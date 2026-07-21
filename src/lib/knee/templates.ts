/**
 * Shape-Funktionen für die Knie-Implantat-Schablonen.
 *
 * Designprinzip: Eine MASTER-Kontur pro Komponente+View liegt in
 * normalisierten Koordinaten (x ∈ [-1..+1] = M/L, y ∈ [-1..+1] = SI).
 * Beim Rendern wird sie mit den katalogseitigen mm-Maßen skaliert,
 * gespiegelt (R/L), rotiert und um `center` versetzt.
 *
 * Die normalisierten Punkte stammen aus dem Browser-Tracer (siehe
 * `TemplateTracer`), nicht aus hardcodierten Konstanten. So kann jede
 * neue Implantat-Familie ohne Code-Änderung getraced werden — die
 * Skalier-/Render-Pipeline hier bleibt identisch.
 */
import type { Types } from '@cornerstonejs/core'
import {
  GENESIS_II_TIBIA_FEMALE_TAPERED,
  JOURNEY_UK_FEMUR,
  JOURNEY_UK_TIBIA_MEDIAL,
  LEGION_PS_FEMUR,
  SPHERE_FEMUR,
  SPHERE_TIBIA_BASEPLATE,
  TIBIA_INSERT,
  bandForSizeIndex,
  femoralDistalThicknessMm,
  type KneeImplantKind,
} from './smithNephewCatalog'
import { useTemplateTracerStore } from '../../state/templateTracerStore'
import { getKneeContour } from './kneeContours'
import type { KneeSide, KneeView } from '../../state/kneeTemplateStore'

type P = Types.Point3

// ----------------------------------------------------------------------
// mm-Dimensionen pro Implantat-Kombination — für die Skalierung der
// normalisierten Tracer-Punkte. M/L geht entlang der x-Achse, „Höhe"
// (vertikale Erstreckung in der jeweiligen Aufnahme-Ebene) entlang der
// y-Achse.
//
// Für AP-Femur und AP-Tibia gilt: M/L = volle Breite aus dem Katalog.
// Höhe = klinische Höhe der Komponente (Anterior-Flansch-Endkante bis
// Kondylen-Spitze beim Femur; Plateau-Linie bis Stem-Spitze bei der
// Tibia). Lateral analog mit A/P.
// ----------------------------------------------------------------------
interface MmDimensions {
  /** Volle Breite der Master-Kontur in mm (=^= entspricht x ∈ [-1..+1]). */
  widthMm: number
  /** Volle Höhe der Master-Kontur in mm (=^= entspricht y ∈ [-1..+1]). */
  heightMm: number
}

function dimensionsFor(
  kind: KneeImplantKind,
  view: KneeView,
  sizeIndex: number,
): MmDimensions | null {
  const clamp = <T,>(arr: ReadonlyArray<T>, i: number) =>
    arr[Math.max(0, Math.min(arr.length - 1, i))]
  switch (kind) {
    case 'legion-ps-femur': {
      const s = clamp(LEGION_PS_FEMUR, sizeIndex)
      // AP-Sicht: M/L breit, klinisch ~55 % der M/L hoch.
      // Lateral-Sicht: A/P tief, klinisch ~65 % der A/P hoch.
      return view === 'AP'
        ? { widthMm: s.mlMm, heightMm: s.mlMm * 0.55 }
        : { widthMm: s.apMm, heightMm: s.apMm * 0.65 }
    }
    case 'genesis-tibia-female':
    case 'genesis-tibia-male': {
      const s = clamp(GENESIS_II_TIBIA_FEMALE_TAPERED, sizeIndex)
      // AP-Tibia: M/L breit, Höhe = Eminentia + Stem ~80 % der M/L.
      // Lateral-Tibia: A/P tief, Stem-Tiefe ~A/P + 30 mm.
      return view === 'AP'
        ? { widthMm: s.mlMm, heightMm: s.mlMm * 0.8 }
        : { widthMm: s.apMm, heightMm: s.apMm + 30 }
    }
    case 'journey-uk-femur': {
      const s = clamp(JOURNEY_UK_FEMUR, sizeIndex)
      return view === 'AP'
        ? { widthMm: s.apMm * 0.5, heightMm: s.siMm }
        : { widthMm: s.apMm, heightMm: s.siMm }
    }
    case 'journey-uk-tibia-medial':
    case 'journey-uk-tibia-lateral': {
      const s = clamp(JOURNEY_UK_TIBIA_MEDIAL, sizeIndex)
      const ml = s.mlMedialMm ?? s.mlLateralMm ?? 25
      return view === 'AP'
        ? { widthMm: ml, heightMm: s.apMm }
        : { widthMm: s.apMm, heightMm: 40 }
    }
    case 'sphere-femur': {
      const s = clamp(SPHERE_FEMUR, sizeIndex)
      return view === 'AP'
        ? { widthMm: s.overallMlMm, heightMm: s.overallMlMm * 0.55 }
        : { widthMm: s.overallApMm, heightMm: s.overallApMm * 0.65 }
    }
    case 'sphere-tibia-baseplate': {
      const s = clamp(SPHERE_TIBIA_BASEPLATE, sizeIndex)
      return view === 'AP'
        ? { widthMm: s.overallMlMm, heightMm: s.overallMlMm * 0.7 }
        : { widthMm: (s.medialApMm + s.lateralApMm) / 2, heightMm: 40 }
    }
    case 'sphere-insert': {
      // Insert wird (noch) nicht separat gerendert.
      return null
    }
  }
}

