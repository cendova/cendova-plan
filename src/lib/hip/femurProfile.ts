/**
 * Femurprofil — Dorr-Vorschlag und CPAH-Morphotyp.
 *
 * Dieses Modul enthaelt AUSSCHLIESSLICH die reine Klassifikation aus
 * bereits berechneten Kennzahlen. Die Geometrie (Landmarken -> CI, CCR,
 * NSA, FOR) kommt in einem eigenen Schritt dazu und benutzt dieselben
 * Konstanten. Grund fuer die Trennung: Grenzwerte sind eine fachliche
 * Festlegung und muessen ohne Punktgeometrie pruefbar bleiben.
 *
 * ACHTUNG, Namensgebung: Die automatische Ausgabe heisst ueberall
 * „Dorr-VORSCHLAG". Sie ersetzt keine aerztliche Beurteilung und wird in
 * der UI bestaetigt oder mit Grund ueberschrieben.
 *
 * ── Quellenlage (Stand 08.08.2026) ────────────────────────────────────
 * Die Klassengrenzen stammen aus dem CPAH-Paper: Stauss R, Savov P,
 * Biestmann F, Brueggemann M, Mont MA, Seyler TM, Ettinger M.
 * „Definition of Femoral Morphotypes Based on the Coronal Plane Alignment
 * of the Hip Classification." J Arthroplasty 2026.
 * DOI 10.1016/j.arth.2026.05.011 (PMID 42134629).
 *
 * Verifiziert ist daraus bisher nur die STRUKTUR, und zwar am Abstract:
 * neun Morphotypen aus Dorr-Typ und NSA, jeder zusaetzlich in eine
 * Normal- und eine High-Offset-Untergruppe geteilt; die dort genannten
 * Typen („2N, 5N, 5H, 6N, 8N") bestaetigen die Schreibweise Zahl+N/H.
 *
 * Die ZAHLEN unten stehen NICHT im Abstract. Der Volltext ist nicht frei
 * zugaenglich (kein PMC-Eintrag), sie sind hier also aus dem fachlichen
 * Handoff uebernommen (`docs/HANDOFF_femurprofil-cpah.md`, Abschnitte
 * „Dorr-Klassifikation" und „CPAH") und noch NICHT am Volltext geprueft.
 * Wer den Volltext zur Hand hat: Werte gegenlesen und diesen Absatz durch
 * die konkrete Fundstelle ersetzen. Alle Grenzen stehen genau einmal —
 * eine Korrektur ist eine Ein-Zeilen-Aenderung plus Test.
 *
 * NICHT verwechseln: Der ISCD-Schwellenwert CI < 0,40 ist ein Trigger fuer
 * eine praeoperative DXA (Bone Health), KEINE CPAH-Grenze und keine
 * Zementier-Indikation. Beide Regeln bleiben technisch getrennt; dieses
 * Modul kennt den ISCD-Wert bewusst nicht.
 */

/** Dorr-Grenzen auf dem Cortical Index CI = (Z − X) / Z.
 *  Lesart: A ist CI > 0,60; C ist CI < 0,50; dazwischen B — die
 *  Grenzwerte SELBST gehoeren also zu B. */
export const DORR_CI_THRESHOLDS = { dorrAAbove: 0.6, dorrCBelow: 0.5 } as const

/** Grenzzonen um die beiden Klassengrenzen, als [von, bis] einschliesslich.
 *
 *  EIGENE KONVENTION dieses Projekts, im Handoff ausdruecklich nur
 *  „vorgeschlagen" — sie stehen so in KEINER Quelle. Zweck ist allein,
 *  einen knappen Messwert als knapp auszuweisen, statt eine Klasse
 *  scheinpraezise auszugeben. Sie veraendern die Klassifikation nicht. */
export const DORR_BORDERLINE_ZONES = {
  ab: [0.58, 0.62],
  bc: [0.48, 0.52],
} as const

/** NSA/CCD-Grenzen in Grad. Lesart: vara ist < 120°, valga ist > 140° —
 *  die Grenzwerte selbst gehoeren also zu norma. */
export const NSA_THRESHOLDS = { varaBelow: 120, valgaAbove: 140 } as const

