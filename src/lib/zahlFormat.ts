/**
 * EINE Zahlschreibweise für die ganze Oberfläche, die Bild-Beschriftungen
 * und das PDF (Realtest 29.09.2026: rechts standen „176.7°" und „3,3°"
 * untereinander, dazu „−12.5 mm" neben „-12,5 mm").
 *
 * Regeln:
 *  - deutsches Dezimalkomma,
 *  - echtes Minuszeichen (U+2212) — das PDF ersetzt es beim Schreiben
 *    zentral (pdfText.ts), weil die PDF-Standardschrift es nicht kennt,
 *  - kein „−0,0": Werte, die auf 0 runden, verlieren ihr Vorzeichen,
 *  - Einheit mit geschütztem Leerzeichen (U+00A0, im PDF-Zeichensatz
 *    enthalten), damit „34,6 %" in schmalen Spalten nicht umbricht;
 *    Grad ohne Leerzeichen, wie im Deutschen üblich.
 */

const NBSP = ' '
const MINUS = '−'

/** Zahl mit Komma und echtem Minus; rundet wie `toFixed`. */
export function zahl(v: number, nachkomma = 1): string {
  const s = Math.abs(v).toFixed(nachkomma).replace('.', ',')
  // Auf 0 gerundete negative Werte ohne Vorzeichen — „−0,0" ist Rauschen.
  const istNull = Number(Math.abs(v).toFixed(nachkomma)) === 0
  return v < 0 && !istNull ? `${MINUS}${s}` : s
}

/** Zahl mit explizitem Vorzeichen (+/−) — für Richtungen und Deltas. */
export function zahlMitVorzeichen(v: number, nachkomma = 1): string {
  const s = zahl(v, nachkomma)
  if (s.startsWith(MINUS)) return s
  return Number(Math.abs(v).toFixed(nachkomma)) === 0 ? s : `+${s}`
}

export const grad = (v: number, nachkomma = 1) => `${zahl(v, nachkomma)}°`
export const gradMitVorzeichen = (v: number, nachkomma = 1) =>
  `${zahlMitVorzeichen(v, nachkomma)}°`
export const mm = (v: number, nachkomma = 1) => `${zahl(v, nachkomma)}${NBSP}mm`
export const mmMitVorzeichen = (v: number, nachkomma = 1) =>
  `${zahlMitVorzeichen(v, nachkomma)}${NBSP}mm`
export const cm = (vMm: number) => `${zahl(vMm / 10, 2)}${NBSP}cm`
export const prozent = (v: number, nachkomma = 1) => `${zahl(v, nachkomma)}${NBSP}%`
/** Verhältniszahlen (CI, CCR, FOR) — zwei Nachkommastellen. */
export const verhaeltnis = (v: number) => zahl(v, 2)
