import type { Types } from '@cornerstonejs/core'
import { angleBetweenLines, refLineFrame } from './geometry'
import {
  MEDACTA_CATALOG,
  HEAD_OFFSETS_MM,
  STEM_CCD_BY_FOLDER,
  type MedactaEntry,
} from './medactaCatalog'

type P = Types.Point3

/** Liefert alle Pfannen-Einträge aus dem Medacta-Katalog. */
export function cupCatalogEntries(): MedactaEntry[] {
  return MEDACTA_CATALOG.filter((e) => e.component === 'Cup')
}

/** Klemmt einen Index in das Katalog-Eintragsarray. */
export function clampCupCatalogIndex(index: number): number {
  const max = cupCatalogEntries().length - 1
  return Math.max(0, Math.min(max, index))
}

/** Klemmt einen Größenindex in die Größenliste eines Katalogeintrags. */
export function clampCupSizeIndex(
  catalogIndex: number,
  sizeIndex: number,
): number {
  const entry = cupCatalogEntries()[clampCupCatalogIndex(catalogIndex)]
  const max = entry ? entry.sizes.length - 1 : 0
  return Math.max(0, Math.min(max, sizeIndex))
}

/**
 * Durchmesser (mm) für eine konkrete Pfannen-Auswahl. Beim Versafit CC
 * TRIO ist das `SIZE`-Feld bereits der Durchmesser in mm.
 */
export function cupDiameterMm(catalogIndex: number, sizeIndex: number): number {
  const entry = cupCatalogEntries()[clampCupCatalogIndex(catalogIndex)]
  if (!entry) return 0
  const size = entry.sizes[clampCupSizeIndex(catalogIndex, sizeIndex)]
  const mm = parseFloat(size?.size ?? '')
  return Number.isFinite(mm) ? mm : 0
}

/** Geometrie der Pfannen-Schablone (Halbkreis) in Weltkoordinaten. */
export interface CupShape {
  /** Drehzentrum = Kontaktpunkt für den Schaft. */
  center: P
  radiusWorld: number
  /** Endpunkte der Öffnungsebene (Pfannenrand = flache Seite). */
  rimFrom: P
  rimTo: P
  /** Verlängerte Randlinie zur Visualisierung. */
  rimLineFrom: P
  rimLineTo: P
  /** Achse senkrecht zum Rand durch das Zentrum (verlängert). */
  axisFrom: P
  axisTo: P
  /** Gesampelte Punkte des Kuppel-Halbkreises (rimTo → … → rimFrom). */
  domeArc: P[]
  /** Kurzer Bogen AUSSERHALB der Pfanne am kaudalen Rim-Eck — die
   *  „Cranial edge" (5°-Erhöhung der Versafit-CC-Pfanne, gedachte
   *  Fortführung des Pfannenkreises nach außen). */
  cranialEdge: P[]
  /** Gegenüberliegende Rim-Ecke (kranial-medial). Vom äußeren Endpunkt
   *  des Cranial-Edge-Bogens dorthin verläuft der „wahre" Pfannenrand. */
  cranialAnchor: P
  /** Position des Rotationsgriffs (am Kuppelscheitel). */
  rotationHandle: P
}

const DOME_SEGMENTS = 36
const CRANIAL_EDGE_SEGMENTS = 6
/** Winkelausdehnung des Cranial-Edge-Bogens (5°-Erhöhung der Pfanne). */
const CRANIAL_SPAN_DEG = 5
/** Verlängerungsfaktoren der Hilfslinien relativ zum Pfannenradius. */
const RIM_EXTENSION = 0.6
const AXIS_EXTENSION_TOP = 0.4
const AXIS_EXTENSION_BOTTOM = 0.4

/**
 * Berechnet die Pfannen-Geometrie als Halbkreis. Der Durchmesser wird
 * über die Kalibrierung (mmPerWorldUnit) in Weltkoordinaten umgerechnet
 * — so ist eine 52-mm-Pfanne auch wirklich 52 mm auf dem Bild. Die
 * Kuppel wird als Punktfolge gesampelt, damit der Bogen Zoom/Pan
 * korrekt mitmacht. Die Cranial Edge wird abhängig von der Seite am
 * lateralen Rim-Ende platziert (Medactas intrinsische 12-Uhr-Markierung).
 */
