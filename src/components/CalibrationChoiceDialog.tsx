import { useState } from 'react'
import { useViewerStore } from '../state/viewerStore'
import { useKneePanesStore } from '../state/kneePanesStore'
import {
  applyMagnificationOnlyCalibration,
  startCalibration,
  reopenImageSelection,
} from '../lib/cornerstone/viewer'
import { reopenImageSelection2 } from '../lib/cornerstone/viewer2'

/**
 * Methoden-Auswahl für die Kalibrierung. Erscheint, wenn der Nutzer das
 * Kalibrier-Icon klickt — bietet zwei Wege:
 *
 *  A) Strecke ausmessen: bekannte Referenz im Bild (z.B. Kalibrierkugel)
 *     wird gemessen, danach Länge in mm + Mag-Faktor im Folge-Dialog.
 *     Funktioniert immer.
 *
 *  B) Nur Vergrößerungsfaktor: keine Messung — der Faktor wird direkt
 *     gesetzt, die Skalierung ergibt sich aus dem DICOM-PixelSpacing.
 *     Funktioniert NUR, wenn das geladene Bild ein PixelSpacing hat.
 *
 * Bei B ohne PixelSpacing wird die Option ausgegraut und ein Hinweis
 * angezeigt — dann ist nur Weg A nutzbar.
 */
