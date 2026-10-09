/**
 * Größenvorwahl beim Platzieren der Tibia (Design-Runde 09.10.2026).
 *
 * Der Femur wird in der Regel zuerst geplant. Bisher startete jede neue
 * Tibia mit Größenindex 0 („Gr. 1"), und der Nutzer stellte sie jedes Mal
 * auf die Femurgröße um. Jetzt übernimmt die Tibia die Größe des bereits
 * platzierten AP-Femurs: zuerst über die GLEICHE Größenbezeichnung in der
 * Tibia-Tabelle (die Pakete nummerieren Femur und Tibia gleich), sonst über
 * denselben Index, auf die Tabellenlänge begrenzt. Ohne Femur bleibt es
 * bei Index 0.
 */
import type { KneeImplantKind } from './smithNephewCatalog'
import {
  GENESIS_II_TIBIA_FEMALE_TAPERED,
  JOURNEY_UK_FEMUR,
  JOURNEY_UK_TIBIA_MEDIAL,
  LEGION_PS_FEMUR,
  SPHERE_FEMUR,
  SPHERE_TIBIA_BASEPLATE,
} from './smithNephewCatalog'

/** Größentabelle einer Implantat-Art (Bezeichnung je Index). */
export function sizesForKind(kind: KneeImplantKind): ReadonlyArray<{ size: string }> {
  switch (kind) {
    case 'legion-ps-femur':           return LEGION_PS_FEMUR
    case 'sphere-femur':              return SPHERE_FEMUR
    case 'sphere-tibia-baseplate':    return SPHERE_TIBIA_BASEPLATE
    case 'genesis-tibia-female':
    case 'genesis-tibia-male':        return GENESIS_II_TIBIA_FEMALE_TAPERED
    case 'journey-uk-femur':          return JOURNEY_UK_FEMUR
    case 'journey-uk-tibia-medial':
    case 'journey-uk-tibia-lateral':  return JOURNEY_UK_TIBIA_MEDIAL
    default:                          return []
  }
}

/** Größenbezeichnung ohne Narrow-/Zusatzkennung („3N" → „3"), für den Abgleich. */
function kern(size: string): string {
  return size.trim().replace(/[^0-9.,]+$/, '').trim() || size.trim()
}

/**
 * Index für die neue Tibia aus der Femurgröße — mit Tabellen statt Store,
 * damit die Regel ohne Browser testbar ist.
 */
export function vorwahlGroesseAus(
  femur: ReadonlyArray<{ size: string }>,
  femurIndex: number,
  tibia: ReadonlyArray<{ size: string }>,
): number {
  if (tibia.length === 0) return 0
  const label = femur[femurIndex]?.size
  if (label !== undefined) {
    const exakt = tibia.findIndex((s) => s.size === label)
    if (exakt >= 0) return exakt
    const k = kern(label)
    const naeherung = tibia.findIndex((s) => kern(s.size) === k)
    if (naeherung >= 0) return naeherung
  }
  return Math.max(0, Math.min(tibia.length - 1, femurIndex))
}

/** Komfort-Form über die Implantat-Arten. */
export function vorwahlTibiaGroesse(
  femurKind: KneeImplantKind,
  femurIndex: number,
  tibiaKind: KneeImplantKind,
): number {
  return vorwahlGroesseAus(sizesForKind(femurKind), femurIndex, sizesForKind(tibiaKind))
}
