import type { Types } from '@cornerstonejs/core'
import {
  acuteAngleBetweenLines,
  add,
  angleBetweenVectors,
  circleFrom3Points,
  closestPointOnLine,
  dist,
  dot,
  jointLineAngleVec,
  lineLineIntersection2D,
  midpoint,
  orientTangent,
  perpComponent,
  perpendicularThroughMid,
  scale,
  signedPerpDistance,
  sub,
} from './geometry'
import { classifyAlignment } from './cpak'

type P = Types.Point3

/** Warnzeile für die Werteliste, wenn die Hüftkopf-Punkte (fast) auf
 *  einer Linie liegen — dann sind alle abgeleiteten Winkel unzuverlässig
 *  (klinische Festlegung: warnen, nicht blockieren). */
const HEAD_DEGENERATE_WARNING = {
  label: '⚠ Hüftkopf',
  value: 'Punkte fast kollinear — neu setzen',
}

/** Alle Knie-Messtypen. */
export type KneeKind =
  | 'workflow'
  | 'hka'
  | 'mLDFA'
  | 'mMPTA'
  | 'tibialSlope'

/** Renderdaten einer Messung in Weltkoordinaten (identisch zur Hüft-Form). */
export interface RenderGeometry {
  lines: { from: P; to: P; dashed?: boolean; color?: string }[]
  circles: { center: P; radius: number }[]
  labels: { at: P; text: string }[]
}

export interface KneeResultValue {
  label: string
  value: string
}

export interface KneeComputed {
  values: KneeResultValue[]
  geometry: RenderGeometry
}

export interface KneeRecipe {
  kind: KneeKind
  label: string
  /** Eingabeaufforderung je zu setzendem Punkt. */
  steps: string[]
  /** Ob die Messung eine Kalibrierung benötigt (Längen ja, Winkel nein). */
  needsCalibration: boolean
  /** Punkt-Indexpaare, die als verschiebbare Linie zusammengehören. */
  lineGroups: [number, number][]
  compute: (points: P[], mmPerWorldUnit: number) => KneeComputed
}

const HEAD_CONTOUR = [
  'Hüftkopfkontur — Punkt 1',
  'Hüftkopfkontur — Punkt 2',
  'Hüftkopfkontur — Punkt 3',
]

function deg(v: number): string {
  return `${v.toFixed(1)}°`
}

// (kein generischer mm-Formatter aktuell genutzt — alle Werte verwenden
// `signedMm` für Pre/Post-Vergleich. Bei Bedarf hier ergänzen.)

/** Signed mm mit explizitem Vorzeichen ("+4,2 mm" / "−1,8 mm"). */
function signedMm(v: number): string {
  const s = v >= 0 ? '+' : '−'
  return `${s}${Math.abs(v).toFixed(1)} mm`
}