// ----------------------------------------------------------------------
// Gerenderte Shape (in Weltkoordinaten).
//
// `paths` enthält alle Sub-Pfade — typischerweise EINE Außenkontur
// (style 'fill', closed) plus 0–N Feature-Linien (PS-Box, Schnitte).
// Der Overlay-Renderer entscheidet per `style`+`closed`, ob er ein
// gefülltes Polygon, eine Polygon-Linie oder eine Polyline zeichnet.
// ----------------------------------------------------------------------
export interface KneeTemplatePath {
  style: 'fill' | 'line' | 'axis'
  closed: boolean
  polygon: P[]
}

export interface KneeTemplateShape {
  /** Alle Sub-Pfade in Render-Reihenfolge (Außenkontur zuerst). */
  paths: KneeTemplatePath[]
  /** Bounding-Box-Mitte (entspricht dem Anker `center`). */
  center: P
  /** Position des Rotationsgriffs (am proximalen Mittelpunkt, leicht
   *  versetzt — analog Hüft-Schaft). */
  rotationHandle: P
  /** mm-Beschriftung: kurze Bezeichnung + Größe für das Label. */
  label: string
  /** Resektionslinie (bis zu den Implantaträndern) + med/lat Referenz-
   *  punkte — nur AP-Femur/Tibia mit Kontur-Resektionsdaten. */
  resection?: { line: [P, P]; med: P; lat: P }
}

export interface ShapeRequest {
  kind: KneeImplantKind
  view: KneeView
  side: KneeSide
  sizeIndex: number
  center: P
  rotationDeg: number
  mmPerWorldUnit: number
  /** Gewählte Inlay-Dicke (mm) bei Tibia-Verbünden. Hebt die Artikulations-
   *  fläche um (Wert − Basisdicke) an. Undefined = keine Anhebung. */
  insertThicknessMm?: number
}

// Hinweis zur Skalierung: Der Tracer normalisiert auf die halbe BREITE
// der AUSSENKONTUR (nicht der gezogenen BBox). Das bedeutet:
// - Die Kontur-Breite (x-Achse = Leitmaß) wird auf [-1, +1] gemappt
// - Die Höhe (y) teilt denselben Faktor → echtes Aspect bleibt erhalten
// - Die gezogene BBox dient nur als optische Hilfe, nicht als Maßstab
//
// Im Renderer multiplizieren wir beide Achsen mit dem GLEICHEN Faktor
// (`widthMm / 2`). Dadurch landet die Kontur-Breite exakt auf `widthMm`
// aus dem Katalog, und die Höhe ergibt sich automatisch aus dem
// getrackten y-Bereich — robust auch, wenn die Höhe größer als die
// Breite ist.

