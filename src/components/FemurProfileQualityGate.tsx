import { useState } from 'react'
import {
  FEMUR_PROFILE_QUALITAETS_KRITERIEN,
  type FemurProfileImageQuality,
  femurProfileAusschlussgruende,
  isFemurProfileClassifiable,
  leereBildqualitaet,
} from '../lib/hip/femurProfile'

/**
 * Checkliste vor dem Femurprofil: Ist DIESE Aufnahme für eine
 * quantitative Klassifikation überhaupt geeignet?
 *
 * Bewusst als schlanke Variante des `ConfirmDialog`-Musters gebaut, nicht
 * als zweites Dialogsystem — gleiche Overlay-Mechanik (Klick daneben =
 * Abbruch), nur ohne den roten Destruktiv-Anstrich.
 *
 * Zwei Festlegungen, die man dem Dialog ansehen soll:
 *
 * 1. Er BLOCKIERT NICHT. Wer eine ungeeignete Aufnahme vermessen will,
 *    darf das zu Dokumentationszwecken — unterdrückt wird nur die
 *    abgeleitete Dorr-/CPAH-Klasse. Deshalb heißt der Knopf dann auch
 *    ehrlich „Ohne Klassifikation messen" statt „Trotzdem".
 * 2. Er misst nichts. Rotation und Projektion sind ärztliche
 *    Beurteilungen; eine automatische Erkennung würde das MVP nur
 *    vortäuschen. Einzig die Kalibrierung kommt aus dem Viewer — und
 *    steht trotzdem sichtbar in der Liste, statt still vorausgesetzt zu
 *    werden.
 */
export function FemurProfileQualityGate({
  open,
  calibrated,
  onStart,
  onCancel,
}: {
  open: boolean
  /** Aus dem Viewer vorbefüllt — der Nutzer kann es nicht „wegklicken". */
  calibrated: boolean
  onStart(quality: FemurProfileImageQuality): void
  onCancel(): void
}) {
  const [antworten, setAntworten] = useState<FemurProfileImageQuality>(() =>
    leereBildqualitaet(calibrated),
  )

  if (!open) return null

  // Die Kalibrierung gewinnt immer aus dem Viewer, egal was im lokalen
  // Zustand steht (der Dialog kann zwischen zwei Öffnungen überleben).
  const stand: FemurProfileImageQuality = { ...antworten, calibrated }
  const gruende = femurProfileAusschlussgruende(stand)
  const bestanden = isFemurProfileClassifiable(stand)

  const umschalten = (feld: keyof FemurProfileImageQuality) =>
    setAntworten((a) => ({ ...a, [feld]: !a[feld] }))

  const starten = () => {
    onStart({
      ...stand,
      exclusionReasons: gruende,
      confirmedAt: new Date().toISOString(),
    })
    // Für den nächsten Aufruf zurücksetzen: eine Bestätigung gilt für
    // genau die Aufnahme, für die sie abgegeben wurde.
    setAntworten(leereBildqualitaet(calibrated))
  }

  const abbrechen = () => {
    setAntworten(leereBildqualitaet(calibrated))
    onCancel()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={abbrechen}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[32rem] max-w-[92vw] rounded-lg border border-neutral-700 bg-neutral-950 p-4 shadow-xl"
      >
        <div className="mb-1 text-sm font-semibold text-violet-200">
          Bildqualität für das Femurprofil
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-neutral-400">
          Dorr und CPAH werden nur aus einer dafür geeigneten Aufnahme
          abgeleitet. Die Punkte sind ärztlich zu beurteilen — das Programm
          erkennt sie nicht selbst.
        </p>

        <div className="mb-3 flex flex-col gap-1">
          {FEMUR_PROFILE_QUALITAETS_KRITERIEN.map((k) => {
            const wert = stand[k.feld] === true
            // „Erfüllt" heißt bei der Deformitäts-Zeile: NICHT angehakt.
            const erfuellt = k.invertiert ? !wert : wert
            const ausViewer = k.feld === 'calibrated'
            return (
              <label
                key={k.feld}
                className={[
                  'flex items-start gap-2 rounded px-2 py-1.5 text-xs',
                  ausViewer
                    ? 'cursor-default bg-neutral-900/60'
                    : 'cursor-pointer hover:bg-neutral-900',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={wert}
                  disabled={ausViewer}
                  onChange={() => !ausViewer && umschalten(k.feld)}
                  className="mt-0.5 accent-violet-600"
                />
                <span className={erfuellt ? 'text-neutral-200' : 'text-neutral-400'}>
                  {k.frage}
                  {k.invertiert && (
                    <span className="ml-1 text-[10px] text-amber-500">
                      (anhaken = Ausschlussgrund)
                    </span>
                  )}
                  {ausViewer && (
                    <span className="ml-1 text-[10px] text-neutral-500">
                      {calibrated ? '— aus dem Viewer bestätigt' : '— fehlt noch'}
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </div>

        {!bestanden && (
          <div className="mb-3 rounded border border-amber-900/60 bg-amber-950/30 p-2 text-[11px] leading-relaxed text-amber-200">
            <div className="font-semibold">
              Keine Dorr-/CPAH-Klasse aus dieser Aufnahme.
            </div>
            <ul className="mt-1 list-inside list-disc text-amber-200/80">
              {gruende.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            <div className="mt-1 text-amber-200/70">
              Messen und Dokumentieren bleibt möglich — die Rohwerte
              erscheinen, die Klassifikation wird unterdrückt.
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={abbrechen}
            className="rounded px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-800"
          >
            Abbrechen
          </button>
          <button
            onClick={starten}
            className={[
              'rounded px-3 py-1.5 text-xs font-semibold text-white transition',
              bestanden
                ? 'bg-violet-700 hover:bg-violet-600'
                : 'bg-neutral-700 hover:bg-neutral-600',
            ].join(' ')}
          >
            {bestanden ? 'Messung starten' : 'Ohne Klassifikation messen'}
          </button>
        </div>
      </div>
    </div>
  )
}
