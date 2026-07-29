/**
 * Schulter-Messrezepte. Der Vertrag ist ABSICHTLICH zeichengleich zu
 * `hip/recipes.ts` und `knee/recipes.ts` — dadurch verarbeiten Viewport,
 * Overlay, Werteliste und PDF-Export die Schulter ohne Sonderfall.
 *
 * Stand: alle geplanten Messungen umgesetzt — Winkel (CSA,
 * Akromion-Index, Glenoid-Inklination, Hals-Schaft-Winkel), Längenmaße
 * (AHD, Humeruskopf) und die Bilanz-Winkel der inversen Prothese
 * (DSA/LSA). Nur die Längenmaße brauchen eine Kalibrierung. Offen bleibt
 * die Schablonen-Schnittstelle (Plan `docs/schulter-modul-plan.md`,
 * Schritt 7).
 *
 * Fachliche Leitplanke (siehe Plan A.0): Es werden ausschließlich Größen
 * abgebildet, die auf einer echten a.p.-Aufnahme valide messbar sind.
 * Glenoid-Version, Humerus-Retroversion und Walch-Typisierung gehören ins
 * CT und bleiben bewusst außerhalb dieses Moduls.
 */
import type { Types } from '@cornerstonejs/core'
import {
  add,
  angleAtVertex,
  angleBetweenVectors,
  circleFrom3Points,
  closestPointOnLine,
  dist,
  dot,
  midpoint,
  perpendicularDistance,
  scale,
  sub,
  unit,
} from '../geometry'
import { beurteileCsa } from './csa'
import { beurteileAcromionIndex } from './acromionIndex'
import { beurteileAhd } from './ahd'

type P = Types.Point3

function deg(v: number): string {
  return `${v.toFixed(1)}°`
}

function mm(v: number): string {
  return `${v.toFixed(1)} mm`
}

/**
 * Alle Schulter-Messtypen. Der Typ ist bereits vollständig deklariert,
 * damit Store, UI und Plan-Format stabil bleiben, während die Rezepte
 * nacheinander dazukommen. `getShoulderRecipe` liefert für noch nicht
 * implementierte Typen `undefined` — genau wie bei der Hüfte für einen
 * unbekannten Typ.
 */
export type ShoulderKind =
  /** Critical Shoulder Angle (Glenoidlinie ↔ unterer Glenoidrand→Akromion). */
  | 'csa'
  /** Akromion-Index (dimensionslos, ohne Kalibrierung messbar). */
  | 'acromionIndex'
  /** Glenoid-Inklination / β-Winkel (Skapulaspina ↔ Glenoidlinie). */
  | 'glenoidInclination'
  /** Humeraler Hals-Schaft-Winkel (Gegenstück zum Hüft-CCD). */
  | 'neckShaftAngle'
  /** Akromiohumeraler Abstand in mm (braucht Kalibrierung). */
  | 'ahd'
  /** Humeruskopf-Zentrum/-Radius aus drei Konturpunkten. */
  | 'humeralHead'
  /** Distalization Shoulder Angle (nur Reverse). */
  | 'dsa'
  /** Lateralization Shoulder Angle (nur Reverse). */
  | 'lsa'

/** Renderdaten einer Messung in Weltkoordinaten (identisch zu Hüfte/Knie). */
export interface RenderGeometry {
  lines: { from: P; to: P; dashed?: boolean; color?: string }[]
  circles: { center: P; radius: number }[]
  labels: { at: P; text: string }[]
}

export interface ShoulderResultValue {
  label: string
  value: string
}

export interface ShoulderComputed {
  values: ShoulderResultValue[]
  geometry: RenderGeometry
}

export interface ShoulderRecipe {
  kind: ShoulderKind
  label: string
  /** Eingabeaufforderung je zu setzendem Punkt. */
  steps: string[]
  /** Ob die Messung eine Kalibrierung benötigt (Längen ja, Winkel nein). */
  needsCalibration: boolean
  /** Punkt-Indexpaare, die als verschiebbare Linie zusammengehören. */
  lineGroups: [number, number][]
  /**
   * Nur bei diesem Prothesentyp anbieten. `undefined` = für beide gültig.
   * Die Bilanz-Winkel (DSA/LSA) sind ausschließlich für die inverse
   * Prothese sinnvoll; die präoperative Analyse gilt für beide.
   * WICHTIG: Das filtert nur das ANGEBOT — die Rechenlogik der Rezepte
   * kennt keinen Prothesentyp.
   */
  onlyFor?: ShoulderProsthesis
  compute: (points: P[], mmPerWorldUnit: number) => ShoulderComputed
}

