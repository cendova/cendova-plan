import type { Types } from '@cornerstonejs/core'

/**
 * Gemeinsames Zeichnen versetzter Bildfragmente — genutzt vom Schaft-Crop
 * (Schulter) und von der Bildsimulation der Umstellungsosteotomie (Knie).
 *
 * Prinzip (Details im Kopf von ShaftFragmentOverlay): Die Pixel werden
 * bei jedem Bild frisch aus dem Viewport-Canvas kopiert und per Canvas-
 * Transformation in das Ziel-Polygon gezeichnet — scharf in jeder
 * Zoomstufe, ohne gespeicherte Pixel. Alle Polygone sind CANVAS-Punkte.
 */
type CP = Types.Point2 | readonly [number, number]

function pfad(ctx: CanvasRenderingContext2D, poly: readonly CP[]) {
  ctx.beginPath()
  poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.closePath()
}

/** Füllt die Stelle, aus der ein Stück herausgelöst wurde, schwarz
 *  (Bildhintergrund) — sonst stünde der Knochen doppelt im Bild. */
export function fuelleLuecke(ctx: CanvasRenderingContext2D, poly: readonly CP[]) {
  ctx.save()
  pfad(ctx, poly)
  ctx.fillStyle = '#000000'
  ctx.fill()
  ctx.restore()
}

/**
 * Zeichnet die Pixel des Quell-Polygons starr bewegt in das Ziel-Polygon.
 * `qs`/`zs` sind die Schwerpunkte beider Polygone (Canvas). Der Drehwinkel
 * wird aus dem Quellpunkt mit dem GRÖSSTEN Abstand zum Schwerpunkt
 * abgeleitet — nahe am Drehpunkt würde Rundungsrauschen den Winkel
 * beliebig ausschlagen lassen; so stimmt die Richtung auch bei gedrehtem
 * oder gespiegeltem Viewport.
 */
export function zeichneVersetzt(
  ctx: CanvasRenderingContext2D,
  quelle: HTMLCanvasElement,
  breite: number,
  hoehe: number,
  quellPoly: readonly CP[],
  zielPoly: readonly CP[],
  qs: CP,
  zs: CP,
) {
  ctx.save()
  pfad(ctx, zielPoly)
  ctx.clip()
  let refIdx = 0
  let refDist = -1
  for (let i = 0; i < quellPoly.length; i++) {
    const d = Math.hypot(quellPoly[i][0] - qs[0], quellPoly[i][1] - qs[1])
    if (d > refDist) {
      refDist = d
      refIdx = i
    }
  }
  const a0 = quellPoly[refIdx]
  const b0 = zielPoly[refIdx]
  const winkel =
    refDist < 1e-6
      ? 0
      : Math.atan2(b0[1] - zs[1], b0[0] - zs[0]) - Math.atan2(a0[1] - qs[1], a0[0] - qs[0])
  ctx.translate(zs[0], zs[1])
  ctx.rotate(winkel)
  ctx.translate(-qs[0], -qs[1])
  ctx.drawImage(quelle, 0, 0, quelle.width, quelle.height, 0, 0, breite, hoehe)
  ctx.restore()
}