/** Schwelle der Femoral Offset Ratio FOR = FO / Z fuer den High-Offset-
 *  Untertyp. Lesart: H ist FOR >= 1,60 — die Schwelle selbst ist H. */
export const FOR_HIGH_AT = 1.6

export type DorrType = 'A' | 'B' | 'C'
export type DorrBorderline = 'A/B' | 'B/C' | null
export type NsaClass = 'vara' | 'norma' | 'valga'
export type OffsetSubtype = 'N' | 'H'
export type CpahType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export interface DorrSuggestion {
  suggested: DorrType
  /** Gesetzt, wenn der Wert in einer der Grenzzonen liegt. */
  borderline: DorrBorderline
  // BEWUSST KEIN eigenes confidence-Feld: es waere vollstaendig aus
  // `borderline` ableitbar (null = sicher, sonst grenzwertig) — zwei
  // Felder fuer dieselbe Information laufen frueher oder spaeter
  // auseinander.
}

export interface CpahResult {
  type: CpahType
  offsetSubtype: OffsetSubtype
  /** Typ und Untertyp zusammen, z. B. „5H" — die Schreibweise des Papers. */
  code: string
}

/**
 * Wacht ueber die Eingaben der Klassifizierer.
 *
 * Ohne diese Wache faellt NaN durch jeden Vergleich und landet still in
 * der letzten Kategorie — bei Dorr also ausgerechnet auf „C", der Klasse
 * mit der Zementier-Warnung. Ein lauter Fehler ist der einzige
 * vertretbare Ausgang; die Geometrie-Ebene prueft ihre Rohwerte, BEVOR
 * sie hier hineingeht, und meldet unbrauchbare Messungen als Warnung.
 */
function pruefeEndlich(wert: number, name: string): void {
  if (!Number.isFinite(wert)) {
    throw new Error(`${name} ist kein endlicher Wert (${wert}) — Klassifikation abgebrochen.`)
  }
}

function inZone(wert: number, [von, bis]: readonly [number, number]): boolean {
  return wert >= von && wert <= bis
}

/** Dorr-Vorschlag aus dem Cortical Index. */
export function classifyDorr(corticalIndex: number): DorrSuggestion {
  pruefeEndlich(corticalIndex, 'Cortical Index')

  const suggested: DorrType =
    corticalIndex > DORR_CI_THRESHOLDS.dorrAAbove
      ? 'A'
      : corticalIndex < DORR_CI_THRESHOLDS.dorrCBelow
        ? 'C'
        : 'B'

  const borderline: DorrBorderline = inZone(corticalIndex, DORR_BORDERLINE_ZONES.ab)
    ? 'A/B'
    : inZone(corticalIndex, DORR_BORDERLINE_ZONES.bc)
      ? 'B/C'
      : null

  return { suggested, borderline }
}

/** Coxa vara / norma / valga aus dem NSA (CCD-Winkel) in Grad. */
export function classifyNsa(nsaDeg: number): NsaClass {
  pruefeEndlich(nsaDeg, 'NSA')
  if (nsaDeg < NSA_THRESHOLDS.varaBelow) return 'vara'
  if (nsaDeg > NSA_THRESHOLDS.valgaAbove) return 'valga'
  return 'norma'
}

/** Normal- oder High-Offset aus der Femoral Offset Ratio. */
export function classifyOffsetSubtype(femoralOffsetRatio: number): OffsetSubtype {
  pruefeEndlich(femoralOffsetRatio, 'Femoral Offset Ratio')
  return femoralOffsetRatio >= FOR_HIGH_AT ? 'H' : 'N'
}

/** Die 9er-Matrix: Zeile = Dorr-Typ, Spalte = NSA-Klasse. */
const CPAH_MATRIX: Record<DorrType, Record<NsaClass, CpahType>> = {
  A: { vara: 1, norma: 2, valga: 3 },
  B: { vara: 4, norma: 5, valga: 6 },
  C: { vara: 7, norma: 8, valga: 9 },
}

/** Setzt den CPAH-Morphotyp aus den drei Einzelklassen zusammen. */
export function computeCpah(
  dorr: DorrType,
  nsa: NsaClass,
  offsetSubtype: OffsetSubtype,
): CpahResult {
  const type = CPAH_MATRIX[dorr][nsa]
  return { type, offsetSubtype, code: `${type}${offsetSubtype}` }
}