export function cupShape(
  center: P,
  diameterMm: number,
  rotationDeg: number,
  mmPerWorldUnit: number,
  side: 'R' | 'L' = 'R',
): CupShape {
  const radiusWorld = diameterMm / 2 / mmPerWorldUnit
  const a = (rotationDeg * Math.PI) / 180
  const dir: P = [Math.cos(a), Math.sin(a), 0]
  const perp: P = [Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2), 0]

  const arcPoint = (t: number, r: number = radiusWorld): P => [
    center[0] + Math.cos(t) * r,
    center[1] + Math.sin(t) * r,
    center[2],
  ]

  const domeArc: P[] = []
  for (let i = 0; i <= DOME_SEGMENTS; i++) {
    domeArc.push(arcPoint(a + (Math.PI * i) / DOME_SEGMENTS))
  }

  // Cranial Edge: kurzer Bogen AUSSERHALB der Pfanne am lateral-kaudalen
  // Rim-Eck. Die 5°-Erhöhung der Versafit-CC entsteht visuell, indem man
  // den Pfannenkreis gedanklich über den Rim hinaus weiterführt — der
  // äußere Endpunkt liegt 5° um den vollen Kreis vom Rim-Eck entfernt,
  // auf der vom Dom abgewandten Seite (= unter der Rim-Linie im Cup-
  // lokalen Koordinatensystem).
  //
  // R-Hüfte: laterales Rim-Eck = Winkel `a` (dir-Richtung). Der Bogen
  // läuft im Uhrzeigersinn (negativer Winkel) nach außen.
  // L-Hüfte: spiegelbildlich am Rim-Eck `a + π`, mit umgekehrter Richtung.
  const lateralRimAngle = side === 'L' ? a + Math.PI : a
  const awayFromDome = side === 'L' ? +1 : -1
  const spanRad = (CRANIAL_SPAN_DEG * Math.PI) / 180
  const cranialEdge: P[] = []
  for (let i = 0; i <= CRANIAL_EDGE_SEGMENTS; i++) {
    const t =
      lateralRimAngle + awayFromDome * (spanRad * (i / CRANIAL_EDGE_SEGMENTS))
    cranialEdge.push(arcPoint(t, radiusWorld))
  }
  // Anker = gegenüberliegendes (kranial-mediales) Rim-Eck. Vom äußeren
  // Endpunkt des Cranial-Edge-Bogens zu diesem Anker zeichnet die UI den
  // „wahren" Pfannenrand — eine leicht gegenüber der Diameter-Linie
  // gekippte Sehne, die die 5°-Erhöhung einbezieht.
  const cranialAnchor: P = arcPoint(lateralRimAngle + Math.PI, radiusWorld)

  const offsetAlong = (v: P, s: number): P => [
    center[0] + v[0] * s,
    center[1] + v[1] * s,
    center[2],
  ]

  return {
    center,
    radiusWorld,
    rimFrom: offsetAlong(dir, -radiusWorld),
    rimTo: offsetAlong(dir, radiusWorld),
    rimLineFrom: offsetAlong(dir, -radiusWorld * (1 + RIM_EXTENSION)),
    rimLineTo: offsetAlong(dir, radiusWorld * (1 + RIM_EXTENSION)),
    axisFrom: offsetAlong(perp, -radiusWorld * AXIS_EXTENSION_BOTTOM),
    axisTo: offsetAlong(perp, radiusWorld * (1 + AXIS_EXTENSION_TOP)),
    domeArc,
    cranialEdge,
    cranialAnchor,
    rotationHandle: offsetAlong(perp, radiusWorld * 1.15),
  }
}

/**
 * Inklinationswinkel der Pfanne: Winkel zwischen der Öffnungsebene
 * (rimFrom→rimTo) und der Becken-Referenzlinie (refFrom→refTo).
 * Als spitzer Winkel (0–90°) angegeben; klinischer Zielbereich ~40°.
 */
