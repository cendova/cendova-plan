// Schulter-Schablonen-Katalog (Affinis / Medacta Reverse / ReUnion).
//
// Im ÖFFENTLICHEN Repo sind die Tabellen bewusst LEER: Familien und
// Größenlisten stammen aus Hersteller-Material und kommen aus dem
// importierten Schablonen-Paket — lib/templates/registry.ts ersetzt sie
// beim Paket-Load in-place (dieselbe Doktrin wie KNEE_IMPLANT_FAMILIES).
//
// Mehrdimensionale Größen (Ø × Dicke × Typ, z. B. Glenosphären) sind
// LINEARISIERT: sizeIndex 0..n-1, das zugehörige Label beschreibt die
// Kombination (z. B. „Ø36/T2"). Keine Kombinatorik-Logik in v1 —
// die Lehre aus Genesis II: keine redundanten Varianten-Kinds.
import type { ShoulderProsthesis } from './recipes'

export type ShoulderImplantKind =
  | 'affinis-short-stem'
  | 'affinis-short-head'
  | 'affinis-glenoid'
  | 'affinis-glenoid-vitamys'
  | 'medacta-rev-stem-short'
  | 'medacta-rev-stem-standard'
  | 'medacta-rev-liner'
  | 'medacta-rev-baseplate'
  | 'medacta-rev-glenosphere'
  | 'reunion-s-stem'
  | 'reunion-rsa-cup'
  | 'reunion-rsa-insert'
  | 'reunion-rsa-glenosphere'

export interface ShoulderImplantFamily {
  kind: ShoulderImplantKind
  label: string
  manufacturer: 'Mathys' | 'Medacta' | 'Stryker'
  /** Filtert NUR das Angebot in der Toolbar (anatomisch/revers) —
   *  nie Rechenlogik (dieselbe Doktrin wie recipesForProsthesis). */
  prosthesis: ShoulderProsthesis
  /** Knochen-Seite — bestimmt die sinnvolle Erstplatzierung. */
  bone: 'Humerus' | 'Glenoid'
  /** Anzahl verfügbarer Größen — für UI-Anzeige. */
  sizeCount: number
}

/** Familien (leer — kommt aus dem Paket). */
export const SHOULDER_IMPLANT_FAMILIES: ShoulderImplantFamily[] = []

/** Größen-Labels je kind, Index = sizeIndex (leer — kommt aus dem Paket). */
export const SHOULDER_SIZE_LABELS: Record<string, string[]> = {}

export function shoulderFamiliesForProsthesis(
  p: ShoulderProsthesis,
): ShoulderImplantFamily[] {
  return SHOULDER_IMPLANT_FAMILIES.filter((f) => f.prosthesis === p)
}

export function shoulderSizeLabel(
  kind: ShoulderImplantKind,
  sizeIndex: number,
): string {
  return SHOULDER_SIZE_LABELS[kind]?.[sizeIndex] ?? `Gr. ${sizeIndex + 1}`
}