/** Prothesentyp des Schultermoduls (Plan B.8: beide werden unterstützt). */
export type ShoulderProsthesis = 'anatomic' | 'reverse'

// ----------------------------------------------------------------------
// CSA — Critical Shoulder Angle
//
// Winkel AM UNTEREN GLENOIDRAND zwischen zwei Schenkeln:
//   1. Glenoidlinie   unterer Glenoidrand → oberer Glenoidrand
//   2. Akromionlinie  unterer Glenoidrand → lateralster Akromionpunkt
//
// Reiner Winkel → keine Kalibrierung nötig. Die Reihenfolge der Punkte
// folgt der Mess-Praxis (Glenoid zuerst, Akromion zuletzt).
//
// Seitenunabhängig in der RECHNUNG: Der Nutzer setzt den lateralen
// Akromionpunkt selbst, damit ist die Richtung durch die Punkte bestimmt.
// Die im Store gespeicherte Seite dient der Dokumentation (welche
// Schulter), nicht der Berechnung.
// ----------------------------------------------------------------------
const csa: ShoulderRecipe = {
  kind: 'csa',
  label: 'CSA (Critical Shoulder Angle)',
  needsCalibration: false,
  steps: [
    'Glenoid — oberer Rand',
    'Glenoid — unterer Rand',
    'Akromion — lateralster Punkt',
  ],
  // Die Glenoidlinie ist als Ganzes verschiebbar.
  lineGroups: [[0, 1]],
  compute: (points) => {
    const [glenoidOben, glenoidUnten, akromion] = points
    // Scheitel ist der UNTERE Glenoidrand.
    const winkel = angleAtVertex(glenoidOben, glenoidUnten, akromion)
    const befund = beurteileCsa(winkel)

    // Glenoidlinie etwas über den oberen Rand hinaus verlängern, damit
    // der Winkel im Bild gut ablesbar bleibt (wie beim CCD die Halsachse).
    const glenoidRichtung = unit(sub(glenoidOben, glenoidUnten))
    const glenoidEnde = add(
      glenoidUnten,
      scale(glenoidRichtung, 1.15 * dist(glenoidUnten, glenoidOben)),
    )

    return {
      values: [
        { label: 'CSA', value: deg(winkel) },
        { label: 'Beurteilung', value: befund.hinweis },
      ],
      geometry: {
        lines: [
          { from: glenoidUnten, to: glenoidEnde },
          { from: glenoidUnten, to: akromion },
        ],
        circles: [],
        labels: [{ at: glenoidUnten, text: `CSA ${deg(winkel)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// Akromion-Index (AI) nach Nyffeler et al. 2006
//
//   AI = Abstand(Glenoidebene → lateraler Akromionrand)
//        ────────────────────────────────────────────
//        Abstand(Glenoidebene → lateralster Humeruskopfpunkt)
//
// Beide Abstände senkrecht zur Glenoidebene. Weil sich der Maßstab
// herauskürzt, ist der Index DIMENSIONSLOS — er braucht keine
// Kalibrierung und ist gegen Vergrößerungsfehler unempfindlich.
// ----------------------------------------------------------------------
const acromionIndex: ShoulderRecipe = {
  kind: 'acromionIndex',
  label: 'Akromion-Index',
  needsCalibration: false,
  steps: [
    'Glenoid — oberer Rand',
    'Glenoid — unterer Rand',
    'Akromion — lateralster Punkt',
    'Humeruskopf — lateralster Punkt',
  ],
  lineGroups: [[0, 1]],
  compute: (points) => {
    const [glenoidOben, glenoidUnten, akromion, humeruskopf] = points
    const ga = perpendicularDistance(akromion, glenoidOben, glenoidUnten)
    const gh = perpendicularDistance(humeruskopf, glenoidOben, glenoidUnten)
    // Degeneriert: Liegt der Humeruskopf-Punkt AUF der Glenoidebene, ist
    // der Index nicht definiert. Warnen statt NaN oder Unendlich zeigen.
    if (gh < 1e-6) {
      return {
        values: [
          {
            label: '⚠ Akromion-Index',
            value: 'Humeruskopf-Punkt liegt auf der Glenoidebene',
          },
        ],
        geometry: {
          lines: [{ from: glenoidOben, to: glenoidUnten }],
          circles: [],
          labels: [{ at: glenoidUnten, text: 'AI —' }],
        },
      }
    }
    const ai = ga / gh
    const befund = beurteileAcromionIndex(ai)

    // Lotfußpunkte auf der Glenoidebene: zeigen im Bild, WELCHE beiden
    // Strecken ins Verhältnis gesetzt werden.
    const fussAkromion = closestPointOnLine(akromion, glenoidOben, glenoidUnten)
    const fussKopf = closestPointOnLine(humeruskopf, glenoidOben, glenoidUnten)

    return {
      values: [
        { label: 'Akromion-Index', value: ai.toFixed(2).replace('.', ',') },
        { label: 'Beurteilung', value: befund.hinweis },
      ],
      geometry: {
        lines: [
          // Glenoidebene als Referenz.
          { from: glenoidOben, to: glenoidUnten },
          // Die beiden gemessenen Abstände.
          { from: fussAkromion, to: akromion },
          { from: fussKopf, to: humeruskopf, dashed: true },
        ],
        circles: [],
        labels: [
          { at: akromion, text: `AI ${ai.toFixed(2).replace('.', ',')}` },
        ],
      },
    }
  },
}

// ----------------------------------------------------------------------
// Glenoid-Inklination (β-Winkel n. Maurer)
//
// Winkel zwischen der Achse der Skapulaspina (Boden der Fossa
// supraspinata, von MEDIAL nach LATERAL) und der Glenoidlinie (von
// KAUDAL nach KRANIAL). Anatomisch etwa 80°.
//
// Die Richtungsfestlegung ist wichtig und seitenneutral: Bei einer
// gespiegelten (linken) Schulter drehen beide Vektoren mit, der Winkel
// bleibt gleich. Deshalb braucht dieses Rezept keine Seiten-Kenntnis.
// ----------------------------------------------------------------------
const glenoidInclination: ShoulderRecipe = {
  kind: 'glenoidInclination',
  label: 'Glenoid-Inklination (β)',
  needsCalibration: false,
  steps: [
    'Skapulaspina — medialer Punkt (Fossa-Boden)',
    'Skapulaspina — lateraler Punkt',
    'Glenoid — oberer Rand',
    'Glenoid — unterer Rand',
  ],
  lineGroups: [
    [0, 1],
    [2, 3],
  ],
  compute: (points) => {
    const [spinaMedial, spinaLateral, glenoidOben, glenoidUnten] = points
    const spinaRichtung = sub(spinaLateral, spinaMedial)
    // Glenoid nach KRANIAL — sonst käme der Supplementwinkel heraus.
    const glenoidRichtung = sub(glenoidOben, glenoidUnten)
    const beta = angleBetweenVectors(spinaRichtung, glenoidRichtung)
    return {
      values: [
        { label: 'β-Winkel', value: deg(beta) },
        { label: 'Referenz', value: 'anatomisch etwa 80°' },
      ],
      geometry: {
        lines: [
          { from: spinaMedial, to: spinaLateral },
          { from: glenoidUnten, to: glenoidOben },
        ],
        circles: [],
        labels: [{ at: spinaLateral, text: `β ${deg(beta)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// Humeraler Hals-Schaft-Winkel — Gegenstück zum Hüft-CCD
//
// Winkel zwischen der Schaftachse und der Senkrechten auf die anatomische
// Hals-Ebene (Kopf-Hals-Achse). Anatomisch etwa 130–135°.
//
// Wie beim CCD wird die STUMPFE Variante gewählt: Der Winkel ist
// anatomisch immer stumpf, und die Senkrechte auf eine Ebene hat zwei
// Richtungen — die Stumpfwahl macht das Ergebnis unabhängig davon, in
// welcher Reihenfolge die beiden Hals-Punkte gesetzt wurden.
// ----------------------------------------------------------------------
const neckShaftAngle: ShoulderRecipe = {
  kind: 'neckShaftAngle',
  label: 'Hals-Schaft-Winkel',
  needsCalibration: false,
  steps: [
    'Anatomischer Hals — medialer Punkt',
    'Anatomischer Hals — lateraler Punkt',
    'Humerusschaft-Achse — proximaler Punkt',
    'Humerusschaft-Achse — distaler Punkt',
  ],
  lineGroups: [
    [0, 1],
    [2, 3],
  ],
  compute: (points) => {
    const [halsMedial, halsLateral, schaftProx, schaftDistal] = points
    const hals = sub(halsLateral, halsMedial)
    // Senkrechte auf die Hals-Ebene in der Bildebene = Kopf-Hals-Achse.
    const kopfHalsAchse: P = [-hals[1], hals[0], 0]
    const schaft = sub(schaftDistal, schaftProx)
    const roh = angleBetweenVectors(kopfHalsAchse, schaft)
    const winkel = roh >= 90 ? roh : 180 - roh

    // Kopf-Hals-Achse durch die Mitte der Hals-Ebene zeichnen, in
    // Richtung Kopf (also weg vom Schaft), Länge an der Hals-Ebene
    // orientiert.
    const halsMitte = midpoint(halsMedial, halsLateral)
    const richtung = unit(kopfHalsAchse)
    const zumKopf = dot(richtung, unit(schaft)) > 0 ? -1 : 1
    const achsenEnde = add(
      halsMitte,
      scale(richtung, zumKopf * 0.8 * dist(halsMedial, halsLateral)),
    )

    return {
      values: [
        { label: 'Hals-Schaft-Winkel', value: deg(winkel) },
        { label: 'Referenz', value: 'anatomisch etwa 130–135°' },
      ],
      geometry: {
        lines: [
          { from: halsMedial, to: halsLateral },
          { from: schaftProx, to: schaftDistal },
          { from: halsMitte, to: achsenEnde, dashed: true },
        ],
        circles: [],
        labels: [{ at: halsMitte, text: `NSA ${deg(winkel)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// AHD — akromiohumeraler Abstand (in mm, BRAUCHT KALIBRIERUNG)
//
// Kürzester Abstand zwischen der Unterfläche des Akromions und der
// Humeruskopf-Kontur. Erste Schulter-Messung mit echtem Maßstab: ohne
// Kalibrierung wäre der Zahlenwert bedeutungslos, deshalb
// `needsCalibration: true` — die Oberfläche kennzeichnet solche
// Messungen als „unkalibriert", solange kein Maßstab gesetzt ist.
// ----------------------------------------------------------------------
const ahd: ShoulderRecipe = {
  kind: 'ahd',
  label: 'AHD (akromiohumeraler Abstand)',
  needsCalibration: true,
  steps: ['Akromion — Unterrand', 'Humeruskopf — Oberrand'],
  lineGroups: [[0, 1]],
  compute: (points, factor) => {
    const [akromionUnten, kopfOben] = points
    const abstand = dist(akromionUnten, kopfOben) * factor
    // OHNE Maßstab KEINE Einordnung: Der Aufrufer übergibt den Faktor 1,
    // solange keine Kalibrierung gesetzt ist — die Zahl ist dann eine
    // Welt-Einheit, kein Millimeterwert. Eine Aussage wie „im üblichen
    // Bereich (≥ 6 mm)" wäre darauf schlicht unbegründet. Den gemessenen
    // Wert zeigen wir weiter (die Oberfläche kennzeichnet ihn als
    // unkalibriert), nur die Beurteilung entfällt.
    // Grenzfall bewusst in Kauf genommen: Bei einer echten 1:1-
    // Kalibrierung fehlt die Einordnung ebenfalls — keine Aussage ist
    // besser als eine womöglich falsche.
    const beurteilbar = factor !== 1
    return {
      values: [
        { label: 'AHD', value: mm(abstand) },
        beurteilbar
          ? { label: 'Beurteilung', value: beurteileAhd(abstand).hinweis }
          : {
              label: 'Beurteilung',
              value: 'ohne Kalibrierung nicht beurteilbar',
            },
      ],
      geometry: {
        lines: [{ from: akromionUnten, to: kopfOben }],
        circles: [],
        labels: [
          { at: midpoint(akromionUnten, kopfOben), text: `AHD ${mm(abstand)}` },
        ],
      },
    }
  },
}

// ----------------------------------------------------------------------
// Humeruskopf — Zentrum und Durchmesser aus drei Konturpunkten
//
// Nutzt dieselbe Primitive wie der Hüftkopf (`circleFrom3Points`) samt
// ihrer Kollinearitäts-Warnung: Liegen die drei Punkte fast auf einer
// Linie, ist das Zentrum numerisch instabil. Klinische Festlegung wie
// bei der Hüfte — warnen, nicht blockieren.
//
// Der Durchmesser ist die Grundlage für die spätere Kopf-/Prothesen-
// größenwahl und braucht deshalb einen echten Maßstab.
// ----------------------------------------------------------------------
const humeralHead: ShoulderRecipe = {
  kind: 'humeralHead',
  label: 'Humeruskopf (Zentrum/Größe)',
  needsCalibration: true,
  steps: [
    'Humeruskopf-Kontur — Punkt 1',
    'Humeruskopf-Kontur — Punkt 2',
    'Humeruskopf-Kontur — Punkt 3',
  ],
  lineGroups: [],
  compute: (points, factor) => {
    const [k1, k2, k3] = points
    const { center, radius, degenerate } = circleFrom3Points(k1, k2, k3)
    const durchmesser = 2 * radius * factor
    return {
      values: [
        ...(degenerate
          ? [
              {
                label: '⚠ Humeruskopf',
                value: 'Punkte fast kollinear — neu setzen',
              },
            ]
          : []),
        { label: 'Durchmesser', value: mm(durchmesser) },
        { label: 'Radius', value: mm(radius * factor) },
      ],
      geometry: {
        lines: [],
        circles: [{ center, radius }],
        labels: [{ at: center, text: `Ø ${mm(durchmesser)}` }],
      },
    }
  },
}

// ----------------------------------------------------------------------
// RSA-Bilanz — DSA und LSA (nur inverse Prothese, `onlyFor: 'reverse'`)
//
// Beide Winkel teilen dieselbe Referenz: die Achse der Skapulaspina.
//   DSA (Distalization): Spina-Achse ↔ Linie Akromion-Spitze →
//       Tuberculum majus. Maß für die Distalisierung/Deltaspannung.
//   LSA (Lateralization): Spina-Achse ↔ Linie Akromion-Spitze →
//       Humerusschaft-Achse. Maß für die Lateralisierung.
//
// BEWUSST OHNE ZIELBEREICHE: Für beide Winkel gibt es publizierte
// Richtwerte, die sich je nach Implantat-Design unterscheiden; eine
// belastbare, allgemein gültige Trennlinie ließ sich nicht belegen.
// Statt erfundener Schwellen steht deshalb nur die gut belegte RICHTUNG
// als Referenzzeile: In einer Kohorte von 216 Grammont-Prothesen war
// mehr Distalisierung mit besseren, mehr Lateralisierung mit
// schlechteren Ergebnissen assoziiert (Clinker et al., JSES 2024,
// doi:10.1016/j.jse.2024.03.049). Für andere Designs gilt das nicht
// unbesehen.
//
// Hinweis zur „Bilanz" im Wortsinn (prä → geplant → post, wie die
// Beinlängen-Bilanz der Hüfte): Sie setzt eine PLATZIERTE Schablone
// voraus, aus der sich der geplante Zustand ableiten lässt. Schulter-
// Schablonen kommen erst mit Schritt 7 — bis dahin liefern DSA und LSA
// den gemessenen Ist-Wert.
// ----------------------------------------------------------------------
const SPINA_SCHRITTE = [
  'Skapulaspina — medialer Punkt',
  'Skapulaspina — lateraler Punkt (Akromion-Spitze)',
]

/** Gemeinsame Rechnung beider Bilanz-Winkel: Spina-Achse gegen eine
 *  Linie, die an der Akromion-Spitze beginnt. */
function bilanzWinkel(
  spinaMedial: P,
  spinaLateral: P,
  zielPunkt: P,
): number {
  return angleAtVertex(spinaMedial, spinaLateral, zielPunkt)
}

const dsa: ShoulderRecipe = {
  kind: 'dsa',
  label: 'DSA (Distalisierung)',
  needsCalibration: false,
  onlyFor: 'reverse',
  steps: [...SPINA_SCHRITTE, 'Tuberculum majus — oberster Punkt'],
  lineGroups: [[0, 1]],
  compute: (points) => {
    const [spinaMedial, spinaLateral, tuberculum] = points
    const winkel = bilanzWinkel(spinaMedial, spinaLateral, tuberculum)
    return {
      values: [
        { label: 'DSA', value: deg(winkel) },
        {
          label: 'Referenz',
          value: 'mehr Distalisierung war mit besseren Ergebnissen assoziiert',
        },
      ],
      geometry: {
        lines: [
          { from: spinaMedial, to: spinaLateral },
          { from: spinaLateral, to: tuberculum },
        ],
        circles: [],
        labels: [{ at: spinaLateral, text: `DSA ${deg(winkel)}` }],
      },
    }
  },
}

const lsa: ShoulderRecipe = {
  kind: 'lsa',
  label: 'LSA (Lateralisierung)',
  needsCalibration: false,
  onlyFor: 'reverse',
  steps: [...SPINA_SCHRITTE, 'Humerusschaft — proximaler Achsenpunkt'],
  lineGroups: [[0, 1]],
  compute: (points) => {
    const [spinaMedial, spinaLateral, schaft] = points
    const winkel = bilanzWinkel(spinaMedial, spinaLateral, schaft)
    return {
      values: [
        { label: 'LSA', value: deg(winkel) },
        {
          label: 'Referenz',
          value: 'mehr Lateralisierung war mit schlechteren Ergebnissen assoziiert',
        },
      ],
      geometry: {
        lines: [
          { from: spinaMedial, to: spinaLateral },
          { from: spinaLateral, to: schaft },
        ],
        circles: [],
        labels: [{ at: spinaLateral, text: `LSA ${deg(winkel)}` }],
      },
    }
  },
}

/**
 * Registry der Rezepte — ab jetzt `Record` statt `Partial<Record>`, genau
 * wie `RECIPES` (Hüfte) und `KNEE_RECIPES` (Knie): alle in `ShoulderKind`
 * deklarierten Typen sind umgesetzt. Ein künftiger neuer Messtyp ohne
 * Rezept ist damit ein Typfehler und fällt nicht erst zur Laufzeit auf.
 */
export const SHOULDER_RECIPES: Record<ShoulderKind, ShoulderRecipe> = {
  csa,
  acromionIndex,
  glenoidInclination,
  neckShaftAngle,
  ahd,
  humeralHead,
  dsa,
  lsa,
}

/** Alle aktuell benutzbaren Rezepte (Reihenfolge = Anzeige im Panel). */
export const AVAILABLE_SHOULDER_RECIPES: ShoulderRecipe[] = [
  csa,
  acromionIndex,
  glenoidInclination,
  neckShaftAngle,
  ahd,
  humeralHead,
  dsa,
  lsa,
]

export function getShoulderRecipe(kind: ShoulderKind): ShoulderRecipe | undefined {
  return SHOULDER_RECIPES[kind]
}

/**
 * Rezepte, die zum gewählten Prothesentyp passen (Plan B.8). Rezepte ohne
 * `onlyFor` gelten für beide Typen.
 */
export function recipesForProsthesis(
  prosthesis: ShoulderProsthesis,
): ShoulderRecipe[] {
  return AVAILABLE_SHOULDER_RECIPES.filter(
    (r) => r.onlyFor === undefined || r.onlyFor === prosthesis,
  )
}
