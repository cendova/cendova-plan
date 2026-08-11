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
import type { Types } from '@cornerstonejs/core'
import {
  angleBetweenVectors,
  circleFrom3Points,
  dot,
  len,
  perpendicularDistance,
  sub,
  unit,
} from './geometry'

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

// ======================================================================
// Geometrie-Engine: Rohwerte aus den 13 Landmarken.
// ======================================================================

type P = Types.Point3

/**
 * Die definierte Punktreihenfolge des Femurprofil-Rezepts:
 *
 *   0–2   Hüftkopfkontur
 *   3     Schenkelhals-Mittelpunkt
 *   4–5   Femurschaftachse proximal/distal
 *   6     Mitte Trochanter minor (verankert NUR die 10-cm-Hilfslinie im
 *         UI — geht bewusst in KEINEN Messwert ein, die Breiten kommen
 *         aus den tatsächlich geklickten Punkten 7–12)
 *   7     äußere Kortikalis medial bei 10 cm
 *   8     innere Kortikalis medial bei 10 cm
 *   9     innere Kortikalis lateral bei 10 cm
 *   10    äußere Kortikalis lateral bei 10 cm
 *   11    innerer Kanalrand medial auf Calcar-Höhe (Mitte Troch. minor)
 *   12    innerer Kanalrand lateral auf Calcar-Höhe
 */
export const FEMUR_PROFILE_POINT_COUNT = 13

/**
 * Rohwerte des Femurprofils. Keine Rundung — die passiert erst in der
 * Anzeige.
 *
 * Zur Null-Semantik (bewusste Präzisierung gegenüber der Plan-Skizze,
 * Folge der NaN-Wache in den Klassifizierern): Werte, deren Geometrie
 * unbrauchbar ist, sind `null` statt NaN oder scheinpräziser Zahl, und
 * `warnings` sagt warum. Eine Dorr-Klasse aus einem Klickfehler wäre
 * schlimmer als keine — insbesondere ein stilles „C" (Zementier-Warnung)
 * oder „A" (CI = 1 bei unsichtbarem Kanal).
 */
export interface FemurProfileRaw {
  headCenter: P
  headRadiusWorld: number
  shaftAxis: [P, P]
  /** null, wenn die Halsmitte (fast) im Kopfzentrum liegt — dann wäre die
   *  Halsrichtung reines Klickrauschen und der Winkel Scheinpräzision. */
  nsaDeg: number | null
  femoralOffsetMm: number
  outerDiameter10cmMm: number
  canalDiameter10cmMm: number
  medialCortexMm: number
  lateralCortexMm: number
  /** CI = (Z − X) / Z; null bei Z = 0. Bleibt als Rohwert auch dann
   *  erhalten, wenn er implausibel ist (z. B. negativ bei X > Z) — dann
   *  ist aber `dorr` null. */
  corticalIndex: number | null
  canalCalcarMm: number
  /** CCR = X / Y; null bei Y = 0. Reine Anzeigegröße — geht NICHT in
   *  CPAH ein (das braucht CI, NSA, FOR). */
  canalCalcarRatio: number | null
  /** FOR = FO / Z; null bei Z = 0. */
  femoralOffsetRatio: number | null
  /** null, wenn die Geometrie keine vertretbare Klassifikation hergibt. */
  dorr: DorrSuggestion | null
  /** null, wenn nsaDeg null ist (Halsmitte im Kopfzentrum). */
  nsaClass: NsaClass | null
  /** null, sobald ein Baustein (Dorr, NSA, FOR) fehlt. */
  cpah: CpahResult | null
  warnings: string[]
}

/**
 * Mindestlänge des Halsvektors (Kopfzentrum → Halsmitte) in mm, unterhalb
 * derer kein NSA berechnet wird. TECHNISCHE Plausibilitätsgrenze (eigene
 * Festlegung, kein klinischer Grenzwert): deutlich über dem Klickrauschen
 * von 1–2 mm, deutlich unter jeder realen Schenkelhalslänge (~40–60 mm).
 * Ohne sie macht der Nullvektor-Sentinel von `angleBetweenVectors` (0°)
 * aus einem Fehlklick still NSA 180° → „valga" → falscher CPAH-Code.
 */
export const NECK_MIN_LEN_MM = 5

/** Signierte Quer-Ablage eines Punktes senkrecht zur Schaftachse.
 *  Breiten entstehen aus der DIFFERENZ zweier Ablagen — dadurch ist ein
 *  entlang der Achse versetzter Klick (daneben auf der 10-cm-Linie)
 *  folgenlos, statt jede Breite systematisch zu überschätzen. */
function querAblage(pt: P, s1: P, achse: P): number {
  const n: P = [-achse[1], achse[0], 0]
  return dot(sub(pt, s1), n)
}

/**
 * Berechnet alle Rohwerte des Femurprofils aus der Punktreihenfolge oben.
 *
 * `mmPerWorldUnit` wird explizit übergeben (Weltkoordinaten → mm).
 * Rückgabe null bei unvollständigen Punkten oder ohne Messrahmen
 * (Schaftachse ohne Länge — senkrecht dazu lässt sich nichts messen).
 */
