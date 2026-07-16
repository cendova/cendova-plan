/**
 * Implantat-Resektion & Live-CPAK (koronale Ebene / AP-Aufnahme).
 *
 * Nach der Knie-Vollvermessung werden Femur- und Tibiakomponente auf die
 * Resektionslinien gesetzt. Aus der Implantat-Rotation ergeben sich die
 * „geplanten" Gelenklinien-Winkel:
 *   - implant-LDFA = Winkel(mech. Femurachse, Femur-Schnittlinie)
 *   - implant-MPTA = Winkel(mech. Tibiaachse, Baseplate-Linie)
 * Bei senkrechtem Schnitt (mechanisches Alignment) sind beide 90°.
 *
 * Die Schnittlinie ist die QUERACHSE des Implantats: lokale x-Achse (M/L),
 * die mit `rotationDeg` mitdreht. Die Seite (R/L) spiegelt nur die Form,
 * nicht die Linien-Orientierung — für den Winkel irrelevant.
 *
 * Vorzeichen: Wir verankern den geplanten Winkel an der GEMESSENEN nativen
 * Gelenklinie. Liegt das Implantat auf der nativen Linie, ist der geplante
 * Winkel = der gemessene; steht der Schnitt senkrecht zur mech. Achse, ist
 * er exakt 90°. Beide Anker sind konstruktiv korrekt, unabhängig von der
 * Welt-/Seiten-Orientierung — dazwischen interpoliert er monoton.
 *
 * Reine Berechnung, kein State/DOM (Datenschutz: nur Geometrie).
 */
import type { Types } from '@cornerstonejs/core'
import {
  circleFrom3Points,
  jointLineAngleVec,
  midpoint,
  orientTangent,
  perpComponent,
  scale,
  sub,
} from './geometry'
import { computeCpak, type CpakResult } from './cpak'
import { KNEE_IMPLANT_FAMILIES, type KneeImplantKind } from './smithNephewCatalog'
import { getKneeImage, type KneeImage } from './kneeImages'

type P = Types.Point3
type V2 = { x: number; y: number }

/** Mechanische Achsen-Landmarken aus den 17 Vollvermessungs-Punkten. */
export interface WorkflowAxes {
  hip: P
  /** Mitte der distalen Femur-Tangente (Femur-Gelenklinie). */
  kneeFemMid: P
  /** Mitte der proximalen Tibia-Tangente (Tibia-Gelenklinie). */
  kneeTibMid: P
  ankle: P
  ldfaMed: P
  ldfaLat: P
  mptaMed: P
  mptaLat: P
  /** Transversaler Lateral-Anker: die achsen-SENKRECHTE Komponente des
   *  Schaftversatzes (Hüftkopf → prox. Femurschaft), zeigt zuverlässig
   *  nach lateral. Richtet die med/lat-Tangenten unabhängig von der
   *  Klick-Reihenfolge aus (Debug-Runde 3). Optional für ältere Aufrufer/
   *  Fixtures — ohne Anker gilt die gelabelte Punkt-Reihenfolge. */
  lateralDir?: P
}

/**
 * Rekonstruiert die mechanischen Achsen aus den Workflow-Punkten. Indizes
 * wie in `computeWorkflowRaw`: 0–2 Hüftkopf-Kontur, 3/4 Femur-Schaft
 * proximal, 7/8 Femur-Kondylen-Tangente, 9/10 Tibia-Plateau-Tangente,
 * 16 Sprunggelenkmitte.
 */
export function extractWorkflowAxes(points: P[]): WorkflowAxes | null {
  if (points.length < 17) return null
  const hip = circleFrom3Points(points[0], points[1], points[2]).center
  const ldfaMed = points[7]
  const ldfaLat = points[8]
  const mptaMed = points[9]
  const mptaLat = points[10]
  const ankle = points[16]
  const kneeFemMid = midpoint(ldfaMed, ldfaLat)
  return {
    hip,
    kneeFemMid,
    kneeTibMid: midpoint(mptaMed, mptaLat),
    ankle,
    ldfaMed,
    ldfaLat,
    mptaMed,
    mptaLat,
    // Transversale (achsen-senkrechte) Komponente des Schaftversatzes —
    // zeigt zuverlässig nach lateral (s. perpComponent). Der rohe
    // Schaftvektor läge fast parallel zur mech. Achse und wäre als Anker
    // untauglich (Debug-Runde 3).
    lateralDir: perpComponent(
      sub(midpoint(points[3], points[4]), hip),
      sub(kneeFemMid, hip),
    ),
  }
}

/** Knochen-Zuordnung einer Implantat-Familie (Femur/Tibia) oder null. */
export function boneOf(kind: KneeImplantKind): 'Femur' | 'Tibia' | null {
  return KNEE_IMPLANT_FAMILIES.find((f) => f.kind === kind)?.bone ?? null
}

