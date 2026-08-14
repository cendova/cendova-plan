import type { Types } from '@cornerstonejs/core'
import {
  type FemurProfileRaw,
  computeFemurProfileRaw,
  isFemurProfileClassifiable,
} from '../lib/hip/femurProfile'
import type { FemurProfileReview } from '../state/hipStore'

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
  points,
  mmPerWorldUnit,
  review,
}: {
  points: Types.Point3[]
  mmPerWorldUnit: number
  /** Bildqualität dieser Messung; fehlt sie, wird nicht klassifiziert. */
  review?: FemurProfileReview
}) {
  const raw = computeFemurProfileRaw(points, mmPerWorldUnit)
  if (!raw) return null

  const quality = review?.imageQuality
  const darfKlassifizieren = isFemurProfileClassifiable(quality)
  const dorr = darfKlassifizieren ? raw.dorr : null
  const cpah = darfKlassifizieren ? raw.cpah : null

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

      {/* Klasse — oder die Begründung, warum es keine gibt. */}
      {dorr ? (
        <div className="text-xs text-neutral-200">
          Dorr-Vorschlag <span className="font-semibold">{dorr.suggested}</span>
          {dorr.borderline && (
            <span className="ml-1 text-amber-400">
              · Grenzbereich {dorr.borderline}
            </span>
          )}
        </div>
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

      {/* Fixationshinweis bei Dorr C (CPAH 7–9). Bewusst als PRÜF-Auftrag
          formuliert, nicht als Entscheidung: Der geometrisch gute Sitz
          eines zementfreien Schafts hebt das Frakturrisiko nicht auf. */}
      {cpah && cpah.type >= 7 && (
        <div className="mt-1.5 rounded border border-red-900/60 bg-red-950/30 p-1.5 text-[10px] leading-relaxed text-red-200">
          Dorr C: zementierte Fixation/Alternative aktiv prüfen.
          Geometrischer Fit hebt das Frakturrisiko nicht auf.
        </div>
      )}

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
