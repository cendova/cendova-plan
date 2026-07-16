import { create } from 'zustand'
import type { Types } from '@cornerstonejs/core'
import { nextId } from '../lib/ids'


/**
 * Eine markierte Osteophyten-Fläche: ein Polygon aus Welt-Koordinaten-
 * Punkten. Wird halbtransparent rot schraffiert gerendert — als
 * Erinnerung an intraoperativ zu entfernende Osteophyten.
 */
export interface OsteophyteRegion {
  id: string
  points: Types.Point3[]
}

interface OsteophyteState {
  /** Fertige Osteophyten-Flächen. */
  regions: OsteophyteRegion[]
  /** Ob das Markier-Werkzeug aktiv ist (Klicks setzen Punkte). */
  placing: boolean
  /** Punkte der aktuell entstehenden Fläche (noch nicht abgeschlossen). */
  draftPoints: Types.Point3[]

  /** Werkzeug ein-/ausschalten. Beim Einschalten ggf. Draft zurücksetzen. */
  setPlacing: (v: boolean) => void
  /** Fügt der aktuellen Fläche einen Punkt hinzu. */
  addPoint: (p: Types.Point3) => void
  /** Entfernt den zuletzt gesetzten Draft-Punkt. */
  removeLastPoint: () => void
  /** Schließt die aktuelle Fläche ab (≥ 3 Punkte) und beginnt eine neue. */
  finishRegion: () => void
  /** Verwirft die aktuelle, noch nicht abgeschlossene Fläche. */
  cancelDraft: () => void
  /** Entfernt eine fertige Fläche. */
  removeRegion: (id: string) => void
  removeAll: () => void
  reset: () => void
}

export const useOsteophyteStore = create<OsteophyteState>((set, get) => ({
  regions: [],
  placing: false,
  draftPoints: [],

  setPlacing: (v) =>
    set((s) =>
      v
        ? { placing: true }
        : // Beim Ausschalten einen angefangenen Draft als Region sichern,
          // wenn er groß genug ist — sonst verwerfen.
          {
            placing: false,
            regions:
              s.draftPoints.length >= 3
                ? [
                    ...s.regions,
                    { id: nextId('ost'), points: s.draftPoints },
                  ]
                : s.regions,
            draftPoints: [],
          },
    ),

  addPoint: (p) =>
    set((s) => ({ draftPoints: [...s.draftPoints, p] })),

  removeLastPoint: () =>
    set((s) => ({ draftPoints: s.draftPoints.slice(0, -1) })),

  finishRegion: () => {
    const { draftPoints, regions } = get()
    if (draftPoints.length < 3) return // zu wenig für eine Fläche
    set({
      regions: [...regions, { id: nextId('ost'), points: draftPoints }],
      draftPoints: [],
    })
  },

  cancelDraft: () => set({ draftPoints: [] }),

  removeRegion: (id) =>
    set((s) => ({ regions: s.regions.filter((r) => r.id !== id) })),

  removeAll: () => set({ regions: [], draftPoints: [] }),

  reset: () => set({ regions: [], draftPoints: [], placing: false }),
}))
