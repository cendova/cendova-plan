/**
 * Schulter-Messrezepte. Der Vertrag ist ABSICHTLICH zeichengleich zu
 * `hip/recipes.ts` und `knee/recipes.ts` — dadurch verarbeiten Viewport,
 * Overlay, Werteliste und PDF-Export die Schulter ohne Sonderfall.
 *
 * Stand: Gerüst. Die Rezepte selbst folgen schrittweise (Plan
 * `docs/schulter-modul-plan.md`, Schritte 2–5): CSA zuerst, dann
 * Akromion-Index / Glenoid-Inklination / Hals-Schaft-Winkel, danach die
 * Längenmaße (AHD, Humeruskopf) und zuletzt die RSA-Bilanz (DSA/LSA).
 *
 * Fachliche Leitplanke (siehe Plan A.0): Es werden ausschließlich Größen
 * abgebildet, die auf einer echten a.p.-Aufnahme valide messbar sind.
 * Glenoid-Version, Humerus-Retroversion und Walch-Typisierung gehören ins
 * CT und bleiben bewusst außerhalb dieses Moduls.
 */
import type { Types } from '@cornerstonejs/core'

type P = Types.Point3

/**
 * Alle Schulter-Messtypen. Der Typ ist bereits vollständig deklariert,
 * damit Store, UI und Plan-Format stabil bleiben, während die Rezepte
 * nacheinander dazukommen. `getShoulderRecipe` liefert für noch nicht
 * implementierte Typen `undefined` — genau wie bei der Hüfte für einen
 * unbekannten Typ.
 */
export type ShoulderKind =
  /** Critical Shoulder Angle (Glenoidlinie ↔ unterer Glenoidrand→Akromion). */
  | 'csa'
  /** Akromion-Index (dimensionslos, ohne Kalibrierung messbar). */
  | 'acromionIndex'
  /** Glenoid-Inklination / β-Winkel (Skapulaspina ↔ Glenoidlinie). */
  | 'glenoidInclination'
  /** Humeraler Hals-Schaft-Winkel (Gegenstück zum Hüft-CCD). */
  | 'neckShaftAngle'
  /** Akromiohumeraler Abstand in mm (braucht Kalibrierung). */
  | 'ahd'
  /** Humeruskopf-Zentrum/-Radius aus drei Konturpunkten. */
  | 'humeralHead'
  /** Distalization Shoulder Angle (nur Reverse). */
  | 'dsa'
  /** Lateralization Shoulder Angle (nur Reverse). */
  | 'lsa'

/** Renderdaten einer Messung in Weltkoordinaten (identisch zu Hüfte/Knie). */
export interface RenderGeometry {
  lines: { from: P; to: P; dashed?: boolean; color?: string }[]
  circles: { center: P; radius: number }[]
  labels: { at: P; text: string }[]
}

export interface ShoulderResultValue {
  label: string
  value: string
}

export interface ShoulderComputed {
  values: ShoulderResultValue[]
  geometry: RenderGeometry
}

export interface ShoulderRecipe {
  kind: ShoulderKind
  label: string
  /** Eingabeaufforderung je zu setzendem Punkt. */
  steps: string[]
  /** Ob die Messung eine Kalibrierung benötigt (Längen ja, Winkel nein). */
  needsCalibration: boolean
  /** Punkt-Indexpaare, die als verschiebbare Linie zusammengehören. */
  lineGroups: [number, number][]
  /**
   * Nur bei diesem Prothesentyp anbieten. `undefined` = für beide gültig.
   * Die Bilanz-Winkel (DSA/LSA) sind ausschließlich für die inverse
   * Prothese sinnvoll; die präoperative Analyse gilt für beide.
   * WICHTIG: Das filtert nur das ANGEBOT — die Rechenlogik der Rezepte
   * kennt keinen Prothesentyp.
   */
  onlyFor?: ShoulderProsthesis
  compute: (points: P[], mmPerWorldUnit: number) => ShoulderComputed
}

/** Prothesentyp des Schultermoduls (Plan B.8: beide werden unterstützt). */
export type ShoulderProsthesis = 'anatomic' | 'reverse'

/**
 * Registry der implementierten Rezepte. Noch leer — wird in Schritt 2 ff.
 * befüllt. `Partial`, weil `ShoulderKind` bereits alle geplanten Typen
 * kennt, die Umsetzung aber schrittweise erfolgt.
 */
export const SHOULDER_RECIPES: Partial<Record<ShoulderKind, ShoulderRecipe>> = {}

/** Alle aktuell benutzbaren Rezepte (Reihenfolge = Anzeige im Panel). */
export const AVAILABLE_SHOULDER_RECIPES: ShoulderRecipe[] = []

export function getShoulderRecipe(kind: ShoulderKind): ShoulderRecipe | undefined {
  return SHOULDER_RECIPES[kind]
}

/**
 * Rezepte, die zum gewählten Prothesentyp passen (Plan B.8). Rezepte ohne
 * `onlyFor` gelten für beide Typen.
 */
export function recipesForProsthesis(
  prosthesis: ShoulderProsthesis,
): ShoulderRecipe[] {
  return AVAILABLE_SHOULDER_RECIPES.filter(
    (r) => r.onlyFor === undefined || r.onlyFor === prosthesis,
  )
}