export function cupInclination(
  rimFrom: P,
  rimTo: P,
  refFrom: P,
  refTo: P,
): number {
  const angle = angleBetweenLines(rimFrom, rimTo, refFrom, refTo)
  return angle > 90 ? 180 - angle : angle
}

/** Standard-Inklination für den Positionierungsvorschlag (Grad). */
export const DEFAULT_PROPOSED_INCLINATION_DEG = 43

/**
 * Berechnet einen Positionierungsvorschlag für eine Pfanne anhand der
 * Tränenfigur: 43°-Inklination, Kuppel nach kranial, kaudale Pfannenkante
 * auf der Höhe der Tränenfigur (0 mm Lot-Abstand zwischen den Parallelen),
 * Zentrum leicht lateral verschoben.
 */
export function computeAutoCupPosition(
  teardrop: P,
  refLine: [P, P],
  side: 'R' | 'L',
  mmPerWorldUnit: number,
  diameterMm: number,
): { center: P; rotationDeg: number } {
  const radiusWorld = diameterMm / 2 / mmPerWorldUnit
  const ux = refLine[1][0] - refLine[0][0]
  const uy = refLine[1][1] - refLine[0][1]
  const refAngleDeg = (Math.atan2(uy, ux) * 180) / Math.PI
  // Drehung:
  //  - Basis +270° → bringt den Dom in cupShape (der naiv auf +perp
  //    bulgt) anatomisch korrekt nach SUPERIOR-LATERAL.
  //  - +180° für L → Spiegelung (sonst zeigt der Dom nach falscher Seite).
  //  - signedOffset = ±(90 − Inklination) — Trick: in cupInclination()
  //    ergibt sich der Anzeigewert als `90° − |signedOffset|`. Damit
  //    das Label exakt DEFAULT_PROPOSED_INCLINATION_DEG (43°) zeigt,
  //    setzen wir |signedOffset| = 90 − 43 = 47°. Die Pfanne dreht
  //    sich dadurch nur 4° anders als bei der naiven Variante —
  //    optisch praktisch unsichtbar, aber das Inklinations-Label
  //    stimmt jetzt mit dem klinischen Zielwert überein.
  const sideRotationOffset = side === 'L' ? 180 : 0
  const inclinationOffset = 90 - DEFAULT_PROPOSED_INCLINATION_DEG
  const signedOffset =
    side === 'R' ? -inclinationOffset : inclinationOffset
  const rotationDeg =
    refAngleDeg + 270 + sideRotationOffset + signedOffset
  const a = (rotationDeg * Math.PI) / 180
  const dirY = Math.sin(a)
  // Kaudales Rim-Ende = das mit größerem image-y. center + caudalSign*dir*r
  const caudalSign = dirY >= 0 ? 1 : -1
  // Zentrum so, dass caudal_rim.y == teardrop.y (0 mm Lot-Abstand).
  const centerY = teardrop[1] - caudalSign * dirY * radiusWorld
  // Laterale Versetzung (Bild-x): R-Hüfte links, L-Hüfte rechts.
  const lateralSignX = side === 'R' ? -1 : 1
  const centerX = teardrop[0] + lateralSignX * radiusWorld * 0.8
  return {
    center: [centerX, centerY, teardrop[2]],
    rotationDeg,
  }
}

// ======================================================================
// SCHAFT-TEMPLATES (Femoral Stems)
// ======================================================================

/** Liefert alle Schaft-Einträge aus dem Medacta-Katalog. */
export function stemCatalogEntries(): MedactaEntry[] {
  return MEDACTA_CATALOG.filter((e) => e.component === 'Stem')
}

export function clampStemCatalogIndex(index: number): number {
  const max = stemCatalogEntries().length - 1
  return Math.max(0, Math.min(max, index))
}

