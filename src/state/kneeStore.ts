import { create } from 'zustand'
import { nextId } from '../lib/ids'
import type { Types } from '@cornerstonejs/core'
import { type KneeKind, getKneeRecipe } from '../lib/knee/recipes'

/**
 * Zustand der Knie-Messungen. Direktes Pendant zu `hipStore`, aber ohne
 * den Becken-Referenzlinien-Sync — beim Knie gibt es (noch) keine global
 * geteilte Achse zwischen mehreren Tools. Wenn das später nötig wird
 * (z. B. „mech. Beinachse" als geteilte Referenz für HKA + mLDFA + mMPTA),
 * kann man es analog zum hipStore↔templateStore-Mechanismus nachrüsten.
 */

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

export interface KneeMeasurement {
  id: string
  kind: KneeKind
  /** Alle gesetzten Landmarken-Punkte in Weltkoordinaten. */
  points: Types.Point3[]
  /** Ob die Messung im Bild gezeichnet wird. */
  visible: boolean
  /** Verschiebung der Beschriftung (vom Nutzer gezogen). */
  labelOffset: LabelOffset
  /** Stil der Beschriftung. */
  labelStyle: LabelStyle
}

interface KneeState {
  measurements: KneeMeasurement[]
  activeKind: KneeKind | null
  draftPoints: Types.Point3[]
  selectedLabelId: string | null

  toggleTool: (kind: KneeKind) => void
  cancelTool: () => void
  addDraftPoint: (p: Types.Point3) => void
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
  /** Verwirft alle Knie-Messungen (z. B. bei neuem Bild). */
  reset: () => void
}

export const useKneeStore = create<KneeState>((set) => ({
  measurements: [],
  activeKind: null,
  draftPoints: [],
  selectedLabelId: null,

  toggleTool: (kind) =>
    set((s) => {
      if (s.activeKind === kind) return { activeKind: null, draftPoints: [] }
      return { activeKind: kind, draftPoints: [] }
    }),

  cancelTool: () => set({ activeKind: null, draftPoints: [] }),

  addDraftPoint: (p) =>
    set((s) => {
      if (!s.activeKind) return s
      const recipe = getKneeRecipe(s.activeKind)
      if (!recipe) return s
      const points = [...s.draftPoints, p]
      if (points.length >= recipe.steps.length) {
        const measurement: KneeMeasurement = {
          id: nextId('knee'),
          kind: s.activeKind,
          points,
          visible: true,
          labelOffset: { x: 16, y: -14 },
          labelStyle: { ...DEFAULT_LABEL_STYLE },
        }
        return {
          measurements: [...s.measurements, measurement],
          draftPoints: [],
          // Werkzeug nach dem letzten Punkt SCHLIESSEN (wie hipStore) —
          // sonst beginnt der nächste Klick sofort eine neue Messung und
          // der Nutzer muss mit Esc abbrechen (Debug-Befund A).
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
      return { draftPoints }
    }),

  updateMeasurementPoint: (id, index, p) =>
    set((s) => ({
      measurements: s.measurements.map((m) => {
        if (m.id !== id) return m
        const points = [...m.points]
        if (index < 0 || index >= points.length) return m
        points[index] = p
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

  removeAll: () =>
    set({ measurements: [], draftPoints: [], selectedLabelId: null }),

  reset: () =>
    set({
      measurements: [],
      draftPoints: [],
      activeKind: null,
      selectedLabelId: null,
    }),
}))