/**
 * Rendert die im Tracer hinterlegten Sub-Pfade für die gegebene
 * Kombination — alle skaliert auf die mm-Maße aus dem Katalog,
 * gespiegelt (L-Seite), rotiert und um `center` versetzt.
 *
 * Skalierung: Die BREITE kommt aus dem Katalog (z. B. mlMm für AP).
 * Die HÖHE ergibt sich aus dem Aspect-Ratio der getrackten Außenkontur
 * — so spart man sich klinische Schätz-Faktoren pro Implantat.
 *
 * Gibt `null` zurück, wenn (1) noch keine Trace mit nutzbaren Punkten
 * existiert oder (2) für die Kombination keine Maße im Katalog stehen.
 */
export function renderKneeTemplate(req: ShapeRequest): KneeTemplateShape | null {
  // BEVORZUGT: maßstabsgetreue Pro-Größe-Kontur (aus Referenz-Screenshots
  // mit Kugel extrahiert). Hat sie für diese (kind, view, sizeIndex) einen
  // Eintrag, nutzen wir sie mit ECHTEN mm-Maßen je Achse — kein Schätz-
  // faktor, korrekte Proportionen pro Größe. Fehlt sie, fällt es unten auf
  // das alte Trace-System zurück (abwärtskompatibel).
  const sized = getKneeContour(req.kind, req.view, req.sizeIndex)
  if (sized && sized.points.length >= 3) {
    return renderFromSizedContour(req, sized)
  }

  // Größenband bestimmen (nur für Komponenten mit Band-Definition, z. B.
  // Journey Femur lateral — sonst null = eine Trace für alle Größen).
  const band = bandForSizeIndex(req.kind, req.view, req.sizeIndex)?.id
  const traced = useTemplateTracerStore
    .getState()
    .getTrace(req.kind, req.view, band)
  if (!traced || traced.length === 0) return null
  const rawUsable = traced.filter((sp) =>
    sp.closed ? sp.points.length >= 3 : sp.points.length >= 2,
  )
  if (rawUsable.length === 0) return null
  // Doppelte/redundante Konturen vermeiden, damit keine unschönen
  // Doppellinien entstehen (Problem bei der Genesis-Tibia-Trace):
  //  1) Es gibt genau EINE Außenkontur (style 'fill'). Weitere 'fill'-
  //     Pfade sind versehentliche Deckungs-Konturen → nur die erste behalten.
  //  2) Manche Traces enthalten redundante Baseplate-Umrisse als eigene
  //     Sub-Pfade („Inlay", „Tibia o. Inlay") — diese wiederholen nur die
  //     Außenkontur. Die ECHTEN Features sind Kiel + Achse. Wir filtern die
  //     Redundanz-Labels case-insensitiv heraus.
  // Komponenten mit sauberer Trace (Legion, Sphere, Journey) sind nicht
  // betroffen — sie haben weder mehrere 'fill'-Pfade noch diese Labels.
  const REDUNDANT_LABELS = ['inlay', 'tibia o. inlay', 'tibia o inlay']
  let fillSeen = false
  const usable = rawUsable.filter((sp) => {
    const label = sp.label.trim().toLowerCase()
    if (REDUNDANT_LABELS.includes(label)) return false
    if (sp.style !== 'fill') return true
    if (fillSeen) return false
    fillSeen = true
    return true
  })
  if (usable.length === 0) return null
  const dims = dimensionsFor(req.kind, req.view, req.sizeIndex)
  if (!dims) return null

  // Einheitliche Skalierung pro Achse: 1 normalisierte Einheit =
  // widthMm/2 Millimeter, für BEIDE Achsen. Das Aspect-Verhältnis lebt
  // in den Punkten selbst (durch halfMax-Normalisierung im Tracer) —
  // keine Schätzfaktoren mehr nötig.
  const widthMm = dims.widthMm
  const halfWorld = widthMm / 2 / req.mmPerWorldUnit
  const halfWWorld = halfWorld
  const halfHWorld = halfWorld
  const sideSign = req.side === 'R' ? 1 : -1
  const cosR = Math.cos((req.rotationDeg * Math.PI) / 180)
  const sinR = Math.sin((req.rotationDeg * Math.PI) / 180)

  const toWorld = (p: { x: number; y: number }): P => {
    const xLocal = p.x * halfWWorld * sideSign
    const yLocal = p.y * halfHWorld
    const xRot = xLocal * cosR - yLocal * sinR
    const yRot = xLocal * sinR + yLocal * cosR
    return [req.center[0] + xRot, req.center[1] + yRot, req.center[2]]
  }

  const paths: KneeTemplatePath[] = usable.map((sp) => ({
    style: sp.style,
    closed: sp.closed,
    polygon: sp.points.map(toWorld),
  }))

  // Rotationsgriff: oberhalb der Kontur, in „proximaler" Richtung.
  const rotationHandle: P = [
    req.center[0] - sinR * halfHWorld * 1.18,
    req.center[1] - cosR * halfHWorld * 1.18,
    req.center[2],
  ]

  const sizeLabel = sizeLabelFor(req.kind, req.sizeIndex)
  return {
    paths,
    center: req.center,
    rotationHandle,
    label: `${labelForKind(req.kind)} · Gr. ${sizeLabel}`,
  }
}