export function clampStemSizeIndex(
  catalogIndex: number,
  sizeIndex: number,
): number {
  const entry = stemCatalogEntries()[clampStemCatalogIndex(catalogIndex)]
  const max = entry ? entry.sizes.length - 1 : 0
  return Math.max(0, Math.min(max, sizeIndex))
}

/** Anzahl der Halslängen-Stufen (= Länge von HEAD_OFFSETS_MM). */
export const HEAD_OFFSET_COUNT = HEAD_OFFSETS_MM.length

export function clampHeadOffsetIndex(index: number): number {
  return Math.max(0, Math.min(HEAD_OFFSET_COUNT - 1, index))
}

/** Liefert den mm-Versatz für einen Halslängen-Index. */
export function headOffsetMm(index: number): number {
  return HEAD_OFFSETS_MM[clampHeadOffsetIndex(index)]
}

/**
 * Geometrische Konstanten der stilisierten Schaft-Darstellung. Diese
 * Werte sind anatomisch plausibel, aber NICHT aus den echten Medacta-
 * PDF-Konturen abgeleitet — das ist eine bewusste Vereinfachung. Wichtig
 * ist, dass Halslinie und Schaftachse korrekt zueinander stehen und der
 * Kopf am richtigen Punkt sitzt.
 */

/**
 * CCD-Winkel (Schenkelhals-Schaft-Winkel) je Schaft-Variante: kommt als
 * `stemCcdByFolder` aus dem Schablonen-Paket (siehe medactaCatalog.ts) —
 * Hersteller-Katalogdaten, daher nicht im Code. Ohne Eintrag gilt der
 * neutrale Default 135° (typischer STD-Wert).
 */
const CCD_DEFAULT_DEG = 135

/** Liefert den CCD-Winkel (Grad) für einen Schaft-Katalog-Index. */
export function stemCcdDeg(catalogIndex: number): number {
  const entry = stemCatalogEntries()[clampStemCatalogIndex(catalogIndex)]
  if (!entry) return CCD_DEFAULT_DEG
  return STEM_CCD_BY_FOLDER[entry.folder] ?? CCD_DEFAULT_DEG
}
const STEM_HEAD_DIAMETER_MM = 32 // Standardkopf-Durchmesser
const STEM_NECK_LENGTH_MM = 38 // Hals-Mittellinien-Länge (Kopf → Halsbasis)
const STEM_NECK_WIDTH_MM = 11 // Halsdicke (für visuelles Rechteck)
const STEM_BODY_LENGTH_MM = 130 // Schaftkörper-Länge entlang Schaftachse
const STEM_BODY_PROX_WIDTH_MM = 14 // Schaftkörper-Breite proximal
const STEM_BODY_DIST_WIDTH_MM = 8 // Schaftkörper-Breite distal
const STEM_SHOULDER_OFFSET_MM = 4 // Lateraler Schulter-Überstand (Trochanter-Andeutung)

/** Skaliert alle Schaft-Maße abhängig vom Größenindex (jeder Schritt 6 %). */
function stemScale(sizeIndex: number): number {
  return 1 + sizeIndex * 0.06
}

/** Geometrie eines Schafts in Weltkoordinaten. */
export interface StemShape {
  /** Kopfzentrum (= Rotationsmittelpunkt; soll mit Pfanne übereinstimmen). */
  headCenter: P
  headRadiusWorld: number
  /** Mitte der Halsbasis (= „Konus-Mitte", Übergang Hals → Schaftkörper). */
  neckBase: P
  /** Linie vom Kopfzentrum zur Halsbasis (zur Anzeige der Halsachse). */
  neckPolygon: P[]
  /** Trapezförmiger Schaftkörper als Polygon (proximal breit, distal schmal). */
  bodyPolygon: P[]
  /** Verlängerte Schaftachse (proximal-distal) zur Visualisierung. */
  shaftAxisFrom: P
  shaftAxisTo: P
  /** Position des Rotationsgriffs (am distalen Schaftende). */
  rotationHandle: P
  /** Aktuell verwendeter Halslängen-Versatz in mm (zur Anzeige). */
  headOffsetMm: number
}

