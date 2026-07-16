import { create } from 'zustand'
import type { Types } from '@cornerstonejs/core'
import { nextId } from '../lib/ids'
import {
  clampCupCatalogIndex,
  clampCupSizeIndex,
  clampHeadOffsetIndex,
  clampStemCatalogIndex,
  clampStemSizeIndex,
  cupCatalogEntries,
  stemCatalogEntries,
} from '../lib/hip/templates'


export interface LabelOffset {
  x: number
  y: number
}

export interface LabelStyle {
  fontSize: number
  color: string
  bold: boolean
  underline: boolean
}

const DEFAULT_LABEL_STYLE: LabelStyle = {
  fontSize: 16,
  color: '#7dd3fc',
  bold: true,
  underline: false,
}

export type CupSide = 'R' | 'L'

/** Eine platzierte Schaft-Schablone. */
export interface StemTemplate {
  id: string
  kind: 'stem'
  /** Kopfzentrum in Weltkoordinaten — Anker der Schablone, sollte mit
   *  der Pfanne übereinstimmen, wenn beide derselben Seite angehören. */
  headCenter: Types.Point3
  /** Welt-Winkel der Schaftachse (Proximal → Distal). 270° = anatomisch
   *  inferior in unserer Konvention. */
  rotationDeg: number
  /** Index des Katalog-Eintrags (Schaft-Familie/Variante). */
  catalogIndex: number
  /** Index der Größe innerhalb des Katalog-Eintrags. */
  sizeIndex: number
  /** Index der Halslänge (0..4 → −4/0/+4/+8/+12 mm). */
  headOffsetIndex: number
  /** Versatz der Beschriftungs-Box (Canvas-Pixel). */
  labelOffset: LabelOffset
  /** Stil der Beschriftungs-Box. */
  labelStyle: LabelStyle
  /** Operierte Seite. */
  side: CupSide
  /** Ob die Schablone im Bild gezeichnet wird (Ein/Aus im Panel). */
  visible: boolean
  /** Femur-Schaft-Achse als zwei Welt-Punkte (proximal, distal). Wird
   *  beim Platzieren über zwei Klicks definiert und dient als klinische
   *  Referenz: stem.rotationDeg, der dieser Achse entspricht = neutral
   *  (0°), Abweichungen = Varus (Spitze lateral) / Valgus (Spitze
   *  medial). Bei null wird auf die Hardcoded-90°-Referenz (vertikal)
   *  zurückgegriffen — gilt für Pläne aus älteren App-Versionen. */
  femurAxis: [Types.Point3, Types.Point3] | null
}

/** Eine platzierte Pfannen-Schablone. */
export interface CupTemplate {
  id: string
  kind: 'cup'
  /** Drehzentrum der Pfanne in Weltkoordinaten. */
  center: Types.Point3
  /** Drehung der Öffnungsebene in Grad. */
  rotationDeg: number
  /** Index des Katalog-Eintrags (Pfannen-Familie/Variante). */
  catalogIndex: number
  /** Index der Größe innerhalb des Katalog-Eintrags. */
  sizeIndex: number
  /** Versatz der Beschriftungs-Box (Canvas-Pixel). */
  labelOffset: LabelOffset
  /** Stil der Beschriftungs-Box. */
  labelStyle: LabelStyle
  /** Operierte Seite (R = rechte Hüfte des Patienten, L = linke). */
  side: CupSide
  /** Position der Tränenfigur (Köhler) in Weltkoordinaten; null = nicht gesetzt. */
  teardrop: Types.Point3 | null
  /** Ob die Schablone im Bild gezeichnet wird (Ein/Aus im Panel). */
  visible: boolean
}

type RefLine = [Types.Point3, Types.Point3]

/**
 * Mehrstufiger Ablauf beim Anlegen einer Schablone (Pfanne oder Schaft).
 * `kind` unterscheidet, was platziert wird; die Stage-Namen unterscheiden
 * sich pro Schablonentyp. Pfanne: Seite → Tränenfigur. Schaft: Seite →
 * Kopfzentrum.
 */
export type PendingCupPlacement =
  | { kind: 'cup'; stage: 'side' }
  | { kind: 'cup'; stage: 'teardrop'; side: CupSide }
  | { kind: 'stem'; stage: 'side' }
  /** Schaft: nach Seitenauswahl 2-Punkt-Femur-Schaft-Achse abfragen.
   *  `axisDraft` enthält den ersten Punkt, sobald gesetzt; der zweite
   *  Klick triggert die finale Platzierung. */
  | {
      kind: 'stem'
      stage: 'femur-axis'
      side: CupSide
      axisDraft: Types.Point3 | null
    }

interface TemplateState {
  templates: CupTemplate[]
  stems: StemTemplate[]
  /** Becken-Referenzlinie für den Inklinationsbezug. */
  referenceLine: RefLine | null
  /** Aktuell ausgewählte Schablone (Pfanne ODER Schaft). */
  selectedId: string | null
  /** Laufender Anlege-Ablauf für eine neue Schablone (null = inaktiv). */
  pending: PendingCupPlacement | null

