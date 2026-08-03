import { useRef } from 'react'
import { getViewport } from '../lib/cornerstone/viewer'
import { useViewportSync } from '../lib/cornerstone/useViewportSync'
import { useViewerStore } from '../state/viewerStore'
import { useShoulderStore } from '../state/shoulderStore'
import { getShoulderRecipe, type ShoulderKind } from '../lib/shoulder/recipes'
import {
  MeasurementSvg,
  OverlayLabels,
  StepPrompt,
  computeVisible,
  useMeasurementInteraction,
  type OverlayLabelAdapter,
} from './measurementOverlay'

/**
 * Schulter-Mess-Overlay — dünne Hülle um den geteilten Kern in
 * measurementOverlay.tsx, aufgebaut wie KneeOverlay.
 *
 * Alle drei Overlays laufen parallel und hängen an `hasImage`, NICHT am
 * Planungs-Modus: Fertige Messungen bleiben so über den Tab-Wechsel
 * hinweg sichtbar (und landen im PDF-Schnappschuss von Seite 1, der das
 * Viewport-DOM abfotografiert). Klick-Konflikte kann es trotzdem nicht
 * geben, weil `setPlanningMode` die Werkzeuge aller anderen Module
 * abbricht — es ist immer höchstens EINES scharf.
 *
 * Schulter-spezifisch ist hier bewusst NICHTS außer dem Store: keine
 * Draft-Verbindungslinien (die Landmarken sind eigenständig, wie beim
 * Knie), kein Info-Kasten. Notizen rendert das HipOverlay einmal global.
 */

const labelAdapter: OverlayLabelAdapter = {
  useIsSelected: (id) => useShoulderStore((s) => s.selectedLabelId === id),
  select: (id) => useShoulderStore.getState().selectLabel(id),
  setOffset: (id, o) => useShoulderStore.getState().setLabelOffset(id, o),
  setStyle: (id, s) => useShoulderStore.getState().setLabelStyle(id, s),
}

export function ShoulderOverlay() {
  const svgRef = useRef<SVGSVGElement>(null)
  useViewportSync()

  const measurements = useShoulderStore((s) => s.measurements)
  const draftPoints = useShoulderStore((s) => s.draftPoints)
  const activeKind = useShoulderStore((s) => s.activeKind)
  const calibration = useViewerStore((s) => s.calibration)
  const factor = calibration?.mmPerWorldUnit ?? 1

  useMeasurementInteraction({
    getState: () => useShoulderStore.getState(),
    getRecipe: (kind) => getShoulderRecipe(kind as ShoulderKind),
    // Leerer Klick: nur die eigene Label-Auswahl aufheben (Hüft-, Notiz-
    // und Template-Auswahl setzt das HipOverlay zurück).
    onEmptyClick: () => useShoulderStore.getState().selectLabel(null),
    onEscape: () => useShoulderStore.getState().cancelTool(),
  })

  const vp = getViewport()
  if (!vp) return null

  const computed = computeVisible(
    measurements,
    (kind) => getShoulderRecipe(kind as ShoulderKind),
    factor,
  )

  const recipe = activeKind ? getShoulderRecipe(activeKind) : undefined
  const nextPrompt =
    recipe && draftPoints.length < recipe.steps.length
      ? recipe.steps[draftPoints.length]
      : undefined

  return (
    <>
      <MeasurementSvg
        svgRef={svgRef}
        computed={computed}
        draftPoints={draftPoints}
        vp={vp}
        showLabelConnector
      />

      <OverlayLabels computed={computed} vp={vp} adapter={labelAdapter} />

      {nextPrompt && recipe && (
        <StepPrompt
          tone="violet"
          recipeLabel={recipe.label}
          stepIndex={draftPoints.length + 1}
          stepCount={recipe.steps.length}
          prompt={nextPrompt}
          showBack={draftPoints.length > 0}
          onBack={() => useShoulderStore.getState().removeLastDraftPoint()}
        />
      )}
    </>
  )
}
