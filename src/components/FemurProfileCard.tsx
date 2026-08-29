import { useState } from 'react'
import type { Types } from '@cornerstonejs/core'
import {
  type DorrType,
  type FemurProfileImageQuality,
  type FemurProfileRaw,
  computeFemurProfileRaw,
  isFemurProfileClassifiable,
} from '../lib/hip/femurProfile'
import { stemPlanningHints } from '../lib/hip/stemPlanningRules'
import {
  FEMUR_PROFILE_OVERRIDE_REASONS,
  type FemurProfileOverrideReason,
  type FemurProfileReview,
  useHipStore,
} from '../state/hipStore'
import { CpahMatrix } from './CpahMatrix'

/**
 * Ergebnis-Karte „Morphologie & Fixation" zu einer Femurprofil-Messung.
 *
 * Grundregel der Darstellung: Die Karte zeigt IMMER die Rohwerte, die
 * KLASSE aber nur, wenn die Bildqualität dafür bestätigt wurde. Eine
 * Dorr-/CPAH-Klasse aus einer ungeeigneten Aufnahme wäre
 * Scheinpräzision — und zwar eine, die Therapieentscheidungen beeinflusst.
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
  /** Bildqualität dieser Messung; fehlt sie, wird nicht klassifiziert. */
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

  // Planungshinweise (Task 15): regelbasiert aus finalem Dorr (bzw. dem
  // Vorschlag, solange nichts Gültiges bestätigt ist) und den
  // CPAH-Bausteinen. Ohne Klassifikationsfreigabe ist `dorr` null und es
  // gibt bewusst KEINE Hinweise — eine Regel aus einer ungeeigneten
  // Aufnahme wäre dieselbe Scheinpräzision wie die Klasse selbst.
  const dorrFuerRegeln =
    dorr == null ? null : bestaetigt && !veraltet && final != null ? final : dorr.suggested
  const hints = dorrFuerRegeln
    ? stemPlanningHints({
        dorr: dorrFuerRegeln,
        dorrBestaetigt: bestaetigt && !veraltet,
        nsaClass: raw.nsaClass,
        offsetSubtype: cpah?.offsetSubtype ?? null,
        corticalIndex: raw.corticalIndex,
        nsaDeg: raw.nsaDeg,
        femoralOffsetRatio: raw.femoralOffsetRatio,
      })
    : []

  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Morphologie &amp; Fixation
        </span>
        <span className="text-[11px] text-violet-300">
          {cpah ? `CPAH ${cpah.code}` : '—'}
        </span>
      </div>

      {/* Klasse — oder die Begründung, warum es keine gibt. Nach der
          ärztlichen Bestätigung tritt diese an die Stelle des Vorschlags;
          der Vorschlag bleibt daneben sichtbar, wenn er abwich. */}
      {dorr ? (
        bestaetigt ? (
          <div className="text-xs text-neutral-200">
            {abweichend ? 'Dorr (ärztlich)' : 'Dorr bestätigt'}{' '}
            <span className="font-semibold">{final}</span>
            {abweichend && (
              <span className="ml-1 text-neutral-400">
                · Vorschlag war {review?.dorrSuggested}
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-neutral-200">
            Dorr-Vorschlag <span className="font-semibold">{dorr.suggested}</span>
            {dorr.borderline && (
              <span className="ml-1 text-amber-400">
                · Grenzbereich {dorr.borderline}
              </span>
            )}
          </div>
        )
      ) : (
        <div className="text-xs text-neutral-400">
          Dorr/CPAH: nicht zuverlässig bestimmbar
        </div>
      )}

      {cpah && (
        <div className="text-[11px] text-neutral-400">
          {cpah.code} · Dorr {dorr?.suggested} · coxa {raw.nsaClass} ·{' '}
          {cpah.offsetSubtype === 'H' ? 'High-offset' : 'Normal-offset'}
        </div>
      )}

      {/* Rohwerte: immer sichtbar, auch ohne Klassifikation — sie sind
          das, was tatsächlich gemessen wurde. */}
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-neutral-800 pt-1.5 text-[10px] tabular-nums text-neutral-400">
        <span>Cortical Index:</span>
        <Wert v={raw.corticalIndex} nachkomma={2} />
        <span>Canal-Calcar Ratio:</span>
        <Wert v={raw.canalCalcarRatio} nachkomma={2} />
        <span>NSA (CCD):</span>
        <Wert v={raw.nsaDeg} nachkomma={1} einheit="°" />
        <span>Femorales Offset:</span>
        <Wert v={raw.femoralOffsetMm} nachkomma={1} einheit=" mm" />
        <span>Femoral Offset Ratio:</span>
        <Wert v={raw.femoralOffsetRatio} nachkomma={2} />
      </div>

      {/* Planungshinweise: regelbasiert (stemPlanningRules), jeder mit
          sichtbaren Belegen. Sie ersetzen die frühere statische Dorr-C-Box;
          deren Wortlaut lebt als Regel DORR_C_FIXATION weiter — das
          Abnahme-Skript pruefe-karte.mjs prüft ihn wörtlich. Bewusst als
          PRÜF-Aufträge formuliert, nie als Entscheidung. */}
      {hints.map((h) => (
        <div
          key={h.code}
          className={[
            'mt-1.5 rounded border p-1.5 text-[10px] leading-relaxed',
            h.severity === 'warning'
              ? 'border-red-900/60 bg-red-950/30 text-red-200'
              : h.severity === 'caution'
                ? 'border-amber-900/60 bg-amber-950/30 text-amber-200'
                : 'border-neutral-800 bg-neutral-900/60 text-neutral-300',
          ].join(' ')}
        >
          {h.text}
          <div className="mt-0.5 text-[9px] opacity-70">{h.evidence.join(' · ')}</div>
        </div>
      ))}

      {/* Warum keine Klasse? Die Gründe stehen aus der Checkliste fest. */}
      {!darfKlassifizieren && (
        <div className="mt-1.5 rounded border border-amber-900/60 bg-amber-950/30 p-1.5 text-[10px] leading-relaxed text-amber-200">
          {quality ? (
            <>
              <span className="font-semibold">
                Bildqualität nicht bestätigt — Rohwerte bleiben, Klasse nicht:
              </span>
              <ul className="mt-0.5 list-inside list-disc text-amber-200/80">
                {quality.exclusionReasons.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </>
          ) : (
            'Ohne bestätigte Bildqualität wird keine Dorr-/CPAH-Klasse abgeleitet.'
          )}
        </div>
      )}

      {/* Ärztliche Bestätigung. Nur sinnvoll, wenn überhaupt eine Klasse
          abgeleitet werden darf — ohne Vorschlag gibt es nichts zu
          bestätigen und nichts zu übersteuern. */}
      {dorr && quality && (
        <DorrBestaetigung
          id={id}
          vorschlag={dorr.suggested}
          quality={quality}
          review={review}
          veraltet={veraltet}
        />
      )}

      {/* Das Schaubild NUR bei bestätigter Bildqualität — es zeigt eine
          Klasse, und genau die darf ohne Bestätigung nicht entstehen.
          Ohne die Werte wäre der Punkt ohnehin nicht platzierbar. */}
      {cpah &&
        raw.corticalIndex != null &&
        raw.nsaDeg != null &&
        raw.femoralOffsetRatio != null && (
          <div className="mt-2">
            <CpahMatrix
              cpah={cpah}
              corticalIndex={raw.corticalIndex}
              nsaDeg={raw.nsaDeg}
              femoralOffsetRatio={raw.femoralOffsetRatio}
            />
          </div>
        )}

      {/* Mess-Warnungen der Geometrie (vertauschte Punkte o. Ä.). */}
      {raw.warnings.length > 0 && (
        <ul className="mt-1.5 list-inside list-disc text-[10px] leading-relaxed text-amber-300/80">
          {raw.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="mt-1.5 border-t border-neutral-800 pt-1 text-[9px] leading-snug text-neutral-500">
        Planungshinweis — keine autonome Implantatentscheidung.
      </div>
    </div>
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
  quality: FemurProfileImageQuality
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
      imageQuality: quality,
      dorrSuggested: vorschlag,
      dorrFinal: wahl,
      ...(abweichend && grund !== '' ? { overrideReason: grund } : {}),
      // Zeitstempel entsteht ERST hier — beim Speichern, nicht beim Öffnen.
      confirmedAt: new Date().toISOString(),
    })
    setOffen(false)
  }

  const zuruecknehmen = () => {
    useHipStore.getState().setFemurProfileReview(id, { imageQuality: quality })
    setWahl(vorschlag)
    setGrund('')
    setOffen(false)
  }

  return (
    <div className="mt-1.5 border-t border-neutral-800 pt-1.5">
      {veraltet && (
        <div className="mb-1 rounded border border-amber-900/60 bg-amber-950/30 p-1.5 text-[10px] leading-relaxed text-amber-200">
          Die Punkte wurden nach der Bestätigung verändert — der Vorschlag
          lautet jetzt {vorschlag}, bestätigt wurde gegen{' '}
          {review?.dorrSuggested}. Bitte erneut prüfen.
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

/** Zahl oder „—", damit ein fehlender Wert nicht als 0 gelesen wird. */
function Wert({
  v,
  nachkomma,
  einheit = '',
}: {
  v: number | null
  nachkomma: number
  einheit?: string
}) {
  if (v == null) {
    return <span className="text-right text-neutral-500">—</span>
  }
  const text =
    einheit === '°'
      ? `${v.toFixed(nachkomma)}${einheit}`
      : `${v.toFixed(nachkomma).replace('.', ',')}${einheit}`
  return <span className="text-right text-neutral-200">{text}</span>
}

export type { FemurProfileRaw }
