import { create } from 'zustand'
import type { Types } from '@cornerstonejs/core'
import { nextId } from '../lib/ids'

/**
 * Ein ausgeschnittenes Schaft-Fragment (Osteotomie-Simulation).
 *
 * `points` beschreibt den Schnitt im ORIGINAL (Welt-Koordinaten, wie beim
 * Osteophyten-Werkzeug); `offset` und `rotationDeg` sagen, wohin das
 * herausgelöste Stück verschoben wurde. Das Original bleibt darunter
 * sichtbar — die Verschiebung ist dadurch als Vorher/Nachher lesbar.
 *
 * Bewusst NICHT gespeichert: Pixel. Das Overlay kopiert bei jedem Bild
 * frisch aus dem Viewport, damit das Fragment in jeder Zoomstufe so scharf
 * ist wie das Original darunter.
 */
export interface ShaftFragment {
  id: string
  /** Schnittkontur im Original (Welt). */
  points: Types.Point3[]
  /** Verschiebung in Welt-Einheiten (x, y). */
  offset: [number, number]
  rotationDeg: number
  visible: boolean
}

interface ShaftFragmentState {
  fragments: ShaftFragment[]
  /** Schneide-Werkzeug aktiv (Klicks setzen Konturpunkte). */
  placing: boolean
  /** Punkte der noch offenen Schnittkontur. */
  draftPoints: Types.Point3[]
  /** Ausgewähltes Fragment (Tastatur/Panel). */
  selectedId: string | null

  setPlacing: (v: boolean) => void
  addPoint: (p: Types.Point3) => void
  removeLastPoint: () => void
  /** Schließt den Schnitt ab (≥ 3 Punkte) und legt das Fragment an. */
  finishFragment: () => void
  cancelDraft: () => void
  select: (id: string | null) => void
  setOffset: (id: string, offset: [number, number]) => void
  setRotationDeg: (id: string, deg: number) => void
  setVisible: (id: string, v: boolean) => void
  remove: (id: string) => void
  removeAll: () => void
  reset: () => void
}

export const useShaftFragmentStore = create<ShaftFragmentState>((set, get) => ({
  fragments: [],
  placing: false,
  draftPoints: [],
  selectedId: null,

  setPlacing: (v) =>
    set((s) =>
      v
        ? { placing: true }
        : // Beim Ausschalten einen angefangenen Schnitt sichern, wenn er
          // groß genug ist — sonst verwerfen (Muster Osteophyten-Werkzeug).
          {
            placing: false,
            fragments:
              s.draftPoints.length >= 3
                ? [...s.fragments, neuesFragment(s.draftPoints)]
                : s.fragments,
            draftPoints: [],
          },
    ),

  addPoint: (p) => set((s) => ({ draftPoints: [...s.draftPoints, p] })),

  removeLastPoint: () =>
    set((s) => ({ draftPoints: s.draftPoints.slice(0, -1) })),

  finishFragment: () => {
    const { draftPoints, fragments } = get()
    if (draftPoints.length < 3) return
    const f = neuesFragment(draftPoints)
    set({ fragments: [...fragments, f], draftPoints: [], selectedId: f.id })
  },

  cancelDraft: () => set({ draftPoints: [] }),

  select: (id) => set({ selectedId: id }),

  setOffset: (id, offset) =>
    set((s) => ({
      fragments: s.fragments.map((f) => (f.id === id ? { ...f, offset } : f)),
    })),

  setRotationDeg: (id, deg) =>
    set((s) => ({
      fragments: s.fragments.map((f) =>
        f.id === id ? { ...f, rotationDeg: deg } : f,
      ),
    })),

  setVisible: (id, v) =>
    set((s) => ({
      fragments: s.fragments.map((f) =>
        f.id === id ? { ...f, visible: v } : f,
      ),
    })),

  remove: (id) =>
    set((s) => ({
      fragments: s.fragments.filter((f) => f.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  removeAll: () => set({ fragments: [], draftPoints: [], selectedId: null }),

  reset: () =>
    set({ fragments: [], draftPoints: [], placing: false, selectedId: null }),
}))

function neuesFragment(points: Types.Point3[]): ShaftFragment {
  return {
    id: nextId('frag'),
    points,
    offset: [0, 0],
    rotationDeg: 0,
    visible: true,
  }
}