/**
 * Default-Rotation eines neu platzierten Schafts in WORLD-Grad:
 * Schaftachse zeigt anatomisch INFERIOR. Das ist in unserer
 * (gegenüber Canvas y-umgekehrten) Welt-Konvention `90°`, sodass
 * der Schaft im Bild nach UNTEN wandert.
 */
export const DEFAULT_STEM_ROTATION_DEG = 90

/**
 * Klinische Schaft-Achsenausrichtung aus dem Rotationswinkel ableiten.
 *
 * Referenz: WENN `referenceAngleDeg` übergeben wird (= Winkel der vom
 * User definierten Femur-Schaft-Achse in Canvas-Grad), gilt diese als
 * Neutral-Position. OHNE Angabe wird die Hardcoded-90°-Vertikale
 * verwendet (Fallback für Schäfte aus Plänen, die VOR der Achsen-
 * Workflow-Einführung gespeichert wurden).
 *
 * Klinische Konvention:
 *  - Spitze des Schafts kippt nach LATERAL (außen, weg von der Mittellinie)
 *    → VARUS-Ausrichtung
 *  - Spitze kippt nach MEDIAL (innen, zur Mittellinie)
 *    → VALGUS-Ausrichtung
 *
 * In unserer Canvas-Konvention (rotationDeg ist Winkel des Vektors
 * proximal→distal, im Uhrzeigersinn, 90° = nach unten):
 *  - rotationDeg > Referenz → Schaft wird im UZS verdreht → Spitze geht
 *    nach RECHTS in Canvas
 *  - rotationDeg < Referenz → Spitze nach LINKS in Canvas
 *
 * Für R-Hüfte (Bild nicht gespiegelt): Spitze nach RECHTS in Canvas
 * = medial für den Patienten = VALGUS; Spitze nach LINKS = lateral =
 * VARUS.
 *
 * Für L-Hüfte: Das Bild wird zur Anzeige gespiegelt, `rotationDeg` aber im
 * unspiegelten Frame gespeichert. Eine identische rotationDeg-Änderung kippt
 * die Spitze daher VISUELL gleich, im PATIENTEN-Koordinatensystem jedoch
 * gespiegelt — also anatomisch gegenläufig. Medial/lateral sind zwischen R
 * und L vertauscht, darum MUSS das Varus/Valgus-Vorzeichen seitenabhängig
 * sein (frühere Annahme „keine Side-Inversion" war falsch — auf der L-Seite
 * wurde Varus als Valgus angezeigt).
 *
 *  R: rotation > Referenz: Spitze lateral = VARUS
 *  L: gespiegelt → rotation < Referenz = VARUS
 */
export function stemAxisAlignment(
  rotationDeg: number,
  side: 'R' | 'L',
  referenceAngleDeg?: number,
): { degrees: number; label: 'Varus' | 'Valgus' | 'Neutral' } {
  const reference = referenceAngleDeg ?? DEFAULT_STEM_ROTATION_DEG
  // Differenz auf das Intervall (−180, +180] normieren, damit z.B.
  // Referenz 88° und rotation 92° als +4° (nicht +356°) gewertet wird.
  let deviation = rotationDeg - reference
  while (deviation > 180) deviation -= 360
  while (deviation <= -180) deviation += 360
  const abs = Math.abs(deviation)
  if (abs < 0.5) return { degrees: 0, label: 'Neutral' }
  // Seitenabhängig: R → deviation>0 = Varus; L gespiegelt → deviation<0 = Varus.
  const isVarus = side === 'L' ? deviation < 0 : deviation > 0
  return { degrees: abs, label: isVarus ? 'Varus' : 'Valgus' }
}

/**
 * Helfer: Berechnet den Achsen-Winkel der zwei Welt-Punkte einer Femur-
 * Schaft-Achse, projiziert in Canvas-Grad. Ergebnis wird so normiert,
 * dass es nach UNTEN zeigt (Sinus ≥ 0), passend zur Konvention
 * proximal → distal.
 */
