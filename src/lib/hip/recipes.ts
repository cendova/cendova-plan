import type { Types } from '@cornerstonejs/core'
import {
  add,
  angleBetweenLines,
  angleBetweenVectors,
  caudalDistance,
  circleFrom3Points,
  closestPointOnLine,
  dist,
  dot,
  len,
  midpoint,
  perpendicularDistance,
  refLineFrame,
  scale,
  sub,
} from './geometry'

type P = Types.Point3

/** Warnzeile für die Werteliste, wenn die Hüftkopf-Punkte (fast) auf
 *  einer Linie liegen — dann sind Kopfzentrum und alle abgeleiteten
 *  Winkel/Abstände unzuverlässig (warnen, nicht blockieren). */
const HEAD_DEGENERATE_WARNING = {
  label: '⚠ Hüftkopf',
  value: 'Punkte fast kollinear — neu setzen',
}

/** Alle Hüft-Messtypen. */
export type HipKind =
  | 'fourPointAngle'
  | 'ccd'
  | 'ceAngle'
  | 'lld'
  | 'globalOffset'
  | 'osteotomy'

/** Renderdaten einer Messung in Weltkoordinaten. */
export interface RenderGeometry {
  lines: {
    from: P
    to: P
    dashed?: boolean
    color?: string
    /** Optionale Strichstärke (Canvas-px). Ohne Angabe Standard-Dicke. */
    width?: number
  }[]
  circles: { center: P; radius: number }[]
  labels: { at: P; text: string }[]
}

export interface HipResultValue {
  label: string
  value: string
}

export interface HipComputed {
  values: HipResultValue[]
  geometry: RenderGeometry
}

export interface Recipe {
  kind: HipKind
  label: string
  /** Eingabeaufforderung je zu setzendem Punkt. */
  steps: string[]
  /** Ob die Messung eine Kalibrierung benötigt (Längen ja, Winkel nein). */
  needsCalibration: boolean
  /**
   * Punkt-Indexpaare, die als verschiebbare Linie zusammengehören.
   * Klick auf die Linie verschiebt beide Endpunkte gemeinsam.
   */
  lineGroups: [number, number][]
  /**
   * Wenn gesetzt, sind diese beiden Punkt-Indizes die globale Becken-
   * Referenzlinie. Konvention: muss `[0, 1]` sein (Linie steht IMMER am
   * Anfang der Steps), damit beim Tool-Start vorhandene Linie nahtlos
   * vorbefüllt werden kann. Der hipStore synct dann in beide Richtungen
   * mit `templateStore.referenceLine`.
   */
  pelvicRefIndices?: [number, number]
  compute: (points: P[], mmPerWorldUnit: number) => HipComputed
}

const HEAD_CONTOUR = [
  'Hüftkopfkontur — Punkt 1',
  'Hüftkopfkontur — Punkt 2',
  'Hüftkopfkontur — Punkt 3',
]

function deg(v: number): string {
  return `${v.toFixed(1)}°`
}

function mm(v: number): string {
  return `${v.toFixed(1)} mm`
}

/** Formatiert einen Millimeterwert als Zentimeter mit Komma. */
function cm(valueMm: number): string {
  return `${(valueMm / 10).toFixed(2).replace('.', ',')} cm`
}

// ----------------------------------------------------------------------
// 4-Punkt-Winkel: zwei unabhängige Linien, Winkel dazwischen.
// ----------------------------------------------------------------------
const fourPointAngle: Recipe = {
  kind: 'fourPointAngle',
  label: '4-Punkt-Winkel',
  needsCalibration: false,
  steps: [
    'Linie 1 — Startpunkt',
    'Linie 1 — Endpunkt',
    'Linie 2 — Startpunkt',
    'Linie 2 — Endpunkt',
  ],
  lineGroups: [
    [0, 1],
    [2, 3],
  ],
  compute: (points) => {
    const [a1, a2, b1, b2] = points
    const angle = angleBetweenLines(a1, a2, b1, b2)
    return {
      values: [{ label: '4-Punkt-Winkel', value: deg(angle) }],
      geometry: {
        lines: [
          { from: a1, to: a2 },
          { from: b1, to: b2 },
        ],
        circles: [],
        labels: [
          { at: midpoint(midpoint(a1, a2), midpoint(b1, b2)), text: deg(angle) },
        ],
      },
    }
  },
}

