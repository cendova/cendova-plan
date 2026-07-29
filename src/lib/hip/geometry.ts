/**
 * Hüft-Geometrie: leitet die gemeinsamen Primitiven aus `lib/geometry`
 * weiter und ergänzt die hüft-EIGENEN Helfer (Becken-Referenzlinie).
 *
 * Aufbau bewusst identisch zu `lib/knee/geometry.ts`: Der Modul-Code
 * importiert weiterhin nur aus `'./geometry'` und muss nicht wissen, wo
 * die Basis-Mathematik liegt. Die Primitiven selbst stehen seit dem
 * Schulter-Vorbereitungs-Refactor in `lib/geometry/` — genau einmal für
 * alle Module.
 */
import type { Types } from '@cornerstonejs/core'
import { dot, scale, sub, unit } from '../geometry'

// Bewusst `export *` statt einer handgepflegten Namensliste: Sonst driften
// die Fassaden der Module auseinander (die Knie-Liste hatte z. B.
// `angleAtVertex` nie enthalten). Eine neue Primitive ist so sofort in
// allen Modulen verfügbar, ohne sie an drei Stellen nachzutragen.
export * from '../geometry'

type P = Types.Point3

/**
 * Richtung `u` + nach KAUDAL orientierte Normale `n` einer Referenzlinie
 * (n[1] >= 0; Bild-y wächst nach kaudal) — DIE gemeinsame Konvention
 * aller LLD-/Offset-Rechnungen. Vorher an vier Stellen unabhängig
 * implementiert (Audit-Befund D3); Konventions-Drift würde dort
 * LLD-/Offset-Vorzeichen kippen.
 */
export function refLineFrame(refFrom: P, refTo: P): { u: P; n: P } {
  const u = unit(sub(refTo, refFrom))
  let n: P = [-u[1], u[0], 0]
  if (n[1] < 0) n = scale(n, -1)
  return { u, n }
}

/**
 * Vorzeichenbehafteter Kaudal-Abstand eines Punktes zur Referenzlinie
 * (Projektion auf die kaudal orientierte Normale; größer = weiter kaudal).
 */
export function caudalDistance(pt: P, refFrom: P, refTo: P): number {
  const { n } = refLineFrame(refFrom, refTo)
  return dot(sub(pt, refFrom), n)
}
