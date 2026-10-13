import { useSyncExternalStore } from 'react'

export interface Language {
  code: string
  name: string
  locale: string
  direction?: 'ltr' | 'rtl'
}
type Messages = Record<string, string>
export const LANGUAGE_STORAGE_KEY = 'cendova-plan-language'
const metadata = import.meta.glob<Language>('./locales/*/meta.json', { eager: true, import: 'default' })
const files = import.meta.glob<Messages>('./locales/*/*.json', { eager: true, import: 'default' })
export const languages: Language[] = Object.values(metadata).sort((a, b) => a.code.localeCompare(b.code))
const catalogs: Record<string, Messages> = Object.fromEntries(languages.map((l) => [l.code, {}]))
for (const [path, messages] of Object.entries(files)) {
  if (path.endsWith('/meta.json')) continue
  const code = path.split('/')[2]
  Object.assign(catalogs[code] ??= {}, messages)
}

export function resolveLanguage(requested: string | null | undefined): string | undefined {
  if (!requested) return undefined
  const requestedCode = requested.toLowerCase().replace(/_/g, '-')
  const exact = languages.find((l) => l.code.toLowerCase() === requestedCode)
  if (exact) return exact.code
  const base = requestedCode.split('-')[0]
  return languages.find((l) => l.code.toLowerCase() === base)?.code
    ?? languages.find((l) => l.code.toLowerCase().split('-')[0] === base)?.code
}

function initialLanguage(): string {
  // Tests und serverseitige Werkzeuge behalten die deutschen Originaltexte.
  if (typeof window === 'undefined') return 'de'
  try {
    const query = resolveLanguage(new URLSearchParams(window.location.search).get('lang'))
    if (query) return query
    const saved = resolveLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY))
    if (saved) return saved
  } catch { /* Gesperrter Browser-Speicher darf den Start nicht verhindern. */ }
  return window.navigator.languages.map(resolveLanguage).find(Boolean) ?? 'de'
}
let language = initialLanguage()
const subscribers = new Set<() => void>()
export const getLanguage = () => language
export const getLocale = () => languages.find((l) => l.code === language)?.locale ?? 'de-DE'

function updateDocument() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language
  document.documentElement.dir = languages.find((l) => l.code === language)?.direction ?? 'ltr'
}
updateDocument()

export function setLanguage(code: string) {
  const supported = resolveLanguage(code)
  if (!supported) return
  language = supported
  cache.clear()
  updateDocument()
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language) } catch { /* Optional. */ }
    // Ein URL-Override bleibt auch nach einem Neuladen konsistent.
    const url = new URL(window.location.href)
    if (url.searchParams.has('lang')) {
      url.searchParams.set('lang', language)
      window.history.replaceState(null, '', url)
    }
  }
  subscribers.forEach((notify) => notify())
}

export function useLanguage() {
  return useSyncExternalStore((notify) => {
    subscribers.add(notify)
    return () => { subscribers.delete(notify) }
  }, getLanguage, () => 'de')
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
type Pattern = { source: string; regex: RegExp; tokens: string[]; weight: number }
const patterns: Pattern[] = [...new Set(Object.values(catalogs).flatMap(Object.keys))]
  .filter((s) => /\{\w+\}/.test(s) && (s.replace(/\{\w+\}/g, '').trim().length >= 8 || /^(?:Slope|Offset|Gr\.|ab) \{\d+\}/.test(s)))
  .map((source) => {
    const tokens = [...source.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    return {
      source,
      tokens,
      regex: new RegExp('^' + source.split(/\{\w+\}/).map(escapeRegex).join('([\\s\\S]*?)') + '$'),
      weight: source.replace(/\{\w+\}/g, '').length,
    }
  }).sort((a, b) => b.weight - a.weight)
const fragments = [...new Set(Object.values(catalogs).flatMap(Object.keys))]
  .filter((s) => !/\{\w+\}/.test(s) && s.length >= 12 && /\s/.test(s))
  .sort((a, b) => b.length - a.length)
const cache = new Map<string, string>()
const protectedMessages = new Map<string, { source: string; values: Record<string, string | number> }>()
const message = (source: string): string | undefined => catalogs[language]?.[source] ?? catalogs.en?.[source]

/** Neue Texte: deutsche Quellnachricht mit benannten Platzhaltern. */
export function t(source: string, values: Record<string, string | number> = {}): string {
  const template = language === 'de' ? source : message(normalize(source)) ?? source
  const interpolate = (text: string) => text.replace(/\{(\w+)\}/g, (token, key: string) => key in values ? String(values[key]) : token)
  const result = interpolate(template)
  if (Object.keys(values).length) {
    // Auch bei weiteren Anzeigegrenzen freie Parameter niemals uebersetzen.
    // Die Quellnachricht erlaubt zugleich den Sprachwechsel alter Statuszeilen.
    if (protectedMessages.size > 1000) protectedMessages.clear()
    const descriptor = { source, values: { ...values } }
    protectedMessages.set(interpolate(source), descriptor)
    protectedMessages.set(result, descriptor)
  }
  return result
}

/** Uebersetzung ausschliesslich an Anzeigegrenzen: gespeicherte Plaene,
 *  Berechnungen, Vergleiche und freie Nutzereingaben bleiben unveraendert. */
export function translateText(text: string, depth = 0): string {
  if (!text || depth > 3) return text
  const protectedMessage = protectedMessages.get(text)
  if (protectedMessage) return t(protectedMessage.source, protectedMessage.values)
  if (language === 'de') return text
  if (/^[\d\s.,+−°×/()%–-]+(?:mm|cm|kg|px)?$/.test(text)) return text
  if (depth === 0 && cache.has(text)) return cache.get(text)!
  const key = normalize(text)
  const exact = message(key)
  let result = text
  if (exact !== undefined) {
    result = text.match(/^\s*/)?.[0] + exact + text.match(/\s*$/)?.[0]
  } else {
    let matched = false
    for (const pattern of patterns) {
      const translation = message(pattern.source)
      if (!translation) continue
      const captures = pattern.regex.exec(text.trim())
      if (!captures) continue
      const values = Object.fromEntries(pattern.tokens.map((token, i) => [token, translateText(captures[i + 1], depth + 1)]))
      result = translation.replace(/\{(\w+)\}/g, (token, name: string) => values[name] ?? token)
      matched = true
      break
    }
    // Aeltere Texte werden teilweise aus Satzfragmenten zusammengesetzt.
    // Nur ganze, bekannte Wortgruppen ersetzen, niemals einzelne Datenwerte.
    if (!matched) {
      for (const fragment of fragments) {
        if (!result.includes(fragment)) continue
        const translated = message(fragment)
        if (translated) result = result.split(fragment).join(translated)
      }
    }
  }
  if (depth === 0) {
    if (cache.size > 2000) cache.clear()
    cache.set(text, result)
  }
  return result
}

/** React-Anzeigegrenze; Elemente und numerische Werte unveraendert lassen. */
export function translate<T>(value: T): T {
  return (typeof value === 'string' ? translateText(value) : value) as T
}

export function formatDate(value: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!parts) return value
  const [year, month, day] = parts.slice(1).map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return value
  return new Intl.DateTimeFormat(getLocale()).format(date)
}

export function formatDisplayDate(value: string): string {
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value)
  return formatDate(dotted ? `${dotted[3]}-${dotted[2]}-${dotted[1]}` : value)
}
