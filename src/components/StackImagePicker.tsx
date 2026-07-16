import { useEffect } from 'react'
import { useViewerStore } from '../state/viewerStore'
import { useKneePanesStore } from '../state/kneePanesStore'
import {
  showImageCandidate,
  fixImageCandidate,
} from '../lib/cornerstone/viewer'
import {
  showImageCandidate2,
  fixImageCandidate2,
} from '../lib/cornerstone/viewer2'

/**
 * Kandidaten-Auswahl bei Mehr-Bild-Ladungen (ZIP/Ordner mit mehreren
 * DICOMs, Debug-Runde 2): Pfeile links/rechts blättern durch die
 * Kandidaten, unten fixiert „Dieses Bild verwenden" die Wahl — danach
 * verschwinden die Pfeile. Wiedereröffnen über den Kalibrier-Dialog.
 *
 * Erscheint nur, wenn es wirklich etwas zu wählen gibt (≥ 2 Kandidaten,
 * noch nicht fixiert). Pfeiltasten (←/→) blättern ebenfalls, Enter
 * fixiert — nur für das AKTIVE Pane, damit sich zwei offene Picker
 * nicht gegenseitig stören.
 */
export function StackImagePicker({ pane }: { pane: 'left' | 'right' }) {
  const selLeft = useViewerStore((s) => s.imageSelection)
  const selRight = useKneePanesStore((s) => s.rightImageSelection)
  const activePane = useKneePanesStore((s) => s.activePane)
  const sel = pane === 'right' ? selRight : selLeft
  const visible = !!sel && sel.count > 1 && !sel.fixed
  const isActivePane = pane === activePane

  const show = (i: number) =>
    pane === 'right' ? showImageCandidate2(i) : showImageCandidate(i)
  const fix = () =>
    pane === 'right' ? fixImageCandidate2() : fixImageCandidate()

  // Tastatur: ←/→ blättern, Enter fixiert. Nicht aus Textfeldern heraus
  // und nur fürs aktive Pane. Schablonen-Nudge per Pfeiltaste kollidiert
  // nicht: solange die Auswahl offen ist, existieren keine Schablonen
  // (der Wechsel setzt sie zurück).
  useEffect(() => {
    if (!visible || !isActivePane || !sel) return
    const index = sel.index
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName.toLowerCase() ?? ''
      if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        void show(index - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        void show(index + 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        fix()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isActivePane, sel?.index, sel?.count, pane])

  if (!visible || !sel) return null

  const atStart = sel.index <= 0
  const atEnd = sel.index >= sel.count - 1
  const fileName = sel.fileNames[sel.index] ?? ''

  return (
    <>
      {/* Blätter-Pfeile, vertikal zentriert an den Bildrändern. */}
      <ArrowButton
        side="left"
        disabled={atStart}
        onClick={() => void show(sel.index - 1)}
      />
      <ArrowButton
        side="right"
        disabled={atEnd}
        onClick={() => void show(sel.index + 1)}
      />

      {/* Auswahl-Chip unten: Position + Dateiname + Fixieren. */}
      <div
        data-overlay-ui
        data-pdf-hide
        className="absolute inset-x-0 bottom-6 z-30 flex justify-center px-3"
      >
        <div className="flex max-w-[92%] items-center gap-2 rounded-lg border border-sky-800 bg-neutral-950/90 px-3 py-1.5 shadow-lg">
          <span className="shrink-0 text-xs font-semibold text-sky-200 tabular-nums">
            Bild {sel.index + 1}/{sel.count}
          </span>
          <span className="min-w-0 truncate text-[11px] text-neutral-400">
            {fileName}
          </span>
          <button
            type="button"
            onClick={fix}
            className="shrink-0 rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-sky-500"
          >
            Dieses Bild verwenden
          </button>
        </div>
      </div>
    </>
  )
}

function ArrowButton({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-overlay-ui
      data-pdf-hide
      onClick={onClick}
      disabled={disabled}
      title={side === 'left' ? 'Vorheriges Bild (←)' : 'Nächstes Bild (→)'}
      className={[
        'absolute top-1/2 z-30 -translate-y-1/2 rounded-full border bg-neutral-950/80 p-2 text-xl leading-none transition',
        side === 'left' ? 'left-2' : 'right-2',
        disabled
          ? 'cursor-default border-neutral-800 text-neutral-700'
          : 'border-sky-700 text-sky-200 shadow-lg hover:bg-sky-900/60',
      ].join(' ')}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  )
}
