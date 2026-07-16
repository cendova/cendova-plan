/**
 * Resektionslinie eines AP-Implantats in Canvas/Welt — geteilt vom Overlay
 * (Zeichnen + mm-Tiefe) und der Auto-Platzierung (Referenz-Tiefe lösen).
 *
 * Warum canvas-basiert statt rein in Welt: Das Schablonen-BILD wird im
 * Overlay über eine SVG-`groupTransform` (Spiegelung L + Rotation) im
 * CANVAS positioniert. Damit Resektionspunkte exakt auf dem Bild sitzen,
 * MUSS dieselbe Transform-Kette benutzt werden — eine reine Welt-Rotation
 * könnte (bei einer y-Spiegelung Welt↔Canvas) abweichen. Beide Verbraucher
 * rechnen daher über diese eine Funktion.
 *
 * Reine Geometrie, kein State/DOM (Datenschutz: nur Koordinaten).
 */
import type { Types } from '@cornerstonejs/core'
import type { KneeImage } from './kneeImages'
import type { WorkflowAxes } from './resection'
import { mechanicalAlignRotationDeg } from './resection'

type Vp = Types.IStackViewport

/** Bild-Gruppen-Transform (erst Spiegelung L um cx, dann Rotation um das
 *  Zentrum) auf einen VOR-Transform-Canvaspunkt — exakt wie der SVG-
 *  `groupTransform` des Schablonenbilds. */
