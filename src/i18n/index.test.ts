import { afterEach, describe, expect, it } from 'vitest'
import { formatDisplayDate, getLanguage, languages, resolveLanguage, setLanguage, t, translate, translateText } from './index'
import { zahl, zahlMitVorzeichen } from '../lib/zahlFormat'
import { INSURANCES, REHA_KINDS } from '../state/planningStore'
import { AVAILABLE_RECIPES } from '../lib/hip/recipes'

afterEach(() => setLanguage('de'))

describe('Sprachen und Anzeigegrenzen', () => {
  it('unterstuetzt regionale Sprachcodes und ignoriert unbekannte Sprachen', () => {
    expect(languages.map((l) => l.code)).toEqual(expect.arrayContaining(['de', 'en', 'fr']))
    expect(resolveLanguage('fr-FR')).toBe('fr')
    expect(resolveLanguage('EN_us')).toBe('en')
    expect(resolveLanguage('not-a-language')).toBeUndefined()
    setLanguage('not-a-language')
    expect(getLanguage()).toBe('de')
  })

  it('wechselt vorhandene Modultexte live ohne die Quellen zu veraendern', () => {
    const source = AVAILABLE_RECIPES.map((r) => r.label)
    setLanguage('fr')
    expect(translate('Hüfte')).toBe('Hanche')
    setLanguage('en')
    expect(translate('Hüfte')).toBe('Hip')
    expect(AVAILABLE_RECIPES.map((r) => r.label)).toEqual(source)
    setLanguage('de')
    expect(translate('Hüfte')).toBe('Hüfte')
  })

  it('haelt persistierte Verwaltungswerte und freie Platzhalter unveraendert', () => {
    const data = JSON.stringify({ insurance: INSURANCES, reha: REHA_KINDS })
    setLanguage('fr')
    const message = t('Krankenhaus: {0}', { 0: 'Hüfte / Clinique Müller' })
    expect(translateText(message)).toContain('Hüfte / Clinique Müller')
    setLanguage('en')
    expect(translateText(message)).toContain('Hüfte / Clinique Müller')
    setLanguage('de')
    expect(translateText(message)).toBe('Krankenhaus: Hüfte / Clinique Müller')
    expect(JSON.stringify({ insurance: INSURANCES, reha: REHA_KINDS })).toBe(data)
    const element = { type: 'div', props: { children: 'Hüfte' } }
    expect(translate(element)).toBe(element)
  })

  it('uebersetzt vollstaendige dynamische Meldungen und behaelt Zahlen bei', () => {
    setLanguage('en')
    expect(translateText('Plan-Fehler: unbekannt')).toBe('Plan error: unknown')
    expect(translateText('Offset 12,5 mm')).toBe('Offset 12,5 mm')
    setLanguage('fr')
    expect(translateText('Offset 12,5 mm')).toBe('Déport 12,5 mm')
    expect(translateText('  Hüfte  ')).toBe('  Hanche  ')
    expect(translateText('12,5 mm')).toBe('12,5 mm')
  })

  it('faellt fuer fehlende Nachrichten auf lesbare Quelltexte zurueck', () => {
    setLanguage('fr')
    expect(t('Neue Sprache {name}', { name: 'Español' })).toBe('Neue Sprache Español')
    expect(translateText('Unbekannte technische Meldung')).toBe('Unbekannte technische Meldung')
  })

  it('formatiert Dezimalzahlen mit Sprache ohne Rechenwerte zu aendern', () => {
    setLanguage('fr')
    expect(zahl(12.345, 2)).toBe('12,35')
    expect(zahl(-0.001)).toBe('0,0')
    setLanguage('en')
    expect(zahl(12.345, 2)).toBe('12.35')
    expect(zahl(-0.001)).toBe('0.0')
    expect(zahlMitVorzeichen(-1.25, 2)).toBe('−1.25')
  })

  it('formatiert gespeicherte Datumswerte nur fuer die Anzeige', () => {
    setLanguage('fr')
    expect(formatDisplayDate('13.10.2026')).toBe('13/10/2026')
    expect(formatDisplayDate('2026-10-13')).toBe('13/10/2026')
    expect(formatDisplayDate('')).toBe('')
    expect(formatDisplayDate('2026-02-31')).toBe('2026-02-31')
  })
})

describe('Katalog-Vertraege', () => {
  const files = import.meta.glob<Record<string, string>>('./locales/*/*.json', { eager: true, import: 'default' })
  const tokens = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  it('enthaelt in jeder Uebersetzung dieselben Platzhalter wie die Quelle', () => {
    for (const [path, messages] of Object.entries(files)) {
      if (path.endsWith('/meta.json')) continue
      for (const [source, target] of Object.entries(messages)) {
        expect(target.trim(), `${path}: ${source}`).not.toBe('')
        expect(tokens(target), `${path}: ${source}`).toEqual(tokens(source))
      }
    }
  })
  it('enthaelt keine widerspruechlichen doppelten Nachrichten', () => {
    for (const code of ['fr', 'en']) {
      const combined: Record<string, string> = {}
      for (const [path, messages] of Object.entries(files)) {
        if (!path.includes(`/${code}/`) || path.endsWith('/meta.json')) continue
        for (const [source, target] of Object.entries(messages)) {
          if (source in combined) expect(target, `${code}: ${source}`).toBe(combined[source])
          combined[source] = target
        }
      }
    }
  })
  it('bietet fuer alle Nachrichten sowohl Englisch als auch Franzoesisch', () => {
    const keys = (code: string) => [...new Set(Object.entries(files).filter(([p]) => p.includes(`/${code}/`) && !p.endsWith('/meta.json')).flatMap(([,m]) => Object.keys(m)))].sort()
    expect(keys('fr')).toEqual(keys('en'))
  })
})
