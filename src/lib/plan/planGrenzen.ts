/**
 * Struktur-/Grenzen-Prüfung für Plan-JSONs (Security-Report §8) — eigenes
 * Modul mit NUR-Typ-Import auf serialize.ts, damit die reine Prüf-Logik
 * ohne die Cornerstone-Importkette unit-testbar bleibt.
 */
import type { PlanFile } from './serialize'

/** Obergrenze der Ausschlussgründe je Messung. Die Kriterienliste des
 *  Bildqualitäts-Gates hat sieben Einträge — großzügig gerundet, damit
 *  eine spätere Erweiterung nicht sofort an die Wand läuft. */
const MAX_AUSSCHLUSSGRUENDE = 32

import {
  endlichIn,
  MAX_EMBEDDED_BASE64,
  MAX_PLAN_ARRAY,
  MAX_PLAN_STRING,
  MAX_MM_PER_UNIT,
  MIN_MM_PER_UNIT,
} from '../importGrenzen'
import { OSTEOTOMIE_GRENZEN } from '../knee/osteotomie'

/** Ein Punkt ist ein Tupel aus 2–3 endlichen Zahlen ([x, y] bzw. [x, y, z]). */
function istPunkt(q: unknown): boolean {
  return (
    Array.isArray(q) &&
    (q.length === 2 || q.length === 3) &&
    q.every((v) => typeof v === 'number' && Number.isFinite(v))
  )
}

const OSTEOTOMIE_TYPEN_ERLAUBT = [
  'htoOeffnend',
  'htoSchliessend',
  'dfoOeffnend',
  'dfoSchliessend',
  'dlo',
]

/** Umstellungsosteotomie (v11): Typ aus der Liste, Zahlen endlich und
 *  plausibel, Punkte als Zahlen-Tupel (istPunkt) oder null. */