export function applyGroupTransform(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rotDeg: number,
  mirror: boolean,
): [number, number] {
  let x = px
  if (mirror) x = 2 * cx - x
  const dx = x - cx
  const dy = py - cy
  const r = (rotDeg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

/** Unsigned-Lotabstand Punkt → Gerade a–b (Weltkoordinaten). */
export function perpDistWorld(
  p: Types.Point3,
  a: Types.Point3,
  b: Types.Point3,
): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L
}

export interface ResectionLine {
  /** Schnittlinien-Endpunkte VOR der Gruppen-Transform (Canvas) — zum
   *  Zeichnen INNERHALB der Bildgruppe (Transform gilt dann mit). */
  aPre: { x: number; y: number }
  bPre: { x: number; y: number }
  /** Endpunkte in Weltkoordinaten — für Tiefe + Label-Positionen (per w2c). */
  aWorld: Types.Point3
  bWorld: Types.Point3
  /** Implantat-Zentrum im Canvas (für die Auswärts-Richtung der Labels). */
  cx: number
  cy: number
}

/**
 * Rechnet die beiden Resektions-Landmarken des Bildes in die Schnittlinie um.
 * Femur: Schnitt liegt `distalThicknessMm` PROXIMAL der distalen Gelenkfläche.
 * Tibia: Schnitt = Baseplate-Linie (kein Offset). `null`, wenn das Bild keine
 * Landmarken trägt.
 */
export function computeResectionLine(
  vp: Vp,
  center: Types.Point3,
  rotationDeg: number,
  side: 'R' | 'L',
  img: KneeImage,
  distalThicknessMm: number | null,
  isFemur: boolean,
  factor: number,
): ResectionLine | null {
  if (!img.resect) return null
  const centerCanvas = vp.worldToCanvas(center)
  const oneMm = 1 / factor
  const probeX = vp.worldToCanvas([center[0] + oneMm, center[1], center[2]] as Types.Point3)
  const probeY = vp.worldToCanvas([center[0], center[1] + oneMm, center[2]] as Types.Point3)
  const cppx = Math.abs(probeX[0] - centerCanvas[0]) * img.mmPerPx
  const cppy = Math.abs(probeY[1] - centerCanvas[1]) * img.mmPerPx
  const wC = img.widthPx * cppx
  const hC = img.heightPx * cppy
  const cx = centerCanvas[0]
  const cy = centerCanvas[1]
  const mirror = side === 'L'
  const pxPerMmY = Math.abs(probeY[1] - centerCanvas[1])
  const pre = (n: [number, number]) => ({ x: cx + (n[0] * wC) / 2, y: cy + (n[1] * hC) / 2 })
  let a = pre(img.resect.left)
  let b = pre(img.resect.right)
  if (isFemur && distalThicknessMm) {
    const off = distalThicknessMm * pxPerMmY
    a = { x: a.x, y: a.y - off }
    b = { x: b.x, y: b.y - off }
  }
  const aPost = applyGroupTransform(a.x, a.y, cx, cy, rotationDeg, mirror)
  const bPost = applyGroupTransform(b.x, b.y, cx, cy, rotationDeg, mirror)
  return {
    aPre: a,
    bPre: b,
    aWorld: vp.canvasToWorld(aPost as Types.Point2),
    bWorld: vp.canvasToWorld(bPost as Types.Point2),
    cx,
    cy,
  }
}

/**
 * Auto-Platzierung: Rotation = mechanisch (Schnitt ⊥ mech. Achse) + Zentrum so
 * entlang der mechanischen Achse, dass die TIEFERE der beiden Resektionen genau
 * `targetMm` (Default 9 mm) misst — die klassische gemessene Resektion mit
 * Referenz an der distalsten (am wenigsten abgenutzten) Kondyle.
 *
 * Liefert { rotationDeg, center } oder null (keine Landmarken / kein Bild).
 */
export function autoPlaceImplant(opts: {
  vp: Vp
  axes: WorkflowAxes
  bone: 'Femur' | 'Tibia'
  side: 'R' | 'L'
  img: KneeImage
  distalThicknessMm: number | null
  factor: number
  targetMm?: number
  /** Aktuelle Rotation als Startwert (vermeidet 180°-Umklappen). Default 0. */
  currentRotationDeg?: number
}): { rotationDeg: number; center: Types.Point3 } | null {
  const { vp, axes, bone, side, img, distalThicknessMm, factor } = opts
  if (!img.resect) return null
  const targetMm = opts.targetMm ?? 9
  const isFemur = bone === 'Femur'
  const nMed = isFemur ? axes.ldfaMed : axes.mptaMed
  const nLat = isFemur ? axes.ldfaLat : axes.mptaLat
  const rotationDeg = mechanicalAlignRotationDeg(
    bone, axes, opts.currentRotationDeg ?? 0, img, side,
  )

  // Bewegungsachse = mechanische Achse (Richtung egal, Gradient korrigiert).
  const mFrom = isFemur ? axes.hip : axes.kneeTibMid
  const mTo = isFemur ? axes.kneeFemMid : axes.ankle
  let ux = mTo[0] - mFrom[0]
  let uy = mTo[1] - mFrom[1]
  const uL = Math.hypot(ux, uy) || 1
  ux /= uL
  uy /= uL

  // „In den Knochen", weg vom Gelenkspalt: Femur proximal (zur Hüfte), Tibia
  // distal (zum Sprunggelenk). Vorzeichenbehaftete Resektionstiefe = wie weit
  // der Schnitt vom nativen Gelenk IN den Knochen reicht. Eindeutige Lösung
  // (kein „zu weit distal"): Schnitt ⊥ mech. Achse ⇒ Komponente entlang dieser
  // Richtung = Lotabstand zum Schnitt, mit Vorzeichen.
  const bFrom = isFemur ? axes.kneeFemMid : axes.kneeTibMid
  const bTo = isFemur ? axes.hip : axes.ankle
  let bx = bTo[0] - bFrom[0]
  let by = bTo[1] - bFrom[1]
  const bL = Math.hypot(bx, by) || 1
  bx /= bL
  by /= bL

  const signedMaxDepth = (c: Types.Point3): number | null => {
    const line = computeResectionLine(vp, c, rotationDeg, side, img, distalThicknessMm, isFemur, factor)
    if (!line) return null
    const midX = (line.aWorld[0] + line.bWorld[0]) / 2
    const midY = (line.aWorld[1] + line.bWorld[1]) / 2
    const sd = (n: Types.Point3) => ((midX - n[0]) * bx + (midY - n[1]) * by) * factor
    return Math.max(sd(nMed), sd(nLat))
  }

  const start = isFemur ? axes.kneeFemMid : axes.kneeTibMid
  let center: Types.Point3 = [start[0], start[1], start[2]]
  // Vorzeichen-Tiefe ist linear in der Verschiebung → ein Newton-Schritt löst
  // exakt; mehrere Iterationen fangen den max()-Knick zwischen den Seiten ab.
  for (let it = 0; it < 8; it++) {
    const d0 = signedMaxDepth(center)
    if (d0 == null) return null
    if (Math.abs(targetMm - d0) < 0.05) break
    const eps = 2
    const probe: Types.Point3 = [center[0] + ux * eps, center[1] + uy * eps, center[2]]
    const d1 = signedMaxDepth(probe)
    if (d1 == null) return null
    const g = (d1 - d0) / eps
    if (Math.abs(g) < 1e-6) break
    const delta = (targetMm - d0) / g
    center = [center[0] + ux * delta, center[1] + uy * delta, center[2]]
  }
  return { rotationDeg, center }
}
