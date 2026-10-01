import { useState } from 'react'
import type { Types } from '@cornerstonejs/core'
import {
  type DorrType,
  type FemurProfileImageQuality,
  type FemurProfileRaw,
  FEMUR_PROFILE_QUALITAETS_KRITERIEN,
  computeFemurProfileRaw,
  isFemurProfileClassifiable,
} from '../lib/hip/femurProfile'
import {
  FEMUR_PROFILE_OVERRIDE_REASONS,
  type FemurProfileOverrideReason,
  type FemurProfileReview,
  useHipStore,
} from '../state/hipStore'
import { CpahMatrix } from './CpahMatrix'
import { Abschnitt, Hinweis, Karte, Kennwerte, type KennwertZeile } from './Ergebnis'
import { grad, mm, verhaeltnis } from '../lib/zahlFormat'

/**
 * Ergebnis-Karte „Morphologie & Fixation" zu einer Femurprofil-Messung.
 *
 * Die Karte zeigt Rohwerte UND Klasse. Die Eignung der Aufnahme
 * (AP-Standard, Rotation, Trochanter minor, Kortikalis, 10 cm, Deformität)
 * ist ärztliche Vorarbeit VOR der Planung — seit 16.09.2026 fragt das
 * Programm sie nicht mehr ab, die Kriterien stehen unten als aufklappbare
 * Erklärung. Nur eine in älteren Plänen gespeicherte Checkliste mit
 * offenen Kriterien unterdrückt die Klasse weiterhin.
 *
 * Der Ton ist bewusst zurückhaltend. Formulierungen wie „Implantat X
 * verwenden", „zementfrei kontraindiziert" oder „Osteoporose
 * diagnostiziert" sind ausgeschlossen: Das Programm ist nicht
 * CE-zertifiziert und trifft keine Therapieentscheidung. Es liefert
 * nachvollziehbare Zahlen und einen Hinweis, was zu PRÜFEN ist.
 */
