import { useRef } from 'react'
import { getViewport } from '../lib/cornerstone/viewer'
import { useViewportSync } from '../lib/cornerstone/useViewportSync'
import { useViewerStore } from '../state/viewerStore'
import { useKneeStore } from '../state/kneeStore'
import { getKneeRecipe, computeWorkflowRaw, type KneeKind } from '../lib/knee/recipes'
import { classifyAlignment } from '../lib/knee/cpak'
import {
  extractWorkflowAxes,
  computePlannedCpak,
  pickComponent,
} from '../lib/knee/resection'
import { useKneeTemplateStore } from '../state/kneeTemplateStore'
import { DraggableImageBox, type BoxLine } from './DraggableImageBox'
import {
  MeasurementSvg,
  OverlayLabels,
  StepPrompt,
  computeVisible,
  useMeasurementInteraction,
  type OverlayLabelAdapter,
} from './measurementOverlay'

/**
 * Knie-Mess-Overlay — dünne Hülle um den geteilten Kern in
 * measurementOverlay.tsx (Audit-Befund C3). Beide Overlays laufen
 * parallel; das aktive Tool ist entweder Hüft- ODER Knie-seitig (Toolbar
 * schaltet gegenseitig ab), daher keine Klick-Konflikte beim Setzen.
 * Knie-spezifisch sind nur: der Ausrichtungs-Kasten (Varus/Valgus +
 * geplante Korrektur), Label-Verbinder-Linien, KEINE Draft-Verbindungen
 * (Landmarken sind eigenständig) und das Leerklick-/Escape-Verhalten.
 * Notizen rendert das HipOverlay einmal global.
 */

const labelAdapter: OverlayLabelAdapter = {
  useIsSelected: (id) => useKneeStore((s) => s.selectedLabelId === id),
  select: (id) => useKneeStore.getState().selectLabel(id),
  setOffset: (id, o) => useKneeStore.getState().setLabelOffset(id, o),
  setStyle: (id, s) => useKneeStore.getState().setLabelStyle(id, s),
}

export function KneeOverlay() {
  const svgRef = useRef<SVGSVGElement>(null)
  useViewportSync()

  const measurements = useKneeStore((s) => s.measurements)
  const draftPoints = useKneeStore((s) => s.draftPoints)
  const activeKind = useKneeStore((s) => s.activeKind)
  // Platzierte Schablonen — für die „geplante" CPAK im Achs-Kasten (landet
  // so im Screenshot/PDF). Reaktiv, damit der Kasten live mitwandert.
  const kneeTemplates = useKneeTemplateStore((s) => s.templates)
  const calibration = useViewerStore((s) => s.calibration)
  const factor = calibration?.mmPerWorldUnit ?? 1

  useMeasurementInteraction({
    getState: () => useKneeStore.getState(),
    getRecipe: (kind) => getKneeRecipe(kind as KneeKind),
    // Leerer Klick: nur eigene Knie-Label-Auswahl aufheben (Hüft-,
    // Notiz- und Template-Auswahl setzt das HipOverlay zurück).
    onEmptyClick: () => useKneeStore.getState().selectLabel(null),
    onEscape: () => useKneeStore.getState().cancelTool(),
  })

  const vp = getViewport()
  if (!vp) return null

  const computed = computeVisible(
    measurements,
    (kind) => getKneeRecipe(kind as KneeKind),
    factor,
  )

  // Frei verschiebbarer Ausrichtungs-Kasten im Bild (Screenshot/PDF): zeigt die
  // GLOBALE Beinachse als Varus/Valgus (signierte mHKA-Abweichung, ±2° wie
  // MacDessi — Richtung und Betrag aus DERSELBEN Größe, Debug-Runde 3: der
  // aHKA ist um den JLCA versetzt und labelte ein 4°-Varusbein „neutral")
  // und — sobald Implantate platziert sind — den durch die Implantat-
  // position korrigierten Wert in GRÜN. mHKA selbst wird nicht mehr angezeigt.
  const alignmentLines = (() => {
    const wf = measurements.find(
      (m) => m.kind === 'workflow' && m.visible !== false,
    )
    const wfRecipe = getKneeRecipe('workflow')
    if (!wf || !wfRecipe || wf.points.length < wfRecipe.steps.length) return null
    const raw = computeWorkflowRaw(wf.points, factor)
    if (!raw) return null
    const fmtDeg = (n: number) => n.toFixed(1).replace('.', ',')
    const alignText = (signed: number, mag: number) => {
      const dir = classifyAlignment(signed)
      return dir === 'Neutral' ? `${fmtDeg(mag)}° neutral` : `${fmtDeg(mag)}° ${dir}`
    }
    const lines: BoxLine[] = [
      'Ausrichtung',
      alignText(raw.hkaDeviationSigned, Math.abs(raw.deviationFrom180)),
    ]
    // Korrigierter (post-OP) Wert aus den platzierten AP-Komponenten — GRÜN.
    const axes = extractWorkflowAxes(wf.points)
    const apLeft = kneeTemplates.filter(
      (t) => (t.pane ?? 'left') === 'left' && t.view === 'AP',
    )
    const fem = pickComponent(apLeft, 'Femur')
    const tib = pickComponent(apLeft, 'Tibia')
    if (axes && (fem || tib)) {
      const planned = computePlannedCpak(axes, raw.mLDFA, raw.mMPTA, fem, tib)
      lines.push({
        text: alignText(planned.cpak.aHKA, Math.abs(planned.cpak.aHKA)),
        color: '#4ade80',
      })
    }
    return lines
  })()

  const recipe = activeKind ? getKneeRecipe(activeKind) : undefined
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

      {alignmentLines && <DraggableImageBox vp={vp} lines={alignmentLines} />}

      {nextPrompt && recipe && (
        <StepPrompt
          tone="violet"
          recipeLabel={recipe.label}
          stepIndex={draftPoints.length + 1}
          stepCount={recipe.steps.length}
          prompt={nextPrompt}
          showBack={draftPoints.length > 0}
          onBack={() => useKneeStore.getState().removeLastDraftPoint()}
        />
      )}
    </>
  )
}