export function femurAxisAngleCanvasDeg(
  axis: [P, P],
  worldToCanvas: (p: P) => [number, number],
): number {
  const c1 = worldToCanvas(axis[0])
  const c2 = worldToCanvas(axis[1])
  let angle = (Math.atan2(c2[1] - c1[1], c2[0] - c1[0]) * 180) / Math.PI
  if (Math.sin((angle * Math.PI) / 180) < 0) {
    angle = ((angle + 180) % 360 + 360) % 360
  }
  return angle
}

/**
 * Berechnet die Geometrie eines Schafts.
 *
 * Konvention:
 *  - `rotationDeg` ist der WORLD-Winkel der Schaftachse (Richtung
 *    PROXIMAL → DISTAL). 270° = anatomisch INFERIOR (= canvas DOWN nach
 *    der internen Y-Umkehrung).
 *  - Aus der Schaftachse leitet sich die HALSACHSE über den CCD-Winkel
 *    (135°) ab. Für R-Hüfte zeigt der Hals nach SUPERIOR-MEDIAL (canvas
 *    UP-RIGHT), für L-Hüfte gespiegelt (canvas UP-LEFT).
 *  - `headCenter` ist der ANKER der Schablone — das was der Nutzer setzt.
 *    Der Halsbasis-Punkt (= Mitte des Schaft-Kragens) wird daraus mit
 *    Halslänge + Versatz aus HEAD_OFFSETS_MM[headOffsetIndex] berechnet.
 */
