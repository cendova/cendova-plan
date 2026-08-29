import { create } from 'zustand'
import { nextId } from '../lib/ids'
import type { Types } from '@cornerstonejs/core'
import { type HipKind, getRecipe, type Recipe } from '../lib/hip/recipes'
import type { DorrType, FemurProfileImageQuality } from '../lib/hip/femurProfile'
import { useTemplateStore } from './templateStore'

/**
 * Wenn ein Hüft-Rezept eine Becken-Referenzlinie enthält UND global
 * bereits eine definiert ist, gibt diese Funktion die vorbefüllten Punkte
 * zurück — sonst eine leere Liste. Konvention: pelvicRefIndices = [0, 1],
 * d. h. die Linie steht IMMER am Anfang der Steps.
 */
function prefillFromGlobalRefLine(recipe: Recipe | undefined): Types.Point3[] {
  if (!recipe?.pelvicRefIndices) return []
  const [i1, i2] = recipe.pelvicRefIndices
  if (i1 !== 0 || i2 !== 1) return [] // Konvention nicht erfüllt
  const refLine = useTemplateStore.getState().referenceLine
  if (!refLine) return []
  return [refLine[0], refLine[1]]
}

/**
 * Findet die jüngste VOLLSTÄNDIGE CCD-Messung.
 *
 * Grundlage des Prefills: Die ersten sechs Schritte des Femurprofils sind
 * wortgleich mit denen des CCD-Rezepts (per Test in `recipes.test.ts`
 * festgenagelt) — Hüftkopfkontur, Halsmitte, Schaftachse. Wer schon einen
 * CCD-Winkel gemessen hat, soll diese sechs Punkte nicht erneut klicken.
 *
 * „Vollständig" heißt: exakt so viele Punkte, wie das Rezept Schritte hat.
 * Eine abgebrochene Messung existiert im Store gar nicht (Punkte werden
 * erst beim letzten Klick zur Messung), der Check ist also
 * Gürtel-und-Hosenträger gegen geladene oder fremde Pläne.
 */
export function findeCcdFuerPrefill(
  measurements: HipMeasurement[],
): HipMeasurement | null {
  const ccd = getRecipe('ccd')
  if (!ccd) return null
  for (let i = measurements.length - 1; i >= 0; i--) {
    const m = measurements[i]
    if (m.kind === 'ccd' && m.points.length === ccd.steps.length) return m
  }
  return null
}

/**
 * Schaftachse (proximal, distal) der jüngsten VOLLSTÄNDIGEN
 * Femurprofil-Messung — für die Schablonen-Platzierung: Liegt die Achse
 * bereits vermessen vor, entfallen die zwei Achsen-Klicks beim Anlegen
 * des Schafts (Realtest 29.08.2026). Punkte 4/5 sind per Prefill-Vertrag
 * (Steps wortgleich mit dem CCD-Rezept) die Femurschaftachse.
 *
 * Gibt KOPIEN zurück — die Schablone darf die Messpunkte nicht teilen,
 * sonst verschöbe eine spätere Punktkorrektur still die Schaftreferenz.
 */
export function findeFemurachseFuerSchaft(
  measurements: HipMeasurement[],
): [Types.Point3, Types.Point3] | null {
  const rezept = getRecipe('femurProfile')
  if (!rezept) return null
  for (let i = measurements.length - 1; i >= 0; i--) {
    const m = measurements[i]
    if (m.kind === 'femurProfile' && m.points.length === rezept.steps.length) {
      return [[...m.points[4]] as Types.Point3, [...m.points[5]] as Types.Point3]
    }
  }
  return null
}

/**
 * Synchronisiert die Becken-Referenz-Punkte einer Hüft-Messung in den
 * globalen `templateStore.referenceLine`. Damit teilen sich LLD/CE und
 * die Pfannen-Schablone EINE gemeinsame Beckenebene.
 *
 * Das `isSyncing`-Flag verhindert eine Endlos-Schleife, wenn der Reverse-
 * Sync (template → hip, weiter unten) seinerseits hipStore-Punkte
 * aktualisiert, die dann erneut hier landen würden.
 */
