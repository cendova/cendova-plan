/**
 * Berechnung der Beinlängendifferenz (LLD) prä- und postoperativ.
 *
 * Konvention für SIGNED LLD (in mm):
 *  - positiv  = RECHTES Bein ist länger als links
 *  - negativ  = LINKES Bein ist länger als rechts (= rechtes Bein kürzer)
 *  - 0        = ausgeglichen
 *
 * Das passt zur LLD-Mess-Recipe (`diff = sRight − sLeft`).
 *
 * Klinische Interpretation:
 *  - „Rechts -6 mm" ≡ rechts ist 6 mm kürzer als links ≡ Signed = -6
 *  - „Links +6 mm" ≡ links ist 6 mm länger als rechts  ≡ Signed = -6
 *  (beides dieselbe Aussage, nur andere Bezugsseite)
 *
 * Implantat-Korrektur (`computePlanningDelta`):
 *  - `d.lldMm > 0` bedeutet: das OPERIERTE Bein wird LÄNGER.
 *  - R-Hüfte operiert: SignedLLD wächst um +d.lldMm
 *  - L-Hüfte operiert: SignedLLD sinkt um -d.lldMm
 *
 * postopSignedLLD = preopSignedLLD + sum_over_sides(side === 'R' ? +d.lldMm : −d.lldMm)
 */
import type { Types } from '@cornerstonejs/core'
import type { HipMeasurement } from '../../state/hipStore'
import type { CupTemplate, StemTemplate } from '../../state/templateStore'
import { computePlanningDelta } from './templates'
import { caudalDistance } from './geometry'

type P = Types.Point3

/**
 * Berechnet den signierten präoperativen LLD-Wert aus den Punkten einer
 * LLD-Hüft-Messung. Liefert null, wenn die Messung unvollständig ist.
 * Positives Ergebnis = rechts länger, negatives = links länger.
 */
export function computePreopLLDSigned(
  m: HipMeasurement,
  mmPerWorldUnit: number,
): number | null {
  if (m.kind !== 'lld') return null
  const [r1, r2, right, left] = m.points
  if (!r1 || !r2 || !right || !left) return null
  // Gemeinsame Kaudal-Projektion aus hip/geometry (eine Konvention für
  // alle LLD-/Offset-Rechnungen — Audit-Befund D3).
  const sRight = caudalDistance(right, r1, r2) * mmPerWorldUnit
  const sLeft = caudalDistance(left, r1, r2) * mmPerWorldUnit
  return sRight - sLeft
}

/**
 * Sucht in den vorhandenen Hüft-Messungen die jüngste LLD-Messung und
 * berechnet daraus den präoperativen LLD. null, wenn keine vorhanden
 * oder unvollständig.
 */
export function findPreopLLD(
  hipMeasurements: HipMeasurement[],
  mmPerWorldUnit: number,
): number | null {
  // Bei mehreren LLD-Messungen: nimm die jüngste (= zuletzt hinzugefügt).
  // Reihenfolge der Liste entspricht Reihenfolge des Hinzufügens, daher
  // von hinten suchen.
  for (let i = hipMeasurements.length - 1; i >= 0; i--) {
    const m = hipMeasurements[i]
    if (m.kind === 'lld' && m.visible !== false) {
      const v = computePreopLLDSigned(m, mmPerWorldUnit)
      if (v != null) return v
    }
  }
  return null
}

/**
 * Aggregiert die Implantat-Längen-Korrektur (signed: positiv = SignedLLD
 * wächst = rechts wird relativ länger).
 *
 * Pro Seite muss eine Pfanne (= geplantes Drehzentrum) UND ein Schaft
 * (= erreichbare Kopfposition) vorhanden sein. Sonst kein Beitrag.
 */
export function computeImplantLLDCorrection(
  cups: CupTemplate[],
  stems: StemTemplate[],
  referenceLine: [P, P] | null,
  mmPerWorldUnit: number,
): { totalSigned: number; perSide: Array<{ side: 'R' | 'L'; mm: number; offsetMm: number }> } {
  if (!referenceLine) return { totalSigned: 0, perSide: [] }
  let total = 0
  const perSide: Array<{ side: 'R' | 'L'; mm: number; offsetMm: number }> = []
  for (const side of ['R', 'L'] as const) {
    const cup = cups.find((c) => c.side === side && c.visible !== false)
    const stem = stems.find((s) => s.side === side && s.visible !== false)
    if (!cup || !stem) continue
    const d = computePlanningDelta(
      cup.center,
      stem.headCenter,
      referenceLine,
      side,
      mmPerWorldUnit,
    )
    // R: positives lldMm → rechts länger → SignedLLD steigt
    // L: positives lldMm → links länger → SignedLLD sinkt
    const sign = side === 'R' ? +1 : -1
    total += sign * d.lldMm
    perSide.push({ side, mm: d.lldMm, offsetMm: d.offsetMm })
  }
  return { totalSigned: total, perSide }
}

