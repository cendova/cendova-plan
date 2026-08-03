import { create } from 'zustand'
import type { Types } from '@cornerstonejs/core'
import { nextId } from '../lib/ids'
import {
  SHOULDER_IMPLANT_FAMILIES,
  type ShoulderImplantKind,
} from '../lib/shoulder/shoulderCatalog'

export type ShoulderSide = 'L' | 'R'

/**
 * Eine platzierte Schulter-Schablone. Vereinfachtes Pendant zu
 * KneeTemplate: die Schulter kennt nur die a.p.-Sicht (Grashey) und nur
 * das Haupt-Pane — kein view/pane-Feld. `groupId` bleibt (Single-Gruppe:
 * groupId = id), damit Listen-/Sichtbarkeits-Logik dem Knie-Muster folgt
 * und eine spätere Kopplung (z. B. Kopf an Schaft) das Feld schon hat.
 */
export interface ShoulderTemplate {
  id: string
  kind: ShoulderImplantKind
  /** Anatomische Seite — beeinflusst Spiegelung der Kontur. */
  side: ShoulderSide
  /** Index in der linearisierten Größenreihe (Katalog-Labels). */
  sizeIndex: number
  /** Anker-Position in Weltkoordinaten (geometrischer Mittelpunkt). */
  center: Types.Point3
  /** Drehung in Grad (0° = wie aufgenommen). */
  rotationDeg: number
  visible: boolean
  groupId: string
}

/** Eine Zeile der Schablonen-Liste = EIN Implantat (Knie-Muster). */
export interface ShoulderSchablonenZeile {
  haupt: ShoulderTemplate
  sichtbar: boolean
  ausgewaehlt: boolean
}

export function gruppiereShoulderNachImplantat(
  templates: readonly ShoulderTemplate[],
  selectedId: string | null,
): ShoulderSchablonenZeile[] {
  const gruppen = new Map<string, ShoulderTemplate[]>()
  for (const t of templates) {
    const g = gruppen.get(t.groupId)
    if (g) g.push(t)
    else gruppen.set(t.groupId, [t])
  }
  return [...gruppen.values()].map((g) => ({
    haupt: g[0],
    sichtbar: g.some((t) => t.visible !== false),
    ausgewaehlt: selectedId != null && g.some((t) => t.id === selectedId),
  }))
}

interface ShoulderTemplateState {
  templates: ShoulderTemplate[]
  selectedId: string | null

  add: (
    kind: ShoulderImplantKind,
    side: ShoulderSide,
    center: Types.Point3,
    sizeIndex?: number,
    groupId?: string,
  ) => string
  remove: (id: string) => void
  setVisible: (id: string, visible: boolean) => void
  setGroupVisible: (id: string, visible: boolean) => void
  setCenter: (id: string, center: Types.Point3) => void
  setRotationDeg: (id: string, deg: number) => void
  setSizeIndex: (id: string, sizeIndex: number) => void
  setSide: (id: string, side: ShoulderSide) => void
  select: (id: string | null) => void
  removeAll: () => void
  reset: () => void
}

function maxSizeIndex(kind: ShoulderImplantKind): number {
  const f = SHOULDER_IMPLANT_FAMILIES.find((x) => x.kind === kind)
  return f ? Math.max(0, f.sizeCount - 1) : 0
}

function clampIdx(kind: ShoulderImplantKind, i: number): number {
  return Math.max(0, Math.min(maxSizeIndex(kind), i))
}

export const useShoulderTemplateStore = create<ShoulderTemplateState>((set) => ({
  templates: [],
  selectedId: null,

  add: (kind, side, center, sizeIndex = 0, groupId) => {
    const id = nextId('shoulderT')
    const t: ShoulderTemplate = {
      id,
      kind,
      side,
      sizeIndex: clampIdx(kind, sizeIndex),
      center,
      rotationDeg: 0,
      visible: true,
      // Ohne explizite Gruppe ist die Schablone ihre eigene Gruppe (Single).
      groupId: groupId ?? id,
    }
    set((s) => ({ templates: [...s.templates, t], selectedId: id }))
    return id
  },

  // Gruppenweit entfernen (Knie-Muster) — heute Single-Gruppen, aber die
  // Semantik bleibt konsistent zur Liste.
  remove: (id) =>
    set((s) => {
      const target = s.templates.find((t) => t.id === id)
      if (!target) return s
      const removed = new Set(
        s.templates.filter((t) => t.groupId === target.groupId).map((t) => t.id),
      )
      return {
        templates: s.templates.filter((t) => t.groupId !== target.groupId),
        selectedId:
          s.selectedId && removed.has(s.selectedId) ? null : s.selectedId,
      }
    }),

  setVisible: (id, visible) =>
    set((s) => ({
      templates: s.templates.map((t) => (t.id === id ? { ...t, visible } : t)),
    })),

  setGroupVisible: (id, visible) =>
    set((s) => {
      const target = s.templates.find((t) => t.id === id)
      if (!target) return s
      return {
        templates: s.templates.map((t) =>
          t.groupId === target.groupId ? { ...t, visible } : t,
        ),
      }
    }),

  setCenter: (id, center) =>
    set((s) => ({
      templates: s.templates.map((t) => (t.id === id ? { ...t, center } : t)),
    })),

  setRotationDeg: (id, deg) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, rotationDeg: deg } : t,
      ),
    })),

  setSizeIndex: (id, sizeIndex) =>
    set((s) => {
      const target = s.templates.find((t) => t.id === id)
      if (!target) return s
      return {
        templates: s.templates.map((t) =>
          t.groupId === target.groupId
            ? { ...t, sizeIndex: clampIdx(t.kind, sizeIndex) }
            : t,
        ),
      }
    }),

  setSide: (id, side) =>
    set((s) => {
      const target = s.templates.find((t) => t.id === id)
      if (!target) return s
      return {
        templates: s.templates.map((t) =>
          t.groupId === target.groupId ? { ...t, side } : t,
        ),
      }
    }),

  select: (id) => set({ selectedId: id }),

  removeAll: () => set({ templates: [], selectedId: null }),

  reset: () => set({ templates: [], selectedId: null }),
}))
