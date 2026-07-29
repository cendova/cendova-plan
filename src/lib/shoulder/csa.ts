/**
 * Einordnung des Critical Shoulder Angle (CSA).
 *
 * Aufbau bewusst wie `knee/cpak.ts`: reine Klassifikations-Logik, getrennt
 * von der Winkel-Berechnung im Rezept, damit sie einzeln testbar bleibt.
 *
 * Die Schwellen 30° / 35° sind die in der Literatur gebräuchlichen
 * Orientierungswerte (hoher CSA eher mit Rotatorenmanschetten-Pathologie
 * assoziiert, niedriger eher mit Omarthrose).
 *
 * WICHTIG — bewusst zurückhaltend formuliert: Eine aktuelle
 * Übersichtsarbeit bewertet den CSA zwar als verlässlich MESSBAR, den
 * prognostischen Nutzen aber ausdrücklich als noch nicht abschließend
 * belegt (JSES Int 2023, doi:10.1016/j.jseint.2023.11.002). Die Ausgabe
 * ist deshalb eine ASSOZIATION, keine Diagnose — und CendovaPlan ist
 * ohnehin kein Medizinprodukt.
 *
 * Zusätzliche Voraussetzung: Der Wert gilt nur auf einer korrekt
 * eingestellten echten a.p.-Aufnahme (Skapula-Ebene); bei verkippter
 * Projektion ändert sich der gemessene Winkel.
 */

/** Untere/obere Grenze des Normbereichs (jeweils einschließend gemeint). */
export const CSA_SCHWELLEN = { niedrigBis: 30, hochAb: 35 } as const

export type CsaBereich = 'niedrig' | 'normal' | 'hoch'

export interface CsaBefund {
  bereich: CsaBereich
  /** Kurztext für die Werteliste — bewusst als Assoziation formuliert. */
  hinweis: string
}

/**
 * Ordnet einen CSA-Wert (Grad) einem Bereich zu.
 * < 30° niedrig · 30–35° Normbereich · > 35° hoch.
 */
export function beurteileCsa(gradWert: number): CsaBefund {
  if (gradWert < CSA_SCHWELLEN.niedrigBis) {
    return {
      bereich: 'niedrig',
      hinweis: 'niedrig — eher mit Omarthrose assoziiert',
    }
  }
  if (gradWert > CSA_SCHWELLEN.hochAb) {
    return {
      bereich: 'hoch',
      hinweis: 'hoch — eher mit Rotatorenmanschetten-Pathologie assoziiert',
    }
  }
  return { bereich: 'normal', hinweis: 'im Normbereich (30–35°)' }
}