/**
 * Rendert eine maßstabsgetreue Pro-Größe-Kontur. Anders als das uniform
 * skalierende Trace-System nutzt diese Funktion die ECHTEN mm-Maße der
 * Kontur (wMm/hMm aus der Kugel-Kalibrierung) und skaliert x und y mit
 * IHREN JEWEILIGEN Faktoren — so bleiben die Proportionen pro Größe exakt
 * (Kiel/Schild/Ausleger korrekt, kein „mitwachsen").
 *
 * Die Kontur-Punkte sind breiten-normalisiert (x ∈ [-1..+1]); um echte
 * Höhe zu erreichen, skalieren wir y mit (hMm/wMm) gegenüber x.
 */
type SizedContour = {
  wMm: number
  hMm: number
  points: { x: number; y: number }[]
  approx?: boolean
  inlaySplitY?: number
  resect?: { left: [number, number]; right: [number, number] }
  axis?: [[number, number], [number, number]]
  features?: [[number, number], [number, number]][]
}

function renderFromSizedContour(
  req: ShapeRequest,
  contour: SizedContour,
): KneeTemplateShape {
  const halfWWorld = contour.wMm / 2 / req.mmPerWorldUnit
  // x und y sind unabhängig auf [-1,1] normalisiert (x über halbe Breite, y
  // über halbe Höhe) → echte anisotrope Skalierung aus wMm/hMm. Ermöglicht
  // abgeleitete Narrow-Varianten (nur Breite gestaucht, Höhe unverändert).
  const halfHWorld = contour.hMm / 2 / req.mmPerWorldUnit
  const sideSign = req.side === 'R' ? 1 : -1
  const cosR = Math.cos((req.rotationDeg * Math.PI) / 180)
  const sinR = Math.sin((req.rotationDeg * Math.PI) / 180)

  // Inlay-Anhebung: nur bei Tibia-Verbünden mit Trennlinie (inlaySplitY) UND
  // gewählter Dicke UND hinterlegter Basisdicke. Alle Punkte OBERHALB der
  // Trennlinie (kleineres y = das Inlay) werden um (gewählt − Basis) mm nach
  // oben verschoben; Baseplate + Kiel bleiben fix. „Oben" = negatives lokales y.
  const insertCfg = TIBIA_INSERT[req.kind]
  const splitY = contour.inlaySplitY
  const liftWorld =
    insertCfg != null && splitY != null && req.insertThicknessMm != null
      ? (req.insertThicknessMm - insertCfg.baseMm) / req.mmPerWorldUnit
      : 0

  const toWorld = (p: { x: number; y: number }): P => {
    const xLocal = p.x * halfWWorld * sideSign
    const lift = splitY != null && p.y < splitY ? liftWorld : 0
    const yLocal = p.y * halfHWorld - lift
    const xRot = xLocal * cosR - yLocal * sinR
    const yRot = xLocal * sinR + yLocal * cosR
    return [req.center[0] + xRot, req.center[1] + yRot, req.center[2]]
  }

  const paths: KneeTemplatePath[] = [
    { style: 'fill', closed: true, polygon: contour.points.map(toWorld) },
  ]

  // Lokaler Frame → Welt OHNE Inlay-Anhebung (für Achse + Resektionslinie —
  // die dürfen nicht mit dem angehobenen Inlay wandern). sideSign spiegelt L.
  const localToWorld = (xNorm: number, yNorm: number): P => {
    const xL = xNorm * halfWWorld * sideSign
    const yL = yNorm * halfHWorld
    return [
      req.center[0] + xL * cosR - yL * sinR,
      req.center[1] + xL * sinR + yL * cosR,
      req.center[2],
    ]
  }

  // Ausricht-Achse (Mittellinie): BEVORZUGT die aus dem DXF gefittete echte
  // Achse (contour.axis) — sonst die synthetische 6°-Valgus-/90°-Näherung.
  const axisLocal = contour.axis
    ? contour.axis.map(([x, y]) => [x, y])
    : axisEndpointsLocal(req.kind, req.view)
  if (axisLocal) {
    paths.push({
      style: 'axis',
      closed: false,
      polygon: axisLocal.map(([x, y]) => localToWorld(x, y)),
    })
  }

  // Schild-/Feature-Linien (Femur medial+lateral) — dünne durchgezogene
  // Linien, gleicher Transform wie die Kontur (ohne Inlay-Anhebung).
  if (contour.features) {
    for (const seg of contour.features) {
      paths.push({
        style: 'line',
        closed: false,
        polygon: seg.map(([x, y]) => localToWorld(x, y)),
      })
    }
  }

  // Resektionslinie (distale Femurresektion bzw. Baseplate) MIT medial/
  // lateralen Referenzpunkten — aus contour.resect. Die Linie läuft bis zu
  // den Implantaträndern (Kontur-x-Extent auf Höhe des Schnitts), die Punkte
  // markieren die med/lat Resektionsstellen an den Kondylen.
  const resection =
    (contour.resect
      ? buildContourResection(req, contour, localToWorld)
      : null) ?? undefined

  // Höchster Kontur-Punkt (kleinstes y) als Rotationsgriff-Richtung; um die
  // Inlay-Anhebung erhöht, damit der Griff über der angehobenen Oberkante bleibt.
  const minY = Math.min(...contour.points.map((p) => p.y))
  const handleReach = halfHWorld * (Math.abs(minY) + 0.18) + liftWorld
  const rotationHandle: P = [
    req.center[0] - sinR * handleReach,
    req.center[1] - cosR * handleReach,
    req.center[2],
  ]
  const insertLabel =
    insertCfg != null && req.insertThicknessMm != null ? ` · Inlay ${req.insertThicknessMm} mm` : ''
  return {
    paths,
    center: req.center,
    rotationHandle,
    resection,
    label: `${labelForKind(req.kind)} · Gr. ${sizeLabelFor(req.kind, req.sizeIndex)}${contour.approx ? ' (ca.)' : ''}${insertLabel}`,
  }
}