export function CalibrationChoiceDialog() {
  const open = useViewerStore((s) => s.calibrationChoiceOpen)
  const setOpen = useViewerStore((s) => s.setCalibrationChoiceOpen)
  const setMagOnlyOpen = useViewerStore((s) => s.setMagnificationOnlyOpen)
  // PixelSpacing des AKTUELLEN Kalibrier-Ziels (links Haupt-Bild, rechts
  // das zweite Knie-Pane) — bestimmt, ob „nur Mag-Faktor" möglich ist.
  const target = useKneePanesStore((s) => s.calibrationTarget)
  const splitView = useKneePanesStore((s) => s.splitView)
  const leftPx = useViewerStore((s) => s.imageMeta?.pixelSpacing)
  const rightPx = useKneePanesStore((s) => s.rightImageMeta?.pixelSpacing)
  const pixelSpacing = target === 'right' ? rightPx : leftPx
  const hasPixelSpacing = !!pixelSpacing && pixelSpacing > 0
  // Kandidaten-Auswahl des Ziel-Panes: Wiedereröffnen nur anbieten, wenn
  // die Ladung überhaupt mehrere Bilder hatte (Debug-Runde 2).
  const leftSel = useViewerStore((s) => s.imageSelection)
  const rightSel = useKneePanesStore((s) => s.rightImageSelection)
  const sel = target === 'right' ? rightSel : leftSel
  const canReopen = !!sel && sel.count > 1
  // Zwei-Stufen-Bestätigung fürs Wiedereröffnen (Warnhinweis inline).
  const [confirmReopen, setConfirmReopen] = useState(false)
  // Hinweis, welches Bild kalibriert wird (nur in der Zwei-Bild-Ansicht).
  const targetLabel = splitView
    ? target === 'right'
      ? 'seitliches Bild'
      : 'AP-Bild'
    : ''

  if (!open) return null

  function closeDialog() {
    setConfirmReopen(false)
    setOpen(false)
  }

  function chooseMeasure() {
    closeDialog()
    startCalibration()
  }

  function chooseMagnification() {
    if (!hasPixelSpacing) return
    closeDialog()
    setMagOnlyOpen(true)
  }

  function confirmReopenSelection() {
    closeDialog()
    if (target === 'right') reopenImageSelection2()
    else reopenImageSelection()
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
      <div className="w-[440px] rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
        <div className="border-b border-neutral-700 px-4 py-3 text-sm font-semibold">
          Kalibrierungs-Methode wählen
          {targetLabel && (
            <span className="ml-2 font-normal text-sky-300">· {targetLabel}</span>
          )}
        </div>

        <div className="space-y-3 p-4 text-sm">
          <p className="text-neutral-400">
            Wie soll die Größenskala des Bildes festgelegt werden?
          </p>

          <button
            onClick={chooseMeasure}
            className="block w-full rounded border border-sky-700 bg-sky-900/30 px-3 py-3 text-left transition hover:bg-sky-800/50"
          >
            <div className="font-medium text-sky-200">
              Strecke ausmessen (z.B. Kalibrierkugel)
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              Bekannte Referenz im Bild mit einer Strecke nachzeichnen, dann
              die echte Länge in mm eingeben.
            </div>
          </button>

          <button
            onClick={chooseMagnification}
            disabled={!hasPixelSpacing}
            className={[
              'block w-full rounded border px-3 py-3 text-left transition',
              hasPixelSpacing
                ? 'border-emerald-700 bg-emerald-900/30 hover:bg-emerald-800/50'
                : 'cursor-not-allowed border-neutral-800 bg-neutral-950 opacity-60',
            ].join(' ')}
          >
            <div
              className={
                hasPixelSpacing
                  ? 'font-medium text-emerald-200'
                  : 'font-medium text-neutral-400'
              }
            >
              Nur Vergrößerungsfaktor eingeben
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              {hasPixelSpacing
                ? 'Skala kommt aus dem DICOM-PixelSpacing; nur der Mag-Faktor (z.B. 1.15) wird angegeben.'
                : 'Bild enthält keine PixelSpacing-Information — diese Methode ist nicht möglich.'}
            </div>
          </button>

          {/* Mehr-Bild-Ladung: fixiertes Bild wieder zur Auswahl öffnen —
              mit Warnhinweis, weil bild-gebundene Planung verfällt. */}
          {canReopen && !confirmReopen && (
            <button
              onClick={() => setConfirmReopen(true)}
              className="block w-full rounded border border-neutral-700 bg-neutral-950/60 px-3 py-3 text-left transition hover:bg-neutral-800/60"
            >
              <div className="font-medium text-neutral-200">
                Anderes Bild aus der Serie wählen …
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                Die Datei enthielt {sel?.count} Bilder — Auswahl-Pfeile
                wieder einblenden.
              </div>
            </button>
          )}
          {canReopen && confirmReopen && (
            <div className="rounded border border-red-800 bg-red-950/40 px-3 py-3">
              <div className="text-sm font-medium text-red-200">
                Bild wirklich wechseln?
              </div>
              <p className="mt-1 text-xs leading-snug text-red-300/90">
                Beim Wechsel auf ein anderes Bild gehen die aktuellen
                Messungen und Schablonen verloren, und das neue Bild muss
                neu kalibriert werden.
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmReopen(false)}
                  className="rounded px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-neutral-800"
                >
                  Abbrechen
                </button>
                <button
                  onClick={confirmReopenSelection}
                  className="rounded bg-red-700 px-2.5 py-1 text-xs font-medium text-red-50 transition hover:bg-red-600"
                >
                  Ja, Bild-Auswahl öffnen
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-700 px-4 py-3">
          <button
            onClick={closeDialog}
            className="rounded px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-neutral-800"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}

/** Vorbelegter Vergrößerungsfaktor für Hüft-AP-Aufnahmen — typischer
 *  Richtwert aus der Literatur (~1,10–1,15 je nach Aufnahmegeometrie);
 *  im Dialog editierbar und an die eigene Geometrie anzupassen. */
const DEFAULT_MAG = '1.12'

/**
 * Mag-Only-Dialog. Nutzer trägt den Vergrößerungsfaktor ein, ohne eine
 * Strecke zu zeichnen. Setzt die Kalibrierung auf Basis des DICOM-
 * PixelSpacings.
 */
export function MagnificationOnlyDialog() {
  const open = useViewerStore((s) => s.magnificationOnlyOpen)
  const setOpen = useViewerStore((s) => s.setMagnificationOnlyOpen)
  const setStatus = useViewerStore((s) => s.setStatus)
  const [mag, setMag] = useState(DEFAULT_MAG)

  if (!open) return null

  const value = Number(mag.replace(',', '.'))
  const valid = value > 0

  function confirm() {
    if (!valid) return
    const ok = applyMagnificationOnlyCalibration(value)
    if (ok) {
      setOpen(false)
    } else {
      setStatus('Mag-only nicht möglich: Bild hat keine PixelSpacing-Information.')
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
        <div className="border-b border-neutral-700 px-4 py-3 text-sm font-semibold">
          Vergrößerungsfaktor eingeben
        </div>

        <div className="space-y-4 p-4 text-sm">
          <p className="text-neutral-400">
            Setzt die Kalibrierung auf Basis des DICOM-PixelSpacings,
            angepasst um den Röntgen-Vergrößerungsfaktor. Vorbelegung{' '}
            {DEFAULT_MAG} (typischer Richtwert — an die eigene
            Aufnahmegeometrie anpassen).
          </p>

          <div>
            <label className="mb-1 block text-xs text-neutral-500">
              Vergrößerungsfaktor
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0.5"
                max="2.0"
                step="0.01"
                value={mag}
                autoFocus
                onChange={(e) => setMag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirm()}
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 outline-none focus:border-sky-600"
              />
              <span className="text-neutral-400">×</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-700 px-4 py-3">
          <button
            onClick={() => setOpen(false)}
            className="rounded px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-neutral-800"
          >
            Abbrechen
          </button>
          <button
            onClick={confirm}
            disabled={!valid}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  )
}