/**
 * Schnittlinien-Richtung des Implantats in Weltkoordinaten.
 *
 * Ohne Bild: lokale x-Achse (M/L) bei Rotation r → (cos r, sin r).
 * Mit Bild: exakt die GEZEICHNETE Resektionslinie aus den resect-
 * Landmarken des Schablonen-PNGs. Hintergrund (Debug-Befund F1): Die
 * Femur-Bilder tragen den distalen ~6°-Valgusschnitt in ihren Landmarken
 * (Tibia: exakt horizontal). Die Winkel-Box muss DIESELBE Linie messen,
 * die der Nutzer sieht — sonst wirkt der konstante 6°-Offset um die
 * 90°-Neutrale herum wie eine Varus/Valgus-Inversion.
 * mmPerPx kürzt sich; es zählen Seitenverhältnis, side-Spiegelung und
 * Rotation — identisch zur SVG-Gruppe (rotate ∘ mirror) und zu
 * computeResectionLine/applyGroupTransform.
 */
function cutDirectionFor(
  rotationDeg: number,
  img?: KneeImage | null,
  side?: 'L' | 'R',
): V2 {
  const r = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const resect = img?.resect
  if (!resect) return { x: cos, y: sin }
  const s = side === 'L' ? -1 : 1
  const wc = (img.widthPx * img.mmPerPx) / 2
  const hc = (img.heightPx * img.mmPerPx) / 2
  const dx = (resect.right[0] - resect.left[0]) * wc * s
  const dy = (resect.right[1] - resect.left[1]) * hc
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
}

/**
 * Implantat-Gelenklinien-Winkel (LDFA für Femur, MPTA für Tibia) aus der
 * Komponenten-Rotation. Vorzeichen kommt GEOMETRISCH aus der Lage der
 * medialen/lateralen Tangentenpunkte (jointLineAngle) — nicht mehr aus
 * einer Kalibrierung über den gemessenen Spitzwinkel (Debug-Befund K3:
 * die riet bei neutralem Knie und kippte bei valgischen Tangenten).
 * Eigenschaften: Schnitt ⊥ mech. Achse = 90°; Implantat auf der nativen
 * Gelenklinie = gemessener (signierter) Winkel; seitenunabhängig korrekt.
 */
export function implantJointAngle(
  axes: WorkflowAxes,
  bone: 'Femur' | 'Tibia',
  rotationDeg: number,
  img?: KneeImage | null,
  side?: 'L' | 'R',
): number {
  const cut = cutDirectionFor(rotationDeg, img, side)
  const cutFrom: P = [0, 0, 0]
  const cutTo: P = [cut.x, cut.y, 0]
  // toward-Vektoren anatomisch verankert, wenn der Lateral-Anker da ist
  // (Debug-Runde 3: vertauschte med/lat-Klicks spiegelten das Vorzeichen).
  //
  // Achsen-RICHTUNG identisch zur Messung (computeWorkflowRaw, Runde 3
  // Fund 2): vom Gelenk WEG in die Diaphyse — Femur Richtung Hüfte
  // (kneeFemMid → hip), Tibia Richtung Sprunggelenk (kneeTibMid → ankle).
  // So gilt: Implantat auf der nativen Linie = gemessener LDFA/MPTA; ein
  // Femur-Implantat springt die geplante CPAK nicht (sonst zeigte die
  // native Lage 96° statt der gemessenen 84°).
  return bone === 'Femur'
    ? jointLineAngleVec(
        axes.kneeFemMid, axes.hip,
        towardLateral(axes), // LDFA: Linie nach LATERAL orientiert
        cutFrom, cutTo,
      )
    : jointLineAngleVec(
        axes.kneeTibMid, axes.ankle,
        towardMedial(axes), // MPTA: Linie nach MEDIAL orientiert
        cutFrom, cutTo,
      )
}

/** Nach-LATERAL-Vektor der Femur-Tangente — anatomisch verankert, sofern
 *  `lateralDir` vorhanden; sonst gelabelte Reihenfolge (med → lat). */
export function towardLateral(axes: WorkflowAxes): P {
  const raw = sub(axes.ldfaLat, axes.ldfaMed)
  return axes.lateralDir ? orientTangent(raw, axes.lateralDir) : raw
}

/** Nach-MEDIAL-Vektor der Tibia-Tangente (Pendant zu `towardLateral`). */
export function towardMedial(axes: WorkflowAxes): P {
  const raw = sub(axes.mptaMed, axes.mptaLat)
  return axes.lateralDir
    ? orientTangent(raw, scale(axes.lateralDir, -1))
    : raw
}

