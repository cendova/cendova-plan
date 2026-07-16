import type { Types } from '@cornerstonejs/core'

type P = Types.Point3

/** Differenz zweier Punkte. */
export function sub(a: P, b: P): P {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** Summe zweier Vektoren/Punkte. */
export function add(a: P, b: P): P {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

/** Vektor mit Skalar multiplizieren. */
export function scale(v: P, s: number): P {
  return [v[0] * s, v[1] * s, v[2] * s]
}

/** Euklidische Länge eines Vektors. */
export function len(v: P): number {
  return Math.hypot(v[0], v[1], v[2])
}

/** Abstand zweier Punkte. */
export function dist(a: P, b: P): number {
  return len(sub(a, b))
}

/** Skalarprodukt. */
export function dot(a: P, b: P): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** Mittelpunkt zweier Punkte. */
export function midpoint(a: P, b: P): P {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
}

/** Winkel in Grad (0–180) zwischen zwei Richtungsvektoren. */
export function angleBetweenVectors(v1: P, v2: P): number {
  const m = len(v1) * len(v2)
  if (m === 0) return 0
  const cos = Math.min(1, Math.max(-1, dot(v1, v2) / m))
  return (Math.acos(cos) * 180) / Math.PI
}

/**
 * Winkel in Grad (0–180) zwischen der Linie a1→a2 und der Linie b1→b2,
 * gemessen über die Richtungen, wie die Linien gezeichnet wurden.
 */
export function angleBetweenLines(a1: P, a2: P, b1: P, b2: P): number {
  return angleBetweenVectors(sub(a2, a1), sub(b2, b1))
}

/** Senkrechter Abstand des Punktes p zur (unendlichen) Geraden l1–l2. */
export function perpendicularDistance(p: P, l1: P, l2: P): number {
  const d = sub(l2, l1)
  const dl = len(d)
  if (dl === 0) return dist(p, l1)
  const t = dot(sub(p, l1), d) / (dl * dl)
  const foot: P = [l1[0] + d[0] * t, l1[1] + d[1] * t, l1[2] + d[2] * t]
  return dist(p, foot)
}

/** Lotfußpunkt von p auf der Geraden l1–l2. */
export function closestPointOnLine(p: P, l1: P, l2: P): P {
  const d = sub(l2, l1)
  const dl = len(d)
  if (dl === 0) return l1
  const t = dot(sub(p, l1), d) / (dl * dl)
  return [l1[0] + d[0] * t, l1[1] + d[1] * t, l1[2] + d[2] * t]
}

/** Normierte Richtung (Einheitsvektor). Nullvektor bleibt [0,0,0]. */
export function unit(v: P): P {
  const l = len(v)
  return l === 0 ? [0, 0, 0] : scale(v, 1 / l)
}

/** Winkel (Grad) am Punkt b zwischen den Strahlen nach a und c. */
export function angleAtVertex(a: P, b: P, c: P): number {
  return angleBetweenVectors(sub(a, b), sub(c, b))
}

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

/**
 * Umkreismittelpunkt + Radius dreier Punkte (2D, in der Bildebene).
 * Für die Bestimmung des Hüftkopfzentrums aus drei Konturpunkten.
 *
 * `degenerate: true`, wenn die Punkte (fast) kollinear liegen — dann ist
 * das Zentrum numerisch instabil und alle daraus abgeleiteten Winkel
 * (CCD, CE, mLDFA, HKA …) unzuverlässig. Aufrufer, die Messwerte
 * anzeigen, MÜSSEN das als Warnung an den Nutzer durchreichen
 * (Audit-Befund D15; klinische Festlegung: warnen, nicht blockieren).
 */
export function circleFrom3Points(
  p1: P,
  p2: P,
  p3: P,
): { center: P; radius: number; degenerate?: true } {
  const [ax, ay] = p1
  const [bx, by] = p2
  const [cx, cy] = p3
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-9) {
    // Exakt kollinear — Notfallwert, damit nichts crasht.
    return { center: midpoint(p1, p3), radius: dist(p1, p3) / 2, degenerate: true }
  }
  const a2 = ax * ax + ay * ay
  const b2 = bx * bx + by * by
  const c2 = cx * cx + cy * cy
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d
  const center: P = [ux, uy, p1[2]]
  const radius = dist(center, p1)
  // Fast kollinear: der Umkreis sprengt die Punktspanne um ein
  // Vielfaches. Drei gut über die Kopfkontur verteilte Punkte liefern
  // r ≈ 0.5–2 × Spanne; ab 4× ist die Platzierung klinisch unbrauchbar.
  const spread = Math.max(dist(p1, p2), dist(p2, p3), dist(p1, p3))
  if (radius > 4 * spread) {
    return { center, radius, degenerate: true }
  }
  return { center, radius }
}
