import { useRef } from 'react'
import { getViewport } from '../lib/cornerstone/viewer'
import { useViewportSync } from '../lib/cornerstone/useViewportSync'
import { useViewerStore } from '../state/viewerStore'
import { useHipStore } from '../state/hipStore'
import { useNoteStore } from '../state/noteStore'
import { useTemplateStore } from '../state/templateStore'
import { getRecipe, type HipKind } from '../lib/hip/recipes'
import { computeImplantLLDCorrection } from '../lib/hip/lldCalculation'
import { NoteBox } from './NoteBox'
import { DraggableImageBox } from './DraggableImageBox'
import {
  MeasurementSvg,
  OverlayLabels,
  StepPrompt,
  computeVisible,
  useMeasurementInteraction,
  type OverlayLabelAdapter,
} from './measurementOverlay'

/**
 * Hüft-Mess-Overlay — dünne Hülle um den geteilten Kern in
 * measurementOverlay.tsx (Audit-Befund C3: Hip-/KneeOverlay waren ~90 %
 * identisch). Hüft-spezifisch sind nur: Notizen (einmal global hier),
 * der Korrektur-Kasten (Beinlänge/Offset), Draft-Verbindungslinien und
 * das Leerklick-/Escape-Verhalten.
 */

const labelAdapter: OverlayLabelAdapter = {
  useIsSelected: (id) => useHipStore((s) => s.selectedLabelId === id),
  select: (id) => useHipStore.getState().selectLabel(id),
  setOffset: (id, o) => useHipStore.getState().setLabelOffset(id, o),
  setStyle: (id, s) => useHipStore.getState().setLabelStyle(id, s),
}

export function HipOverlay() {
  const svgRef = useRef<SVGSVGElement>(null)
  // Hält das Overlay mit Zoom/Pan der Kamera synchron.
  useViewportSync()

  const measurements = useHipStore((s) => s.measurements)
  const draftPoints = useHipStore((s) => s.draftPoints)
  const activeKind = useHipStore((s) => s.activeKind)
  const notes = useNoteStore((s) => s.notes)
  const calibration = useViewerStore((s) => s.calibration)
  const factor = calibration?.mmPerWorldUnit ?? 1
  // Für die Beinlängen-Bilanz (prä-OP-Messung + geplante Implantat-Korrektur).
  const cups = useTemplateStore((s) => s.templates)
  const stems = useTemplateStore((s) => s.stems)
  const referenceLine = useTemplateStore((s) => s.referenceLine)

  useMeasurementInteraction({
    getState: () => useHipStore.getState(),
    getRecipe: (kind) => getRecipe(kind as HipKind),
    // Notiz-Platzierung beansprucht einen Leerklick (nur die Hüfte
    // behandelt Notizen — einmal global).
    claimEmptyClick: (world) => {
      const noteStore = useNoteStore.getState()
      if (!noteStore.placing) return false
      noteStore.addNote(world)
      return true
    },
    // Leerer Klick: Auswahl von Notiz, Beschriftung und Schablone aufheben.
    onEmptyClick: () => {
      useNoteStore.getState().select(null)
      useHipStore.getState().selectLabel(null)
      useTemplateStore.getState().select(null)
    },
    onEscape: () => {
      useHipStore.getState().cancelTool()
      useNoteStore.getState().setPlacing(false)
    },
  })

  const vp = getViewport()
  if (!vp) return null

  const computed = computeVisible(
    measurements,
    (kind) => getRecipe(kind as HipKind),
    factor,
  )

  // „Korrektur"-Kasten (klein, frei verschiebbar) im Bild: zeigt die durch
  // Pfanne + Schaft geplante Beinlängen- (cm) und Offset-Änderung (mm) der
  // operierten Seite. Welt-verankert → wandert beim Zoomen/Pannen mit dem Bild.
  const correction = computeImplantLLDCorrection(
    cups,
    stems,
    referenceLine,
    factor,
  )
  const opCorr = correction.perSide.length > 0 ? correction.perSide[0] : null
  const signCm = (mm: number) =>
    `${mm >= 0 ? '+' : ''}${(mm / 10).toFixed(2).replace('.', ',')} cm`
  const signMm = (mm: number) => `${mm >= 0 ? '+' : ''}${mm.toFixed(1)} mm`
  const balanceLines = opCorr
    ? [
        'Korrektur',
        `Beinlänge: ${signCm(opCorr.mm)}`,
        `Offset: ${signMm(opCorr.offsetMm)}`,
      ]
    : null

  const recipe = activeKind ? getRecipe(activeKind) : undefined
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
        draftLineGroups={recipe?.lineGroups}
      />

      <OverlayLabels computed={computed} vp={vp} adapter={labelAdapter} />

      {balanceLines && <DraggableImageBox vp={vp} lines={balanceLines} />}

      {notes.map((n) => (
        <NoteBox key={n.id} note={n} vp={vp} />
      ))}

      {nextPrompt && recipe && (
        <StepPrompt
          tone="amber"
          recipeLabel={recipe.label}
          stepIndex={draftPoints.length + 1}
          stepCount={recipe.steps.length}
          prompt={nextPrompt}
          showBack={draftPoints.length > 0}
          onBack={() => useHipStore.getState().removeLastDraftPoint()}
        />
      )}
    </>
  )
}