let isSyncing = false
function syncRefLineToTemplate(recipe: Recipe | undefined, points: Types.Point3[]) {
  if (isSyncing) return
  if (!recipe?.pelvicRefIndices) return
  const [i1, i2] = recipe.pelvicRefIndices
  const a = points[i1]
  const b = points[i2]
  if (a && b) {
    isSyncing = true
    try {
      useTemplateStore.getState().setReferenceLine([a, b])
    } finally {
      isSyncing = false
    }
  }
}


/** Versatz der Mess-Beschriftung gegenüber ihrem Ankerpunkt (Canvas-Pixel). */
export interface LabelOffset {
  x: number
  y: number
}

/** Stil der Mess-Beschriftung (nur Darstellung, Text bleibt der Messwert). */
export interface LabelStyle {
  fontSize: number
  color: string
  bold: boolean
  underline: boolean
}

const DEFAULT_LABEL_STYLE: LabelStyle = {
  fontSize: 13,
  color: '#ffffff',
  bold: false,
  underline: false,
}

/** Gründe für eine vom Vorschlag abweichende Dorr-Klasse. Enum ohne
 *  Freitext: ein Freitextfeld müsste `planGrenzen.ts` deckeln, und für
 *  die Dokumentation genügt die Kategorie. */
export type FemurProfileOverrideReason =
  | 'rotation'
  | 'kortikalis_unscharf'
  | 'deformitaet'
  | 'laterale_aufnahme'
  | 'gesamtmorphologie'
  | 'sonstiges'

/**
 * Ärztliche Beurteilung einer Femurprofil-Messung: getrennt gespeichert
 * vom automatischen Vorschlag, damit im Nachhinein sichtbar bleibt, was
 * das Programm vorgeschlagen und was der Arzt entschieden hat.
 *
 * Enthält bewusst KEINEN Nutzernamen und keine Patientendaten — nur die
 * Entscheidung, ihren Grund und den Zeitpunkt.
 */
export interface FemurProfileReview {
  imageQuality: FemurProfileImageQuality
  /**
   * Der Vorschlag, GEGEN DEN bestätigt wurde.
   *
   * Nicht redundant, sondern der einzige Weg, eine veraltete Bestätigung
   * zu erkennen: Wer nach der Bestätigung einen Punkt verschiebt, ändert
   * womöglich den Vorschlag. Ohne diesen Festwert stünde „Dorr bestätigt
   * B" über einer Rechnung, die inzwischen C ergibt — und niemand könnte
   * das sehen.
   */
  dorrSuggested?: DorrType
  /** Die ärztlich festgelegte Klasse. Fehlt sie, ist nichts bestätigt. */
  dorrFinal?: DorrType
  /** Pflicht, sobald `dorrFinal` vom Vorschlag abweicht. */
  overrideReason?: FemurProfileOverrideReason
  /** ISO-Zeitstempel — erst beim Speichern der Bestätigung gesetzt. */
  confirmedAt?: string
}

/** Klartext der Override-Gründe für die Oberfläche. */
export const FEMUR_PROFILE_OVERRIDE_REASONS: {
  wert: FemurProfileOverrideReason
  text: string
}[] = [
  { wert: 'rotation', text: 'Rotationsfehlstellung der Aufnahme' },
  { wert: 'kortikalis_unscharf', text: 'Kortikalisgrenzen unscharf' },
  { wert: 'deformitaet', text: 'Deformität verfälscht die Messung' },
  { wert: 'laterale_aufnahme', text: 'Beurteilung anhand seitlicher Aufnahme' },
  { wert: 'gesamtmorphologie', text: 'Gesamtmorphologie spricht dagegen' },
  { wert: 'sonstiges', text: 'Sonstiges' },
]

/**
 * Ist die Beurteilung in sich schlüssig? Eine vom Vorschlag abweichende
 * Klasse ohne Grund wird abgelehnt — sonst entstünde eine
 * undokumentierte Übersteuerung, und genau ihre Nachvollziehbarkeit ist
 * der Zweck der Trennung von Vorschlag und Entscheidung.
 */
