import { useEffect, useRef, useState } from 'react'
import {
  setupViewport2,
  teardownViewport2,
  resizeViewport2,
  loadFilesToPane2,
  clearSlopePane2,
} from '../lib/cornerstone/viewer2'
import { useKneePanesStore } from '../state/kneePanesStore'
import {
  collectFilesFromDrop,
  expandZips,
  pickDicomImageFiles,
} from '../lib/cornerstone/dicomFolder'
import { loadPlanFromFile, findPlanFile } from '../lib/plan/serialize'
import { KneeTemplateOverlay } from './KneeTemplateOverlay'
import { StackImagePicker } from './StackImagePicker'
import { PaneMaximizeButton } from './PaneMaximizeButton'

/**
 * Rechtes Pane der Knie-Zwei-Bild-Ansicht (typischerweise die seitliche
 * Aufnahme). Eigenständige Cornerstone-Instanz (siehe viewer2.ts) — vom
 * Haupt-Pane isoliert.
 *
 * v1: Anzeige + Navigation (Pan/Zoom/Fenstern) + eigenes Bild-Laden per
 * Drag&Drop oder Button + eigener Kalibrier-Badge (Auto aus DICOM).
 *
 * `roleLabel` kommt von außen (feste Rolle „seitlich").
 */
export function KneePane2({ roleLabel }: { roleLabel: string }) {
  const elementRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const hasImage = useKneePanesStore((s) => s.rightHasImage)
  const status = useKneePanesStore((s) => s.rightStatus)
  const setRightStatus = useKneePanesStore((s) => s.setRightStatus)
  const isActive = useKneePanesStore((s) => s.activePane === 'right')
  const slopeActive = useKneePanesStore((s) => s.slopeActive)
  const setSlopeActive = useKneePanesStore((s) => s.setSlopeActive)
  const rightMeasurements = useKneePanesStore((s) => s.rightMeasurements)
  // Slope-Chip: nur im Slope-Modus entstandene Winkel tragen das
  // Slope-Label (generische W-Winkel bleiben außen vor, Befund T1).
  const slope =
    rightMeasurements.find(
      (m) => m.kind === 'angle' && m.label.startsWith('Slope'),
    ) ?? null

  // Der Slope-Modus wird über die Toolbar armiert („3 · Einzel-Messungen"
  // → Tibialer Slope, UX-Befund P1-2) — hier bleibt nur der Wert-Chip.

  // Slope-Messung verwerfen (entfernt die Winkel-Annotation der seitlichen
  // Aufnahme) und zurück zur Navigation.
  function resetSlope() {
    clearSlopePane2()
    setSlopeActive(false)
  }

  // Cornerstone-Setup beim Mount, Teardown beim Unmount.
  useEffect(() => {
    const el = elementRef.current
    if (!el) return
    let disposed = false
    setupViewport2(el).catch((e) => {
      console.error('[viewer2] Setup fehlgeschlagen', e)
      if (!disposed) setRightStatus('Viewer (rechts) konnte nicht starten')
    })
    const ro = new ResizeObserver(() => resizeViewport2())
    ro.observe(el)
    return () => {
      disposed = true
      ro.disconnect()
      teardownViewport2()
    }
  }, [setRightStatus])

  // Lädt die wahrscheinliche DICOM-Bilddatei aus der Auswahl (Einzeldatei,
  // Ordner-Inhalt oder ZIP) ins seitliche Pane — wie das Haupt-Pane.
  async function loadPicked(files: File[]) {
    // Plan-JSON hier abgelegt? → als Plan laden statt DICOM-Suche.
    const planFile = findPlanFile(files)
    if (planFile) {
      const result = await loadPlanFromFile(planFile)
      setRightStatus(result.ok ? result.summary : `Fehler: ${result.error}`)
      return
    }
    const picked = pickDicomImageFiles(files)
    if (picked.length === 0) {
      setRightStatus('Kein DICOM-Bild gefunden (DICOMDIR/Beilagen übersprungen).')
      return
    }
    try {
      await loadFilesToPane2(picked)
    } catch (err) {
      setRightStatus(
        `Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`,
      )
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    await loadPicked(await expandZips(Array.from(files)))
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    // Ganze Ordner (inkl. DICOMDIR/Unterordner) und ZIPs werden unterstützt.
    await loadPicked(await collectFilesFromDrop(e.dataTransfer))
  }

  return (
    <div className="relative flex min-w-0 flex-1 flex-col bg-black">
      {/* Mini-Kopfzeile: Rolle + Kalibrier-Badge + Laden. */}
      <div
        data-overlay-ui
        className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950/90 px-2 py-1 text-xs"
      >
        <span className="font-semibold text-neutral-200">{roleLabel}</span>
        {isActive && <span className="text-[11px] font-medium text-sky-400">· aktiv</span>}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Tibialer Slope — Wert-Chip (Messung startet in der Toolbar
              unter „3 · Einzel-Messungen"). */}
          {hasImage && slope && (
            <>
              <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-200">
                Slope {slope.value.toFixed(1).replace('.', ',')}°
              </span>
              <button
                type="button"
                onClick={resetSlope}
                title="Slope-Messung verwerfen"
                className="rounded px-1 py-0.5 text-[11px] text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
              >
                Zurücksetzen
              </button>
            </>
          )}
          {/* Vollbild-Umschalter (Doppelpfeil) fürs seitliche Pane. */}
          <PaneMaximizeButton pane="right" />
        </div>
      </div>

      {/* Cornerstone-Render-Fläche + Drag&Drop. Die id ist die Capture-
          Wurzel für den PDF-Export (Seite 1, zweites Bild „seitlich"). */}
      <div
        id="viewport-capture-root-right"
        className="relative min-h-0 flex-1"
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
      >
        <div
          ref={elementRef}
          className="absolute inset-0"
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Fehler auch MIT geladenem Bild sichtbar machen (Debug-Befund K1:
            Meldungen erschienen nur im Empty-State — ein fehlgeschlagener
            Zweit-Load blieb stumm schwarz). */}
        {hasImage && status.startsWith('Fehler') && (
          <div
            data-overlay-ui
            data-pdf-hide
            className="absolute inset-x-2 top-2 z-20 rounded border border-red-800/70 bg-red-950/85 px-2 py-1 text-[11px] leading-snug text-red-200"
          >
            {status}
          </div>
        )}

        {/* Schablonen-Overlay des rechten Panes (eigener Viewport +
            eigene Kalibrierung, gefiltert auf pane='right'). */}
        {hasImage && <KneeTemplateOverlay pane="right" />}

        {/* Kandidaten-Auswahl bei Mehr-Bild-Ladungen (ZIP mit mehreren
            DICOMs): Pfeile + Fixieren, wie im Haupt-Pane. */}
        {hasImage && <StackImagePicker pane="right" />}

        {!hasImage && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center text-neutral-600 transition hover:text-neutral-400"
          >
            <div className="mb-2 text-4xl">⊞</div>
            <p className="text-xs">{status}</p>
            <p className="mt-1 text-[11px] text-neutral-700">
              Seitliches Bild, -Ordner oder -ZIP laden — oder hierher ziehen
            </p>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".dcm,.dicom,.ima,.zip"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {/* Anleitung während der Slope-Messung (3-Punkt-Winkel). */}
        {hasImage && slopeActive && !slope && (
          <div
            data-overlay-ui
            data-pdf-hide
            className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-3"
          >
            <span className="rounded bg-neutral-900/85 px-2.5 py-1 text-center text-[11px] font-medium text-neutral-200 shadow">
              Tibialer Slope: Schaftachse · Scheitel am Plateau · Plateau (3 Punkte)
            </span>
          </div>
        )}

        {dragOver && (
          <div className="pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed border-sky-500 bg-sky-500/10" />
        )}
      </div>
    </div>
  )
}
