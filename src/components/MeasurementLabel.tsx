import type { Types } from '@cornerstonejs/core'
import { getViewport } from '../lib/cornerstone/viewer'
import { type LabelOffset, type LabelStyle } from '../state/hipStore'
import { useNoteStore } from '../state/noteStore'

type Vp = NonNullable<ReturnType<typeof getViewport>>

/** Minimum benötigte Felder fürs Label-Rendering. Sowohl HipMeasurement
 *  als auch KneeMeasurement erfüllen dieses Interface. */
interface MeasurementLabelable {
  id: string
  labelOffset: LabelOffset
}

/**
 * Store-Adapter: nur die Operationen, die die Label-Komponente wirklich
 * braucht. `setStyle` bleibt aus Kompatibilitätsgründen im Interface (die
 * Overlays liefern es), wird aber nicht mehr genutzt — die Beschriftung ist
 * bewusst fest (weiß), ohne Stil-Modifikatoren.
 *
 * Wichtig: `isSelected` muss ein REAKTIVER Wert sein (vom Caller per Hook
 * gelesen), sonst rerendert das Label nicht beim Selektions-Wechsel.
 */
export interface LabelStoreAdapter {
  isSelected: boolean
  select: () => void
  setOffset: (offset: LabelOffset) => void
  setStyle: (style: Partial<LabelStyle>) => void
}

/**
 * Beschriftung einer Mess-Annotation im Bild — zeigt den berechneten
 * Messwert. Feste, weiße Schrift (keine Stil-Leiste mehr); die Box ist
 * frei verschiebbar.
 */
export function MeasurementLabel({
  measurement,
  text,
  anchor,
  vp,
  store,
}: {
  measurement: MeasurementLabelable
  text: string
  anchor: Types.Point3
  vp: Vp
  store: LabelStoreAdapter
}) {
  const a = vp.worldToCanvas(anchor)
  const left = a[0] + measurement.labelOffset.x
  const top = a[1] + measurement.labelOffset.y

  function startDrag(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey) return // Cmd/Strg+Links = Pan (H2)
    e.stopPropagation()
    e.preventDefault()
    store.select()
    useNoteStore.getState().select(null)
    const startOffset = { ...measurement.labelOffset }
    const startX = e.clientX
    const startY = e.clientY

    function move(ev: MouseEvent) {
      store.setOffset({
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
          'cursor-move whitespace-nowrap rounded bg-slate-900/90 px-1.5 py-0.5 text-[17px] font-semibold leading-tight text-slate-50',
          store.isSelected ? 'ring-1 ring-slate-300' : '',
        ].join(' ')}
      >
        {text}
      </div>
    </div>
  )
}