export function istGueltigeFemurProfileReview(r: FemurProfileReview): boolean {
  if (r.dorrFinal == null) return true // nichts bestätigt, nichts zu prüfen
  const abweichend = r.dorrSuggested != null && r.dorrFinal !== r.dorrSuggested
  return !abweichend || r.overrideReason != null
}

export interface HipMeasurement {
  id: string
  kind: HipKind
  /** Alle gesetzten Landmarken-Punkte in Weltkoordinaten. */
  points: Types.Point3[]
  /** Ob die Messung im Bild gezeichnet wird. */
  visible: boolean
  /** Verschiebung der Beschriftung (vom Nutzer gezogen). */
  labelOffset: LabelOffset
  /** Stil der Beschriftung. */
  labelStyle: LabelStyle
  /** Nur beim Femurprofil: die vor der Messung bestätigte Bildqualität. */
  femurProfileReview?: FemurProfileReview
}

interface HipState {
  /** Abgeschlossene Hüft-Messungen. */
  measurements: HipMeasurement[]
  /** Gerade aktives Hüft-Werkzeug (null = keines). */
  activeKind: HipKind | null
  /** Bereits gesetzte Punkte der laufenden Platzierung. */
  draftPoints: Types.Point3[]
  /** Aktuell ausgewählte Mess-Beschriftung (für die Stil-Leiste). */
  selectedLabelId: string | null
  /**
   * Bildqualitäts-Checkliste der GERADE laufenden Femurprofil-Messung.
   * Wird vor dem Start bestätigt und in Task 7 an die fertige Messung
   * geheftet; bis dahin lebt sie nur hier.
   *
   * Sie wird beim Abbruch verworfen (siehe `cancelTool`): eine
   * Bestätigung gehört zu GENAU der Aufnahme, für die sie abgegeben
   * wurde — sonst klebte sie am nächsten Bild weiter.
   */
  femurProfileGate: FemurProfileImageQuality | null

  /** Aktiviert ein Werkzeug; erneuter Aufruf desselben schaltet es ab. */
  toggleTool: (kind: HipKind) => void
  cancelTool: () => void
  /** Hinterlegt die bestätigte Checkliste (vor dem Start der Messung). */
  setFemurProfileGate: (q: FemurProfileImageQuality | null) => void
  /**
   * Speichert die ärztliche Beurteilung an einer Femurprofil-Messung.
   *
   * Lehnt unschlüssige Beurteilungen ab (abweichende Klasse ohne Grund)
   * und lässt andere Messarten unberührt. Weil das Feld AN der Messung
   * hängt, entsteht dabei automatisch ein neues `measurements`-Array —
   * die Undo-Historie erfasst die Bestätigung damit von selbst
   * (historyStore vergleicht Referenzen).
   */
  setFemurProfileReview: (id: string, review: FemurProfileReview) => void
  /** Setzt den nächsten Punkt; bei Vollständigkeit wird die Messung fertig. */
  addDraftPoint: (p: Types.Point3) => void
  /** Entfernt den zuletzt gesetzten Punkt der laufenden Platzierung. */
  removeLastDraftPoint: () => void
  updateDraftPoint: (index: number, p: Types.Point3) => void
  updateMeasurementPoint: (
    id: string,
    index: number,
    p: Types.Point3,
  ) => void
  setVisible: (id: string, visible: boolean) => void
  setLabelOffset: (id: string, offset: LabelOffset) => void
  setLabelStyle: (id: string, style: Partial<LabelStyle>) => void
  selectLabel: (id: string | null) => void
  removeMeasurement: (id: string) => void
  removeAll: () => void
  /** Verwirft alle Hüft-Messungen (z. B. bei neuem Bild). */
  reset: () => void
}

