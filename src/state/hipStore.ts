import { create } from 'zustand'
import { nextId } from '../lib/ids'
import type { Types } from '@cornerstonejs/core'
import { type HipKind, getRecipe, type Recipe } from '../lib/hip/recipes'
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

  /** Aktiviert ein Werkzeug; erneuter Aufruf desselben schaltet es ab. */
  toggleTool: (kind: HipKind) => void
  cancelTool: () => void
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

  toggleTool: (kind) =>
    set((s) => {
      // Tool ausschalten, wenn dasselbe nochmal geklickt wird.
      if (s.activeKind === kind) return { activeKind: null, draftPoints: [] }
      // Beim Einschalten: wenn das Rezept eine Becken-Referenzlinie
      // verlangt UND global schon eine definiert ist, die ersten beiden
      // Punkte vorbefüllen — der Nutzer klickt nur die restlichen.
      const recipe = getRecipe(kind)
      const prefilled = prefillFromGlobalRefLine(recipe)
      return { activeKind: kind, draftPoints: prefilled }
    }),

  cancelTool: () => set({ activeKind: null, draftPoints: [] }),

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
