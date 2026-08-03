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
import { useShaftFragmentStore } from '../state/shaftFragmentStore'
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

/** Bricht jedes laufende Mess-, Notiz- oder Zusatz-Werkzeug ab. */
function cancelOthers() {
  brichFremdeWerkzeugeAb()
  brichZusatzWerkzeugeAb()
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

/**
 * Bricht die modul-unabhängigen ZUSATZ-Werkzeuge ab (Notiz, Osteophyt,
 * Schaft-Fragment) — außer optional einem.
 *
 * Aus demselben Grund zentral wie `brichFremdeWerkzeugeAb`: Vorher stand
 * die Liste an fünf Aufrufstellen ausgeschrieben; mit dem dritten
 * Zusatzwerkzeug wäre das Vergessen einer Stelle ein stiller Fehler —
 * zwei scharfe Werkzeuge nähmen denselben Klick an.
 */
type Zusatzwerkzeug = 'note' | 'osteophyte' | 'fragment'

function brichZusatzWerkzeugeAb(ausser?: Zusatzwerkzeug) {
  if (ausser !== 'note') useNoteStore.getState().setPlacing(false)
  if (ausser !== 'osteophyte') useOsteophyteStore.getState().setPlacing(false)
  if (ausser !== 'fragment') useShaftFragmentStore.getState().setPlacing(false)
}

/** Aktiviert ein Hüft-Mess-Werkzeug (Toggle). */
export function pickHipTool(kind: HipKind) {
  brichFremdeWerkzeugeAb('hip')
  brichZusatzWerkzeugeAb()
  useHipStore.getState().toggleTool(kind)
}

/** Aktiviert ein Knie-Mess-Werkzeug (Toggle). */
export function pickKneeTool(kind: KneeKind) {
  brichFremdeWerkzeugeAb('knee')
  brichZusatzWerkzeugeAb()
  useKneeStore.getState().toggleTool(kind)
}

/** Aktiviert ein Schulter-Mess-Werkzeug (Toggle). */
export function pickShoulderTool(kind: ShoulderKind) {
  brichFremdeWerkzeugeAb('shoulder')
  brichZusatzWerkzeugeAb()
  useShoulderStore.getState().toggleTool(kind)
}

/** Toggelt den Notiz-Setz-Modus. */
export function toggleNoteTool() {
  const next = !useNoteStore.getState().placing
  if (next) {
    brichFremdeWerkzeugeAb()
    brichZusatzWerkzeugeAb('note')
  }
  useNoteStore.getState().setPlacing(next)
}

/** Toggelt den Osteophyten-Markier-Modus. Beim Einschalten alle anderen
 *  Werkzeuge abbrechen, damit Klicks eindeutig zugeordnet sind. */
export function toggleOsteophyteTool() {
  const next = !useOsteophyteStore.getState().placing
  if (next) {
    brichFremdeWerkzeugeAb()
    brichZusatzWerkzeugeAb('osteophyte')
    // Laufende Pfannen-/Schaft-Platzierung abbrechen, sonst würden zwei
    // Klick-Listener (Template + Osteophyt) denselben Klick verarbeiten.
    useTemplateStore.getState().cancelPlacement()
  }
  useOsteophyteStore.getState().setPlacing(next)
}

/** Toggelt das Schaft-Schneidewerkzeug (Osteotomie-Simulation). */
export function toggleShaftFragmentTool() {
  const next = !useShaftFragmentStore.getState().placing
  if (next) {
    brichFremdeWerkzeugeAb()
    brichZusatzWerkzeugeAb('fragment')
    useTemplateStore.getState().cancelPlacement()
  }
  useShaftFragmentStore.getState().setPlacing(next)
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
  // Auch die modul-unabhängigen Zusatzwerkzeuge: ein scharfes
  // Schneidewerkzeug soll nach dem Tab-Wechsel keine Klicks abfangen.
  brichZusatzWerkzeugeAb()
  useViewerStore.getState().setPlanningMode(mode)
}
