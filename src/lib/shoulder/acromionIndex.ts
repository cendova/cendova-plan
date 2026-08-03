/**
 * Einordnung des Akromion-Index (AI) nach Nyffeler et al., JBJS Am 2006
 * (doi:10.2106/JBJS.D.03042).
 *
 * Messvorschrift dort: auf der ECHTEN a.p.-Aufnahme bei Neutralrotation
 * des Arms den Abstand von der Glenoidebene zum lateralen Akromionrand
 * teilen durch den Abstand von der Glenoidebene zum lateralsten Punkt
 * des Humeruskopfes.
 *
 * Referenzwerte derselben Arbeit (Mittelwert ± SD):
 *   0,73 ± 0,06  vollschichtige Rotatorenmanschetten-Ruptur
 *   0,64 ± 0,06  asymptomatische Kontrollen mit intakter Manschette
 *   0,60 ± 0,08  Omarthrose mit intakter Manschette
 *
 * WICHTIG — warum hier bewusst keine harte Trennlinie steht: Die Arbeit
 * berichtet GRUPPEN-Mittelwerte, deren Streubereiche sich überlappen; sie
 * definiert keinen validierten Cut-off. Die Einordnung unten benennt
 * deshalb nur, in welchen Bereich der Wert fällt, und nennt den Vergleich
 * — sie behauptet keine Zuordnung im Einzelfall. CendovaPlan ist kein
 * Medizinprodukt.
 */

/** Grenzen des Bereichs asymptomatischer Schultern (0,64 ± 0,06). */
export const AI_SCHWELLEN = { niedrigBis: 0.58, hochAb: 0.7 } as const

export type AiBereich = 'niedrig' | 'mittel' | 'hoch'

export interface AiBefund {
  bereich: AiBereich
  hinweis: string
}

/**
 * Ordnet einen Akromion-Index ein.
 * < 0,58 niedrig · 0,58–0,70 Bereich asymptomatischer Schultern · > 0,70 hoch.
 */
export function beurteileAcromionIndex(wert: number): AiBefund {
  if (wert < AI_SCHWELLEN.niedrigBis) {
    return {
      bereich: 'niedrig',
      hinweis: 'niedrig — Gruppenmittel bei Omarthrose 0,60',
    }
  }
  if (wert > AI_SCHWELLEN.hochAb) {
    return {
      bereich: 'hoch',
      hinweis: 'hoch — Gruppenmittel bei Manschettenruptur 0,73',
    }
  }
  return {
    bereich: 'mittel',
    hinweis: 'im Bereich asymptomatischer Schultern (0,64 ± 0,06)',
  }
}
