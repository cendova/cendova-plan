import { useEffect } from 'react'
import {
  usePlanningStore,
  computeBmi,
  INSURANCES,
  REHA_KINDS,
  type Insurance,
  type RehaKind,
} from '../state/planningStore'
import {
  useOrgProfileStore,
  cleanHospitals,
  getOrgProfile,
} from '../state/orgProfileStore'
import { useViewerStore } from '../state/viewerStore'

/**
 * Eingabedialog für organisatorische/klinische Planungsdaten (OP-Termin,
 * Krankenhaus, Versicherung, Größe/Gewicht/BMI, Reha, Allergien,
 * Antikoagulation, Planer). Alle Felder sind LIVE an den Store gebunden —
 * es gibt keinen separaten Entwurf; „Fertig" schließt nur. Dadurch gilt der
 * State schon nach der ersten Eingabe als „befüllt" und der Vor-Export-
 * Hinweis erscheint nicht erneut.
 */
export function PlanningDataDialog() {
  const s = usePlanningStore()
  // Klinische BLD (Arztbrief) — lebt im viewerStore, wird hier im Hüft-
  // Modul miterfasst (früher Patientenleiste, Debug-Runde 2).
  const clinicalBld = useViewerStore((v) => v.clinicalBld)
  const setClinicalBld = useViewerStore((v) => v.setClinicalBld)
  const planningMode = useViewerStore((v) => v.planningMode)
  // Standort-Liste aus dem Einrichtungs-Profil (leer = neutral; über den
  // Einstellungsdialog personalisierbar).
  const hospitalOptions = cleanHospitals(
    useOrgProfileStore((v) => v.hospitals),
  )
  const openOrgProfile = useOrgProfileStore((v) => v.setDialogOpen)

  // Beim Öffnen Größe/Gewicht aus dem DICOM vorbelegen, falls noch leer.
  useEffect(() => {
    if (!s.dialogOpen) return
    const patient = useViewerStore.getState().patientInfo
    const st = usePlanningStore.getState()
    const patch: Record<string, string> = {}
    if (!st.heightCm && patient?.heightCm != null)
      patch.heightCm = String(patient.heightCm)
    if (!st.weightKg && patient?.weightKg != null)
      patch.weightKg = String(patient.weightKg)
    // Planer aus dem Einrichtungs-Profil vorbelegen, solange noch leer —
    // greift auch, wenn das Profil erst in derselben Sitzung gesetzt wurde
    // (der Store-Init liest den Default nur beim Laden).
    if (!st.planner.trim()) {
      const dp = getOrgProfile().defaultPlanner.trim()
      if (dp) patch.planner = dp
    }
    if (Object.keys(patch).length) st.setMany(patch)
  }, [s.dialogOpen])

  if (!s.dialogOpen) return null

  const bmi = computeBmi(s.heightCm, s.weightKg)
  const showRehaDate = s.reha === 'AHB ambulant' || s.reha === 'AHB stationär'

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
            Planungsdaten
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
          {/* OP-Termin + „noch unklar" */}
          <Field label="OP-Termin">
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={s.surgeryDate}
                disabled={s.surgeryDateUnknown}
                onChange={(e) =>
                  s.setMany({
                    surgeryDate: e.target.value,
                    surgeryDateUnknown: e.target.value
                      ? false
                      : s.surgeryDateUnknown,
                  })
                }
                className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 [color-scheme:dark] disabled:opacity-40 focus:border-sky-600 focus:outline-none"
              />
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={s.surgeryDateUnknown}
                  onChange={(e) =>
                    s.setMany({
                      surgeryDateUnknown: e.target.checked,
                      surgeryDate: e.target.checked ? '' : s.surgeryDate,
                    })
                  }
                  className="accent-sky-600"
                />
                noch unklar
              </label>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Krankenhaus">
              <Select
                value={s.hospital}
                onChange={(v) => s.setField('hospital', v)}
              >
                <option value="">– bitte wählen –</option>
                {hospitalOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
                {/* Generische, immer verfügbare Option. */}
                <option value="unklar">noch unklar</option>
              </Select>
              {hospitalOptions.length === 0 && (
                <button
                  type="button"
                  onClick={() => openOrgProfile(true)}
                  className="mt-1 text-[11px] text-neutral-500 underline decoration-dotted transition hover:text-sky-300"
                >
                  Standorte hinterlegen (Einrichtung ⚙)
                </button>
              )}
            </Field>
            <Field label="Versicherung">
              <Select
                value={s.insurance}
                onChange={(v) => s.setField('insurance', v as Insurance)}
              >
                <option value="">– bitte wählen –</option>
                {INSURANCES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Größe (cm)">
              <input
                type="number"
                inputMode="numeric"
                value={s.heightCm}
                onChange={(e) => s.setField('heightCm', e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none"
              />
            </Field>
            <Field label="Gewicht (kg)">
              <input
                type="number"
                inputMode="numeric"
                value={s.weightKg}
                onChange={(e) => s.setField('weightKg', e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none"
              />
            </Field>
            <Field label="BMI">
              <div className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm tabular-nums text-neutral-300">
                {bmi != null ? bmi.toFixed(1) : '–'}
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Reha">
              <Select
                value={s.reha}
                onChange={(v) => s.setField('reha', v as RehaKind)}
              >
                <option value="">– keine –</option>
                {REHA_KINDS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            {showRehaDate && (
              <Field label="… ab dem">
                <input
                  type="date"
                  value={s.rehaDate}
                  onChange={(e) => s.setField('rehaDate', e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 [color-scheme:dark] focus:border-sky-600 focus:outline-none"
                />
              </Field>
            )}
          </div>

          <Field label="Allergien">
            <input
              type="text"
              value={s.allergies}
              onChange={(e) => s.setField('allergies', e.target.value)}
              placeholder="z. B. Penicillin, Pflaster …"
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-600 focus:outline-none"
            />
          </Field>

          <Field label="Antikoagulation">
            <input
              type="text"
              value={s.anticoagulation}
              onChange={(e) => s.setField('anticoagulation', e.target.value)}
              placeholder="z. B. ASS 100, DOAK …"
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-600 focus:outline-none"
            />
          </Field>

          <Field label="Sonstiges">
            <input
              type="text"
              value={s.other}
              onChange={(e) => s.setField('other', e.target.value)}
              placeholder="z. B. Hüftkopf erhalten, Wunsch-Implantat …"
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-600 focus:outline-none"
            />
          </Field>

          {planningMode === 'hip' && (
            <Field label="Klinische Beinlängendifferenz (BLD)">
              <input
                type="text"
                value={clinicalBld}
                onChange={(e) => setClinicalBld(e.target.value)}
                placeholder="± 0,x cm Rechts/Links"
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-600 focus:outline-none"
              />
            </Field>
          )}

          <Field label="Planung durchgeführt von">
            <input
              type="text"
              value={s.planner}
              onChange={(e) => s.setField('planner', e.target.value)}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none"
            />
          </Field>
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

/**
 * Vor-Export-Hinweis: erscheint, wenn beim PDF-Export noch GAR KEINE
 * Planungsdaten erfasst sind. Zwei Wege: Daten eingeben (öffnet den Dialog)
 * oder trotzdem exportieren.
 */
export function PlanningExportWarning() {
  const open = usePlanningStore((st) => st.warnOpen)
  const setWarnOpen = usePlanningStore((st) => st.setWarnOpen)
  const setDialogOpen = usePlanningStore((st) => st.setDialogOpen)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg border border-amber-700 bg-neutral-900 p-5 shadow-xl">
        <h2 className="mb-2 text-sm font-semibold text-amber-300">
          Noch keine Planungsdaten erfasst
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-neutral-300">
          Es sind noch keine Angaben zu OP-Termin, Krankenhaus, Versicherung
          oder Reha hinterlegt. Möchtest du sie vor dem Export eingeben?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setWarnOpen(false)
              void import('../lib/plan/pdfExport').then((m) => m.triggerPdfExport())
            }}
            className="rounded px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-neutral-800"
          >
            Trotzdem exportieren
          </button>
          <button
            onClick={() => {
              setWarnOpen(false)
              setDialogOpen(true)
            }}
            className="rounded bg-sky-700 px-4 py-1.5 text-sm font-medium text-sky-50 transition hover:bg-sky-600"
          >
            Daten eingeben
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

function Select({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none"
    >
      {children}
    </select>
  )
}