export function computeFemurProfileRaw(
  points: P[],
  mmPerWorldUnit: number,
): FemurProfileRaw | null {
  if (points.length < FEMUR_PROFILE_POINT_COUNT) return null

  // Ohne endlichen Maßstab gibt es keinen Messrahmen — wie bei der
  // längenlosen Schaftachse: sonst passiert z. B. CI = (Inf − Inf)/Inf
  // = NaN den Plausibilitäts-Guard und die NaN-Wache wirft.
  if (!Number.isFinite(mmPerWorldUnit)) return null

  const [c1, c2, c3, neckPt, s1, s2, , om, im, il, ol, calM, calL] = points

  // Ohne Achsrichtung gibt es keine Senkrechte und damit keinen einzigen
  // Breitenwert — das ist so unfertig wie fehlende Punkte, daher null.
  const shaftDir = unit(sub(s2, s1))
  if (len(shaftDir) === 0) return null

  const warnings: string[] = []

  // Hüftkopf: warnen, nicht blockieren (Doktrin aus Audit-Befund D15 —
  // dieselbe Behandlung wie im CCD-Rezept).
  const { center, radius, degenerate } = circleFrom3Points(c1, c2, c3)
  if (degenerate) {
    warnings.push('Hüftkopf-Punkte fast kollinear — Zentrum unzuverlässig, Punkte neu setzen.')
  }

  // NSA wie im CCD-Rezept: stets die stumpfe Winkelvariante. Aber nur,
  // wenn der Halsvektor lang genug ist: liegt die Halsmitte (fast) im
  // Kopfzentrum, liefert der Nullvektor-Sentinel 0° → still 180° →
  // „valga" — anders als im CCD-Rezept, wo der Arzt die absurde Zahl
  // SIEHT, flösse sie hier unsichtbar in den CPAH-Code.
  const neckVec = sub(neckPt, center)
  const nsaMessbar = len(neckVec) * mmPerWorldUnit >= NECK_MIN_LEN_MM
  if (!nsaMessbar) {
    warnings.push('Halsmitte liegt (fast) im Kopfzentrum — NSA nicht messbar, Punkt neu setzen.')
  }
  const rawAngle = angleBetweenVectors(neckVec, sub(s2, s1))
  const nsaDeg = nsaMessbar ? (rawAngle >= 90 ? rawAngle : 180 - rawAngle) : null
  const nsaClass = nsaDeg != null ? classifyNsa(nsaDeg) : null

  const femoralOffsetMm = perpendicularDistance(center, s1, s2) * mmPerWorldUnit

  // Breiten als Projektions-Differenzen senkrecht zur Schaftachse.
  const qOm = querAblage(om, s1, shaftDir)
  const qIm = querAblage(im, s1, shaftDir)
  const qIl = querAblage(il, s1, shaftDir)
  const qOl = querAblage(ol, s1, shaftDir)
  const z = Math.abs(qOm - qOl) * mmPerWorldUnit
  const x = Math.abs(qIm - qIl) * mmPerWorldUnit
  const medialCortexMm = Math.abs(qOm - qIm) * mmPerWorldUnit
  const lateralCortexMm = Math.abs(qIl - qOl) * mmPerWorldUnit
  const y =
    Math.abs(querAblage(calM, s1, shaftDir) - querAblage(calL, s1, shaftDir)) * mmPerWorldUnit

  // Plausibilität der Klassifikations-Eingaben. Rohwerte bleiben stehen
  // (der Nutzer soll SEHEN, was gemessen wurde) — aber keine Klasse aus
  // unmöglicher Anatomie.
  //
  // Die vier Kortikalis-Ablagen müssen STRENG außen–innen–innen–außen
  // geordnet sein (beide Klickrichtungen erlaubt). Das fängt auch Fehler,
  // die der bloße x<=z-Vergleich übersieht: ein einzelnes vertauschtes
  // Seitenpaar oder ein innerer Punkt außerhalb der Kortikalis kann X < Z
  // lassen und lieferte sonst still eine falsche Dorr-Klasse. Die strenge
  // Ordnung impliziert zugleich X < Z (Kortikalisdicke > 0 beidseits).
  const kortikalisGeordnet =
    (qOm < qIm && qIm < qIl && qIl < qOl) || (qOm > qIm && qIm > qIl && qIl > qOl)
  if (z <= 0) {
    warnings.push('Äußerer Durchmesser bei 10 cm ist null — äußere Kortikalis-Punkte prüfen.')
  }
  if (x <= 0) {
    warnings.push('Kanalbreite bei 10 cm ist null — innere Kortikalis-Punkte prüfen.')
  }
  if (x > z && z > 0) {
    warnings.push('Kanal breiter als der äußere Durchmesser — Kortikalis-Punkte vertauscht?')
  }
  if (!kortikalisGeordnet && z > 0 && x > 0 && x <= z) {
    warnings.push(
      'Kortikalis-Punkte nicht außen–innen–innen–außen geordnet — einzelner Punkt vertauscht oder außerhalb gesetzt?',
    )
  }
  if (y <= 0) {
    warnings.push('Kanalbreite auf Calcar-Höhe ist null — Calcar-Punkte prüfen.')
  }

  const corticalIndex = z > 0 ? (z - x) / z : null
  const canalCalcarRatio = y > 0 ? x / y : null
  const femoralOffsetRatio = z > 0 ? femoralOffsetMm / z : null

  const klassifizierbar = z > 0 && x > 0 && kortikalisGeordnet
  const dorr = klassifizierbar && corticalIndex != null ? classifyDorr(corticalIndex) : null
  const cpah =
    dorr != null && nsaClass != null && femoralOffsetRatio != null
      ? computeCpah(dorr.suggested, nsaClass, classifyOffsetSubtype(femoralOffsetRatio))
      : null

  return {
    headCenter: center,
    headRadiusWorld: radius,
    shaftAxis: [s1, s2],
    nsaDeg,
    femoralOffsetMm,
    outerDiameter10cmMm: z,
    canalDiameter10cmMm: x,
    medialCortexMm,
    lateralCortexMm,
    corticalIndex,
    canalCalcarMm: y,
    canalCalcarRatio,
    femoralOffsetRatio,
    dorr,
    nsaClass,
    cpah,
    warnings,
  }
}