export function stemShape(
  headCenter: P,
  rotationDeg: number,
  catalogIndex: number,
  sizeIndex: number,
  headOffsetIndex: number,
  mmPerWorldUnit: number,
  side: 'R' | 'L',
): StemShape {
  const ccdDeg = stemCcdDeg(catalogIndex)
  const scale = stemScale(sizeIndex)
  const mmToWorld = (mm: number) => mm / mmPerWorldUnit
  const headRadiusWorld = mmToWorld(STEM_HEAD_DIAMETER_MM / 2)
  const offsetMm = headOffsetMm(headOffsetIndex)
  const neckLenWorld = mmToWorld(STEM_NECK_LENGTH_MM + offsetMm)
  const bodyLenWorld = mmToWorld(STEM_BODY_LENGTH_MM * scale)
  const bodyProxHalfWorld = mmToWorld((STEM_BODY_PROX_WIDTH_MM * scale) / 2)
  const bodyDistHalfWorld = mmToWorld((STEM_BODY_DIST_WIDTH_MM * scale) / 2)
  const neckHalfWorld = mmToWorld(STEM_NECK_WIDTH_MM / 2)
  const shoulderWorld = mmToWorld(STEM_SHOULDER_OFFSET_MM * scale)

  // Schaftachse: world-Vektor in PROXIMAL → DISTAL Richtung.
  const shaftRad = (rotationDeg * Math.PI) / 180
  const shaft: P = [Math.cos(shaftRad), Math.sin(shaftRad), 0]
  // Senkrechte zur Schaftachse, im Welt-Drehsinn (Cosinus-Richtung).
  const shaftPerp: P = [-shaft[1], shaft[0], 0]

  // Hals-Richtung (Kopfzentrum → Halsbasis). Innenwinkel zur Schaftachse
  // = CCD. Drehung der Schaftrichtung um (180 − CCD) ergibt eine Linie,
  // die mit der Schaftachse den CCD-Winkel einschließt. Für 135° CCD
  // entspricht das ±45° Abweichung; bei 125° (LAT-Variante) sind es 55°
  // (= varischer Hals, mehr Offset zwischen Schaft und Kopf).
  // R-Hüfte: Hals geht nach SUPERIOR-MEDIAL, L-Hüfte spiegelbildlich.
  const sideSign = side === 'R' ? -1 : +1
  const headToBaseDeg = rotationDeg + sideSign * (180 - ccdDeg)
  const headToBaseRad = (headToBaseDeg * Math.PI) / 180
  const neckDir: P = [Math.cos(headToBaseRad), Math.sin(headToBaseRad), 0]

  const neckBase: P = [
    headCenter[0] + neckDir[0] * neckLenWorld,
    headCenter[1] + neckDir[1] * neckLenWorld,
    headCenter[2],
  ]

  // Hals als schmales Rechteck (4 Eckpunkte) zwischen Kopfzentrum und
  // Halsbasis, perpendikular zur Hals-Mittellinie. Wir nehmen einen
  // Hals-perp-Vektor (perp zur Halsrichtung).
  const neckPerp: P = [-neckDir[1], neckDir[0], 0]
  const neckPolygon: P[] = [
    [headCenter[0] + neckPerp[0] * neckHalfWorld, headCenter[1] + neckPerp[1] * neckHalfWorld, headCenter[2]],
    [headCenter[0] - neckPerp[0] * neckHalfWorld, headCenter[1] - neckPerp[1] * neckHalfWorld, headCenter[2]],
    [neckBase[0] - neckPerp[0] * neckHalfWorld, neckBase[1] - neckPerp[1] * neckHalfWorld, neckBase[2]],
    [neckBase[0] + neckPerp[0] * neckHalfWorld, neckBase[1] + neckPerp[1] * neckHalfWorld, neckBase[2]],
  ]

  // Schaftkörper als Trapez ab Halsbasis nach distal. Plus laterale
  // Schulter (Andeutung der Trochanter-Region) am proximalen, lateralen
  // Eck.
  // „Lateral" = die SEITE der Schaftachse, die in shaftPerp-Richtung
  // liegt. Für R-Hüfte ist das canvas-LINKS, für L-Hüfte canvas-RECHTS.
  // Welt-perp kann je nach Rotation in beide Richtungen zeigen — wir
  // wählen so, dass +shoulder anatomisch LATERAL ist.
  const lateralSign = side === 'R' ? -1 : +1
  // Die laterale Welt-Richtung im Schaft-Querschnitt (skalar entlang
  // shaftPerp; Vorzeichen so, dass sie für die Seite stimmt).
  const lateral: P = [
    shaftPerp[0] * lateralSign,
    shaftPerp[1] * lateralSign,
    0,
  ]
  const medial: P = [-lateral[0], -lateral[1], 0]

  const bodyTopMedial: P = [
    neckBase[0] + medial[0] * bodyProxHalfWorld,
    neckBase[1] + medial[1] * bodyProxHalfWorld,
    neckBase[2],
  ]
  // Lateraler Schulter-Punkt: weiter lateral als die Schaftbreite, um
  // den Trochanter-Überstand anzudeuten.
  const bodyTopLateralShoulder: P = [
    neckBase[0] + lateral[0] * (bodyProxHalfWorld + shoulderWorld),
    neckBase[1] + lateral[1] * (bodyProxHalfWorld + shoulderWorld),
    neckBase[2],
  ]
  const distalCenter: P = [
    neckBase[0] + shaft[0] * bodyLenWorld,
    neckBase[1] + shaft[1] * bodyLenWorld,
    neckBase[2],
  ]
  const bodyBottomMedial: P = [
    distalCenter[0] + medial[0] * bodyDistHalfWorld,
    distalCenter[1] + medial[1] * bodyDistHalfWorld,
    distalCenter[2],
  ]
  const bodyBottomLateral: P = [
    distalCenter[0] + lateral[0] * bodyDistHalfWorld,
    distalCenter[1] + lateral[1] * bodyDistHalfWorld,
    distalCenter[2],
  ]

  const bodyPolygon: P[] = [
    bodyTopMedial,
    bodyTopLateralShoulder,
    bodyBottomLateral,
    bodyBottomMedial,
  ]

  // Verlängerte Schaftachse (Hilfslinie, dünn gestrichelt).
  const axisExtensionProx = mmToWorld(20)
  const axisExtensionDist = mmToWorld(15)
  const shaftAxisFrom: P = [
    neckBase[0] - shaft[0] * axisExtensionProx,
    neckBase[1] - shaft[1] * axisExtensionProx,
    neckBase[2],
  ]
  const shaftAxisTo: P = [
    distalCenter[0] + shaft[0] * axisExtensionDist,
    distalCenter[1] + shaft[1] * axisExtensionDist,
    distalCenter[2],
  ]

  // Rotationsgriff am distalen Schaftende, leicht nach lateral versetzt.
  const rotationHandle: P = [
    shaftAxisTo[0] + lateral[0] * mmToWorld(8),
    shaftAxisTo[1] + lateral[1] * mmToWorld(8),
    shaftAxisTo[2],
  ]

  return {
    headCenter,
    headRadiusWorld,
    neckBase,
    neckPolygon,
    bodyPolygon,
    shaftAxisFrom,
    shaftAxisTo,
    rotationHandle,
    headOffsetMm: offsetMm,
  }
}