/**
 * Resektionslinie aus den Kontur-Referenzpunkten (contour.resect):
 *  - Femur: Schnitt liegt `distalThicknessMm` PROXIMAL der Kondylen (nach
 *    oben, kleineres lokales y). Tibia: Baseplate-Linie (kein Offset).
 *  - Die LINIE läuft bis zu den Implantaträndern (Kontur-x-Extent auf
 *    Schnitthöhe), die zwei PUNKTE sitzen an den med/lat Kondylen.
 */
function buildContourResection(
  req: ShapeRequest,
  contour: SizedContour,
  localToWorld: (x: number, y: number) => P,
): { line: [P, P]; med: P; lat: P } | null {
  const resect = contour.resect
  if (!resect) return null
  const isFemur = req.kind.includes('femur')
  const halfHMm = contour.hMm / 2
  const distal = isFemur ? femoralDistalThicknessMm(req.kind, req.sizeIndex) : null
  // Schnitthöhe: Mittel der beiden Referenz-y minus (Femur) Offset nach oben.
  const yRef = (resect.left[1] + resect.right[1]) / 2
  const offNorm = isFemur && distal ? distal / halfHMm : 0
  const yCut = yRef - offNorm // y nach unten: „proximal/oben" = kleiner
  // Kontur-x-Ausdehnung auf Schnitthöhe (Schnittpunkte der Kanten mit y=yCut).
  const xs: number[] = []
  const pts = contour.points
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if ((a.y <= yCut && b.y > yCut) || (b.y <= yCut && a.y > yCut)) {
      xs.push(a.x + ((yCut - a.y) / (b.y - a.y)) * (b.x - a.x))
    }
  }
  const xMin = xs.length ? Math.min(...xs) : Math.min(resect.left[0], resect.right[0])
  const xMax = xs.length ? Math.max(...xs) : Math.max(resect.left[0], resect.right[0])
  return {
    line: [localToWorld(xMin, yCut), localToWorld(xMax, yCut)],
    med: localToWorld(resect.left[0], yCut),
    lat: localToWorld(resect.right[0], yCut),
  }
}

