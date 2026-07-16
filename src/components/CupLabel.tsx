import type { Types } from '@cornerstonejs/core'
import { getViewport } from '../lib/cornerstone/viewer'
import { useHipStore } from '../state/hipStore'
import { useNoteStore } from '../state/noteStore'
import {
  useTemplateStore,
  type LabelOffset,
  type LabelStyle,
} from '../state/templateStore'

type Vp = NonNullable<ReturnType<typeof getViewport>>

/** Minimum benötigte Felder, um eine Beschriftung anzuzeigen. Sowohl
 *  CupTemplate als auch StemTemplate erfüllen dieses Interface. `labelStyle`
 *  bleibt im Typ (Serialisierung/Kompat), wird aber NICHT mehr gerendert —
 *  die Beschriftung ist bewusst fest (weiß), ohne Stil-Modifikatoren. */
interface Labelable {
  id: string
  labelOffset: LabelOffset
  labelStyle: LabelStyle
}

/**
 * Beschriftungsbox einer Schablone (Pfanne oder Schaft). Der Text
 * (`lines`) wird vom Caller geliefert; die Box ist frei verschiebbar.
 *
 * Bewusst OHNE Stil-Leiste (Schriftgröße/Farbe/Fett/Unterstrichen wurden
 * entfernt): eine feste, weiße Beschriftung bleibt klar lesbar, neutral
 * gegenüber Amber (Implantat) und Cyan (Messung) und hält das UI einfach.
 */
export function CupLabel({
  cup,
  lines,
  anchor,
  vp,
}: {
  cup: Labelable
  lines: string[]
  anchor: Types.Point3
  vp: Vp
}) {
  const selected = useTemplateStore((s) => s.selectedId === cup.id)

  const a = vp.worldToCanvas(anchor)
  const left = a[0] + cup.labelOffset.x
  const top = a[1] + cup.labelOffset.y

  function startDrag(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey) return // Cmd/Strg+Links = Pan (H2)
    e.stopPropagation()
    e.preventDefault()
    useTemplateStore.getState().select(cup.id)
    useNoteStore.getState().select(null)
    useHipStore.getState().selectLabel(null)
    const startOffset = { ...cup.labelOffset }
    const startX = e.clientX
    const startY = e.clientY

    function move(ev: MouseEvent) {
      useTemplateStore.getState().setLabelOffset(cup.id, {
        x: startOffset.x + (ev.clientX - startX),
        y: startOffset.y + (ev.clientY - startY),
      })
    }
    function up() {
      window.removeEventListener('mousemove', move, true)
      window.removeEventListener('mouseup', up, true)
    }
    window.addEventListener('mousemove', move, true)
    window.addEventListener('mouseup', up, true)
  }

  return (
    <div data-overlay-ui className="absolute" style={{ left, top }}>
      <div
        data-overlay-ui
        onMouseDown={startDrag}
        className={[
          'cursor-move whitespace-pre rounded bg-slate-900/85 px-2 py-1 text-[19px] font-semibold leading-tight text-slate-50',
          selected ? 'ring-1 ring-amber-300' : '',
        ].join(' ')}
      >
        {lines.join('\n')}
      </div>
    </div>
  )
}