// ----------------------------------------------------------------------
// HKA — Hip-Knee-Ankle / Mikulicz-Linie.
//
// Anatomisches Modell:
//   - Hüftkopfzentrum aus 3 Konturpunkten (Circle-Fit, wie beim CCD).
//   - Femur-Mechanische Achse: Hüftkopfzentrum → Kniezentrum.
//   - Tibia-Mechanische Achse: Kniezentrum → Sprunggelenk.
//   - HKA-Winkel = Winkel HÜFTKOPF → KNIE → SPRUNGGELENK (am Knie).
//     Neutrale Beinachse = 180°. < 180° = Varus, > 180° = Valgus.
//   - Mikulicz-Abstand = vorzeichenbehafteter Lotabstand des Kniezentrums
//     zur direkten Linie Hüftkopf↔Sprunggelenk (in mm). Vorzeichen bleibt
//     anatomisch uninterpretiert (Bild-Orientierungs-abhängig); der User
//     liest die Richtung am Bild ab.
// ----------------------------------------------------------------------
const hka: KneeRecipe = {
  kind: 'hka',
  label: 'mHKA (Beinachse)',
  needsCalibration: true,
  steps: [
    ...HEAD_CONTOUR,
    'Kniezentrum',
    'Sprunggelenkmitte',
  ],
  lineGroups: [],
  compute: (points, factor) => {
    const [c1, c2, c3, knee, ankle] = points
    const { center: hip, radius } = circleFrom3Points(c1, c2, c3)
    // HKA: Winkel zwischen den am Knie zusammenlaufenden Vektoren.
    const vHip = sub(hip, knee)
    const vAnkle = sub(ankle, knee)
    const hkaDeg = angleBetweenVectors(vHip, vAnkle)
    // Wie weit weicht das Bein von der Streckung ab (= 180°-Abweichung).
    const deviationDeg = 180 - hkaDeg
    // Mikulicz-Abstand: vorzeichenbehaftet, in mm.
    const mikuliczWorld = signedPerpDistance(knee, hip, ankle)
    const mikuliczMm = mikuliczWorld * factor
    // Fußpunkt für die kurze Senkrechte vom Knie auf die Mikulicz-Linie.
    const foot = closestPointOnLine(knee, hip, ankle)
    return {
      values: [
        { label: 'mHKA', value: deg(hkaDeg) },
        { label: 'Abweichung 180°', value: deg(deviationDeg) },
        { label: 'Mikulicz-Abstand', value: signedMm(mikuliczMm) },
      ],
      geometry: {
        lines: [
          // Femur-Mech-Achse und Tibia-Mech-Achse (durchgezogen).
          { from: hip, to: knee },
          { from: knee, to: ankle },
          // Direkte Mikulicz-Linie (gestrichelt, grau).
          { from: hip, to: ankle, dashed: true, color: '#e2e8f0' },
          // Kurzes Lot vom Kniezentrum zur Mikulicz-Linie (orange).
          { from: knee, to: foot, color: '#fb923c' },
        ],
        circles: [{ center: hip, radius }],
        labels: [{ at: knee, text: `mHKA ${deg(hkaDeg)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// mLDFA — mechanischer lateraler distaler Femur-Winkel.
//
// 3 Konturpunkte am Hüftkopf + 2 Punkte für die distale Femur-Tangente
// (mediale und laterale Kondylen-Tangentialpunkte). Das Kniezentrum ist
// der Mittelpunkt der Tangente. Die Femur-Mechanische Achse läuft vom
// Hüftkopfzentrum zu diesem Mittelpunkt. mLDFA = spitzer Winkel zwischen
// Mech-Achse und Tangente (klinischer Normwert ≈ 85–90°).
// ----------------------------------------------------------------------
const mLDFA: KneeRecipe = {
  kind: 'mLDFA',
  label: 'mLDFA',
  needsCalibration: false,
  steps: [
    ...HEAD_CONTOUR,
    'Femur-Kondylen-Tangente — Punkt 1 (medial)',
    'Femur-Kondylen-Tangente — Punkt 2 (lateral)',
  ],
  lineGroups: [[3, 4]],
  compute: (points) => {
    const [c1, c2, c3, tMed, tLat] = points
    const { center: hip, radius } = circleFrom3Points(c1, c2, c3)
    const kneeMid = midpoint(tMed, tLat)
    const angle = acuteAngleBetweenLines(hip, kneeMid, tMed, tLat)
    return {
      values: [{ label: 'mLDFA', value: deg(angle) }],
      geometry: {
        lines: [
          { from: hip, to: kneeMid },
          { from: tMed, to: tLat },
        ],
        circles: [{ center: hip, radius }],
        labels: [{ at: kneeMid, text: `mLDFA ${deg(angle)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// mMPTA — mechanischer medialer proximaler Tibia-Winkel.
//
// 2 Punkte für die Tibia-Plateau-Tangente + 1 Punkt für die Sprunggelenk-
// mitte. Tibia-Mech-Achse läuft vom Tangenten-Mittelpunkt zum Sprung-
// gelenk; mMPTA = spitzer Winkel (Normwert ≈ 85–90°).
// ----------------------------------------------------------------------
const mMPTA: KneeRecipe = {
  kind: 'mMPTA',
  label: 'mMPTA',
  needsCalibration: false,
  steps: [
    'Tibia-Plateau-Tangente — Punkt 1 (medial)',
    'Tibia-Plateau-Tangente — Punkt 2 (lateral)',
    'Sprunggelenkmitte',
  ],
  lineGroups: [[0, 1]],
  compute: (points) => {
    const [tMed, tLat, ankle] = points
    const kneeMid = midpoint(tMed, tLat)
    const angle = acuteAngleBetweenLines(kneeMid, ankle, tMed, tLat)
    return {
      values: [{ label: 'mMPTA', value: deg(angle) }],
      geometry: {
        lines: [
          { from: kneeMid, to: ankle },
          { from: tMed, to: tLat },
        ],
        circles: [],
        labels: [{ at: kneeMid, text: `mMPTA ${deg(angle)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// Tibialer Slope (laterale Aufnahme).
//
// 2 Punkte für die Tibia-Schaftachse (proximal → distal) + 2 Punkte
// für das Tibia-Plateau in der Sagittalebene (anterior → posterior).
// Slope = Winkel zwischen Plateau und der SENKRECHTEN zur Schaftachse
// (also: 90° − Winkel zwischen Schaftachse und Plateau, als positiver
// Wert). Normwert ≈ 5–10° posteriorer Slope.
//
// Vorzeichen-Konvention: Wir geben hier den BETRAG aus. Ob es ein
// posteriorer oder anteriorer Slope ist, sieht der User am Bild ab.
// ----------------------------------------------------------------------
const tibialSlope: KneeRecipe = {
  kind: 'tibialSlope',
  label: 'Tibialer Slope',
  needsCalibration: false,
  steps: [
    'Tibia-Schaftachse — proximaler Punkt',
    'Tibia-Schaftachse — distaler Punkt',
    'Tibia-Plateau (lateral) — anteriorer Punkt',
    'Tibia-Plateau (lateral) — posteriorer Punkt',
  ],
  lineGroups: [
    [0, 1],
    [2, 3],
  ],
  compute: (points) => {
    const [s1, s2, p1, p2] = points
    // Spitzer Winkel zwischen Schaftachse und Plateau-Tangente.
    const shaftVsPlateau = acuteAngleBetweenLines(s1, s2, p1, p2)
    // Slope = Abweichung von 90°. Wenn das Plateau senkrecht zur Schaft-
    // achse stünde, wäre shaftVsPlateau = 90° und der Slope = 0°.
    const slope = Math.abs(90 - shaftVsPlateau)
    // Visualisierung: Senkrechte zur Schaftachse durch den Mittelpunkt
    // des Plateaus — macht es einfacher zu sehen, wie weit das Plateau
    // davon abweicht.
    const platMid = midpoint(p1, p2)
    const shaftVec = sub(s2, s1)
    const shaftLen = Math.hypot(shaftVec[0], shaftVec[1])
    let perpLine: { from: P; to: P }
    if (shaftLen > 0) {
      // Halbe Länge der Plateau-Tangente als Maßstab für die Hilfslinie.
      const platHalf = dist(p1, p2) / 2
      const unit: P = [shaftVec[0] / shaftLen, shaftVec[1] / shaftLen, 0]
      const perpUnit: P = [-unit[1], unit[0], 0]
      perpLine = {
        from: add(platMid, scale(perpUnit, -platHalf)),
        to: add(platMid, scale(perpUnit, platHalf)),
      }
    } else {
      perpLine = perpendicularThroughMid(p1, p2, 0)
    }
    return {
      values: [{ label: 'Tibialer Slope', value: deg(slope) }],
      geometry: {
        lines: [
          { from: s1, to: s2 },
          { from: p1, to: p2 },
          { from: perpLine.from, to: perpLine.to, dashed: true, color: '#e2e8f0' },
        ],
        circles: [],
        labels: [{ at: platMid, text: `Slope ${deg(slope)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// Knie-Vollvermessung — kombinierter Workflow für die TEP-Planung.
//
// EINE 17-Punkt-Sequenz liefert alle Parameter, die für die Resektions-
// planung gebraucht werden — HKA, mLDFA, mMPTA, Femur-AMA („Wetter-
// winkel") und JLCA. Erspart dem User, dieselben Landmarken (Hüftkopf,
// Tangenten) für jede Einzelmessung neu zu setzen.
//
// Punkt-Indizes:
//   0–2   Hüftkopf-Kontur (→ Hüftkopfzentrum via circle-fit)
//   3,4   Femur-Schaft proximal medial+lateral (→ Mitte = anat. Stütz-Pkt 1)
//   5,6   Femur-Schaft distal medial+lateral   (→ Mitte = anat. Stütz-Pkt 2)
//   7,8   Femur-Kondylen-Tangente medial+lateral (LDFA)
//   9,10  Tibia-Plateau-Tangente medial+lateral (MPTA)
//   11    Anatomisches Kniezentrum (Eminentia-Mitte)  → Knick der HKA
//   12,13 Tibia-Schaft proximal medial+lateral
//   14,15 Tibia-Schaft distal medial+lateral
//   16    Sprunggelenkmitte
//
// Resultate:
//   - HKA-Winkel + Mikulicz-Abstand (mm) am Knie-Punkt 11
//   - mLDFA = spitzer Winkel (mech. Femur-Achse, LDFA-Tangente)
//   - mMPTA = spitzer Winkel (mech. Tibia-Achse, MPTA-Tangente)
//   - JLCA  = spitzer Winkel zwischen Femur-Tangente und Tibia-Tangente
//   - Femur-AMA („Wetterwinkel") = Winkel zwischen anatomischer Femur-
//     Schaftachse (Stützpunkte aus 3-4 & 5-6) und mechanischer Femur-Achse
//     (Hüftkopf → Femur-Tangenten-Mitte). Klinisch ~5–7°, entscheidend
//     für den distalen Femur-Resektionsblock.
// ----------------------------------------------------------------------
const workflow: KneeRecipe = {
  kind: 'workflow',
  label: 'Knie-Vollvermessung',
  needsCalibration: true,
  steps: [
    // Hüftkopf (0–2)
    'Hüftkopfkontur — Punkt 1',
    'Hüftkopfkontur — Punkt 2',
    'Hüftkopfkontur — Punkt 3',
    // Femur-Schaftachse (3–6) — je Höhe medial + lateral am Innenrand
    'Femur-Schaft proximal — medialer Innenrand',
    'Femur-Schaft proximal — lateraler Innenrand',
    'Femur-Schaft distal — medialer Innenrand',
    'Femur-Schaft distal — lateraler Innenrand',
    // LDFA-Tangente (7,8)
    'Femur-Kondylen-Tangente — medial',
    'Femur-Kondylen-Tangente — lateral',
    // MPTA-Tangente (9,10)
    'Tibia-Plateau-Tangente — medial',
    'Tibia-Plateau-Tangente — lateral',
    // Kniezentrum (11)
    'Anatomisches Kniezentrum (Eminentia-Mitte)',
    // Tibia-Schaftachse (12–15)
    'Tibia-Schaft proximal — medialer Innenrand',
    'Tibia-Schaft proximal — lateraler Innenrand',
    'Tibia-Schaft distal — medialer Innenrand',
    'Tibia-Schaft distal — lateraler Innenrand',
    // Sprunggelenk (16)
    'Sprunggelenkmitte',
  ],
  // Verschiebbare Linien: die Tangenten + die anatomischen Schaft-
  // Stütz-Paare. Letztere sind als Paar gedacht (jedes Paar definiert
  // EINE Schaft-Mitte); wenn der User das Paar als Linie zieht, wandert
  // die Mitte mit — anatomisch sinnvoll.
  lineGroups: [
    [3, 4], // Femur-Schaft proximal
    [5, 6], // Femur-Schaft distal
    [7, 8], // LDFA-Tangente
    [9, 10], // MPTA-Tangente
    [12, 13], // Tibia-Schaft proximal
    [14, 15], // Tibia-Schaft distal
  ],
  compute: (points, factor) => {
    // EINE Rechen-Engine (Audit-Befund D1): sämtliche Messwerte kommen aus
    // computeWorkflowRaw — hier wird nur noch formatiert und gezeichnet.
    // Vorher rechneten compute und computeWorkflowRaw dieselben Formeln
    // unabhängig doppelt (Drift-Risiko auf Messwerten).
    const raw = computeWorkflowRaw(points, factor)
    if (!raw) {
      return { values: [], geometry: { lines: [], circles: [], labels: [] } }
    }
    const [
      , , ,
      femProxMed, femProxLat, femDistMed, femDistLat,
      ldfaMed, ldfaLat,
      mptaMed, mptaLat,
      knee,
      tibProxMed, tibProxLat, tibDistMed, tibDistLat,
      ankle,
    ] = points
    const { hip, hipRadius, femAnatProx, femAnatDist, tibAnatProx, tibAnatDist } =
      raw

    // Visuelle Endpunkte der anatomischen Schaftachsen — durchgehend von
    // Gelenk zu Gelenk gezeichnet, aber strikt in der Richtung der 4
    // Schaft-Stützpunkte (also nicht zum Gelenk hin abgeknickt).
    //
    // Pro Seite zwei Endpunkte:
    //  - Gelenk-Tangente: Schnittpunkt mit LDFA bzw. MPTA — markiert, wo
    //    die anatomische Achse die Resektionsebene kreuzt.
    //  - Gegenüberliegendes Gelenk: Lotfußpunkt von Hüftkopfzentrum bzw.
    //    Sprunggelenkmitte auf die anatomische Achse. Damit endet die
    //    Linie auf Hüftkopf-/Sprunggelenk-Höhe, ohne die anatomische
    //    Richtung zu verlassen. Beim Femur landet das nahe der
    //    Trochanterspitze (Schaft liegt lateral des Hüftkopfs).
    const femAnatDistalEnd =
      lineLineIntersection2D(femAnatProx, femAnatDist, ldfaMed, ldfaLat) ??
      femAnatDist
    const femAnatProxEnd = closestPointOnLine(hip, femAnatProx, femAnatDist)
    const tibAnatProxEnd =
      lineLineIntersection2D(tibAnatProx, tibAnatDist, mptaMed, mptaLat) ??
      tibAnatProx
    const tibAnatDistalEnd = closestPointOnLine(
      ankle,
      tibAnatProx,
      tibAnatDist,
    )

    // Ausrichtungs-Label aus der SIGNIERTEN mHKA-ABWEICHUNG mit den
    // MacDessi-Schwellen (±2°) — klinische Festlegung Debug-Runde 3:
    // das Label neben dem mHKA-Wert muss den mHKA klassifizieren, nicht
    // den aHKA (der ist um den JLCA versetzt — bei JLCA ~5° erschien ein
    // 4°-Varusbein als „Neutral"). Die CPAK-Matrix bleibt aHKA-basiert
    // (das IST ihre Definition).
    const alignmentLabel = classifyAlignment(raw.hkaDeviationSigned)

    return {
      values: [
        ...(raw.hipDegenerate ? [HEAD_DEGENERATE_WARNING] : []),
        { label: 'mHKA', value: deg(raw.mHKA) },
        { label: alignmentLabel, value: deg(Math.abs(raw.deviationFrom180)) },
        { label: 'Mikulicz-Abstand', value: signedMm(raw.mikuliczMm) },
        { label: 'mLDFA', value: deg(raw.mLDFA) },
        { label: 'mMPTA', value: deg(raw.mMPTA) },
        { label: 'JLCA', value: deg(raw.JLCA) },
        { label: 'β-Winkel (Femur-AMA)', value: deg(raw.betaAngle) },
      ],
      geometry: {
        lines: [
          // Mechanische Beinachsen (Femur + Tibia, durchgezogen).
          { from: hip, to: knee },
          { from: knee, to: ankle },
          // Mikulicz-Direktlinie (gestrichelt grau).
          { from: hip, to: ankle, dashed: true, color: '#e2e8f0' },
          // Anatomische Schaftachsen — durchgezogen amber, beidseitig
          // bis zu den Gelenk-Endpunkten verlängert: bis zur Tangente und
          // bis zum Lotfußpunkt des gegenüberliegenden Gelenks.
          { from: femAnatProxEnd, to: femAnatDistalEnd, color: '#fbbf24' },
          { from: tibAnatProxEnd, to: tibAnatDistalEnd, color: '#fbbf24' },
          // Tangenten Femur-Kondylen + Tibia-Plateau.
          { from: ldfaMed, to: ldfaLat },
          { from: mptaMed, to: mptaLat },
          // Schaft-Stützpaare (dünn, damit man sie als Linien greifen kann).
          { from: femProxMed, to: femProxLat },
          { from: femDistMed, to: femDistLat },
          { from: tibProxMed, to: tibProxLat },
          { from: tibDistMed, to: tibDistLat },
        ],
        circles: [{ center: hip, radius: hipRadius }],
        labels: [{ at: knee, text: `mHKA ${deg(raw.mHKA)}` }],
      },
    }
  },
}

/** Alle implementierten Knie-Rezepte in Anzeigereihenfolge. */
export const KNEE_RECIPES: Record<KneeKind, KneeRecipe> = {
  workflow,
  hka,
  mLDFA,
  mMPTA,
  tibialSlope,
}

export const AVAILABLE_KNEE_RECIPES: KneeRecipe[] = [
  workflow,
  hka,
  mLDFA,
  mMPTA,
  tibialSlope,
]

export function getKneeRecipe(kind: KneeKind): KneeRecipe | undefined {
  return KNEE_RECIPES[kind]
}

// ----------------------------------------------------------------------
// DIE Rechen-Engine der Vollvermessung (seit R2 die EINZIGE — Audit-
// Befund D1). Liefert alle Messwerte als Floats plus die Geometrie-
// Primitiven (Hüftkopf, Schaftachsen, Tangenten-Mittelpunkte), aus denen
// workflow.compute die Anzeige formatiert und zeichnet. Downstream-
// Konsumenten (CPAK-Matrix, Overlays, PDF) lesen dieselben Zahlen —
// keine parallele Zweitrechnung mehr.
// ----------------------------------------------------------------------
export interface WorkflowRaw {
  /** mechanischer Hip-Knee-Ankle-Winkel (am Knie, 180° = neutral). */
  mHKA: number
  deviationFrom180: number
  /** mHKA-Abweichung SIGNIERT in aHKA-Konvention (negativ = Varus,
   *  positiv = Valgus). Richtung anatomisch: Kniezentrum lateral der
   *  Traglinie Hüfte→Sprunggelenk = Varus. Basis des Varus/Valgus-Labels
   *  der Werteliste und des Ausrichtungs-Kastens (klinische Festlegung:
   *  ±2° wie MacDessi, aber auf der mHKA-Abweichung — NICHT auf dem
   *  aHKA, der um den JLCA versetzt ist). */
  hkaDeviationSigned: number
  mikuliczMm: number
  mLDFA: number
  mMPTA: number
  JLCA: number
  /** β-Winkel = Femur-AMA / Femoral Valgus Cut Angle. */
  betaAngle: number
  /** aHKA = mMPTA − mLDFA (CPAK-Eingang) — hier, damit Label-Logik und
   *  Matrix garantiert vom selben Wert leben. */
  aHKA: number
  /** Hüftkopf-Punkte (fast) kollinear → alle Werte unzuverlässig
   *  (Befund D15; Anzeige warnt, blockiert nicht). */
  hipDegenerate?: true
  // — Geometrie-Primitiven (Weltkoordinaten) für die Visualisierung —
  hip: P
  hipRadius: number
  femAnatProx: P
  femAnatDist: P
  tibAnatProx: P
  tibAnatDist: P
  kneeFemMid: P
  kneeTibMid: P
}

export function computeWorkflowRaw(
  points: P[],
  mmPerWorldUnit: number,
): WorkflowRaw | null {
  if (points.length < 17) return null
  const [
    c1, c2, c3,
    femProxMed, femProxLat, femDistMed, femDistLat,
    ldfaMed, ldfaLat,
    mptaMed, mptaLat,
    knee,
    tibProxMed, tibProxLat, tibDistMed, tibDistLat,
    ankle,
  ] = points
  const {
    center: hip,
    radius: hipRadius,
    degenerate: hipDegenerate,
  } = circleFrom3Points(c1, c2, c3)
  // Anatomische Schaftachsen aus den Innenrand-Paaren.
  const femAnatProx = midpoint(femProxMed, femProxLat)
  const femAnatDist = midpoint(femDistMed, femDistLat)
  const tibAnatProx = midpoint(tibProxMed, tibProxLat)
  const tibAnatDist = midpoint(tibDistMed, tibDistLat)
  // „Mechanische" Komponenten-Knie-Zentren (für die Tangenten-Winkel).
  const kneeFemMid = midpoint(ldfaMed, ldfaLat)
  const kneeTibMid = midpoint(mptaMed, mptaLat)
  const mHKA = angleBetweenVectors(sub(hip, knee), sub(ankle, knee))
  const mikuliczMm = signedPerpDistance(knee, hip, ankle) * mmPerWorldUnit
  // mLDFA/mMPTA SIGNIERT über jointLineAngleVec (Debug-Befund K3): die
  // frühere Spitzwinkel-Faltung warf die Seite weg — ein valgisches
  // Plateau (wahres MPTA 92°) wurde als 88° gemessen und kippte damit
  // aHKA-Vorzeichen, CPAK-Typ und die Implantat-Vorzeichen-Kalibrierung.
  //
  // Die med/lat-ORIENTIERUNG kommt dabei ANATOMISCH verankert (Debug-
  // Runde 3): der proximale Femurschaft liegt im AP immer LATERAL der
  // mechanischen Femur-Achse — unabhängig von Seite (R/L), Bildrotation
  // und der Reihenfolge, in der die Tangentenpunkte geklickt/gezogen
  // wurden. Als Anker dient die TRANSVERSALE (achsen-senkrechte)
  // Komponente des Schaftversatzes; der rohe Schaftvektor läge fast
  // parallel zur Achse und würde als Anker verworfen.
  const mechFemAxis = sub(kneeFemMid, hip)
  const lateralDir = perpComponent(sub(femAnatProx, hip), mechFemAxis)
  const towardLat = orientTangent(sub(ldfaLat, ldfaMed), lateralDir)
  const towardMed = orientTangent(sub(mptaMed, mptaLat), scale(lateralDir, -1))
  // WICHTIG — Achsen-RICHTUNG (Debug-Runde 3, Fund 2): Beide Winkel messen
  // gegen die mech. Achse, die vom Gelenk WEG in die Diaphyse zeigt:
  //   - Femur (LDFA): Schaft ist PROXIMAL → Achse Richtung Hüfte
  //     (kneeFemMid → hip).
  //   - Tibia (MPTA): Schaft ist DISTAL → Achse Richtung Sprunggelenk
  //     (kneeTibMid → ankle).
  // Vorher nahm der Femur die Achse Richtung KNIE (hip → kneeFemMid) und
  // lieferte damit systematisch den SUPPLEMENTWINKEL (96,5° statt ~83,5°);
  // die Tibia war schon korrekt, daher fiel der Fehler nur beim LDFA auf.
  // (Bestätigt über die interne Konsistenz aHKA/JLCA/mHKA am Nutzer-Bild.)
  const mLDFA = jointLineAngleVec(kneeFemMid, hip, towardLat, ldfaMed, ldfaLat)
  const mMPTA = jointLineAngleVec(kneeTibMid, ankle, towardMed, mptaMed, mptaLat)
  // mHKA-Abweichung SIGNIERT (aHKA-Konvention: negativ = Varus). Der reine
  // Vektorwinkel mHKA ist immer ≤ 180° und kennt die Seite nicht — die
  // Richtung kommt anatomisch: liegt das Kniezentrum LATERAL der Traglinie
  // Hüfte→Sprunggelenk (Traglinie läuft medial am Knie vorbei), ist das
  // Bein varisch; medial = valgisch. Der Lateral-Anker macht das seiten-
  // unabhängig (R/L). Nur bei degeneriertem Anker (synthetisch exakt
  // gerader Schaft) entscheidet ersatzweise das aHKA-Vorzeichen.
  const dev = 180 - mHKA
  const kneeOffset = sub(knee, closestPointOnLine(knee, hip, ankle))
  const anchorUsable = dot(lateralDir, lateralDir) > 1e-9
  const isVarus = anchorUsable
    ? dot(kneeOffset, lateralDir) > 0
    : mMPTA - mLDFA < 0
  const hkaDeviationSigned = isVarus ? -dev : dev
  const JLCA = acuteAngleBetweenLines(ldfaMed, ldfaLat, mptaMed, mptaLat)
  const betaAngle = acuteAngleBetweenLines(
    femAnatProx, femAnatDist,
    hip, kneeFemMid,
  )
  return {
    mHKA,
    deviationFrom180: dev,
    hkaDeviationSigned,
    mikuliczMm,
    mLDFA,
    mMPTA,
    JLCA,
    betaAngle,
    aHKA: mMPTA - mLDFA,
    ...(hipDegenerate ? { hipDegenerate: true as const } : {}),
    hip,
    hipRadius,
    femAnatProx,
    femAnatDist,
    tibAnatProx,
    tibAnatDist,
    kneeFemMid,
    kneeTibMid,
  }
}
