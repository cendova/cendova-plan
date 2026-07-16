/**
 * CPAK-Schaubild: 3×3-Matrix der 9 MacDessi-Typen mit einem Punkt für die
 * aktuelle Knie-Konstitution. Wird im MeasurementPanel angezeigt, wenn
 * der „Knie-Vollvermessung"-Workflow gelaufen ist.
 *
 * Design:
 *   - SVG, ~200 px breit (passt in die rechte Sidebar)
 *   - Tabellen-Konvention nach MacDessi 2021: Spalten Varus | Neutral | Valgus,
 *     Zeilen Apex distal | Neutral | Apex proximal
 *   - Aktive Zelle leicht eingefärbt, Typ-Nummer + Häufigkeit pro Zelle
 *   - Punkt linear interpoliert über den Plot-Bereich, geclippt auf
 *     [-12°..+12°] für aHKA und [170°..190°] für JLO
 */
import type { CpakResult } from '../lib/knee/cpak'
import { CPAK_AHKA_THRESHOLDS, CPAK_JLO_THRESHOLDS } from '../lib/knee/cpak'
import type { PlannedCpak } from '../lib/knee/resection'

const W = 220
const H = 200
const PAD_LEFT = 40
const PAD_TOP = 24
const PAD_RIGHT = 8
const PAD_BOTTOM = 32
const PLOT_W = W - PAD_LEFT - PAD_RIGHT
const PLOT_H = H - PAD_TOP - PAD_BOTTOM

// Skala. aHKA: Varus links (negative Werte), Valgus rechts (positive Werte).
// Wir clampen den Punkt, damit Extremwerte am Plot-Rand bleiben, nicht
// außerhalb landen.
const AHKA_MIN = -12
const AHKA_MAX = 12
const JLO_MIN = 170
const JLO_MAX = 190

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** aHKA → Plot-X (Pixel): negativer aHKA (Varus) = LINKS, positiver (Valgus) = RECHTS. */
function xOf(aHKA: number): number {
  const c = clamp(aHKA, AHKA_MIN, AHKA_MAX)
  const t = (c - AHKA_MIN) / (AHKA_MAX - AHKA_MIN)
  return PAD_LEFT + t * PLOT_W
}

/** JLO → Plot-Y (Pixel): NIEDRIGE JLO (< 177°) = weiter OBEN (Apex distal),
 *  hohe JLO (> 183°) = unten (Apex proximal) — MacDessi-konform. */
function yOf(JLO: number): number {
  const c = clamp(JLO, JLO_MIN, JLO_MAX)
  const t = (c - JLO_MIN) / (JLO_MAX - JLO_MIN)
  return PAD_TOP + t * PLOT_H
}

const CELLS: {
  type: CpakResult['type']
  col: 0 | 1 | 2
  row: 0 | 1 | 2
  prev: number
}[] = [
  { type: 'I',    col: 0, row: 0, prev: 5 },
  { type: 'II',   col: 1, row: 0, prev: 3 },
  { type: 'III',  col: 2, row: 0, prev: 1 },
  { type: 'IV',   col: 0, row: 1, prev: 32 },
  { type: 'V',    col: 1, row: 1, prev: 18 },
  { type: 'VI',   col: 2, row: 1, prev: 7 },
  { type: 'VII',  col: 0, row: 2, prev: 18 },
  { type: 'VIII', col: 1, row: 2, prev: 8 },
  { type: 'IX',   col: 2, row: 2, prev: 8 },
]

