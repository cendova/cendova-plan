/**
 * Geometrie des Schaft-Fragments („Crop-Werkzeug").
 *
 * Idee: Der Nutzer umfährt den Humerusschaft mit einem Polygon. Das
 * eingeschlossene Bildstück lässt sich anschließend verschieben und drehen —
 * eine Osteotomie-Simulation. Das ORIGINAL bleibt darunter sichtbar, damit
 * die Verschiebung als Vorher/Nachher lesbar ist.
 *
 * Alle Punkte sind WELT-Koordinaten (wie in den übrigen Stores); die
 * Umrechnung nach Canvas macht erst das Overlay über `worldToCanvas`.
 * Dadurch bleiben Zoom und Pan automatisch korrekt und die Rechnung hier
 * ist frei von Viewport-Abhängigkeiten — und damit testbar.
 */
import type { Types } from '@cornerstonejs/core'

/** Flächen-Schwerpunkt des Polygons (Drehpunkt des Fragments). */
export function polygonSchwerpunkt(points: Types.Point3[]): Types.Point3 {
  if (points.length === 0) return [0, 0, 0]
  if (points.length < 3) {
    // Zu wenig für eine Fläche: einfacher Mittelwert.
    const n = points.length
    return [
      points.reduce((s, p) => s + p[0], 0) / n,
      points.reduce((s, p) => s + p[1], 0) / n,
      points[0][2],
    ]
  }
  // Standard-Formel über die zweifache orientierte Fläche.
  let a2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    const kreuz = x0 * y1 - x1 * y0
    a2 += kreuz
    cx += (x0 + x1) * kreuz
    cy += (y0 + y1) * kreuz
  }
  // Entartet (kollinear, Fläche 0): auf den Mittelwert zurückfallen, statt
  // durch null zu teilen.
  if (Math.abs(a2) < 1e-9) {
    const n = points.length
    return [
      points.reduce((s, p) => s + p[0], 0) / n,
      points.reduce((s, p) => s + p[1], 0) / n,
      points[0][2],
    ]
  }
  return [cx / (3 * a2), cy / (3 * a2), points[0][2]]
}

/**
 * Bildet einen Punkt des Originals auf seine Lage im verschobenen
 * Fragment ab: erst um den Schwerpunkt drehen, dann verschieben.
 *
 * Reihenfolge ist bewusst so: Der Drehgriff soll das Fragment um sich
 * selbst drehen, unabhängig davon, wie weit es schon verschoben wurde.
 */
export function fragmentPunkt(
  p: Types.Point3,
  schwerpunkt: Types.Point3,
  rotationDeg: number,
  offset: readonly [number, number],
): Types.Point3 {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = p[0] - schwerpunkt[0]
  const dy = p[1] - schwerpunkt[1]
  return [
    schwerpunkt[0] + dx * cos - dy * sin + offset[0],
    schwerpunkt[1] + dx * sin + dy * cos + offset[1],
    p[2],
  ]
}

/** Ganzes Polygon transformieren (Reihenfolge bleibt erhalten). */
export function fragmentPolygon(
  points: Types.Point3[],
  rotationDeg: number,
  offset: readonly [number, number],
): Types.Point3[] {
  const s = polygonSchwerpunkt(points)
  return points.map((p) => fragmentPunkt(p, s, rotationDeg, offset))
}

/**
 * Punkt-in-Polygon (Strahlverfahren, ungerade Schnittzahl = innen).
 * Wird für die Treffererkennung beim Ziehen gebraucht.
 */
export function punktImPolygon(
  p: readonly [number, number],
  polygon: Types.Point3[],
): boolean {
  let drin = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const schneidet =
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi
    if (schneidet) drin = !drin
  }
  return drin
}

/**
 * Verschiebung in Millimetern — für die Beschriftung am Fragment und den
 * PDF-Bericht. `mmProWelt` kommt aus der Kalibrierung; ohne sie ist der
 * Wert eine Welt-Einheit und die Oberfläche kennzeichnet ihn als
 * unkalibriert (wie bei den Längenmaßen).
 */
export function verschiebungBetrag(
  offset: readonly [number, number],
  mmProWelt: number,
): number {
  return Math.hypot(offset[0], offset[1]) * mmProWelt
}