/**
 * Lokale Achsen-Endpunkte im normalisierten Frame (x∈[-1,1] M/L, y∈[-1,1] S/I)
 * oder null, wenn keine Achse gilt. Reichen 1.4× über die Kontur hinaus, damit
 * die Richtung gut an der anatomischen Achse ausrichtbar ist. Nur AP (koronale
 * Ebene): Tibia vertikal (90° zum Plateau, durch den Kiel), Femur 6° Valgus.
 */
function axisEndpointsLocal(
  kind: KneeImplantKind,
  view: KneeView,
): number[][] | null {
  if (view !== 'AP') return null
  const reach = 1.4
  if (kind.includes('tibia')) return [[0, -reach], [0, reach]]
  if (kind.includes('femur')) {
    const a = (6 * Math.PI) / 180
    const s = Math.sin(a) * reach
    const c = Math.cos(a) * reach
    return [[s, -c], [-s, c]]
  }
  return null
}

function labelForKind(kind: KneeImplantKind): string {
  switch (kind) {
    case 'legion-ps-femur':            return 'Legion PS'
    case 'genesis-tibia-female':       return 'Genesis II (F)'
    case 'genesis-tibia-male':         return 'Genesis II (M)'
    case 'journey-uk-femur':           return 'Journey UK F'
    case 'journey-uk-tibia-medial':   return 'Journey UK T (med)'
    case 'journey-uk-tibia-lateral':  return 'Journey UK T (lat)'
    case 'sphere-femur':               return 'Sphere F'
    case 'sphere-tibia-baseplate':     return 'Sphere T'
    case 'sphere-insert':              return 'Sphere Ins'
  }
}

export function sizeLabelFor(kind: KneeImplantKind, sizeIndex: number): string {
  // Leere Tabelle → '?' statt Crash: Ein Paket kann eine Kontur liefern,
  // ohne die zugehörige Maßtabelle zu füllen — das darf das Rendern der
  // platzierten Schablone nicht kippen (Label zeigt dann 'Gr. ?').
  const clamp = <T,>(arr: ReadonlyArray<T>, i: number): T | undefined =>
    arr.length ? arr[Math.max(0, Math.min(arr.length - 1, i))] : undefined
  switch (kind) {
    case 'legion-ps-femur':           return clamp(LEGION_PS_FEMUR, sizeIndex)?.size ?? '?'
    case 'genesis-tibia-female':
    case 'genesis-tibia-male':        return clamp(GENESIS_II_TIBIA_FEMALE_TAPERED, sizeIndex)?.size ?? '?'
    case 'journey-uk-femur':          return clamp(JOURNEY_UK_FEMUR, sizeIndex)?.size ?? '?'
    case 'journey-uk-tibia-medial':
    case 'journey-uk-tibia-lateral':  return clamp(JOURNEY_UK_TIBIA_MEDIAL, sizeIndex)?.size ?? '?'
    case 'sphere-femur':              return clamp(SPHERE_FEMUR, sizeIndex)?.size ?? '?'
    case 'sphere-tibia-baseplate':    return clamp(SPHERE_TIBIA_BASEPLATE, sizeIndex)?.size ?? '?'
    case 'sphere-insert':             return ''
  }
}