// ----------------------------------------------------------------------
// CCD-Winkel: Schenkelhalsachse gegen Femurschaftachse.
// ----------------------------------------------------------------------
const ccd: Recipe = {
  kind: 'ccd',
  label: 'CCD-Winkel',
  needsCalibration: false,
  steps: [
    ...HEAD_CONTOUR,
    'Schenkelhals — Mitte',
    'Femurschaftachse — proximaler Punkt',
    'Femurschaftachse — distaler Punkt',
  ],
  lineGroups: [[4, 5]],
  compute: (points) => {
    const [c1, c2, c3, neckPt, s1, s2] = points
    const { center, radius, degenerate } = circleFrom3Points(c1, c2, c3)
    const neckDir = sub(neckPt, center)
    const shaftDir = sub(s2, s1)
    const raw = angleBetweenVectors(neckDir, shaftDir)
    // Der Schenkelhalswinkel ist stets stumpf — stumpfe Variante wählen.
    const angle = raw >= 90 ? raw : 180 - raw
    // Halsachse über den gesetzten Punkt hinaus verlängern.
    const neckEnd = add(center, scale(neckDir, 1.6))
    return {
      values: [
        ...(degenerate ? [HEAD_DEGENERATE_WARNING] : []),
        { label: 'CCD-Winkel', value: deg(angle) },
      ],
      geometry: {
        lines: [
          { from: center, to: neckEnd },
          { from: s1, to: s2 },
        ],
        circles: [{ center, radius }],
        labels: [{ at: neckPt, text: `CCD ${deg(angle)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// CE-Winkel (Wiberg): Vertikale (senkrecht zur Referenzlinie) gegen
// Linie Hüftkopfzentrum → lateraler Pfannenerker.
// ----------------------------------------------------------------------
const ceAngle: Recipe = {
  kind: 'ceAngle',
  label: 'CE-Winkel',
  needsCalibration: false,
  // Becken-Referenzlinie ZUERST, damit sie bei vorhandener globaler
  // Linie nahtlos vorbefüllt werden kann (siehe hipStore.toggleTool).
  steps: [
    'Becken-Referenzlinie — Punkt 1',
    'Becken-Referenzlinie — Punkt 2',
    ...HEAD_CONTOUR,
    'Lateraler Pfannenerker',
  ],
  lineGroups: [[0, 1]],
  pelvicRefIndices: [0, 1],
  compute: (points) => {
    const [r1, r2, c1, c2, c3, edge] = points
    const { center, radius, degenerate } = circleFrom3Points(c1, c2, c3)
    const refDir = sub(r2, r1)
    // Senkrechte zur Referenzlinie, nach kranial (Bild-y negativ) gerichtet.
    let perp: P = [-refDir[1], refDir[0], 0]
    const pl = len(perp)
    if (pl > 0) perp = scale(perp, 1 / pl)
    if (perp[1] > 0) perp = scale(perp, -1)
    const edgeDir = sub(edge, center)
    const angle = angleBetweenVectors(perp, edgeDir)
    const reach = Math.max(dist(center, edge), radius * 2)
    return {
      values: [
        ...(degenerate ? [HEAD_DEGENERATE_WARNING] : []),
        { label: 'CE-Winkel', value: deg(angle) },
      ],
      geometry: {
        lines: [
          { from: add(center, scale(perp, -reach * 0.35)), to: add(center, scale(perp, reach)) },
          { from: center, to: edge },
          { from: r1, to: r2, dashed: true },
        ],
        circles: [{ center, radius }],
        labels: [{ at: center, text: `CE ${deg(angle)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// Beinlängendifferenz: Referenzlinie + je ein Bezugspunkt pro Seite.
// ----------------------------------------------------------------------
const lld: Recipe = {
  kind: 'lld',
  label: 'Beinlängendifferenz',
  needsCalibration: true,
  steps: [
    'Becken-Referenzlinie — Punkt 1',
    'Becken-Referenzlinie — Punkt 2',
    'Spitze Trochanter major rechts',
    'Spitze Trochanter major links',
  ],
  lineGroups: [[0, 1]],
  pelvicRefIndices: [0, 1],
  compute: (points, factor) => {
    const [r1, r2, right, left] = points
    // Richtung + Kaudal-Projektion aus hip/geometry — eine Konvention für
    // alle LLD-/Offset-Rechnungen (Audit-Befund D3).
    const { u } = refLineFrame(r1, r2)
    // Signierte Abstände unterhalb der Referenzlinie — größer = weiter kaudal.
    const sRight = caudalDistance(right, r1, r2) * factor
    const sLeft = caudalDistance(left, r1, r2) * factor
    // Der weiter kaudal stehende Trochanter gehört zum längeren Bein.
    const diff = sRight - sLeft
    // Vorzeichen-Konvention: die VERKÜRZUNG anzeigen (das klinische Defizit),
    // nicht die Verlängerung — die KÜRZERE Seite bekommt das Minus.
    const shorterSide = diff >= 0 ? 'LINKS' : 'RECHTS'
    const lldText =
      Math.abs(diff) < 0.05
        ? '0 cm (seitengleich)'
        : `−${cm(Math.abs(diff))} ${shorterSide}`
    // Bezugspunkte auf die Referenzrichtung projizieren -> horizontale Spanne.
    const tR = dot(sub(right, r1), u)
    const tL = dot(sub(left, r1), u)
    const tMin = Math.min(tR, tL)
    const tMax = Math.max(tR, tL)
    const along = (p: P, tp: number, target: number): P =>
      add(p, scale(u, target - tp))
    const tMid = (tMin + tMax) / 2
    const labelAt = midpoint(along(right, tR, tMid), along(left, tL, tMid))
    return {
      values: [
        { label: 'TM rechts', value: cm(Math.abs(sRight)) },
        { label: 'TM links', value: cm(Math.abs(sLeft)) },
        { label: 'Beinlängendifferenz', value: lldText },
      ],
      geometry: {
        lines: [
          { from: r1, to: r2, dashed: true, color: '#e2e8f0' },
          // Rechts (grün) und links (rot), parallel zur Referenzlinie.
          {
            from: along(right, tR, tMin),
            to: along(right, tR, tMax),
            color: '#4ade80',
          },
          {
            from: along(left, tL, tMin),
            to: along(left, tL, tMax),
            color: '#f87171',
          },
        ],
        circles: [],
        labels: [{ at: labelAt, text: lldText }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// Globales Offset: femorales Offset (Kopfzentrum → Schaftachse) plus
// acetabuläres Offset (Kopfzentrum → Becken-Mittellinie).
// ----------------------------------------------------------------------
const globalOffset: Recipe = {
  kind: 'globalOffset',
  label: 'Globales Offset',
  needsCalibration: true,
  steps: [
    ...HEAD_CONTOUR,
    'Femurschaftachse — proximaler Punkt',
    'Femurschaftachse — distaler Punkt',
    'Becken-Mittellinie — oberer Punkt',
    'Becken-Mittellinie — unterer Punkt',
  ],
  lineGroups: [
    [3, 4],
    [5, 6],
  ],
  compute: (points, factor) => {
    const [c1, c2, c3, s1, s2, m1, m2] = points
    const { center, radius, degenerate } = circleFrom3Points(c1, c2, c3)
    const femoral = perpendicularDistance(center, s1, s2) * factor
    const acetabular = perpendicularDistance(center, m1, m2) * factor
    const total = femoral + acetabular
    return {
      values: [
        ...(degenerate ? [HEAD_DEGENERATE_WARNING] : []),
        { label: 'Femoral', value: mm(femoral) },
        { label: 'Acetabulär', value: mm(acetabular) },
        { label: 'Global', value: mm(total) },
      ],
      geometry: {
        lines: [
          { from: s1, to: s2 },
          { from: m1, to: m2, dashed: true },
          { from: center, to: closestPointOnLine(center, s1, s2) },
          { from: center, to: closestPointOnLine(center, m1, m2) },
        ],
        circles: [{ center, radius }],
        labels: [{ at: center, text: `Offset ${mm(total)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// Osteotomie-Planer: Resektionshöhe relativ zum Trochanter minor.
//
// Klinischer Ablauf:
//  1) Spitze des Trochanter minor markieren (knöcherner Bezugspunkt für
//     die Resektionshöhe — gut reproduzierbar im Röntgen).
//  2) Osteotomie-Linie vom kranialen Schenkelhals zur Kalkaregion ziehen
//     (= geplante Schnittebene des Schenkelhalses).
//  3) Ergebnis = Abstand vom kalkar-seitigen Linienende zum Trochanter
//     minor in Zentimetern (typische Referenz für die intraoperative
//     Kontrolle der Resektionshöhe).
// ----------------------------------------------------------------------
const osteotomy: Recipe = {
  kind: 'osteotomy',
  label: 'Osteotomie-Planer',
  needsCalibration: true,
  steps: [
    'Spitze Trochanter minor',
    'Kranialer Schenkelhals (Linienstart)',
    'Kalkaregion (Linienende)',
  ],
  // Die Osteotomie-Linie (Punkte 1↔2) ist als Gruppe verschiebbar.
  lineGroups: [[1, 2]],
  compute: (points, factor) => {
    const [tmTip, neckStart, calcar] = points
    // Resektionshöhe = Strecke vom Kalkar-Linienende zum Trochanter minor.
    const resectionMm = dist(calcar, tmTip) * factor
    return {
      values: [
        { label: 'Resektionshöhe (Kalkar → Troch. minor)', value: cm(resectionMm) },
      ],
      geometry: {
        lines: [
          // Osteotomie-/Schnittlinie (Schenkelhals → Kalkar): kräftig ROT
          // und dick, damit sie sich klar vom blauen Schaft abhebt.
          { from: neckStart, to: calcar, color: '#ef4444', width: 3.5 },
          // Mess-Strecke (Kalkar → Trochanter minor), gestrichelt + amber.
          { from: calcar, to: tmTip, dashed: true, color: '#fbbf24' },
        ],
        circles: [],
        // Kontext im Label (Debug-Befund H3): der Wert ist die Distanz der
        // GESTRICHELTEN Strecke Kalkar→Trochanter minor — ohne „→ TM" wurde
        // er als Länge der roten Osteotomie-Linie fehlgelesen.
        labels: [{ at: midpoint(calcar, tmTip), text: `→ TM ${cm(resectionMm)}` }],
      },
    }
  },
}

/** Alle implementierten Rezepte in Anzeigereihenfolge. */
export const RECIPES: Record<HipKind, Recipe> = {
  fourPointAngle,
  ccd,
  ceAngle,
  lld,
  globalOffset,
  osteotomy,
}

/** Liste der Mess-Rezepte für die Werkzeugleiste (Sektion „Hüft-
 *  Messungen"). Der Osteotomie-Planer ist bewusst NICHT enthalten — er
 *  bekommt eine eigene Sektion nach den Templates (siehe Toolbar). */
export const AVAILABLE_RECIPES: Recipe[] = [
  fourPointAngle,
  ccd,
  ceAngle,
  lld,
  globalOffset,
]

export function getRecipe(kind: HipKind): Recipe | undefined {
  return RECIPES[kind]
}