export const useHipStore = create<HipState>((set) => ({
  measurements: [],
  activeKind: null,
  draftPoints: [],
  selectedLabelId: null,
  femurProfileGate: null,

  toggleTool: (kind) =>
    set((s) => {
      // Die Qualitäts-Bestätigung gehört zur LAUFENDEN Femurprofil-
      // Sitzung. Sie überlebt nur den einen Fall, für den sie gedacht
      // ist: das Einschalten des Femurprofils, unmittelbar nachdem der
      // Dialog sie gesetzt hat. Abschalten oder Wechsel auf ein anderes
      // Werkzeug bricht die Messung ab — dann muss auch die Bestätigung
      // weg, sonst gälte sie stillschweigend für den nächsten Anlauf.
      const gateBehalten = kind === 'femurProfile' && s.activeKind !== kind
      const femurProfileGate = gateBehalten ? s.femurProfileGate : null
      // Tool ausschalten, wenn dasselbe nochmal geklickt wird.
      if (s.activeKind === kind) {
        return { activeKind: null, draftPoints: [], femurProfileGate }
      }
      // Beim Einschalten: wenn das Rezept eine Becken-Referenzlinie
      // verlangt UND global schon eine definiert ist, die ersten beiden
      // Punkte vorbefüllen — der Nutzer klickt nur die restlichen.
      const recipe = getRecipe(kind)
      let prefilled = prefillFromGlobalRefLine(recipe)
      // Zweite Prefill-Quelle: Das Femurprofil übernimmt die sechs
      // gemeinsamen Punkte einer vorhandenen CCD-Messung und startet
      // damit bei Schritt 7 von 13.
      //
      // Punkte werden KOPIERT, nicht geteilt: Ein gezogener Draft-Punkt
      // darf die CCD-Messung nicht mitverändern. (Heute ersetzt
      // `updateDraftPoint` das Element ohnehin, aber darauf soll sich
      // niemand verlassen müssen.)
      if (kind === 'femurProfile') {
        const ccd = findeCcdFuerPrefill(s.measurements)
        if (ccd) {
          prefilled = ccd.points.slice(0, 6).map((p) => [...p] as Types.Point3)
        }
      }
      return { activeKind: kind, draftPoints: prefilled, femurProfileGate }
    }),

  // Abbruch verwirft AUCH die Qualitäts-Bestätigung: Sie gilt für die
  // Aufnahme, für die sie abgegeben wurde. Bliebe sie liegen, startete
  // der nächste Versuch — womöglich an einem anderen Bild — stillschweigend
  // mit einer fremden Bestätigung.
  cancelTool: () =>
    set({ activeKind: null, draftPoints: [], femurProfileGate: null }),

  setFemurProfileGate: (q) => set({ femurProfileGate: q }),

  setFemurProfileReview: (id, review) =>
    set((s) => {
      if (!istGueltigeFemurProfileReview(review)) return s
      const ziel = s.measurements.find((m) => m.id === id)
      // Andere Messarten haben keine Beurteilung — stillschweigend eine
      // anzuhängen würde nur unauffindbaren Datenmüll erzeugen.
      if (!ziel || ziel.kind !== 'femurProfile') return s
      return {
        measurements: s.measurements.map((m) =>
          m.id === id ? { ...m, femurProfileReview: review } : m,
        ),
      }
    }),

  addDraftPoint: (p) =>
    set((s) => {
      if (!s.activeKind) return s
      const recipe = getRecipe(s.activeKind)
      if (!recipe) return s
      const points = [...s.draftPoints, p]
      if (points.length >= recipe.steps.length) {
        const measurement: HipMeasurement = {
          id: nextId('hip'),
          kind: s.activeKind,
          points,
          visible: true,
          labelOffset: { x: 16, y: -14 },
          labelStyle: { ...DEFAULT_LABEL_STYLE },
          // Die Qualitäts-Bestätigung wandert aus der Sitzung an die
          // fertige Messung — ab hier gehört sie zu ihr und nicht mehr
          // zum laufenden Anlauf. Ohne diese Bindung könnte die
          // Ergebnis-Karte einer zweiten oder geladenen Messung nicht
          // sagen, ob sie klassifizieren darf.
          ...(s.activeKind === 'femurProfile' && s.femurProfileGate
            ? { femurProfileReview: { imageQuality: s.femurProfileGate } }
            : {}),
        }
        // Wenn diese Messung die Becken-Referenzlinie definiert (LLD, CE),
        // global propagieren, damit Pfannen-Tools sie nutzen.
        syncRefLineToTemplate(recipe, points)
        return {
          measurements: [...s.measurements, measurement],
          draftPoints: [],
          // Werkzeug nach dem letzten Punkt SCHLIESSEN — nicht offen für
          // eine weitere Messung lassen. Sonst bliebe das Hüft-Tool
          // „scharf" und würde Klicks abfangen, die eigentlich der
          // Pfannen-/Schaft-Platzierung gelten.
          activeKind: null,
        }
      }
      return { draftPoints: points }
    }),

  removeLastDraftPoint: () =>
    set((s) => ({ draftPoints: s.draftPoints.slice(0, -1) })),

  updateDraftPoint: (index, p) =>
    set((s) => {
      const draftPoints = [...s.draftPoints]
      if (index < 0 || index >= draftPoints.length) return s
      draftPoints[index] = p
      // Wenn Becken-Ref-Punkt gezogen wird, gleich global aktualisieren.
      const recipe = s.activeKind ? getRecipe(s.activeKind) : undefined
      if (recipe?.pelvicRefIndices?.includes(index)) {
        syncRefLineToTemplate(recipe, draftPoints)
      }
      return { draftPoints }
    }),

  updateMeasurementPoint: (id, index, p) =>
    set((s) => ({
      measurements: s.measurements.map((m) => {
        if (m.id !== id) return m
        const points = [...m.points]
        if (index < 0 || index >= points.length) return m
        points[index] = p
        const recipe = getRecipe(m.kind)
        if (recipe?.pelvicRefIndices?.includes(index)) {
          syncRefLineToTemplate(recipe, points)
        }
        return { ...m, points }
      }),
    })),

  setVisible: (id, visible) =>
    set((s) => ({
      measurements: s.measurements.map((m) =>
        m.id === id ? { ...m, visible } : m,
      ),
    })),

  setLabelOffset: (id, offset) =>
    set((s) => ({
      measurements: s.measurements.map((m) =>
        m.id === id ? { ...m, labelOffset: offset } : m,
      ),
    })),

  setLabelStyle: (id, style) =>
    set((s) => ({
      measurements: s.measurements.map((m) =>
        m.id === id ? { ...m, labelStyle: { ...m.labelStyle, ...style } } : m,
      ),
    })),

  selectLabel: (id) => set({ selectedLabelId: id }),

  removeMeasurement: (id) =>
    set((s) => ({
      measurements: s.measurements.filter((m) => m.id !== id),
      selectedLabelId: s.selectedLabelId === id ? null : s.selectedLabelId,
    })),

  removeAll: () => set({ measurements: [], draftPoints: [], selectedLabelId: null }),

  reset: () =>
    set({
      measurements: [],
      draftPoints: [],
      activeKind: null,
      selectedLabelId: null,
      femurProfileGate: null,
    }),
}))

