import { useState } from 'react'
import { useViewerStore } from '../state/viewerStore'
import { applyCalibration, cancelCalibration } from '../lib/cornerstone/viewer'

const PRESETS = [
  { label: 'Kalibrierkugel 25 mm', mm: 25 },
  { label: 'Kalibrierkugel 30 mm', mm: 30 },
]

export function CalibrationDialog() {
  const pending = useViewerStore((s) => s.pendingCalibration)
  const [mm, setMm] = useState('25')

  if (!pending) return null

  const value = Number(mm.replace(',', '.'))
  const valid = value > 0

  function confirm() {
    // KEIN Vergrößerungsfaktor: Beim Ausmessen einer realen Strecke (z. B.
    // Kalibrierkugel auf Hüfthöhe) ist die Röntgenvergrößerung bereits
    // kompensiert — die Kugel wird genauso vergrößert wie die Hüfte. Ein
    // zusätzlicher Faktor würde die Skala doppelt korrigieren und alle
    // Messungen verfälschen. Mag = 1,0 (Default) → mmPerWorldUnit ergibt
    // sich direkt aus der gemessenen Strecke. Der Vergrößerungsfaktor
    // gehört ausschließlich zur „Nur-Vergrößerung"-Methode (ohne Kugel).
    if (valid) applyCalibration(value)
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
        <div className="border-b border-neutral-700 px-4 py-3 text-sm font-semibold">
          Kalibrierung festlegen
        </div>

        <div className="space-y-4 p-4 text-sm">
          <p className="text-neutral-400">
            Gib die bekannte reale Länge der gezeichneten Strecke ein. Alle
            Messungen werden anschließend in echten Millimetern angezeigt.
          </p>

          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.mm}
                onClick={() => setMm(String(p.mm))}
                className={[
                  'flex-1 rounded border px-2 py-1.5 text-xs transition',
                  Number(mm) === p.mm
                    ? 'border-sky-600 bg-sky-700/40 text-sky-200'
                    : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-500">
              Bekannte Länge der Strecke
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.1"
                value={mm}
                autoFocus
                onChange={(e) => setMm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirm()}
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 outline-none focus:border-sky-600"
              />
              <span className="text-neutral-400">mm</span>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-neutral-500">
              Die Röntgenvergrößerung ist über die ausgemessene Strecke
              bereits berücksichtigt — kein zusätzlicher Faktor nötig.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-700 px-4 py-3">
          <button
            onClick={cancelCalibration}
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