/** Minimal-Form einer platzierten Schablone (entkoppelt von kneeTemplateStore).
 *  side + sizeIndex erlauben die bild-genaue Schnittrichtung (Befund F1);
 *  fehlen sie, gilt die idealisierte M/L-Achse. */
export interface PlacedComponent {
  kind: KneeImplantKind
  rotationDeg: number
  side?: 'L' | 'R'
  sizeIndex?: number
}

/** Resektions-Bild einer platzierten Komponente (AP), falls verfügbar. */
function imgFor(c: PlacedComponent | null): KneeImage | null {
  if (!c || c.sizeIndex == null) return null
  return getKneeImage(c.kind, 'AP', c.sizeIndex)
}

/** Ergebnis der geplanten (post-OP) CPAK-Berechnung. */
export interface PlannedCpak {
  cpak: CpakResult
  /** Geplanter LDFA (Femurkomponente) bzw. gemessener, wenn keine platziert. */
  ldfa: number
  /** Geplanter MPTA (Tibiakomponente) bzw. gemessener, wenn keine platziert. */
  mpta: number
  femPlaced: boolean
  tibPlaced: boolean
}

/**
 * Geplante CPAK aus den platzierten Komponenten. Wo eine Komponente liegt,
 * zählt ihr Implantat-Winkel; sonst der gemessene Wert. So wandert der
 * „geplante" Punkt live, sobald Femur/Tibia rotiert/verschoben werden.
 */
export function computePlannedCpak(
  axes: WorkflowAxes,
  measuredMLDFA: number,
  measuredMMPTA: number,
  fem: PlacedComponent | null,
  tib: PlacedComponent | null,
): PlannedCpak {
  const ldfa = fem
    ? implantJointAngle(axes, 'Femur', fem.rotationDeg, imgFor(fem), fem.side)
    : measuredMLDFA
  const mpta = tib
    ? implantJointAngle(axes, 'Tibia', tib.rotationDeg, imgFor(tib), tib.side)
    : measuredMMPTA
  return {
    cpak: computeCpak(ldfa, mpta),
    ldfa,
    mpta,
    femPlaced: fem != null,
    tibPlaced: tib != null,
  }
}

/** Wählt die zuletzt platzierte Komponente eines Knochens (Femur/Tibia). */
export function pickComponent<T extends PlacedComponent>(
  templates: ReadonlyArray<T>,
  bone: 'Femur' | 'Tibia',
): T | null {
  const matches = templates.filter((t) => boneOf(t.kind) === bone)
  return matches.length ? matches[matches.length - 1] : null
}

/** Gelenklinien-Mittelpunkt für die mechanische Ausrichtung einer Komponente. */
export function jointCenterFor(bone: 'Femur' | 'Tibia', axes: WorkflowAxes): P {
  return bone === 'Femur' ? axes.kneeFemMid : axes.kneeTibMid
}

/** Faltet `target` auf den 180°-äquivalenten Winkel nahe `current` — eine
 *  Linie wiederholt sich alle 180°, damit das Implantat nicht „umklappt". */
function nearestEquivalentAngle(target: number, current: number): number {
  let t = target
  while (t - current > 90) t -= 180
  while (current - t > 90) t += 180
  return t
}

/**
 * Rotation (Grad), die den Implantat-Schnitt senkrecht zur mechanischen
 * Achse stellt (LDFA/MPTA = 90°). Auf die nächste Übereinstimmung zur
 * aktuellen Rotation eingerastet.
 */
export function mechanicalAlignRotationDeg(
  bone: 'Femur' | 'Tibia',
  axes: WorkflowAxes,
  currentRotationDeg: number,
  img?: KneeImage | null,
  side?: 'L' | 'R',
): number {
  const [from, to] =
    bone === 'Femur' ? [axes.hip, axes.kneeFemMid] : [axes.kneeTibMid, axes.ankle]
  const mech: V2 = { x: to[0] - from[0], y: to[1] - from[1] }
  // Schnitt ⊥ mech. Achse → Querachse ∥ Senkrechte perp=(−my, mx).
  const perpAngle = (Math.atan2(mech.x, -mech.y) * 180) / Math.PI
  // Basis-Kippung der GEZEICHNETEN Linie bei Rotation 0 abziehen — dann
  // steht die sichtbare Resektionslinie senkrecht (Box = 90°), nicht die
  // idealisierte M/L-Achse (Befund F1: Femur-Landmarken sind ~6° gekippt).
  const base = cutDirectionFor(0, img, side)
  const baseAngle = (Math.atan2(base.y, base.x) * 180) / Math.PI
  return nearestEquivalentAngle(perpAngle - baseAngle, currentRotationDeg)
}