  /** Startet den Pfannen-Anlege-Ablauf — fragt zuerst nach der Seite. */
  startCupPlacement: () => void
  /** Startet den Schaft-Anlege-Ablauf — fragt zuerst nach der Seite. */
  startStemPlacement: () => void
  /** Wählt die Seite im laufenden Ablauf; geht zur nächsten Stufe. */
  chooseSide: (side: CupSide) => void
  cancelPlacement: () => void
  /**
   * Schließt den Pfannen-Anlege-Ablauf ab und erzeugt die Pfanne. Liest
   * Seite aus pending; teardrop = null bedeutet „übersprungen".
   */
  placeCup: (
    center: Types.Point3,
    rotationDeg: number,
    defaultRef: RefLine,
    teardrop: Types.Point3 | null,
  ) => void
  /** Erzeugt einen Schaft direkt — der Workflow fragt kein Kopfzentrum
   *  mehr ab (siehe `finishStemPlacement` im viewer.ts: das übernimmt
   *  automatisch das Pfannenzentrum derselben Seite). `femurAxis` ist
   *  die zuvor in 2 Klicks definierte Schaft-Achse (proximal, distal)
   *  und wird als 90°-Referenz für Varus/Valgus genutzt. */
  placeStem: (
    side: CupSide,
    headCenter: Types.Point3,
    rotationDeg: number,
    femurAxis: [Types.Point3, Types.Point3] | null,
  ) => void
  /** Klick im Femur-Achse-Stage: erster Klick speichert den ersten
   *  Punkt in `pending.axisDraft`, zweiter Klick verlässt den Stage und
   *  ruft die Schaftplatzierung über `placeStemForSide(side, axis)` auf
   *  (siehe viewer.ts). */
  addFemurAxisPoint: (p: Types.Point3) => Types.Point3 | null
  updateCenter: (id: string, center: Types.Point3) => void
  setRotation: (id: string, deg: number) => void
  setCatalogIndex: (id: string, index: number) => void
  setSizeIndex: (id: string, index: number) => void
  setHeadOffsetIndex: (id: string, index: number) => void
  setLabelOffset: (id: string, offset: LabelOffset) => void
  setLabelStyle: (id: string, style: Partial<LabelStyle>) => void
  setReferencePoint: (index: 0 | 1, p: Types.Point3) => void
  /**
   * Setzt die Becken-Referenzlinie ALS GANZES (auch wenn vorher keine
   * existierte). Wird vom hipStore beim Anlegen von LLD/CE-Messungen
   * aufgerufen, damit Pfannen-Tools dieselbe Linie nutzen.
   */
  setReferenceLine: (line: RefLine | null) => void
  setTeardrop: (id: string, point: Types.Point3 | null) => void
  /** Blendet eine Pfanne im Bild ein oder aus. */
  setVisible: (id: string, visible: boolean) => void
  select: (id: string | null) => void
  remove: (id: string) => void
  removeAll: () => void
  reset: () => void
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  stems: [],
  referenceLine: null,
  selectedId: null,
  pending: null,

  startCupPlacement: () => set({ pending: { kind: 'cup', stage: 'side' } }),
  startStemPlacement: () => set({ pending: { kind: 'stem', stage: 'side' } }),

  chooseSide: (side) =>
    set((s) => {
      if (!s.pending || s.pending.stage !== 'side') return s
      if (s.pending.kind === 'cup') {
        return { pending: { kind: 'cup', stage: 'teardrop', side } }
      }
      // Stem: nach Seitenauswahl Femur-Schaft-Achse abfragen (2 Klicks).
      // Der PlacementBanner zeigt die Anleitung; die Klicks werden vom
      // TemplateOverlay-Klick-Handler abgefangen und über
      // `addFemurAxisPoint` aufgenommen.
      return {
        pending: {
          kind: 'stem',
          stage: 'femur-axis',
          side,
          axisDraft: null,
        },
      }
    }),

  addFemurAxisPoint: (p) => {
    // Nur im richtigen Stage handeln. Beim ersten Klick wird p
    // als Draft gespeichert; beim zweiten Klick geben wir den ersten
    // Punkt zurück, damit der Caller (viewer.ts → placeStemForSide) die
    // Achse + Platzierung in einem Schritt anwenden kann.
    const cur = get().pending
    if (!cur || cur.kind !== 'stem' || cur.stage !== 'femur-axis') return null
    if (cur.axisDraft == null) {
      set({
        pending: {
          kind: 'stem',
          stage: 'femur-axis',
          side: cur.side,
          axisDraft: p,
        },
      })
      return null
    }
    return cur.axisDraft
  },

  cancelPlacement: () => set({ pending: null }),