export function FemurProfileCard({
  id,
  points,
  mmPerWorldUnit,
  review,
}: {
  /** Mess-ID — die Bestätigung wird an genau dieser Messung gespeichert. */
  id: string
  points: Types.Point3[]
  mmPerWorldUnit: number
  /** Ärztliche Beurteilung; eine darin gespeicherte Checkliste (ältere
   *  Pläne) kann die Klasse unterdrücken. */
  review?: FemurProfileReview
}) {
  const raw = computeFemurProfileRaw(points, mmPerWorldUnit)

  const quality = review?.imageQuality
  const darfKlassifizieren = isFemurProfileClassifiable(quality)
  const dorr = darfKlassifizieren ? raw?.dorr ?? null : null
  const cpah = darfKlassifizieren ? raw?.cpah ?? null : null

  // Die ärztliche Entscheidung — sie ersetzt die Anzeige des Vorschlags,
  // löscht ihn aber nicht: beides bleibt getrennt gespeichert.
  const final = review?.dorrFinal ?? null
  const bestaetigt = final != null
  const abweichend = bestaetigt && review?.dorrSuggested != null && final !== review.dorrSuggested
  // Veraltet: nach der Bestätigung wurde ein Punkt verschoben und der
  // Vorschlag hat sich geändert. Ohne diesen Abgleich stünde „Dorr
  // bestätigt B" über einer Rechnung, die inzwischen C ergibt.
  const veraltet =
    bestaetigt &&
    review?.dorrSuggested != null &&
    dorr != null &&
    dorr.suggested !== review.dorrSuggested

  if (!raw) return null

  const v2 = (v: number | null) => (v == null ? null : verhaeltnis(v))
  // Die Klasse steht als eigene Zeile über den Rohwerten (eigene Tabelle,
  // damit ihr Zusatz nicht mit der Wertspalte der Rohwerte um Platz
  // ringt). Was der CPAH-Code bedeutet (coxa, Offset-Typ), zeigt das
  // Schaubild — eine Klartextzeile wiederholte den Code aus dem Kopf nur.
  const dorrZeile: KennwertZeile | null = dorr
    ? {
        label: bestaetigt ? (abweichend ? 'Dorr (ärztlich)' : 'Dorr bestätigt') : 'Dorr-Vorschlag',
        werte: [bestaetigt ? final : dorr.suggested],
        betont: true,
        norm: abweichend ? (
          `Vorschlag war ${review?.dorrSuggested}`
        ) : !bestaetigt && dorr.borderline ? (
          <span className="text-amber-400">Grenzbereich {dorr.borderline}</span>
        ) : undefined,
      }
    : null
  const rohwerte: KennwertZeile[] = [
    // Kopfdurchmesser zuerst: eigene Größe (Kopf statt Schaft) und die
    // Orientierung für die Pfannengröße (Realtest-Wunsch 01.10.2026).
    {
      label: 'Kopf-⌀',
      werte: [raw.headDiameterMm == null ? null : mm(raw.headDiameterMm)],
      titel:
        'Hüftkopf-Durchmesser: Umkreis der drei Kopfkontur-Punkte, über die Kalibrierung vergrößerungskorrigiert',
    },
    { label: 'Cortical Index', werte: [v2(raw.corticalIndex)] },
    { label: 'Canal-Calcar Ratio', werte: [v2(raw.canalCalcarRatio)] },
    { label: 'NSA (CCD)', werte: [raw.nsaDeg == null ? null : grad(raw.nsaDeg)] },
    {
      label: 'Femorales Offset',
      werte: [raw.femoralOffsetMm == null ? null : mm(raw.femoralOffsetMm)],
    },
    { label: 'Femoral Offset Ratio', werte: [v2(raw.femoralOffsetRatio)] },
  ]

  return (
    <Karte
      titel="Morphologie & Fixation"
      kennung={cpah ? `CPAH ${cpah.code}` : undefined}
      fuss={
        <>
          {/* Voraussetzungen der Aufnahme — als ERKLÄRUNG, nicht als
              Abfrage: Wer plant, hat die Eignung der Aufnahme vorher
              geprüft (Nutzerentscheid 16.09.2026). Dieselbe Liste wie die
              frühere Checkliste, damit Anspruch und Dokumentation nicht
              auseinanderlaufen. */}
          <details>
            <summary className="cursor-pointer select-none hover:text-neutral-300">
              Voraussetzungen der Aufnahme für Dorr/CPAH
            </summary>
            <ul className="mt-0.5 list-inside list-disc">
              {FEMUR_PROFILE_QUALITAETS_KRITERIEN.map((k) => (
                <li key={k.feld}>{k.voraussetzung ?? k.frage}</li>
              ))}
            </ul>
            <div className="mt-0.5">
              Ärztlich vorab zu beurteilen — das Programm erkennt sie nicht selbst.
            </div>
          </details>
          <div className="mt-0.5">Planungshinweis — keine autonome Implantatentscheidung.</div>
        </>
      }
    >
      {/* Ohne Klasse steht die Begründung vor den Rohwerten — diese bleiben
          immer sichtbar, sie sind das, was tatsächlich gemessen wurde. */}
      {dorrZeile ? (
        <div className="mb-1">
          <Kennwerte zeilen={[dorrZeile]} />
        </div>
      ) : (
        <div className="mb-1 text-[11px] text-neutral-400">
          Dorr/CPAH: nicht zuverlässig bestimmbar
        </div>
      )}
      <Kennwerte zeilen={rohwerte} />

      {/* Fixationshinweis bei Dorr C (CPAH 7–9). Bewusst als PRÜF-Auftrag
          formuliert, nicht als Entscheidung: Der geometrisch gute Sitz
          eines zementfreien Schafts hebt das Frakturrisiko nicht auf.
          Mehr Schaft-Bezug gibt es hier bewusst NICHT (Entscheidung
          16.09.2026): Die Implantatwahl bleibt beim planenden Chirurgen. */}
      {cpah && cpah.type >= 7 && (
        <Hinweis stufe="warning">
          Dorr C: zementierte Fixation/Alternative aktiv prüfen.
          Geometrischer Fit hebt das Frakturrisiko nicht auf.
        </Hinweis>
      )}

      {/* Warum keine Klasse? Nur noch bei älteren Plänen, deren gespeicherte
          Checkliste offene Kriterien trägt — deren Entscheidung bleibt. */}
      {!darfKlassifizieren && quality && (
        <Hinweis stufe="caution">
          <span className="font-semibold">
            Bildqualität laut gespeicherter Checkliste nicht bestätigt — Rohwerte
            bleiben, Klasse nicht:
          </span>
          <ul className="mt-0.5 list-inside list-disc opacity-80">
            {quality.exclusionReasons.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Hinweis>
      )}

      {/* Mess-Warnungen der Geometrie (vertauschte Punkte o. Ä.). */}
      {raw.warnings.map((w) => (
        <Hinweis key={w} stufe="caution">
          {w}
        </Hinweis>
      ))}

      {/* Ärztliche Bestätigung. Nur sinnvoll, wenn überhaupt eine Klasse
          abgeleitet werden darf — ohne Vorschlag gibt es nichts zu
          bestätigen und nichts zu übersteuern. */}
      {dorr && (
        <DorrBestaetigung
          id={id}
          vorschlag={dorr.suggested}
          quality={quality}
          review={review}
          veraltet={veraltet}
        />
      )}

      {/* Das Schaubild nur mit Klasse — ohne die Werte wäre der Punkt
          ohnehin nicht platzierbar. */}
      {cpah &&
        raw.corticalIndex != null &&
        raw.nsaDeg != null &&
        raw.femoralOffsetRatio != null && (
          <Abschnitt>
            <CpahMatrix
              cpah={cpah}
              corticalIndex={raw.corticalIndex}
              nsaDeg={raw.nsaDeg}
              femoralOffsetRatio={raw.femoralOffsetRatio}
            />
          </Abschnitt>
        )}
    </Karte>
  )
}

/**
 * Bestätigen oder Übersteuern des Dorr-Vorschlags.
 *
 * Der Vorschlag bleibt gespeichert; die ärztliche Entscheidung kommt
 * DANEBEN, nicht an seine Stelle. Weicht sie ab, ist ein Grund Pflicht —
 * ohne ihn nimmt der Store die Beurteilung gar nicht erst an, und der
 * Knopf bleibt entsprechend gesperrt.
 */
function DorrBestaetigung({
  id,
  vorschlag,
  quality,
  review,
  veraltet,
}: {
  id: string
  vorschlag: DorrType
  /** Gespeicherte Checkliste älterer Pläne — wird beim Speichern mitgeführt. */
  quality?: FemurProfileImageQuality
  review?: FemurProfileReview
  veraltet: boolean
}) {
  const [offen, setOffen] = useState(false)
  const [wahl, setWahl] = useState<DorrType>(review?.dorrFinal ?? vorschlag)
  const [grund, setGrund] = useState<FemurProfileOverrideReason | ''>(
    review?.overrideReason ?? '',
  )

  const abweichend = wahl !== vorschlag
  const speicherbar = !abweichend || grund !== ''

  const speichern = () => {
    useHipStore.getState().setFemurProfileReview(id, {
      ...(quality ? { imageQuality: quality } : {}),
      dorrSuggested: vorschlag,
      dorrFinal: wahl,
      ...(abweichend && grund !== '' ? { overrideReason: grund } : {}),
      // Zeitstempel entsteht ERST hier — beim Speichern, nicht beim Öffnen.
      confirmedAt: new Date().toISOString(),
    })
    setOffen(false)
  }

  const zuruecknehmen = () => {
    useHipStore.getState().setFemurProfileReview(id, quality ? { imageQuality: quality } : {})
    setWahl(vorschlag)
    setGrund('')
    setOffen(false)
  }

  return (
    <div className="mt-1.5 border-t border-neutral-800 pt-1.5">
      {veraltet && (
        <div className="mb-1.5 *:mt-0">
          <Hinweis stufe="caution">
            Die Punkte wurden nach der Bestätigung verändert — der Vorschlag
            lautet jetzt {vorschlag}, bestätigt wurde gegen{' '}
            {review?.dorrSuggested}. Bitte erneut prüfen.
          </Hinweis>
        </div>
      )}

      {!offen ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-neutral-500">
            {review?.dorrFinal
              ? `Bestätigt${
                  review.overrideReason
                    ? ` · ${
                        FEMUR_PROFILE_OVERRIDE_REASONS.find(
                          (r) => r.wert === review.overrideReason,
                        )?.text ?? review.overrideReason
                      }`
                    : ''
                }`
              : 'Noch nicht ärztlich bestätigt'}
          </span>
          <button
            onClick={() => setOffen(true)}
            className="rounded border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-300 transition hover:bg-neutral-800"
          >
            {review?.dorrFinal ? 'Ändern' : 'Bestätigen'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neutral-500">Dorr:</span>
            {(['A', 'B', 'C'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setWahl(t)}
                className={[
                  'rounded border px-2 py-0.5 text-[10px] transition',
                  wahl === t
                    ? 'border-violet-500 bg-violet-700/30 text-violet-100'
                    : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800',
                ].join(' ')}
              >
                {t}
                {t === vorschlag && (
                  <span className="ml-0.5 text-neutral-500">·V</span>
                )}
              </button>
            ))}
          </div>

          {abweichend && (
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-amber-400">
                Abweichung vom Vorschlag {vorschlag} — Grund erforderlich:
              </span>
              <select
                value={grund}
                onChange={(e) =>
                  setGrund(e.target.value as FemurProfileOverrideReason | '')
                }
                className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-[11px] text-neutral-200"
              >
                <option value="">— bitte wählen —</option>
                {FEMUR_PROFILE_OVERRIDE_REASONS.map((r) => (
                  <option key={r.wert} value={r.wert}>
                    {r.text}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex justify-end gap-1.5">
            {review?.dorrFinal && (
              <button
                onClick={zuruecknehmen}
                className="rounded px-2 py-0.5 text-[10px] text-neutral-400 transition hover:bg-neutral-800"
              >
                Zurücknehmen
              </button>
            )}
            <button
              onClick={() => setOffen(false)}
              className="rounded px-2 py-0.5 text-[10px] text-neutral-400 transition hover:bg-neutral-800"
            >
              Abbrechen
            </button>
            <button
              onClick={speichern}
              disabled={!speicherbar}
              title={speicherbar ? undefined : 'Erst einen Grund wählen.'}
              className={[
                'rounded px-2 py-0.5 text-[10px] font-semibold text-white transition',
                speicherbar
                  ? 'bg-violet-700 hover:bg-violet-600'
                  : 'cursor-not-allowed bg-neutral-700 opacity-50',
              ].join(' ')}
            >
              Speichern
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export type { FemurProfileRaw }
