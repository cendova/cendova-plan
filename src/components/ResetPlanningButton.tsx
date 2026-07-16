import { useState } from 'react'
import { resetPlanning } from '../lib/cornerstone/viewer'
import { useViewerStore } from '../state/viewerStore'
import { IconReset, ToolIconButton } from './ToolIcon'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * „Planung zurücksetzen" — sitzt neben Vor/Zurück in der Kopfzeile
 * (Nutzer-Wunsch Debug-Runde 2), mit rotem Warn-Dialog inkl. Hinweis,
 * vorher zu speichern. Bild + Kalibrierung bleiben erhalten.
 */
export function ResetPlanningButton() {
  const hasImage = useViewerStore((s) => s.hasImage)
  const setStatus = useViewerStore((s) => s.setStatus)
  const [open, setOpen] = useState(false)
  return (
    <>
      <ToolIconButton
        icon={<IconReset />}
        title="Planung zurücksetzen … (Bild + Kalibrierung bleiben)"
        disabled={!hasImage}
        onClick={() => setOpen(true)}
      />
      <ConfirmDialog
        open={open}
        title="Planung zurücksetzen?"
        confirmLabel="Alles löschen"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          resetPlanning()
          setOpen(false)
          setStatus('Planung zurückgesetzt — Bild und Kalibrierung bleiben.')
        }}
      >
        Alle Messungen (beide Bilder), Schablonen, Notizen,
        Osteophyten-Markierungen und Planungsdaten werden gelöscht —{' '}
        <span className="font-semibold text-neutral-100">
          auch Rückgängig hilft danach nicht mehr.
        </span>{' '}
        Bild und Kalibrierung bleiben erhalten.{' '}
        <span className="font-semibold text-neutral-100">
          Tipp: Vorher den Plan speichern (Disketten-Symbol).
        </span>
      </ConfirmDialog>
    </>
  )
}
