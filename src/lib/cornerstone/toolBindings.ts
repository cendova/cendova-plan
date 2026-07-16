/**
 * Gemeinsame Maus-Bindings beider Panes (Debug-Befund T1): Vorher konnte
 * das rechte Pane Pan/Zoom/Fenstern gar nicht auf die linke Taste legen
 * (fiel immer auf Fenstern zurück) und beim Pane-Wechsel wurde das
 * gewählte Werkzeug nicht übertragen — „Kontrast ändert sich, obwohl
 * Zoom gewählt". Jetzt gibt es EINE Binding-Funktion; pickLeftTool wendet
 * das gewählte Werkzeug immer auf BEIDE ToolGroups an (Highlight ==
 * Verhalten per Konstruktion).
 *
 * Belegung: links = gewähltes Werkzeug · Mitte oder Cmd/Strg+links = Pan
 * (Trackpad, Befund H2) · rechts = Zoom · Rad = Stack.
 */
import {
  AngleTool,
  Enums as csToolsEnums,
  LengthTool,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
} from '@cornerstonejs/tools'
import type { LeftTool } from '../../state/viewerStore'

export function applyToolBindings(toolGroupId: string, left: LeftTool): void {
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId)
  if (!toolGroup) return
  const { Primary, Secondary, Auxiliary, Wheel } = csToolsEnums.MouseBindings
  const { Meta, Ctrl } = csToolsEnums.KeyboardBindings

  // Alle Werkzeuge der linken Taste zurücksetzen.
  toolGroup.setToolPassive(WindowLevelTool.toolName)
  toolGroup.setToolPassive(LengthTool.toolName)
  toolGroup.setToolPassive(AngleTool.toolName)

  const panBindings = [
    { mouseButton: Auxiliary },
    // Trackpad ohne Mitteltaste (Befund H2): Cmd+Links (macOS,
    // Ctrl+Klick wäre dort Rechtsklick) bzw. Strg+Links (Windows/Linux).
    { mouseButton: Primary, modifierKey: Meta },
    { mouseButton: Primary, modifierKey: Ctrl },
  ]
  const zoomBindings = [{ mouseButton: Secondary }]
  if (left === 'Pan') panBindings.push({ mouseButton: Primary })
  if (left === 'Zoom') zoomBindings.push({ mouseButton: Primary })

  toolGroup.setToolActive(PanTool.toolName, { bindings: panBindings })
  toolGroup.setToolActive(ZoomTool.toolName, { bindings: zoomBindings })
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: Wheel }],
  })

  const onPrimary = { bindings: [{ mouseButton: Primary }] }
  if (left === 'WindowLevel') {
    toolGroup.setToolActive(WindowLevelTool.toolName, onPrimary)
  } else if (left === 'Length') {
    toolGroup.setToolActive(LengthTool.toolName, onPrimary)
  } else if (left === 'Angle') {
    toolGroup.setToolActive(AngleTool.toolName, onPrimary)
  }
}
