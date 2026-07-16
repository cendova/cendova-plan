/**
 * CPAK-Klassifikation nach MacDessi et al. 2021 (Coronal Plane Alignment
 * of the Knee).
 *
 * Zwei Achsen:
 *   - aHKA (arithmetic HKA) = mMPTA − mLDFA
 *       < −2°  → Varus
 *       −2…+2° → Neutral
 *       > +2°  → Valgus
 *   - JLO (Joint Line Obliquity) = mMPTA + mLDFA
 *       < 177° → Apex distal
 *       177…183° → Neutral
 *       > 183° → Apex proximal
 *
 * Daraus entsteht eine 3×3-Matrix mit 9 Typen (I–IX):
 *
 *                    Varus       Neutral      Valgus
 *   Apex distal       I            II           III
 *   Neutral          IV            V            VI
 *   Apex proximal   VII          VIII           IX
 */

/** Sub-Bereiche der beiden Achsen — werden vom UI auch zum Rendern der
 *  Schwellen-Beschriftungen genutzt. */
// CPAK/MacDessi: negativer aHKA = Varus, positiver = Valgus.
export const CPAK_AHKA_THRESHOLDS = { varusAt: -2, valgusAt: 2 } as const
// MacDessi: JLO < 177° = Apex distal, > 183° = Apex proximal (NICHT umgekehrt).
export const CPAK_JLO_THRESHOLDS = { apexDistalAt: 177, apexProximalAt: 183 } as const

export type CpakAlignment = 'Varus' | 'Neutral' | 'Valgus'
export type CpakJlo = 'Apex distal' | 'Neutral' | 'Apex proximal'
export type CpakType =
  | 'I'
  | 'II'
  | 'III'
  | 'IV'
  | 'V'
  | 'VI'
  | 'VII'
  | 'VIII'
  | 'IX'

export interface CpakResult {
  aHKA: number
  JLO: number
  alignment: CpakAlignment
  jlo: CpakJlo
  type: CpakType
  /** Häufigkeit dieses Typs in einer großen Normal-Kohorte (MacDessi 2021,
   *  Tab. 2) — nur als Orientierung für die UI. */
  prevalencePct: number
}

const TYPE_GRID: Record<CpakJlo, Record<CpakAlignment, CpakType>> = {
  'Apex distal':   { Varus: 'I',   Neutral: 'II',   Valgus: 'III' },
  'Neutral':       { Varus: 'IV',  Neutral: 'V',    Valgus: 'VI' },
  'Apex proximal': { Varus: 'VII', Neutral: 'VIII', Valgus: 'IX' },
}

// Häufigkeiten (gerundet) aus MacDessi et al. 2021, Knee-Cohort N=500.
const PREVALENCE_PCT: Record<CpakType, number> = {
  I: 5,
  II: 3,
  III: 1,
  IV: 32,
  V: 18,
  VI: 7,
  VII: 18,
  VIII: 8,
  IX: 8,
}

/**
 * DIE eine Quelle für Varus/Neutral/Valgus aus einem SIGNIERTEN Achswert
 * (negativ = Varus) — MacDessi-Schwellen ±2°. Die CPAK-Matrix füttert sie
 * mit dem aHKA; Werteliste und Ausrichtungs-Kasten mit der signierten
 * mHKA-Abweichung (klinische Festlegung Debug-Runde 3: das Label neben dem
 * mHKA klassifiziert den mHKA — aHKA und mHKA sind um den JLCA versetzt).
 */
export function classifyAlignment(aHKA: number): CpakAlignment {
  if (aHKA < CPAK_AHKA_THRESHOLDS.varusAt) return 'Varus'
  if (aHKA > CPAK_AHKA_THRESHOLDS.valgusAt) return 'Valgus'
  return 'Neutral'
}

function classifyJlo(JLO: number): CpakJlo {
  if (JLO < CPAK_JLO_THRESHOLDS.apexDistalAt) return 'Apex distal'
  if (JLO > CPAK_JLO_THRESHOLDS.apexProximalAt) return 'Apex proximal'
  return 'Neutral'
}

/**
 * Berechnet aHKA, JLO und den daraus folgenden CPAK-Typ aus mLDFA/mMPTA
 * (jeweils in Grad). Beide Eingabewerte werden als gemessene mechanische
 * Knie-Tangentenwinkel erwartet — also so, wie der Workflow-Recipe sie
 * direkt ausgibt.
 */
export function computeCpak(mLDFA: number, mMPTA: number): CpakResult {
  const aHKA = mMPTA - mLDFA
  const JLO = mMPTA + mLDFA
  const alignment = classifyAlignment(aHKA)
  const jlo = classifyJlo(JLO)
  const type = TYPE_GRID[jlo][alignment]
  return { aHKA, JLO, alignment, jlo, type, prevalencePct: PREVALENCE_PCT[type] }
}
