import { useEffect, useRef, useState } from 'react'
import {
  setupViewport,
  teardownViewport,
  resizeViewport,
  loadFiles,
  recoverViewport,
  isViewportLost,
} from '../lib/cornerstone/viewer'
import { useViewerStore } from '../state/viewerStore'
import { useHipStore } from '../state/hipStore'
import { useKneeStore } from '../state/kneeStore'
import { useNoteStore } from '../state/noteStore'
import { useTemplateStore } from '../state/templateStore'
import { HipOverlay } from './HipOverlay'
import { KneeOverlay } from './KneeOverlay'
import { KneeTemplateOverlay } from './KneeTemplateOverlay'
import { TemplateOverlay } from './TemplateOverlay'
import { OsteophyteOverlay } from './OsteophyteOverlay'
import { useOsteophyteStore } from '../state/osteophyteStore'
import { KneePane2 } from './KneePane2'
import { StackImagePicker } from './StackImagePicker'
import { PaneMaximizeButton } from './PaneMaximizeButton'
import { useKneePanesStore } from '../state/kneePanesStore'
import { resizeViewport2 } from '../lib/cornerstone/viewer2'
import {
  collectFilesFromDrop,
  pickDicomImageFiles,
} from '../lib/cornerstone/dicomFolder'
import { loadPlanFromFile, findPlanFile } from '../lib/plan/serialize'

/**
 * Mauszeiger passend zum aktuellen Modus:
 * - Mess- und Platzierungswerkzeuge → Fadenkreuz (präzise Landmarken-Setzung)
 * - Pan → „grab" (Hand)
 * - Zoom / Window-Level → Größenpfeil (vertikales Ziehen)
 * - Standard → normaler Pfeil
 *
 * Wird auf den Viewport-Container gelegt; einzelne Overlay-Elemente
 * (Drag-Handles, Beschriftungen) setzen ihre eigenen Cursor lokal mit
 * `style.cursor` und überstimmen damit.
 */
function viewportCursorClass(args: {
  leftTool: string
  hipActive: boolean
  kneeActive: boolean
  placingNote: boolean
  placingCup: boolean
  placingOsteophyte: boolean
  hasImage: boolean
}): string {
  if (!args.hasImage) return 'cursor-default'
  if (
    args.hipActive ||
    args.kneeActive ||
    args.placingNote ||
    args.placingCup ||
    args.placingOsteophyte
  ) {
    return 'cursor-crosshair'
  }
  switch (args.leftTool) {
    case 'Length':
    case 'Angle':
      return 'cursor-crosshair'
    case 'Pan':
      return 'cursor-grab'
    case 'Zoom':
    case 'WindowLevel':
      return 'cursor-ns-resize'
    default:
      return 'cursor-default'
  }
}

