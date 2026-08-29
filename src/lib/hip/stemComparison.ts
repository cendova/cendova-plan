/**
 * Femurseitiger Schablonen-Abgleich (Task 16, Phase B).
 *
 * Vergleicht das Kopfzentrum der PLATZIERTEN Schaftschablone mit dem
 * GEMESSENEN anatomischen Kopfzentrum — beides relativ zur Femurschaft-
 * achse der Femurprofil-Messung (Punkte 4/5). CPAH bleibt damit nur die
 * Vorauswahl; bewertet wird die tatsächliche Geometrie der Variante.
 *
 * Bewusste Abgrenzung zu `computePlanningDelta` (templates.ts): Dort
 * werden Pfannenzentrum und Schaftkopf im Koordinatensystem der
 * BECKEN-Referenzlinie verglichen (globale Bilanz). Hier geht es um den
 * FEMURSEITIGEN Beitrag entlang der gemessenen Schaftachse — dieselbe
 * Referenz, gegen die auch `femoralOffsetMm`/FOR gemessen wurden. Zwei
 * verschiedene Fragen, deshalb zwei Funktionen; die Vorzeichen-
 * konventionen sind identisch (+ = mehr Offset, + = Bein wird länger).
 *
 * Achsrichtung: Punkt 4 = proximal, Punkt 5 = distal (Prefill-Vertrag).
 * Eine verkehrt herum gesetzte Achse kehrt das Längs-Vorzeichen sichtbar
 * um — dieselbe bewusst NICHT abgefangene Fehlbedienung wie bei der
 * 10-cm-Linie (dort wandert die Linie ins Becken).
 *
 * Ohne Kalibrierung gibt es KEINE Werte (null) — keine Pseudo-mm.
 */
import type { Types } from '@cornerstonejs/core'
import { dot, len, sub } from './geometry'

type P = Types.Point3

export interface StemFemurComparison {
  /** Offset-Differenz in mm: Lotabstand Schablonenkopf→Achse minus
   *  gemessenes femorales Offset. Positiv = Variante baut MEHR Offset
   *  auf als die Anatomie. */
  deltaFoMm: number
  /** Kopfhöhe entlang der Achse in mm: positiv = Schablonenkopf liegt
   *  PROXIMALER als das anatomische Zentrum = das Bein würde femurseitig
   *  LÄNGER (gleiche Konvention wie PlanningDelta.lldMm). */
  deltaLaengsMm: number
  /** Ehrliche Einschränkungen (z. B. Kopf auf der Gegenseite der Achse). */
  warnings: string[]
}

/**
 * Femurseitiger Abgleich; `null`, wenn er nicht ehrlich berechenbar ist
 * (fehlende/kaputte Kalibrierung oder Achse ohne Richtung).
 */
export function vergleicheSchaftMitFemurprofil(args: {
  /** Anatomisches Kopfzentrum aus der Femurprofil-Messung. */
  anatomischesKopfzentrum: P
  /** Wirksames Kopfzentrum der platzierten Schablone (headCenter). */
  schablonenKopfzentrum: P
  /** Femurschaftachse der Messung: [proximal, distal] (Punkte 4/5). */
  achse: [P, P]
  mmPerWorldUnit: number | null
}): StemFemurComparison | null {
  const { anatomischesKopfzentrum: ka, schablonenKopfzentrum: ks, achse, mmPerWorldUnit } = args
  if (
    mmPerWorldUnit == null ||
    !Number.isFinite(mmPerWorldUnit) ||
    mmPerWorldUnit <= 0
  ) {
    return null
  }
  const richtung = sub(achse[1], achse[0])
  const dl = len(richtung)
  if (dl === 0) return null
  const u: P = [richtung[0] / dl, richtung[1] / dl, 0]
  const n: P = [-u[1], u[0], 0]

  // Quer (Offset): vorzeichenbehafteter Lotabstand zur Achsen-Geraden.
  const qa = dot(sub(ka, achse[0]), n)
  const qs = dot(sub(ks, achse[0]), n)
  // Längs: Lage entlang der Achse (u zeigt nach distal).
  const la = dot(sub(ka, achse[0]), u)
  const ls = dot(sub(ks, achse[0]), u)

  const warnings: string[] = []
  // Beide Köpfe gehören auf DIESELBE Seite der Achse (medial). Liegen sie
  // auf Gegenseiten, ist fast sicher die Schablone verrutscht oder die
  // Messung von der Gegenseite — der Betragsvergleich bleibt rechnerisch
  // definiert, aber er darf nicht unkommentiert stehen.
  if (qa !== 0 && qs !== 0 && Math.sign(qa) !== Math.sign(qs)) {
    warnings.push(
      'Schablonenkopf liegt auf der GEGENSEITE der Femurachse — Platzierung/Seite prüfen.',
    )
  }

  return {
    deltaFoMm: (Math.abs(qs) - Math.abs(qa)) * mmPerWorldUnit,
    // Positiv, wenn der Schablonenkopf proximaler liegt (ls < la): Der
    // Kopf sitzt höher am Femur, muss zur Reposition ins alte Dreh-
    // zentrum nach distal gezogen werden → Bein wird länger.
    deltaLaengsMm: (la - ls) * mmPerWorldUnit,
    warnings,
  }
}