/**
 * Reverse-Sync: wenn die globale Beckenebene anderswo geändert wird
 * (z. B. der Nutzer zieht sie im Pfannen-Overlay), müssen alle Hüft-
 * Messungen, die diese Linie nutzen (LLD, CE), ihre entsprechenden
 * Punkte mitführen. Sonst zeigen LLD und Pfanne die Linie an
 * unterschiedlichen Positionen.
 *
 * Das `isSyncing`-Flag (oben definiert) verhindert die Endlos-Schleife
 * zurück nach templateStore.
 */
const unsubscribeRefLineSync = useTemplateStore.subscribe((state, prev) => {
  if (state.referenceLine === prev.referenceLine) return
  if (isSyncing) return
  const next = state.referenceLine
  isSyncing = true
  try {
    useHipStore.setState((s) => ({
      measurements: s.measurements.map((m) => {
        const recipe = getRecipe(m.kind)
        if (!recipe?.pelvicRefIndices || !next) return m
        const [i1, i2] = recipe.pelvicRefIndices
        const points = [...m.points]
        points[i1] = next[0]
        points[i2] = next[1]
        return { ...m, points }
      }),
    }))
  } finally {
    isSyncing = false
  }
})

// Bei HMR alte Subscription entsorgen, damit sich keine Doppelten ansammeln.
if (import.meta.hot) {
  import.meta.hot.dispose(() => unsubscribeRefLineSync())
}