/**
 * Wandelt einen signierten LLD-Wert in den klinischen Text-String um.
 * Beispiel: -6 → „Rechts -6.0 mm (kürzer)", +5 → „Rechts +5.0 mm (länger)".
 * Bei 0 ± Toleranz → „Ausgeglichen".
 */
export function formatSignedLLD(
  signedMm: number,
  side: 'R' | 'L' = 'R',
): string {
  if (Math.abs(signedMm) < 0.05) return 'Ausgeglichen'
  // Für die Anzeige bezogen auf die genannte Seite. Default = R (typisches
  // Berichtsformat: alles relativ zur rechten Seite).
  const valueForSide = side === 'R' ? signedMm : -signedMm
  const sign = valueForSide >= 0 ? '+' : ''
  const longerShorter = valueForSide >= 0 ? 'länger' : 'kürzer'
  const sideLabel = side === 'R' ? 'Rechts' : 'Links'
  return `${sideLabel} ${sign}${valueForSide.toFixed(1)} mm (${longerShorter})`
}

/** Operierte Seite = Seite mit Pfanne+Schaft (aus der Korrektur). Bei
 *  einseitiger Planung (Normalfall) eindeutig; sonst die erste. */
export function operatedSideOf(
  perSide: Array<{ side: 'R' | 'L' }>,
): 'R' | 'L' | null {
  return perSide.length > 0 ? perSide[0].side : null
}

/**
 * Signed-LLD relativ zu EINER Bezugsseite, OHNE Klammer-Zusatz.
 * Konvention signed: positiv = rechts länger, negativ = links länger.
 *  - side='L': signed −6 → „Links +6,0 mm"; signed +6 → „Links −6,0 mm".
 *  - side='R': signed +6 → „Rechts +6,0 mm".
 */
export function formatLldForSide(signedMm: number, side: 'R' | 'L'): string {
  if (Math.abs(signedMm) < 0.05) return 'ausgeglichen'
  const v = side === 'R' ? signedMm : -signedMm
  const sideLabel = side === 'R' ? 'Rechts' : 'Links'
  // Beinlänge einheitlich in cm (wie die BLD-Messung), Komma als Dezimaltrenner.
  return `${sideLabel} ${v >= 0 ? '+' : ''}${(v / 10).toFixed(2).replace('.', ',')} cm`
}

/** Anzeige-Daten der Beinlaengen-Bilanz (geteilt von Sidebar + Bild-Kasten). */
export interface LldBalanceView {
  /** Bezugsseite: operierte Seite (sobald Implantate), sonst die LAENGERE. */
  opSide: 'R' | 'L'
  /** Pfanne + Schaft der operierten Seite geplant? (dann Korrektur + Post-OP). */
  hasImplants: boolean
  /** Praeoperativ gemessener LLD, relativ zur Bezugsseite. */
  preopText: string
  /** Implantat-Korrektur (mm) der operierten Seite, oder null ohne Implantate. */
  correctionText: string | null
  /** Postoperativer LLD, oder null ohne Implantate. */
  postopText: string | null
  /** Kompakte Ergebnis-Zeile fuer den kleinen Bild-Kasten. */
  resultText: string
}

/**
 * Baut die Anzeige-Daten der Beinlaengen-Bilanz aus prae-OP-LLD + geplanter
 * Implantat-Korrektur. Bezugsseite ist die OPERIERTE Seite, sobald Implantate
 * geplant sind; davor die LAENGERE Seite (natuerliche Lesart statt willkuerlich
 * rechts). So erscheint die Bilanz schon ab der BLD-Messung und wird mit den
 * Implantaten vollstaendig.
 */
export function buildLldBalance(
  preopLLD: number,
  correction: {
    totalSigned: number
    perSide: Array<{ side: 'R' | 'L'; mm: number; offsetMm: number }>
  },
): LldBalanceView {
  const hasImplants = correction.perSide.length > 0
  const opSide =
    operatedSideOf(correction.perSide) ?? (preopLLD >= 0 ? 'R' : 'L')
  const postop = preopLLD + correction.totalSigned
  const corrMm =
    correction.perSide.find((c) => c.side === opSide)?.mm ??
    correction.perSide[0]?.mm ??
    0
  return {
    opSide,
    hasImplants,
    preopText: formatLldForSide(preopLLD, opSide),
    correctionText: hasImplants
      ? `${corrMm >= 0 ? '+' : ''}${(corrMm / 10).toFixed(2).replace('.', ',')} cm`
      : null,
    postopText: hasImplants ? formatLldForSide(postop, opSide) : null,
    resultText: hasImplants
      ? formatLldForSide(postop, opSide)
      : formatLldForSide(preopLLD, opSide),
  }
}