// ======================================================================
// LLD- / OFFSET-ÄNDERUNG
// ======================================================================

export interface PlanningDelta {
  /** Längenänderung in mm. Positiv = Bein wird länger durch das Implantat. */
  lldMm: number
  /** Offset-Änderung in mm. Vorzeichen klinisch:
   *  - NEGATIV, wenn der geplante Kopf weiter LATERAL liegt (näher zur
   *    Femurachse) → das globale Offset VERRINGERT sich.
   *  - POSITIV, wenn der Kopf weiter MEDIAL liegt → Offset wird GRÖSSER. */
  offsetMm: number
}

/**
 * Berechnet, wie sich Beinlänge und Offset durch die geplante Schaft-
 * Position gegenüber dem nativen (Vor-OP-)Hüftkopfzentrum ändern.
 *
 * Die Becken-Referenzlinie definiert das Koordinatensystem:
 *  - Richtung ENTLANG der Linie = horizontaler/lateraler Bezug → Offset
 *  - Senkrechte zur Linie nach KAUDAL = vertikaler Bezug → LLD
 *
 * Vorzeichenkonvention:
 *  - LLD > 0 wenn die geplante Kopfposition KRANIALER als die native
 *    liegt → das operierte Bein wird LÄNGER.
 *  - Offset < 0 wenn die geplante Kopfposition weiter LATERAL liegt
 *    (näher zur Femurachse → globales Offset wird kleiner); > 0 bei
 *    medialerer Position. (für R-Hüfte ist lateral = Bild-LINKS, für
 *    L-Hüfte = Bild-RECHTS.)
 */
export function computePlanningDelta(
  preopHead: P,
  plannedHead: P,
  refLine: [P, P],
  side: 'R' | 'L',
  mmPerWorldUnit: number,
): PlanningDelta {
  // Richtung + kaudal orientierte Normale aus hip/geometry — dieselbe
  // Konvention wie LLD-Rezept und lldCalculation (Audit-Befund D3).
  const { u, n } = refLineFrame(refLine[0], refLine[1])

  const dx = plannedHead[0] - preopHead[0]
  const dy = plannedHead[1] - preopHead[1]

  // Verschiebung entlang u (lateral/medial) und n (kranial/kaudal).
  const along = dx * u[0] + dy * u[1]
  const acrossCaudal = dx * n[0] + dy * n[1]

  // LLD: positiv wenn geplante Kopfposition KRANIALER liegt (= weniger
  // nach kaudal → operierte Bein wird länger).
  const lldMm = -acrossCaudal * mmPerWorldUnit

  // Offset: NEGATIV wenn geplant weiter LATERAL (Kopf näher zur
  // Femurachse → globales Offset wird kleiner), POSITIV bei medialerer
  // Lage. „Lateral" hängt von der Seite ab: +u zeigt nach Bild-RECHTS.
  //  - R-Hüfte lateral = −u (Bild-LINKS) → along < 0 → soll Offset < 0 →
  //    lateralSign = +1.
  //  - L-Hüfte lateral = +u (Bild-RECHTS) → along > 0 → soll Offset < 0 →
  //    lateralSign = −1.
  const lateralSign = side === 'R' ? +1 : -1
  const offsetMm = lateralSign * along * mmPerWorldUnit

  return { lldMm, offsetMm }
}
