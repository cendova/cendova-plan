import { create } from 'zustand'
import { useHipStore, type HipMeasurement } from './hipStore'
import { useKneeStore, type KneeMeasurement } from './kneeStore'
import {
  useKneeTemplateStore,
  type KneeTemplate,
} from './kneeTemplateStore'
import {
  useTemplateStore,
  type CupTemplate,
  type StemTemplate,
} from './templateStore'
import { useNoteStore, type TextNote } from './noteStore'
import type { Types } from '@cornerstonejs/core'

/**
 * Vollständiger Schnappschuss aller rückgängig-fähigen Stores. Wir
 * snapshotten Referenzen (nicht Deep-Clones), weil zustand bei
 * Mutationen immer NEUE Arrays/Objekte erzeugt — frühere Referenzen
 * bleiben damit als unveränderliche Snapshots erhalten.
 *
 * Cornerstone-Längen/-Winkel (LengthTool, AngleTool) leben in
 * Cornerstones eigener Annotation-State und sind hier NICHT erfasst.
 */
interface Snapshot {
  hipMeasurements: HipMeasurement[]
  kneeMeasurements: KneeMeasurement[]
  kneeTemplates: KneeTemplate[]
  templates: CupTemplate[]
  /** Schaft-Schablonen. MUSS hier mit erfasst werden — sonst werden
   *  Schaft-Verschiebungen/-Rotationen nicht in die Undo-History
   *  aufgenommen (snapsEqual würde sie nicht als Änderung erkennen) und
   *  ein Undo könnte sie nicht zurücksetzen. */
  stems: StemTemplate[]
  referenceLine: [Types.Point3, Types.Point3] | null
  notes: TextNote[]
}

const MAX_HISTORY = 50
/** Debounce-Fenster: nach so vielen ms Ruhe wird ein History-Eintrag erzeugt. */
const DEBOUNCE_MS = 350

function takeSnapshot(): Snapshot {
  return {
    hipMeasurements: useHipStore.getState().measurements,
    kneeMeasurements: useKneeStore.getState().measurements,
    kneeTemplates: useKneeTemplateStore.getState().templates,
    templates: useTemplateStore.getState().templates,
    stems: useTemplateStore.getState().stems,
    referenceLine: useTemplateStore.getState().referenceLine,
    notes: useNoteStore.getState().notes,
  }
}

function snapsEqual(a: Snapshot, b: Snapshot): boolean {
  // Referenz-Vergleich reicht, weil zustand bei jedem `set` ein
  // neues Array zurückgibt. Wenn nichts gemutiert wurde, sind die
  // Referenzen identisch.
  return (
    a.hipMeasurements === b.hipMeasurements &&
    a.kneeMeasurements === b.kneeMeasurements &&
    a.kneeTemplates === b.kneeTemplates &&
    a.templates === b.templates &&
    a.stems === b.stems &&
    a.referenceLine === b.referenceLine &&
    a.notes === b.notes
  )
}

/** Wird während `restore()` auf true gesetzt, damit Subscription-
 *  basierte Capture-Schleifen nichts machen. */
let isRestoring = false

function restore(snap: Snapshot) {
  isRestoring = true
  try {
    // Reihenfolge: erst templateStore (referenceLine), damit die
    // hipStore↔templateStore-Subscription beim Setzen der hipStore-
    // Messungen nicht noch mal die referenceLine überschreibt.
    useTemplateStore.setState({
      templates: snap.templates,
      stems: snap.stems,
      referenceLine: snap.referenceLine,
    })
    useHipStore.setState({ measurements: snap.hipMeasurements })
    useKneeStore.setState({ measurements: snap.kneeMeasurements })
    useKneeTemplateStore.setState({ templates: snap.kneeTemplates })
    useNoteStore.setState({ notes: snap.notes })
  } finally {
    isRestoring = false
  }
}

interface HistoryState {
  /** Vergangene Snapshots inkl. aktuellem (letzter Eintrag = jetzt). */
  past: Snapshot[]
  /** Snapshots nach einem Undo (für Redo verfügbar). */
  future: Snapshot[]
  /** Erfasst den aktuellen App-Zustand als History-Eintrag. */
  capture: () => void
  undo: () => void
  redo: () => void
  /** Komplett leeren (z. B. bei neuem Bild). */
  reset: () => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [takeSnapshot()],
  future: [],

  capture: () => {
    if (isRestoring) return
    const snap = takeSnapshot()
    const past = get().past
    const lastSnap = past[past.length - 1]
    if (lastSnap && snapsEqual(snap, lastSnap)) return
    set({
      past: [...past.slice(-MAX_HISTORY + 1), snap],
      future: [], // neue Aktion verwirft die Redo-Kette
    })
  },

  undo: () => {
    const { past, future } = get()
    if (past.length < 2) return // mindestens 1 Zustand + 1 vorheriger
    const current = past[past.length - 1]
    const previous = past[past.length - 2]
    restore(previous)
    set({
      past: past.slice(0, -1),
      future: [current, ...future],
    })
  },

  redo: () => {
    const { past, future } = get()
    if (future.length === 0) return
    const next = future[0]
    restore(next)
    set({
      past: [...past, next],
      future: future.slice(1),
    })
  },

  reset: () => {
    set({ past: [takeSnapshot()], future: [] })
  },
}))

// ----------------------------------------------------------------------
// Auto-Capture: bei jeder Mutation der überwachten Stores nach
// `DEBOUNCE_MS` Ruhe einen History-Eintrag erzeugen. Drag-Operationen
// (viele Mausevents in Folge) werden so zu EINEM Schritt zusammengefasst.
// ----------------------------------------------------------------------
let captureTimer: ReturnType<typeof setTimeout> | null = null
function scheduleCapture() {
  if (isRestoring) return
  if (captureTimer) clearTimeout(captureTimer)
  captureTimer = setTimeout(() => {
    useHistoryStore.getState().capture()
    captureTimer = null
  }, DEBOUNCE_MS)
}

const unsubHip = useHipStore.subscribe(scheduleCapture)
const unsubKnee = useKneeStore.subscribe(scheduleCapture)
const unsubKneeTpl = useKneeTemplateStore.subscribe(scheduleCapture)
const unsubTemplate = useTemplateStore.subscribe(scheduleCapture)
const unsubNote = useNoteStore.subscribe(scheduleCapture)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (captureTimer) clearTimeout(captureTimer)
    unsubHip()
    unsubKnee()
    unsubKneeTpl()
    unsubTemplate()
    unsubNote()
  })
}