function pruefeOsteotomie(o: unknown): string | null {
  if (o === undefined || o === null) return null
  if (typeof o !== 'object') return 'Feld „kneeOsteotomie" ist kein Objekt'
  const r = o as Record<string, unknown>
  if (!OSTEOTOMIE_TYPEN_ERLAUBT.includes(r.typ as string))
    return 'Umstellungsosteotomie: unbekannter Typ'
  const zahl = (v: unknown, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
  const g = OSTEOTOMIE_GRENZEN
  if (!zahl(r.zielWblProzent, ...g.zielWblProzent)) return 'Umstellungsosteotomie: Zielwert unplausibel'
  if (r.dloZielLdfa !== undefined && !zahl(r.dloZielLdfa, ...g.dloZielLdfa))
    return 'Umstellungsosteotomie: Ziel-mLDFA unplausibel'
  if (r.deltaJlca !== undefined && r.deltaJlca !== null && !zahl(r.deltaJlca, ...g.deltaJlca))
    return 'Umstellungsosteotomie: ΔJLCA unplausibel'
  for (const k of ['sichtbar', 'bildSimulation']) {
    if (r[k] !== undefined && typeof r[k] !== 'boolean')
      return `Umstellungsosteotomie: Feld „${k}" ist kein Wahrheitswert`
  }
  for (const k of ['femurScharnier', 'femurStart', 'tibiaScharnier', 'tibiaStart']) {
    const v = r[k]
    if (v === undefined || v === null) continue
    if (!istPunkt(v)) return `Umstellungsosteotomie: Punkt „${k}" ungültig`
  }
  return null
}

/**
 * Struktur-/Grenzen-Prüfung eines geparsten Plans, BEVOR irgendetwas in
 * Stores übernommen wird (Security-Report §8): richtige Grundtypen,
 * gedeckelte Array-/String-Größen, endliche plausible Kalibrierung.
 * Bewusst tolerant gegenüber FEHLENDEN Feldern (alte Pläne laden weiter) —
 * hart nur bei falschen Typen und absurden Größen (DoS/Manipulation).
 * Gibt null zurück, wenn alles in Ordnung ist, sonst die Fehlermeldung.
 */
export function pruefePlanGrenzen(plan: PlanFile): string | null {
  const arrayOk = (v: unknown, name: string): string | null => {
    if (v === undefined || v === null) return null
    if (!Array.isArray(v)) return `Feld „${name}" ist kein Array`
    if (v.length > MAX_PLAN_ARRAY)
      return `Feld „${name}" ist zu groß (${v.length} > ${MAX_PLAN_ARRAY} Einträge)`
    return null
  }
  const checks: Array<string | null> = [
    arrayOk(plan.hipMeasurements, 'hipMeasurements'),
    arrayOk(plan.kneeMeasurements, 'kneeMeasurements'),
    arrayOk(plan.shoulderMeasurements, 'shoulderMeasurements'),
    arrayOk(plan.genericMeasurements, 'genericMeasurements'),
    arrayOk(plan.templates?.cups, 'templates.cups'),
    arrayOk(plan.templates?.stems, 'templates.stems'),
    arrayOk(plan.kneeTemplates, 'kneeTemplates'),
    arrayOk(plan.shoulderTemplates, 'shoulderTemplates'),
    arrayOk(plan.notes, 'notes'),
    arrayOk(plan.osteophytes, 'osteophytes'),
    arrayOk(plan.shaftFragments, 'shaftFragments'),
  ]
  const arrFehler = checks.find((c) => c !== null)
  if (arrFehler) return arrFehler

  // Messpunkte: JSON kennt kein NaN/Infinity — ein solcher Wert wird beim
  // Speichern STILL zu `null`. Ein einziger solcher Punkt ließ beim Laden
  // jeden Rechenkern werfen (alle Hüft-Rezepte nachgewiesen), und ohne
  // Fehlergrenze stand dann die ganze Oberfläche (Befund Release-Check
  // 28.09.2026). Darum: VORHANDENE Punkte müssen Zahlen-Tupel sein. Ein
  // fehlendes `points` bleibt toleriert (Grundsatz dieses Moduls).
  for (const [name, liste] of [
    ['hipMeasurements', plan.hipMeasurements],
    ['kneeMeasurements', plan.kneeMeasurements],
    ['shoulderMeasurements', plan.shoulderMeasurements],
  ] as const) {
    const ms = (liste ?? []) as unknown[]
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]
      if (m === null || typeof m !== 'object') return `Feld „${name}[${i}]" ist kein Objekt`
      const pts = (m as { points?: unknown }).points
      if (pts === undefined) continue
      const feld = `${name}[${i}].points`
      if (!Array.isArray(pts)) return `Feld „${feld}" ist kein Array`
      if (pts.length > MAX_PLAN_ARRAY)
        return `Feld „${feld}" ist zu groß (${pts.length} > ${MAX_PLAN_ARRAY} Einträge)`
      if (!pts.every(istPunkt))
        return `Feld „${feld}" enthält einen ungültigen Punkt (keine endlichen Koordinaten)`
    }
  }

  const osteoFehler = pruefeOsteotomie(plan.kneeOsteotomie)
  if (osteoFehler) return osteoFehler

  // Kalibrierung: falls vorhanden, muss der Kernfaktor endlich + plausibel
  // sein — ein manipuliertes mmPerWorldUnit verfälscht JEDE Messung.
  for (const [name, cal] of [
    ['calibration', plan.calibration],
    ['rightCalibration', plan.rightCalibration],
  ] as const) {
    if (cal === undefined || cal === null) continue
    if (typeof cal !== 'object')
      return `Feld „${name}" hat den falschen Typ`
    if (!endlichIn(cal.mmPerWorldUnit, MIN_MM_PER_UNIT, MAX_MM_PER_UNIT))
      return `Feld „${name}.mmPerWorldUnit" ist keine plausible Zahl`
  }

  // Freitexte deckeln (DoS über riesige Strings in Notizen/Planungsdaten).
  const texte: Array<[string, unknown]> = [
    ['clinicalBld', plan.clinicalBld],
    ...(plan.planning
      ? Object.entries(plan.planning).map(
          ([k, v]) => [`planning.${k}`, v] as [string, unknown],
        )
      : []),
    ...((plan.notes ?? []) as Array<{ text?: unknown }>).map(
      (n, i) => [`notes[${i}].text`, n?.text] as [string, unknown],
    ),
  ]
  for (const [name, wert] of texte) {
    if (typeof wert === 'string' && wert.length > MAX_PLAN_STRING)
      return `Feld „${name}" ist zu lang (> ${MAX_PLAN_STRING} Zeichen)`
  }

  // Ausschlussgründe der Femurprofil-Beurteilung: Sie stammen zwar aus
  // einer festen Kriterienliste, kommen hier aber aus einer FREMDEN
  // Datei. Ohne Deckel könnte ein präparierter Plan pro Messung eine
  // beliebig lange Liste beliebig langer Texte mitbringen — die Karte
  // rendert jeden Eintrag, das legt den Browser lahm. Die echte Liste hat
  // sieben Einträge; alles darüber ist offensichtlich manipuliert.
  const hipMs = (plan.hipMeasurements ?? []) as Array<{
    femurProfileReview?: { imageQuality?: { exclusionReasons?: unknown } }
  }>
  for (let i = 0; i < hipMs.length; i++) {
    const gruende = hipMs[i]?.femurProfileReview?.imageQuality?.exclusionReasons
    if (gruende === undefined || gruende === null) continue
    const feld = `hipMeasurements[${i}].femurProfileReview.imageQuality.exclusionReasons`
    if (!Array.isArray(gruende)) return `Feld „${feld}" ist kein Array`
    if (gruende.length > MAX_AUSSCHLUSSGRUENDE)
      return `Feld „${feld}" hat zu viele Einträge (${gruende.length} > ${MAX_AUSSCHLUSSGRUENDE})`
    for (const g of gruende) {
      if (typeof g !== 'string') return `Feld „${feld}" enthält einen Nicht-Text`
      if (g.length > MAX_PLAN_STRING)
        return `Feld „${feld}" enthält einen zu langen Text (> ${MAX_PLAN_STRING} Zeichen)`
    }
  }

  // Eingebettete Bilder: Base64-Länge deckeln, bevor atob den RAM flutet.
  for (const [name, img] of [
    ['embeddedImage', plan.embeddedImage],
    ['embeddedImageRight', plan.embeddedImageRight],
  ] as const) {
    if (!img) continue
    if (typeof img.base64 !== 'string')
      return `Feld „${name}.base64" hat den falschen Typ`
    if (img.base64.length > MAX_EMBEDDED_BASE64)
      return `Eingebettetes Bild „${name}" ist zu groß`
  }
  return null
}

