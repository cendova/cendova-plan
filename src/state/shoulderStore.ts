/**
 * Zustand des Schulter-Moduls. Aufbau bewusst als Spiegel von
 * `hipStore.ts` — gleiche Feld- und Action-Namen, damit Overlay,
 * Werteliste und Plan-Serialisierung dem bekannten Muster folgen.
 *
 * Zwei Zusätze gegenüber Hüfte/Knie (Plan `docs/schulter-modul-plan.md`):
 *  - `side` (Projekt-Konvention 'R' | 'L' wie in `hip/lldCalculation.ts`),
 *    weil „lateral" auf der a.p.-Aufnahme seitenabhängig ist,
 *  - `prosthesis` ('anatomic' | 'reverse'), das steuert NUR, welche
 *    Rezepte angeboten werden — nie die Rechenlogik.
 */
import { create } from 'zustand'
import type { Types } from '@cornerstonejs/core'
import { nextId } from '../lib/ids'
import {
  getShoulderRecipe,
  type ShoulderKind,
  type ShoulderProsthesis,
} from '../lib/shoulder/recipes'

/** Operierte/untersuchte Seite. Gleiche Kodierung wie die Hüft-LLD. */
export type ShoulderSide = 'R' | 'L'

/** Versatz der Mess-Beschriftung gegenüber ihrem Ankerpunkt (Canvas-Pixel).
 *  Eigene Definition wie im Knie-Store — die Stores bleiben bewusst
 *  voneinander unabhängig (kein Modul importiert aus einem anderen). */
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

export interface ShoulderMeasurement {
  id: string
  kind: ShoulderKind
  /** Alle gesetzten Landmarken-Punkte in Weltkoordinaten. */
  points: Types.Point3[]
  /**
   * Seite, die zum Zeitpunkt der MESSUNG galt (Schnappschuss, nicht
   * Referenz auf den globalen Wert). Grund: Winkel wie CSA und der
   * Akromion-Index hängen an der Frage, welche Richtung „lateral" ist.
   * Läge hier nur ein Verweis auf `side`, würde ein späteres Umschalten
   * alle bereits gesetzten Messungen still umdeuten.
   */
  side: ShoulderSide
  /** Ob die Messung im Bild gezeichnet wird. */
  visible: boolean
  /** Verschiebung der Beschriftung (vom Nutzer gezogen). */
  labelOffset: LabelOffset
  /** Stil der Beschriftung. */
  labelStyle: LabelStyle
}

interface ShoulderState {
  /** Abgeschlossene Schulter-Messungen. */
  measurements: ShoulderMeasurement[]
  /** Gerade aktives Schulter-Werkzeug (null = keines). */
  activeKind: ShoulderKind | null
  /** Bereits gesetzte Punkte der laufenden Platzierung. */
  draftPoints: Types.Point3[]
  /** Aktuell ausgewählte Mess-Beschriftung (für die Stil-Leiste). */
  selectedLabelId: string | null
  /** Seite — Vorbelegung für NEUE Messungen (s. ShoulderMeasurement.side). */
  side: ShoulderSide
  /** Prothesentyp; filtert das Rezept-Angebot, nicht die Berechnung. */
  prosthesis: ShoulderProsthesis

  setSide: (side: ShoulderSide) => void
  setProsthesis: (p: ShoulderProsthesis) => void

  /** Aktiviert ein Werkzeug; erneuter Aufruf desselben schaltet es ab. */
  toggleTool: (kind: ShoulderKind) => void
  cancelTool: () => void
  /** Setzt den nächsten Punkt; bei Vollständigkeit wird die Messung fertig. */
  addDraftPoint: (p: Types.Point3) => void
  /** Entfernt den zuletzt gesetzten Punkt der laufenden Platzierung. */
  removeLastDraftPoint: () => void
  updateDraftPoint: (index: number, p: Types.Point3) => void
  updateMeasurementPoint: (id: string, index: number, p: Types.Point3) => void
  setVisible: (id: string, visible: boolean) => void
  setLabelOffset: (id: string, offset: LabelOffset) => void
  setLabelStyle: (id: string, style: Partial<LabelStyle>) => void
  selectLabel: (id: string | null) => void
  removeMeasurement: (id: string) => void
  removeAll: () => void
  /** Verwirft alle Schulter-Messungen (z. B. bei neuem Bild). */
  reset: () => void
}

export const useShoulderStore = create<ShoulderState>((set) => ({
  measurements: [],
  activeKind: null,
  draftPoints: [],
  selectedLabelId: null,
  side: 'R',
  prosthesis: 'anatomic',

  // Seite/Typ wirken nur auf KÜNFTIGE Messungen bzw. das Angebot —
  // bestehende Messungen bleiben unangetastet (s. Snapshot oben).
  setSide: (side) => set({ side }),
  setProsthesis: (prosthesis) => set({ prosthesis }),

  toggleTool: (kind) =>
    set((s) => {
      // Tool ausschalten, wenn dasselbe nochmal geklickt wird.
      if (s.activeKind === kind) return { activeKind: null, draftPoints: [] }
      return { activeKind: kind, draftPoints: [] }
    }),

  cancelTool: () => set({ activeKind: null, draftPoints: [] }),

  addDraftPoint: (p) =>
    set((s) => {
      if (!s.activeKind) return s
      const recipe = getShoulderRecipe(s.activeKind)
      if (!recipe) return s
      const points = [...s.draftPoints, p]
      if (points.length >= recipe.steps.length) {
        const measurement: ShoulderMeasurement = {
          id: nextId('shoulder'),
          kind: s.activeKind,
          points,
          // Seite hier EINFRIEREN, nicht referenzieren.
          side: s.side,
          visible: true,
          labelOffset: { x: 16, y: -14 },
          labelStyle: { ...DEFAULT_LABEL_STYLE },
        }
        return {
          measurements: [...s.measurements, measurement],
          draftPoints: [],
          // Werkzeug nach dem letzten Punkt schließen (wie Hüfte/Knie),
          // damit es keine Klicks abfängt, die der Schablone gelten.
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