export function Viewport() {
  const elementRef = useRef<HTMLDivElement>(null)
  const hasImage = useViewerStore((s) => s.hasImage)
  const leftTool = useViewerStore((s) => s.leftTool)
  const setStatus = useViewerStore((s) => s.setStatus)
  const hipActive = useHipStore((s) => s.activeKind != null)
  const kneeActive = useKneeStore((s) => s.activeKind != null)
  const placingNote = useNoteStore((s) => s.placing)
  const placingCup = useTemplateStore((s) => s.pending != null)
  const placingOsteophyte = useOsteophyteStore((s) => s.placing)
  const planningMode = useViewerStore((s) => s.planningMode)
  const splitView = useKneePanesStore((s) => s.splitView)
  const activePane = useKneePanesStore((s) => s.activePane)
  const setActivePane = useKneePanesStore((s) => s.setActivePane)
  const maximizedPane = useKneePanesStore((s) => s.maximizedPane)
  // Zwei-Bild-Ansicht nur im Knie-Modus.
  const showSplit = planningMode === 'knee' && splitView
  // Vollbild je Pane (Doppelpfeil oben rechts): das andere Pane wird
  // ausgeblendet; Kamera (Zoom/Pan) bleibt erhalten (keepCamera-Resize),
  // Overlays folgen worldToCanvas — nichts verschiebt sich.
  const maximized = showSplit ? maximizedPane : null
  // Aktiv-Rahmen nur sichtbar, wenn geteilt (sonst ist „links" implizit).
  const leftActive = showSplit && activePane === 'left'
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Wenn der Viewport unerwartet verloren geht (WebGL-Context-Loss,
   *  Cornerstone-Engine-Crash), zeigen wir einen Wiederherstellen-Knopf
   *  als manuellen Fallback zur Auto-Recovery. */
  const [viewportLost, setViewportLost] = useState(false)
  const [recovering, setRecovering] = useState(false)

  // Periodischer Health-Check: prüft alle 500 ms, ob ein Bild als geladen
  // markiert ist, aber Cornerstones Viewport-Instanz weg ist (= das
  // typische Symptom des „Bild verschwindet"-Bugs). Dann blenden wir
  // einen Recovery-Knopf ein.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const lost = isViewportLost()
      setViewportLost((prev) => (prev !== lost ? lost : prev))
    }, 500)
    return () => window.clearInterval(interval)
  }, [])

  async function handleRecover() {
    setRecovering(true)
    try {
      const ok = await recoverViewport()
      if (ok) {
        setViewportLost(false)
        setError(null)
      }
    } finally {
      setRecovering(false)
    }
  }

  const cursorClass = viewportCursorClass({
    leftTool,
    hipActive,
    kneeActive,
    placingNote,
    placingCup,
    placingOsteophyte,
    hasImage,
  })

  useEffect(() => {
    const el = elementRef.current
    if (!el) return
    setupViewport(el).catch((e) => {
      console.error('Viewport-Initialisierung fehlgeschlagen', e)
      setError('Viewer konnte nicht gestartet werden (siehe Konsole).')
    })
    const ro = new ResizeObserver(() => resizeViewport())
    ro.observe(el)
    return () => {
      ro.disconnect()
      teardownViewport()
    }
  }, [])

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    try {
      // Ganze ORDNER (inkl. DICOMDIR/Unterordner) werden unterstützt: rekursiv
      // sammeln und auf die wahrscheinliche DICOM-Bilddatei filtern (größte
      // zuerst). collectFilesFromDrop greift die Drop-Entries synchron ab.
      const all = await collectFilesFromDrop(e.dataTransfer)
      // Plan-JSON aufs Bild gezogen? → als Plan laden statt DICOM-Suche.
      const planFile = findPlanFile(all)
      if (planFile) {
        const result = await loadPlanFromFile(planFile)
        if (result.ok) {
          setError(null)
          setStatus(result.summary)
        } else {
          setError(result.error)
        }
        return
      }
      const picked = pickDicomImageFiles(all)
      if (picked.length === 0) {
        setError('Kein DICOM-Bild gefunden (DICOMDIR/Beilagen übersprungen).')
        return
      }
      await loadFiles(picked)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(msg)
      setStatus(`Fehler: ${msg}`)
    }
  }

  // Bei Layout-Wechsel (Split an/aus) müssen beide Cornerstone-Viewports
  // auf ihre neue Elementgröße reagieren — sonst bleibt das Bild
  // verzerrt/abgeschnitten, bis man manuell resized. Ein doppelter rAF
  // stellt sicher, dass das DOM-Reflow durch ist.
  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        resizeViewport()
        resizeViewport2()
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [showSplit, maximized])

  // Feste Pane-Rollen: links AP-Ganzbein, rechts seitlich.
  const rightRole = 'seitlich'

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
    {/* Linke Spalte: Mini-Kopfzeile (nur Zwei-Bild-Ansicht) + Capture-Root
        — Aufbau SPIEGELGLEICH zu KneePane2, damit beide Panes konsistent
        aussehen (Debug-Runde 3: links schwebender Chip, rechts Kopfzeile).
        Die Kopfzeile liegt AUSSERHALB der Capture-Root → nie im PDF. */}
    <div
      className={[
        'relative flex min-w-0 flex-1 flex-col',
        // Vollbild des rechten Panes: Haupt-Pane ausblenden (Engine bleibt
        // aktiv; beim Zurückschalten stellt der keepCamera-Resize die
        // Ansicht unverändert wieder her).
        maximized === 'right' ? 'hidden' : '',
      ].join(' ')}
      // Capture-Phase: aktives Pane setzen, BEVOR Cornerstone/Tools den
      // Klick verarbeiten — so ist das Routing schon beim ersten Klick on.
      onPointerDownCapture={() => {
        if (showSplit) setActivePane('left')
      }}
    >
      {showSplit && (
        <div
          data-overlay-ui
          className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950/90 px-2 py-1 text-xs"
        >
          <span className="font-semibold text-neutral-200">AP (Ganzbein)</span>
          {activePane === 'left' && (
            <span className="text-[11px] font-medium text-sky-400">
              · aktiv
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {/* Vollbild-Umschalter (Doppelpfeil), wie im rechten Pane. */}
            <PaneMaximizeButton pane="left" />
          </div>
        </div>
      )}
    <main
      // ID = stabiler Anker für den PDF-Export (html2canvas erfasst diesen
      // Bereich inkl. Cornerstone-Canvas und aller SVG-Overlays).
      id="viewport-capture-root"
      className="relative flex min-h-0 min-w-0 flex-1 bg-black"
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
    >
      <div
        ref={elementRef}
        className={`absolute inset-0 ${cursorClass}`}
        onContextMenu={(e) => e.preventDefault()}
      />

      {!hasImage && !error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-neutral-600">
          <div className="mb-2 text-5xl">⊡</div>
          <p className="text-sm">Kein Bild geladen</p>
          <p className="mt-1 text-xs text-neutral-700">
            DICOM-Datei, -Ordner oder -ZIP hierher ziehen oder „Bild laden“ wählen
          </p>
        </div>
      )}

      {error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-sm rounded border border-red-800 bg-red-950/80 px-4 py-3 text-center text-sm text-red-200">
            {error}
          </div>
        </div>
      )}

      {/* Recovery-Banner: erscheint, wenn der Viewport unerwartet
          verloren geht (WebGL-Context-Loss, Cornerstone-Crash). Knopf
          versucht ein vollständiges Re-Init + Re-Load des letzten Bilds. */}
      {viewportLost && (
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded border border-amber-700 bg-amber-950/95 px-4 py-2 text-sm text-amber-100 shadow-lg">
          <span>
            Render-Kontext verloren — Bild und Planung sind gespeichert.
          </span>
          <button
            onClick={handleRecover}
            disabled={recovering}
            className={[
              'rounded bg-amber-700 px-3 py-1 text-xs font-medium text-amber-50 transition',
              recovering
                ? 'cursor-wait opacity-60'
                : 'hover:bg-amber-600',
            ].join(' ')}
          >
            {recovering ? 'Stelle wieder her …' : 'Bild wiederherstellen'}
          </button>
        </div>
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed border-sky-500 bg-sky-500/10" />
      )}

      {hasImage && <HipOverlay />}
      {hasImage && <KneeOverlay />}
      {hasImage && <KneeTemplateOverlay />}
      {hasImage && <TemplateOverlay />}
      {hasImage && <OsteophyteOverlay />}
      {hasImage && <StackImagePicker pane="left" />}
    </main>

      {/* Aktiv-Rahmen über der GANZEN Spalte (inkl. Kopfzeile) — spiegelt
          das rechte Pane. Liegt außerhalb der Capture-Root → nie im PDF;
          pointer-events-none lässt Klicks durch. */}
      {leftActive && (
        <div className="pointer-events-none absolute inset-0 z-20 ring-2 ring-inset ring-sky-500" />
      )}
    </div>

      {/* Rechtes Pane (eigene Cornerstone-Instanz) — nur Knie + Split.
          Trenner links als optische Abgrenzung. Klick setzt das aktive
          Pane (Capture-Phase). Der Aktiv-Ring liegt als SEPARATES Overlay
          (z-20, pointer-events-none) ÜBER KneePane2 — ein ring direkt am
          Wrapper würde von KneePane2s deckendem schwarzen Inhalt verdeckt
          (inset-box-shadow liegt hinter Kind-Elementen). */}
      {showSplit && (
        <div
          onPointerDownCapture={() => setActivePane('right')}
          className={[
            'relative flex min-w-0 flex-1',
            maximized === 'left' ? 'hidden' : '',
            maximized == null ? 'border-l-2 border-neutral-700' : '',
          ].join(' ')}
        >
          <KneePane2 roleLabel={rightRole} />
          {activePane === 'right' && (
            <div className="pointer-events-none absolute inset-0 z-20 ring-2 ring-inset ring-sky-500" />
          )}
        </div>
      )}
    </div>
  )
}
