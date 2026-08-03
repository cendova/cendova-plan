/**
 * Einordnung des akromiohumeralen Abstands (AHD).
 *
 * Schwelle: Ein AHD unter 6 mm gilt verbreitet als pathologisch und als
 * Hinweis auf eine Rotatorenmanschetten-Ruptur; die Messung auf
 * standardisierten a.p.-Aufnahmen wurde als verlässlich und reproduzierbar
 * bestätigt (Gruber et al., JSES 2010, doi:10.1016/j.jse.2009.04.010).
 *
 * ZWEI EINSCHRÄNKUNGEN, die den Wert relativieren — beide bewusst hier
 * dokumentiert, weil sie die Interpretation stärker begrenzen als die
 * Schwelle suggeriert:
 *
 *  1. Messunsicherheit in derselben Größenordnung wie die Schwelle: Die
 *     genannte Arbeit fand maximale Inter-/Intraobserver-Differenzen von
 *     4 bzw. 3 mm. Ein Wert nahe 6 mm trennt also nicht zuverlässig.
 *  2. Röntgen ≠ MRT: Bei massiven Rupturen mit frühem Hamada-Grad lag der
 *     AHD im Röntgen deutlich höher als im MRT derselben Schulter
 *     (7,9 vs. 2,5 mm); die Werte sind NICHT austauschbar
 *     (Mirzayan et al., JSES 2020, doi:10.1016/j.jse.2019.10.020).
 *
 * Zusätzlich gilt wie für alle Längen im Modul: Ohne Kalibrierung ist der
 * Wert bedeutungslos — das Rezept trägt deshalb `needsCalibration: true`,
 * und die Oberfläche kennzeichnet unkalibrierte Messungen.
 */

/** Unterhalb dieses Werts (mm) gilt der AHD verbreitet als vermindert. */
export const AHD_SCHWELLE_MM = 6

export type AhdBereich = 'vermindert' | 'ueblich'

export interface AhdBefund {
  bereich: AhdBereich
  hinweis: string
}

/** Ordnet einen AHD-Wert (in mm) ein. */
export function beurteileAhd(mmWert: number): AhdBefund {
  if (mmWert < AHD_SCHWELLE_MM) {
    return {
      bereich: 'vermindert',
      hinweis: 'vermindert (< 6 mm) — gilt als hinweisend auf einen Manschettendefekt',
    }
  }
  return { bereich: 'ueblich', hinweis: 'im üblichen Bereich (≥ 6 mm)' }
}