  placeCup: (center, rotationDeg, defaultRef, teardrop) =>
    set((s) => {
      if (
        !s.pending ||
        s.pending.kind !== 'cup' ||
        s.pending.stage !== 'teardrop'
      )
        return s
      const side = s.pending.side
      const entries = cupCatalogEntries()
      const catalogIndex = 0 // Versafit CC TRIO (einzige Pfanne aktuell)
      const sizes = entries[catalogIndex]?.sizes ?? []
      const sizeIndex = Math.max(0, Math.floor((sizes.length - 1) / 2))
      const cup: CupTemplate = {
        id: nextId('cup'),
        kind: 'cup',
        center,
        rotationDeg,
        catalogIndex,
        sizeIndex,
        labelOffset: { x: 90, y: -20 },
        labelStyle: { ...DEFAULT_LABEL_STYLE },
        side,
        teardrop,
        visible: true,
      }
      return {
        templates: [...s.templates, cup],
        referenceLine: s.referenceLine ?? defaultRef,
        selectedId: cup.id,
        pending: null,
      }
    }),

  placeStem: (side, headCenter, rotationDeg, femurAxis) =>
    set((s) => {
      const entries = stemCatalogEntries()
      const catalogIndex = 0 // Quadra-P STD als Default
      const sizes = entries[catalogIndex]?.sizes ?? []
      const sizeIndex = Math.max(0, Math.floor((sizes.length - 1) / 2))
      const headOffsetIndex = 0 // -4 mm (kleinster Kopf) als Start für alle Schäfte
      const stem: StemTemplate = {
        id: nextId('stem'),
        kind: 'stem',
        headCenter,
        rotationDeg,
        catalogIndex,
        sizeIndex,
        headOffsetIndex,
        labelOffset: { x: 90, y: 30 },
        labelStyle: { ...DEFAULT_LABEL_STYLE },
        side,
        visible: true,
        femurAxis,
      }
      return {
        stems: [...s.stems, stem],
        selectedId: stem.id,
        pending: null,
      }
    }),

  updateCenter: (id, center) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, center } : t,
      ),
      // Für Schäfte ist „center" das Kopfzentrum.
      stems: s.stems.map((t) =>
        t.id === id ? { ...t, headCenter: center } : t,
      ),
    })),

  setRotation: (id, deg) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, rotationDeg: deg } : t,
      ),
      stems: s.stems.map((t) =>
        t.id === id ? { ...t, rotationDeg: deg } : t,
      ),
    })),

  setCatalogIndex: (id, index) =>
    set((s) => ({
      templates: s.templates.map((t) => {
        if (t.id !== id) return t
        const catalogIndex = clampCupCatalogIndex(index)
        const sizeIndex = clampCupSizeIndex(catalogIndex, t.sizeIndex)
        return { ...t, catalogIndex, sizeIndex }
      }),
      stems: s.stems.map((t) => {
        if (t.id !== id) return t
        const catalogIndex = clampStemCatalogIndex(index)
        const sizeIndex = clampStemSizeIndex(catalogIndex, t.sizeIndex)
        return { ...t, catalogIndex, sizeIndex }
      }),
    })),

  setSizeIndex: (id, index) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id
          ? { ...t, sizeIndex: clampCupSizeIndex(t.catalogIndex, index) }
          : t,
      ),
      stems: s.stems.map((t) =>
        t.id === id
          ? { ...t, sizeIndex: clampStemSizeIndex(t.catalogIndex, index) }
          : t,
      ),
    })),

  setHeadOffsetIndex: (id, index) =>
    set((s) => ({
      stems: s.stems.map((t) =>
        t.id === id
          ? { ...t, headOffsetIndex: clampHeadOffsetIndex(index) }
          : t,
      ),
    })),

  setLabelOffset: (id, offset) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, labelOffset: offset } : t,
      ),
      stems: s.stems.map((t) =>
        t.id === id ? { ...t, labelOffset: offset } : t,
      ),
    })),

  setLabelStyle: (id, style) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, labelStyle: { ...t.labelStyle, ...style } } : t,
      ),
      stems: s.stems.map((t) =>
        t.id === id ? { ...t, labelStyle: { ...t.labelStyle, ...style } } : t,
      ),
    })),

  setReferencePoint: (index, p) =>
    set((s) => {
      if (!s.referenceLine) return s
      const next: RefLine = [s.referenceLine[0], s.referenceLine[1]]
      next[index] = p
      return { referenceLine: next }
    }),

  setReferenceLine: (line) => set({ referenceLine: line }),

  setTeardrop: (id, point) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, teardrop: point } : t,
      ),
    })),

  setVisible: (id, visible) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, visible } : t,
      ),
      stems: s.stems.map((t) =>
        t.id === id ? { ...t, visible } : t,
      ),
    })),

  select: (id) => set({ selectedId: id }),

  remove: (id) =>
    set((s) => ({
      templates: s.templates.filter((t) => t.id !== id),
      stems: s.stems.filter((t) => t.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  removeAll: () =>
    set({
      templates: [],
      stems: [],
      selectedId: null,
      pending: null,
    }),

  reset: () =>
    set({
      templates: [],
      stems: [],
      referenceLine: null,
      selectedId: null,
      pending: null,
    }),
}))
