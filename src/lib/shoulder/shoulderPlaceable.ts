// Reines Platzierbarkeits-Prädikat für Schulter-Schablonen —
// cornerstone-FREI und bewusst AUSSERHALB der (lazy geladenen)
// Render-Schicht (dieselbe Lektion wie knee/kneePlaceable.ts: hinter der
// Lazy-Grenze lieferte die Fassade vor dem Laden `false`, und die
// Toolbar-Dropdowns filterten kurzzeitig falsch).
import { getShoulderContour } from './shoulderContours'
import type { ShoulderImplantKind } from './shoulderCatalog'

/** Lässt sich die Familie platzieren (Kontur der Default-Größe da)? */
export function shoulderKindPlaceable(kind: ShoulderImplantKind): boolean {
  return getShoulderContour(kind, 0) !== null
}
