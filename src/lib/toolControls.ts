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
import type { ShoulderKind } from './shoulder/recipes'
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
  brichFremdeWerkzeugeAb()
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

/**
 * Bricht die Mess-Werkzeuge ALLER Module ab — außer optional einem, das
 * gerade aktiviert werden soll. Bewusst zentral statt als Aufzählung in
 * jedem pick*-Aufruf: Bei zwei Modulen war die Aufzählung noch
 * überschaubar, ab dem dritten wird das Vergessen eines Moduls zum
 * stillen Fehler (zwei scharfe Werkzeuge nehmen denselben Klick an).
 */
function brichFremdeWerkzeugeAb(ausser?: PlanningMode) {
  if (ausser !== 'hip') useHipStore.getState().cancelTool()
  if (ausser !== 'knee') useKneeStore.getState().cancelTool()
  if (ausser !== 'shoulder') useShoulderStore.getState().cancelTool()
}

/** Aktiviert ein Hüft-Mess-Werkzeug (Toggle). */
export function pickHipTool(kind: HipKind) {
  brichFremdeWerkzeugeAb('hip')
  useNoteStore.getState().setPlacing(false)
  useOsteophyteStore.getState().setPlacing(false)
  useHipStore.getState().toggleTool(kind)
}

/** Aktiviert ein Knie-Mess-Werkzeug (Toggle). */
export function pickKneeTool(kind: KneeKind) {
  brichFremdeWerkzeugeAb('knee')
  useNoteStore.getState().setPlacing(false)
  useOsteophyteStore.getState().setPlacing(false)
  useKneeStore.getState().toggleTool(kind)
}

/** Aktiviert ein Schulter-Mess-Werkzeug (Toggle). */
export function pickShoulderTool(kind: ShoulderKind) {
  brichFremdeWerkzeugeAb('shoulder')
  useNoteStore.getState().setPlacing(false)
  useOsteophyteStore.getState().setPlacing(false)
  useShoulderStore.getState().toggleTool(kind)
}

/** Toggelt den Notiz-Setz-Modus. */
export function toggleNoteTool() {
  const next = !useNoteStore.getState().placing
  if (next) {
    brichFremdeWerkzeugeAb()
    useOsteophyteStore.getState().setPlacing(false)
  }
  useNoteStore.getState().setPlacing(next)
}

/** Toggelt den Osteophyten-Markier-Modus. Beim Einschalten alle anderen
 *  Werkzeuge abbrechen, damit Klicks eindeutig zugeordnet sind. */
export function toggleOsteophyteTool() {
  const next = !useOsteophyteStore.getState().placing
  if (next) {
    brichFremdeWerkzeugeAb()
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
  brichFremdeWerkzeugeAb(mode)
  useViewerStore.getState().setPlanningMode(mode)
}
