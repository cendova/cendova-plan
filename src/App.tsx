import { useEffect } from 'react'
import { Toolbar } from './components/Toolbar'
import { Viewport } from './components/Viewport'
import { CalibrationDialog } from './components/CalibrationDialog'
import {
  CalibrationChoiceDialog,
  MagnificationOnlyDialog,
} from './components/CalibrationChoiceDialog'
import { MeasurementPanel } from './components/MeasurementPanel'
import { TemplatesPanel } from './components/TemplatesPanel'
import { HeaderTools } from './components/HeaderTools'
import { ResetPlanningButton } from './components/ResetPlanningButton'
import { TemplateTracer } from './components/TemplateTracer'
import {
  PlanningDataDialog,
  PlanningExportWarning,
} from './components/PlanningDataDialog'
import { OrgProfileDialog } from './components/OrgProfileDialog'
import { useOrgProfileStore } from './state/orgProfileStore'
import { useViewerStore } from './state/viewerStore'
import { useHistoryStore } from './state/historyStore'
import { useKneePanesStore } from './state/kneePanesStore'
import { captureDiagnostics } from './lib/diagnostics'

function App() {
  const status = useViewerStore((s) => s.status)
  const setStatus = useViewerStore((s) => s.setStatus)
  const imageMeta = useViewerStore((s) => s.imageMeta)
  const calibration = useViewerStore((s) => s.calibration)
  // Patientenname dezent in der Fußzeile (die Patientenleiste über dem
  // Bild entfiel mit Debug-Runde 2 — das PDF trägt die Daten im Kopf).
  const patientInfo = useViewerStore((s) => s.patientInfo)
  const patientLine = patientInfo
    ? [
        [patientInfo.lastName, patientInfo.firstName]
          .filter(Boolean)
          .join(', '),
        patientInfo.birthDate
          ? `* ${patientInfo.birthDate}` +
            (patientInfo.ageYears != null
              ? ` (${patientInfo.ageYears} J.)`
              : '')
          : '',
      ]
        .filter(Boolean)
        .join('  ·  ')
    : ''
  // Rechte Spalte (Bildinfos) + Fußzeilen-Kalibrierung folgen dem AKTIVEN Pane:
  // bei aktivem rechten Knie-Pane die seitliche Aufnahme, sonst das Haupt-Pane.
  const planningMode = useViewerStore((s) => s.planningMode)
  const splitView = useKneePanesStore((s) => s.splitView)
  const activePane = useKneePanesStore((s) => s.activePane)
  const rightImageMeta = useKneePanesStore((s) => s.rightImageMeta)
  const rightCalibration = useKneePanesStore((s) => s.rightCalibration)
  const rightActive =
    planningMode === 'knee' && splitView && activePane === 'right'
  const activeImageMeta = rightActive ? rightImageMeta : imageMeta
  const activeCalibration = rightActive ? rightCalibration : calibration
  const paneSuffix =
    planningMode === 'knee' && splitView ? (rightActive ? ' · seitlich' : ' · AP') : ''
  const canUndo = useHistoryStore((s) => s.past.length > 1)
  const canRedo = useHistoryStore((s) => s.future.length > 0)
  // Kopfzeilen-Untertitel aus dem Einrichtungs-Profil (leer = neutral).
  const headerSubtitle = useOrgProfileStore((s) => s.headerSubtitle)
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)

  // Tastatur-Kürzel — Strg+Z = Undo, Strg+Shift+Z oder Strg+Y = Redo.
  // Wir ignorieren das Event, wenn der Fokus in einem Textfeld liegt,
  // damit die nativen Edit-Shortcuts dort weiter funktionieren.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName.toLowerCase() ?? ''
      const editable = target?.isContentEditable
      if (tag === 'input' || tag === 'textarea' || editable) return

      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useHistoryStore.getState().undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        useHistoryStore.getState().redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative flex h-full flex-col bg-neutral-900 text-neutral-200">
      <header className="flex items-center gap-3 border-b border-neutral-700 bg-neutral-950 px-4 py-2">
        {/* Marken-Icon aus dem Cendova-Design-System (public/brand);
            BASE_URL, damit es auch unter einem Unterpfad (GitHub Pages) lädt. */}
        <img
          src={`${import.meta.env.BASE_URL}brand/cendova-plan.svg`}
          alt=""
          className="h-7 w-7 select-none"
          draggable={false}
        />
        <h1 className="text-sm font-semibold tracking-wide">
          CendovaPlan
          {headerSubtitle && (
            <span className="ml-2 font-normal text-neutral-500">
              {headerSubtitle}
            </span>
          )}
        </h1>
        <div className="ml-4 flex items-center gap-1">
          <HistoryButton
            onClick={undo}
            disabled={!canUndo}
            title="Rückgängig (Strg+Z)"
            label="Zurück"
            icon={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8l3-3v2h5a3 3 0 010 6H7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <HistoryButton
            onClick={redo}
            disabled={!canRedo}
            title="Vorwärts (Strg+Shift+Z / Strg+Y)"
            label="Vor"
            icon={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M13 8l-3-3v2H5a3 3 0 000 6h4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          {/* „Planung zurücksetzen" gehört logisch zu Rückgängig/Vorwärts
              (UX-Wunsch Debug-Runde 2) — mit rotem Warn-Dialog. */}
          <ResetPlanningButton />
        </div>

        <div className="mx-2 h-5 w-px bg-neutral-800" />
        <HeaderTools />

        <span className="ml-auto rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300">
          Lern-/Eigenprojekt — nicht für klinische Nutzung
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <Viewport />
        <aside className="flex w-64 flex-col border-l border-neutral-700 bg-neutral-900">
          <div className="border-b border-neutral-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Bildinformationen{paneSuffix}
          </div>
          <div className="space-y-2 p-3 text-xs">
            {activeImageMeta ? (
              <>
                <InfoRow
                  label="Größe"
                  value={`${activeImageMeta.columns} × ${activeImageMeta.rows} px`}
                />
                <InfoRow
                  label="Pixelabstand"
                  value={
                    activeImageMeta.pixelSpacing
                      ? `${activeImageMeta.pixelSpacing.toFixed(4)} mm/px`
                      : 'nicht im DICOM hinterlegt'
                  }
                />
              </>
            ) : (
              <p className="text-neutral-500">Noch kein Bild geladen.</p>
            )}
          </div>

          <MeasurementPanel />
          <TemplatesPanel />
        </aside>
      </div>

      <footer className="flex items-center gap-4 border-t border-neutral-700 bg-neutral-950 px-4 py-1 text-xs text-neutral-500">
        <span>{status}</span>
        {patientLine && (
          <span
            className="max-w-[30%] truncate text-neutral-400"
            title={patientLine}
          >
            {patientLine}
          </span>
        )}
        <button
          onClick={async () => {
            await captureDiagnostics(new Date().toISOString())
            setStatus(
              'Diagnose gespeichert: Datei im Download-Ordner (CendovaPlan-Diagnose-*.txt) + in der Zwischenablage. Bitte schicken.',
            )
          }}
          title="Programmzustand (Geometrie/Flags, KEINE Patientendaten) als Datei speichern + in die Zwischenablage"
          className="ml-auto rounded px-2 py-0.5 text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-300"
        >
          Diagnose
        </button>
        <span>
          {activeCalibration == null ? (
            `Kalibrierung${paneSuffix}: nicht gesetzt`
          ) : activeCalibration.referenceMm > 0 ? (
            <span className="text-emerald-400">
              Kalibriert ✓ (Referenz {activeCalibration.referenceMm} mm){paneSuffix}
            </span>
          ) : (
            <span className="text-neutral-400">
              Maßstab aus DICOM (nicht manuell kalibriert){paneSuffix}
            </span>
          )}
        </span>
      </footer>

      <CalibrationChoiceDialog />
      <MagnificationOnlyDialog />
      <CalibrationDialog />
      <PlanningDataDialog />
      <PlanningExportWarning />
      <OrgProfileDialog />
      <TemplateTracer />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right text-neutral-300">{value}</span>
    </div>
  )
}

function HistoryButton({
  onClick,
  disabled,
  title,
  label,
  icon,
}: {
  onClick: () => void
  disabled: boolean
  title: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'flex items-center gap-1 rounded px-2 py-1 text-xs transition',
        disabled
          ? 'cursor-not-allowed text-neutral-700'
          : 'text-neutral-300 hover:bg-neutral-800 hover:text-sky-300',
      ].join(' ')}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export default App
