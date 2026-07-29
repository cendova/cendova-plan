/**
 * Zentrale Tool-Auswahl-Logik. Wird vom Header (universelle Tools) und
 * von der Tab-Sidebar (Mess-Tools) benutzt, damit beide Stellen dieselbe
 * Cross-Cancel-Regel anwenden: Nur EIN Tool kann gleichzeitig aktiv sein.
 *
 * Funktionen arbeiten direkt auf den Stores (.getState()) — kein React-
 * Hook nötig, damit sie auch aus Event-Handlern und Tests aufrufbar sind.
 */
import {
  useViewerStore,
  type LeftTool,
  type PlanningMode,
} from '../state/viewerStore'
import { useHipStore } from '../state/hipStore'
import { useKneeStore } from '../state/kneeStore'
import { useShoulderStore } from '../state/shoulderStore'
import { useNoteStore } from '../state/noteStore'
import { useOsteophyteStore } from '../state/osteophyteStore'
import { useTemplateStore } from '../state/templateStore'
import type { HipKind } from './hip/recipes'
import type { KneeKind } from './knee/recipes'
import {
  applyLeftTool,
  cancelCalibration,
  isCalibrationActive,
} from './cornerstone/viewer'
import { applyToolPane2 } from './cornerstone/viewer2'
import { useKneePanesStore } from '../state/kneePanesStore'

/** Bricht jedes laufende Mess- oder Notiz-Werkzeug ab. */
function cancelOthers() {
  useHipStore.getState().cancelTool()
  useKneeStore.getState().cancelTool()
  useNoteStore.getState().setPlacing(false)
  useOsteophyteStore.getState().setPlacing(false)
}

/**
 * Aktiviert ein Cornerstone-Tool (Pan/Zoom/Length/Angle/WindowLevel) auf
 * BEIDEN Panes (Befund T1): Es gibt nur EINE Header-Auswahl — Highlight
 * und Verhalten sind damit per Konstruktion identisch, egal in welchem
 * Bild gearbeitet wird. Ohne Zwei-Bild-Ansicht ist das rechte Anwenden
 * ein No-op (ToolGroup existiert nicht).
 */
export function pickLeftTool(tool: LeftTool) {
  cancelOthers()
  // Laufende Sonder-Modi beenden, damit das neue Tool nicht verfälscht
  // wird: der Kalibrier-Modus fräße sonst die nächste Längenmessung als
  // Referenzstrecke; ein armierter Slope-Modus ließe Klicks fenstern.
  if (isCalibrationActive()) cancelCalibration()
  useKneePanesStore.getState().setSlopeActive(false)
  useViewerStore.getState().setLeftTool(tool)
  applyLeftTool(tool)
  applyToolPane2(tool)
}

/** Aktiviert ein Hüft-Mess-Werkzeug (Toggle). */
export function pickHipTool(kind: HipKind) {
  useKneeStore.getState().cancelTool()
  useNoteStore.getState().setPlacing(false)
  useOsteophyteStore.getState().setPlacing(false)
  useHipStore.getState().toggleTool(kind)
}

/** Aktiviert ein Knie-Mess-Werkzeug (Toggle). */
export function pickKneeTool(kind: KneeKind) {
  useHipStore.getState().cancelTool()
  useNoteStore.getState().setPlacing(false)
  useOsteophyteStore.getState().setPlacing(false)
  useKneeStore.getState().toggleTool(kind)
}

/** Toggelt den Notiz-Setz-Modus. */
export function toggleNoteTool() {
  const next = !useNoteStore.getState().placing
  if (next) {
    useHipStore.getState().cancelTool()
    useKneeStore.getState().cancelTool()
    useOsteophyteStore.getState().setPlacing(false)
  }
  useNoteStore.getState().setPlacing(next)
}

/** Toggelt den Osteophyten-Markier-Modus. Beim Einschalten alle anderen
 *  Werkzeuge abbrechen, damit Klicks eindeutig zugeordnet sind. */
export function toggleOsteophyteTool() {
  const next = !useOsteophyteStore.getState().placing
  if (next) {
    useHipStore.getState().cancelTool()
    useKneeStore.getState().cancelTool()
    useNoteStore.getState().setPlacing(false)
    // Laufende Pfannen-/Schaft-Platzierung abbrechen, sonst würden zwei
    // Klick-Listener (Template + Osteophyt) denselben Klick verarbeiten.
    useTemplateStore.getState().cancelPlacement()
  }
  useOsteophyteStore.getState().setPlacing(next)
}

/**
 * Wechselt den Planungs-Modus (Hüfte / Knie / Schulter). Bricht laufende
 * Werkzeuge ALLER anderen Module ab, lässt fertige Messungen/Templates
 * aber sichtbar — sonst würde der Tab-Wechsel Daten „verschwinden lassen".
 *
 * Bewusst als Abbruch-Schleife über alle Fremd-Module statt als
 * if/else-Paar: Mit dem dritten Modus hätte ein `if (hip) … else …` nur
 * je EIN anderes Werkzeug abgeräumt — beim Wechsel auf die Schulter wäre
 * ein laufendes Knie-Werkzeug „scharf" geblieben und hätte Klicks
 * abgefangen, die der Schulter gelten.
 */
export function setPlanningMode(mode: PlanningMode) {
  const abbrechen: Record<PlanningMode, () => void> = {
    hip: () => useHipStore.getState().cancelTool(),
    knee: () => useKneeStore.getState().cancelTool(),
    shoulder: () => useShoulderStore.getState().cancelTool(),
  }
  for (const m of Object.keys(abbrechen) as PlanningMode[]) {
    if (m !== mode) abbrechen[m]()
  }
  useViewerStore.getState().setPlanningMode(mode)
}
