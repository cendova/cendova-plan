import { useRef, useState } from 'react'
import {
  useOrgProfileStore,
  getOrgProfile,
  cleanHospitals,
} from '../state/orgProfileStore'

/**
 * Einstellungsdialog „Einrichtung personalisieren" — hinterlegt die
 * installations­spezifische Identität (Kopfzeilen-Untertitel, Standort-Liste,
 * vorbelegter Planer). Alle Felder sind LIVE an den Store gebunden (wie im
 * Planungsdialog); der Store persistiert nach localStorage.
 *
 * Die Angaben bleiben rein lokal auf diesem Rechner und sind nicht Teil des
 * (neutralen) öffentlichen Programms. Über Export/Import lässt sich ein
 * einmal erfasstes Profil auf weitere Rechner übernehmen.
 */
export function OrgProfileDialog() {
  const s = useOrgProfileStore()
  const importRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState<string | null>(null)

  if (!s.dialogOpen) return null

  function handleExport() {
    const p = getOrgProfile()
    const clean = { ...p, hospitals: cleanHospitals(p.hospitals) }
    const blob = new Blob([JSON.stringify(clean, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cendova-profil.json'
    a.click()
    URL.revokeObjectURL(url)
    setNote('Profil als „cendova-profil.json" gespeichert.')
  }

  async function handleImport(file: File | undefined) {
    if (!file) return
    try {
      const raw: unknown = JSON.parse(await file.text())
      s.importProfile(raw)
      setNote('Profil importiert.')
    } catch {
      setNote('Import fehlgeschlagen: keine gültige Profil-JSON.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => s.setDialogOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">
            Einrichtung personalisieren
          </h2>
          <button
            onClick={() => s.setDialogOpen(false)}
            className="rounded p-1 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
            aria-label="Schließen"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-4">
          <p className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] leading-relaxed text-neutral-400">
            Diese Angaben bleiben lokal auf diesem Rechner gespeichert und sind
            nicht Teil des öffentlichen Programms. Über Export/Import lässt sich
            das Profil auf weitere Rechner übertragen. Leere Felder bedeuten
            „neutral" (nur „CendovaPlan" ohne Zusatz).
          </p>

          <Field label="Kopfzeile — Untertitel">
            <input
              type="text"
              value={s.headerSubtitle}
              onChange={(e) => s.setProfile({ headerSubtitle: e.target.value })}
              placeholder="z. B. Zentrum für Endoprothetik"
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-600 focus:outline-none"
            />
          </Field>

          <Field label="Standorte / Krankenhäuser (eine pro Zeile)">
            <textarea
              rows={4}
              value={s.hospitals.join('\n')}
              onChange={(e) =>
                s.setProfile({ hospitals: e.target.value.split('\n') })
              }
              placeholder={'z. B.\nKlinikum Musterstadt\nOrthopädische Praxis'}
              className="w-full resize-y rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-600 focus:outline-none"
            />
          </Field>

          <Field label="Planer — Vorbelegung">
            <input
              type="text"
              value={s.defaultPlanner}
              onChange={(e) => s.setProfile({ defaultPlanner: e.target.value })}
              placeholder="z. B. Dr. med. …"
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-600 focus:outline-none"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={handleExport}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-sky-300"
            >
              Profil exportieren (JSON)
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-sky-300"
            >
              Profil importieren …
            </button>
            <button
              onClick={() => {
                s.resetProfile()
                setNote('Auf neutralen Stand zurückgesetzt.')
              }}
              className="rounded border border-neutral-800 px-3 py-1.5 text-xs text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-300"
            >
              Zurücksetzen (neutral)
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                void handleImport(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          {note && <p className="text-xs text-emerald-400">{note}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-700 px-4 py-3">
          <button
            onClick={() => s.setDialogOpen(false)}
            className="rounded bg-sky-700 px-4 py-1.5 text-sm font-medium text-sky-50 transition hover:bg-sky-600"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  )
}
