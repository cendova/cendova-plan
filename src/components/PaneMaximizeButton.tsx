import { useKneePanesStore, type ActivePane } from '../state/kneePanesStore'

/**
 * Vollbild-Umschalter je Pane (Debug-Runde 2): Doppelpfeil oben rechts
 * maximiert das Pane (das andere wird ausgeblendet), erneuter Klick
 * stellt die geteilte Ansicht wieder her. Maximieren setzt das Pane
 * auch AKTIV — sonst liefen Header-Werkzeuge und „Bild laden" ins
 * unsichtbare Pane.
 *
 * Kamera (Zoom/Pan) und Overlays bleiben beim Umschalten stabil: die
 * Cornerstone-Engines resizen mit keepCamera, die SVG-Overlays folgen
 * worldToCanvas.
 */
export function PaneMaximizeButton({
  pane,
  className = '',
}: {
  pane: ActivePane
  className?: string
}) {
  const maximizedPane = useKneePanesStore((s) => s.maximizedPane)
  const isMax = maximizedPane === pane

  function toggle() {
    const store = useKneePanesStore.getState()
    if (isMax) {
      store.setMaximizedPane(null)
    } else {
      store.setMaximizedPane(pane)
      store.setActivePane(pane)
    }
  }

  return (
    <button
      type="button"
      data-overlay-ui
      data-pdf-hide
      onClick={toggle}
      title={isMax ? 'Geteilte Ansicht wiederherstellen' : 'Pane maximieren'}
      className={[
        'rounded border border-neutral-700 bg-neutral-950/80 p-1.5 text-neutral-300 shadow transition hover:bg-neutral-800 hover:text-sky-300',
        className,
      ].join(' ')}
    >
      {isMax ? <IconRestore /> : <IconMaximize />}
    </button>
  )
}

/** Doppelpfeil nach außen (maximieren). */
function IconMaximize() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Doppelpfeil nach innen (geteilte Ansicht wiederherstellen). */
function IconRestore() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M13.5 6.5h-4v-4M9.5 6.5L14 2M2.5 9.5h4v4M6.5 9.5L2 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
