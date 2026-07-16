import { create } from 'zustand'
import type { Types } from '@cornerstonejs/core'
import { nextId } from '../lib/ids'
import {
  KNEE_IMPLANT_FAMILIES,
  TIBIA_INSERT,
  type KneeImplantKind,
} from '../lib/knee/smithNephewCatalog'


export type KneeSide = 'L' | 'R'
export type KneeView = 'AP' | 'lateral'
/** Auf welchem Pane die Schablone liegt — 'left' = Haupt-Pane, 'right' =
 *  zweites Knie-Pane (seitliche Aufnahme). Lokal definiert, um eine
 *  Import-Abhängigkeit auf kneePanesStore zu vermeiden. */
export type TemplatePane = 'left' | 'right'

/**
 * Eine platzierte Knie-Schablone — generischer Eintrag für jede
 * Komponentenfamilie (Femur, Tibia-Baseplate, Insert, Patella). Die
 * konkrete Geometrie (Bezier-Kontur, Skalierung) ergibt sich aus
 * `kind` + `view` + `sizeIndex` über die jeweilige Shape-Funktion.
 */
export interface KneeTemplate {
  id: string
  kind: KneeImplantKind
  /** Welche anatomische Seite — beeinflusst Spiegelung der Kontur. */
  side: KneeSide
  /** Welche Aufnahme-Ebene — AP- und laterale Konturen sind verschieden. */
  view: KneeView
  /** Index der Größe in der Katalog-Reihe (z. B. LEGION_PS_FEMUR[i]). */
  sizeIndex: number
  /** Anker-Position in Weltkoordinaten — typischerweise der
   *  geometrische Mittelpunkt der Komponente. */
  center: Types.Point3
  /** Drehung in Grad (0° = anatomische Standardausrichtung). */
  rotationDeg: number
  /** Anzeigen/ausblenden — wirkt nicht auf den Store, nur auf das Overlay. */
  visible: boolean
  /** Pane-Zuordnung (Zwei-Bild-Ansicht). Default 'left'. */
  pane: TemplatePane
  /** Gruppen-ID: koppelt das zusammengehörige AP+lateral-Paar aus EINEM
   *  Platzierungs-Klick. Größe + Seite werden gruppenweit synchronisiert
   *  (dasselbe Implantat in beiden Ebenen hat dieselbe Größe/Seite). */
  groupId: string
  /** Gewählte Inlay-(Poly-)Dicke in mm bei Tibia-Verbünden. Hebt die
   *  Artikulationsfläche um (Wert − Basisdicke) an. Undefined = kein Inlay-
   *  Regler (Femur oder Tibia ohne bestätigte Insert-Dicken). Gruppenweit. */
  insertThicknessMm?: number
}

interface KneeTemplateState {
  templates: KneeTemplate[]
  /** Aktuell ausgewählte Schablone (für das Eigenschaften-Panel). */
  selectedId: string | null

  add: (
    kind: KneeImplantKind,
    side: KneeSide,
    view: KneeView,
    center: Types.Point3,
    sizeIndex?: number,
    pane?: TemplatePane,
    groupId?: string,
  ) => string
  remove: (id: string) => void
  setVisible: (id: string, visible: boolean) => void
  setCenter: (id: string, center: Types.Point3) => void
  setRotationDeg: (id: string, deg: number) => void
  setSizeIndex: (id: string, sizeIndex: number) => void
  setInsertThickness: (id: string, mm: number) => void
  setSide: (id: string, side: KneeSide) => void
  setView: (id: string, view: KneeView) => void
  select: (id: string | null) => void
  removeAll: () => void
  reset: () => void
}

/** Liefert die maximale gültige Größenindex-Anzahl für eine Familie. */
function maxSizeIndex(kind: KneeImplantKind): number {
  const f = KNEE_IMPLANT_FAMILIES.find((x) => x.kind === kind)
  return f ? Math.max(0, f.sizeCount - 1) : 0
}

function clampIdx(kind: KneeImplantKind, i: number): number {
  return Math.max(0, Math.min(maxSizeIndex(kind), i))
}

export const useKneeTemplateStore = create<KneeTemplateState>((set) => ({
  templates: [],
  selectedId: null,

  add: (kind, side, view, center, sizeIndex = 0, pane = 'left', groupId) => {
    const id = nextId('kneeT')
    const t: KneeTemplate = {
      id,
      kind,
      side,
      view,
      sizeIndex: clampIdx(kind, sizeIndex),
      center,
      rotationDeg: 0,
      visible: true,
      pane,
      // Ohne explizite Gruppe ist die Schablone ihre eigene Gruppe (Single).
      groupId: groupId ?? id,
      // Tibia-Verbünde starten auf Basis-Inlaydicke; Femur bleibt undefined.
      insertThicknessMm: TIBIA_INSERT[kind]?.baseMm,
    }
    set((s) => ({ templates: [...s.templates, t], selectedId: id }))
    return id
  },

  // Gruppenweit entfernen: das gekoppelte AP+lateral-Paar (gleiche groupId)
  // verschwindet gemeinsam — ein Implantat ist EIN Objekt in beiden Ebenen.
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
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, visible } : t,
      ),
    })),

  setCenter: (id, center) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, center } : t,
      ),
    })),

  setRotationDeg: (id, deg) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, rotationDeg: deg } : t,
      ),
    })),

  // Größe gruppenweit setzen: das gekoppelte AP+lateral-Paar (gleiche
  // groupId) bekommt dieselbe Größe — ein Implantat hat in beiden Ebenen
  // dieselbe Größe. Index wird je Schablone an deren kind geklemmt.
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

  // Inlay-Dicke gruppenweit (AP+lateral sind derselbe Verbund). Auf die
  // erlaubte Dickenliste des kind geklemmt; ohne Liste passiert nichts.
  setInsertThickness: (id, mm) =>
    set((s) => {
      const target = s.templates.find((t) => t.id === id)
      if (!target) return s
      const list = TIBIA_INSERT[target.kind]?.thicknessesMm
      if (!list) return s
      const snapped = list.reduce((a, b) => (Math.abs(b - mm) < Math.abs(a - mm) ? b : a), list[0])
      return {
        templates: s.templates.map((t) =>
          t.groupId === target.groupId ? { ...t, insertThicknessMm: snapped } : t,
        ),
      }
    }),

  // Seite ebenfalls gruppenweit (links/rechts-Knie gilt für beide Ebenen).
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

  setView: (id, view) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, view } : t,
      ),
    })),

  select: (id) => set({ selectedId: id }),

  removeAll: () => set({ templates: [], selectedId: null }),

  reset: () => set({ templates: [], selectedId: null }),
}))