export function CpakMatrix({
  result,
  planned = null,
}: {
  result: CpakResult
  /** Optionale „geplante" (post-OP) CPAK aus der Implantat-Position — wird
   *  als zweiter, gefüllter Punkt mit Verbindungslinie gezeigt. */
  planned?: PlannedCpak | null
}) {
  // Trennlinien-Positionen aus den Schwellen ableiten (so bleiben Zellen
  // und Punkt-Position garantiert konsistent — wenn jemand die Schwellen
  // im cpak.ts-Modul ändert, wandert beides mit).
  const xVarusBorder = xOf(CPAK_AHKA_THRESHOLDS.varusAt)
  const xValgusBorder = xOf(CPAK_AHKA_THRESHOLDS.valgusAt)
  const yApexDistalBorder = yOf(CPAK_JLO_THRESHOLDS.apexDistalAt)
  const yApexProxBorder = yOf(CPAK_JLO_THRESHOLDS.apexProximalAt)

  // Zellzentren für Beschriftung — Mittelpunkte der jeweiligen Zonen.
  const colCenters = [
    (PAD_LEFT + xVarusBorder) / 2,
    (xVarusBorder + xValgusBorder) / 2,
    (xValgusBorder + (PAD_LEFT + PLOT_W)) / 2,
  ]
  const rowCenters = [
    (PAD_TOP + yApexDistalBorder) / 2,
    (yApexDistalBorder + yApexProxBorder) / 2,
    (yApexProxBorder + (PAD_TOP + PLOT_H)) / 2,
  ]

  const pointX = xOf(result.aHKA)
  const pointY = yOf(result.JLO)
  const plannedX = planned ? xOf(planned.cpak.aHKA) : null
  const plannedY = planned ? yOf(planned.cpak.JLO) : null

  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          CPAK-Klassifikation
        </span>
        <span className="text-[11px] text-violet-300">
          Typ {result.type}
          {planned && planned.cpak.type !== result.type && (
            <span className="text-amber-300"> → {planned.cpak.type}</span>
          )}
        </span>
      </div>

      <svg width={W} height={H} className="block">
        {/* Plot-Hintergrund */}
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={PLOT_W}
          height={PLOT_H}
          fill="#0f172a"
          stroke="#334155"
          strokeWidth={1}
        />

        {/* Aktive Zelle hervorheben */}
        {CELLS.filter((c) => c.type === result.type).map((c) => {
          const left = c.col === 0 ? PAD_LEFT : c.col === 1 ? xVarusBorder : xValgusBorder
          const right = c.col === 0 ? xVarusBorder : c.col === 1 ? xValgusBorder : PAD_LEFT + PLOT_W
          const top = c.row === 0 ? PAD_TOP : c.row === 1 ? yApexDistalBorder : yApexProxBorder
          const bot = c.row === 0 ? yApexDistalBorder : c.row === 1 ? yApexProxBorder : PAD_TOP + PLOT_H
          return (
            <rect
              key={c.type}
              x={left}
              y={top}
              width={right - left}
              height={bot - top}
              fill="#7c3aed"
              fillOpacity={0.18}
            />
          )
        })}

        {/* Trennlinien */}
        <line x1={xVarusBorder} y1={PAD_TOP} x2={xVarusBorder} y2={PAD_TOP + PLOT_H} stroke="#475569" strokeWidth={1} />
        <line x1={xValgusBorder} y1={PAD_TOP} x2={xValgusBorder} y2={PAD_TOP + PLOT_H} stroke="#475569" strokeWidth={1} />
        <line x1={PAD_LEFT} y1={yApexDistalBorder} x2={PAD_LEFT + PLOT_W} y2={yApexDistalBorder} stroke="#475569" strokeWidth={1} />
        <line x1={PAD_LEFT} y1={yApexProxBorder} x2={PAD_LEFT + PLOT_W} y2={yApexProxBorder} stroke="#475569" strokeWidth={1} />

        {/* Typ-Beschriftung pro Zelle (Häufigkeits-Prozent absichtlich
            entfernt, um die Matrix klar zu halten — die Werte stehen
            weiter in cpak.ts.PREVALENCE_PCT, falls woanders gebraucht). */}
        {CELLS.map((c) => (
          <text
            key={c.type}
            x={colCenters[c.col]}
            y={rowCenters[c.row] + 4}
            textAnchor="middle"
            className="fill-neutral-300"
            fontSize={12}
            fontWeight={c.type === result.type ? 700 : 400}
          >
            {c.type}
          </text>
        ))}

        {/* Spalten-Header (oben) */}
        <text x={colCenters[0]} y={PAD_TOP - 8} textAnchor="middle" fontSize={9} className="fill-neutral-400">Varus</text>
        <text x={colCenters[1]} y={PAD_TOP - 8} textAnchor="middle" fontSize={9} className="fill-neutral-400">Neutral</text>
        <text x={colCenters[2]} y={PAD_TOP - 8} textAnchor="middle" fontSize={9} className="fill-neutral-400">Valgus</text>

        {/* Zeilen-Header (links) */}
        <text x={PAD_LEFT - 4} y={rowCenters[0] + 3} textAnchor="end" fontSize={9} className="fill-neutral-400">Ap. dist</text>
        <text x={PAD_LEFT - 4} y={rowCenters[1] + 3} textAnchor="end" fontSize={9} className="fill-neutral-400">Neutral</text>
        <text x={PAD_LEFT - 4} y={rowCenters[2] + 3} textAnchor="end" fontSize={9} className="fill-neutral-400">Ap. prox</text>

        {/* Schwellen-Beschriftung (unter X-Achse) */}
        <text x={xVarusBorder} y={PAD_TOP + PLOT_H + 11} textAnchor="middle" fontSize={8} className="fill-neutral-500">−2°</text>
        <text x={xValgusBorder} y={PAD_TOP + PLOT_H + 11} textAnchor="middle" fontSize={8} className="fill-neutral-500">+2°</text>
        <text x={PAD_LEFT + PLOT_W / 2} y={PAD_TOP + PLOT_H + 23} textAnchor="middle" fontSize={9} className="fill-neutral-500">aHKA = mMPTA − mLDFA</text>

        {/* Verbindungslinie prä-OP → geplant (zeigt die OP-Korrektur). */}
        {planned && plannedX != null && plannedY != null && (
          <line
            x1={pointX}
            y1={pointY}
            x2={plannedX}
            y2={plannedY}
            stroke="#f59e0b"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        {/* Prä-OP-Punkt: gefüllt ohne Planung, sonst offen (Referenz). */}
        <circle
          cx={pointX}
          cy={pointY}
          r={5}
          fill={planned ? '#0f172a' : '#f59e0b'}
          stroke="#f59e0b"
          strokeWidth={1.5}
        />
        {/* Geplanter (post-OP) Punkt: gefüllt Amber. */}
        {planned && plannedX != null && plannedY != null && (
          <circle
            cx={plannedX}
            cy={plannedY}
            r={5}
            fill="#f59e0b"
            stroke="#fff7ed"
            strokeWidth={1.5}
          />
        )}
      </svg>

      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-neutral-400">
        <span>aHKA:</span>
        <span className="text-right text-neutral-200">{formatAhka(result.aHKA)}</span>
        <span>JLO:</span>
        <span className="text-right text-neutral-200">{result.JLO.toFixed(1)}°</span>
        <span>Ausrichtung:</span>
        <span className="text-right text-neutral-200">{result.alignment}</span>
        <span>Gelenklinie:</span>
        <span className="text-right text-neutral-200">{result.jlo}</span>
      </div>

      {planned && (
        <div className="mt-1.5 border-t border-neutral-800 pt-1.5 text-[10px] text-neutral-400">
          <div className="mb-1 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full border border-amber-500 bg-slate-900" />
              prä-OP
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              geplant · {planned.cpak.alignment}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
            <span>aHKA (geplant):</span>
            <span className="text-right text-amber-200">{formatAhka(planned.cpak.aHKA)}</span>
            <span>LDFA / MPTA:</span>
            <span className="text-right text-amber-200">
              {planned.ldfa.toFixed(1)}° / {planned.mpta.toFixed(1)}°
            </span>
          </div>
          {(!planned.femPlaced || !planned.tibPlaced) && (
            <div className="mt-1 text-[9px] text-neutral-500">
              {!planned.femPlaced
                ? 'Nur Tibia geplant — LDFA = gemessen.'
                : 'Nur Femur geplant — MPTA = gemessen.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** „+5.1°" / „−1.8°" / „0.0°" — Vorzeichen explizit, damit Varus/Valgus
 *  auf einen Blick erkennbar bleibt. */
function formatAhka(v: number): string {
  if (v > 0) return `+${v.toFixed(1)}°`
  if (v < 0) return `−${Math.abs(v).toFixed(1)}°`
  return '0.0°'
}
