/**
 * CPAH-Schaubild: die neun Femur-Morphotypen aus Dorr-Typ (Cortical
 * Index) und NSA, plus der Offset-Untertyp N/H als eigene Leiste.
 *
 * Nach dem MUSTER von `CpakMatrix` gebaut, aber bewusst als EIGENE
 * Komponente: Die CPAK-Matrix trägt knie-spezifische Semantik (aHKA,
 * JLO, geplante post-OP-Lage). Eine Verallgemeinerung beider würde eine
 * Abstraktion erfinden, die es fachlich nicht gibt.
 *
 * Wie beim Knie ein kontinuierlicher 2D-Plot mit Zellen-Overlay statt
 * eines reinen Rasters — erst dadurch sieht man, wie NAH die Anatomie an
 * einer Klassengrenze liegt. Genau das ist die klinisch interessante
 * Information; eine Zelle allein verbirgt sie.
 *
 * KEIN „geplant"-Punkt — der bewusste Unterschied zur CpakMatrix: Die
 * CPAK beschreibt eine Ausrichtung, die die Operation VERÄNDERT. CPAH
 * beschreibt die Knochenform, und die ändert das Implantat nicht.
 *
 * Alle Schwellen kommen aus den Konstanten in `femurProfile.ts`. Zellen,
 * Bänder und Punkt können deshalb nicht gegen die Rechenlogik driften:
 * wer dort eine Grenze ändert, verschiebt hier automatisch alles mit.
 */
import {
  DORR_BORDERLINE_ZONES,
  DORR_CI_THRESHOLDS,
  FOR_HIGH_AT,
  NSA_THRESHOLDS,
  type CpahResult,
} from '../lib/hip/femurProfile'

const W = 220
const H = 236
const PAD_LEFT = 40
const PAD_TOP = 24
const PAD_RIGHT = 8
const PLOT_W = W - PAD_LEFT - PAD_RIGHT
const PLOT_H = 144
const PLOT_BOT = PAD_TOP + PLOT_H

// Skalen. An der Kohorte des CPAH-Papers ausgerichtet (n = 2.345), damit
// echte Anatomien im Plot liegen statt am Rand zu kleben:
//   NSA  105–162° beobachtet (Paper S. 3) → Achse bis 165
//   FOR  Mittel 1,40 bei SD 0,2 (S. 3)    → Leiste ab 0,8 (Mittel − 3 SD)
// Geclampt wird trotzdem: ein Ausreißer soll den Plot nicht sprengen.
const CI_MIN = 0.3
const CI_MAX = 0.8
const NSA_MIN = 105
const NSA_MAX = 165
const FOR_MIN = 0.8
const FOR_MAX = 2.2

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** NSA → Plot-X: coxa vara LINKS, valga RECHTS. */
function xOf(nsaDeg: number): number {
  const t = (clamp(nsaDeg, NSA_MIN, NSA_MAX) - NSA_MIN) / (NSA_MAX - NSA_MIN)
  return PAD_LEFT + t * PLOT_W
}

/** CI → Plot-Y: HOHE Werte OBEN (Dorr A oben, C unten) — dickere
 *  Kortikalis oben entspricht der üblichen Leserichtung „gut nach oben". */
function yOf(ci: number): number {
  const t = (clamp(ci, CI_MIN, CI_MAX) - CI_MIN) / (CI_MAX - CI_MIN)
  return PAD_TOP + (1 - t) * PLOT_H
}

/** FOR → X auf der Untertyp-Leiste. */
function xForOf(v: number): number {
  const t = (clamp(v, FOR_MIN, FOR_MAX) - FOR_MIN) / (FOR_MAX - FOR_MIN)
  return PAD_LEFT + t * PLOT_W
}

const BAR_Y = PLOT_BOT + 40
const BAR_H = 10

export function CpahMatrix({
  cpah,
  corticalIndex,
  nsaDeg,
  femoralOffsetRatio,
  femoralOffsetMm,
}: {
  cpah: CpahResult
  corticalIndex: number
  nsaDeg: number
  femoralOffsetRatio: number
  femoralOffsetMm: number
}) {
  // Trennlinien aus den Schwellen ableiten — dieselbe Technik wie in der
  // CpakMatrix, damit Zellen und Punkt garantiert konsistent bleiben.
  const xVara = xOf(NSA_THRESHOLDS.varaBelow)
  const xValga = xOf(NSA_THRESHOLDS.valgaAbove)
  const yAB = yOf(DORR_CI_THRESHOLDS.dorrAAbove)
  const yBC = yOf(DORR_CI_THRESHOLDS.dorrCBelow)

  const colEdges = [PAD_LEFT, xVara, xValga, PAD_LEFT + PLOT_W]
  const rowEdges = [PAD_TOP, yAB, yBC, PLOT_BOT]
  const colCenters = [
    (colEdges[0] + colEdges[1]) / 2,
    (colEdges[1] + colEdges[2]) / 2,
    (colEdges[2] + colEdges[3]) / 2,
  ]
  const rowCenters = [
    (rowEdges[0] + rowEdges[1]) / 2,
    (rowEdges[1] + rowEdges[2]) / 2,
    (rowEdges[2] + rowEdges[3]) / 2,
  ]

  // Aktive Zelle aus dem Typ zurückrechnen (1–9, zeilenweise A/B/C).
  const zeile = Math.floor((cpah.type - 1) / 3)
  const spalte = (cpah.type - 1) % 3

  const xHigh = xForOf(FOR_HIGH_AT)

  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          CPAH-Klassifikation
        </span>
        <span className="text-[11px] text-violet-300">Typ {cpah.code}</span>
      </div>

      <svg width={W} height={H} className="block">
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={PLOT_W}
          height={PLOT_H}
          fill="#0f172a"
          stroke="#334155"
          strokeWidth={1}
        />

        {/* Dorr-C-Zeile dezent rot: die Fixationswarnung der Typen 7–9
            bekommt damit einen ORT, nicht nur einen Text. */}
        <rect
          x={PAD_LEFT}
          y={yBC}
          width={PLOT_W}
          height={PLOT_BOT - yBC}
          fill="#ef4444"
          fillOpacity={0.07}
        />

        {/* Grenzzonen als amber Bänder. Sie sind eine EIGENE Konvention
            dieses Projekts (keine Paper-Angabe) — deshalb werden sie
            gezeigt statt versteckt. Ein Punkt im Band IST die
            Grenzbereichs-Anzeige; eine zweite Markierung braucht es nicht. */}
        {[DORR_BORDERLINE_ZONES.ab, DORR_BORDERLINE_ZONES.bc].map(([lo, hi]) => (
          <rect
            key={`band${lo}`}
            x={PAD_LEFT}
            y={yOf(hi)}
            width={PLOT_W}
            height={yOf(lo) - yOf(hi)}
            fill="#f59e0b"
            fillOpacity={0.1}
          />
        ))}

        {/* Aktive Zelle */}
        <rect
          x={colEdges[spalte]}
          y={rowEdges[zeile]}
          width={colEdges[spalte + 1] - colEdges[spalte]}
          height={rowEdges[zeile + 1] - rowEdges[zeile]}
          fill="#7c3aed"
          fillOpacity={0.18}
        />

        {/* Trennlinien */}
        {[xVara, xValga].map((x) => (
          <line key={`vx${x}`} x1={x} y1={PAD_TOP} x2={x} y2={PLOT_BOT} stroke="#475569" strokeWidth={1} />
        ))}
        {[yAB, yBC].map((y) => (
          <line key={`hy${y}`} x1={PAD_LEFT} y1={y} x2={PAD_LEFT + PLOT_W} y2={y} stroke="#475569" strokeWidth={1} />
        ))}

        {/* Typ-Nummern 1–9 */}
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => {
            const typ = r * 3 + c + 1
            return (
              <text
                key={`t${typ}`}
                x={colCenters[c]}
                y={rowCenters[r] + 4}
                textAnchor="middle"
                className="fill-neutral-300"
                fontSize={12}
                fontWeight={typ === cpah.type ? 700 : 400}
              >
                {typ}
              </text>
            )
          }),
        )}

        {/* Spalten- und Zeilen-Beschriftung */}
        {['vara', 'norma', 'valga'].map((t, i) => (
          <text key={t} x={colCenters[i]} y={PAD_TOP - 8} textAnchor="middle" fontSize={9} className="fill-neutral-400">
            {t}
          </text>
        ))}
        {['Dorr A', 'Dorr B', 'Dorr C'].map((t, i) => (
          <text key={t} x={PAD_LEFT - 4} y={rowCenters[i] + 3} textAnchor="end" fontSize={9} className="fill-neutral-400">
            {t}
          </text>
        ))}

        {/* Schwellenwerte anschreiben — sonst bleibt die Skala Behauptung. */}
        <text x={xVara} y={PLOT_BOT + 11} textAnchor="middle" fontSize={8} className="fill-neutral-500">
          {NSA_THRESHOLDS.varaBelow}°
        </text>
        <text x={xValga} y={PLOT_BOT + 11} textAnchor="middle" fontSize={8} className="fill-neutral-500">
          {NSA_THRESHOLDS.valgaAbove}°
        </text>
        <text x={PAD_LEFT + PLOT_W / 2} y={PLOT_BOT + 23} textAnchor="middle" fontSize={9} className="fill-neutral-500">
          NSA (CCD-Winkel)
        </text>
        <text x={PAD_LEFT + PLOT_W - 3} y={yAB - 3} textAnchor="end" fontSize={8} className="fill-neutral-500">
          {DORR_CI_THRESHOLDS.dorrAAbove.toFixed(2).replace('.', ',')}
        </text>
        <text x={PAD_LEFT + PLOT_W - 3} y={yBC - 3} textAnchor="end" fontSize={8} className="fill-neutral-500">
          {DORR_CI_THRESHOLDS.dorrCBelow.toFixed(2).replace('.', ',')}
        </text>

        {/* Der Messpunkt (NSA, CI). */}
        <circle
          cx={xOf(nsaDeg)}
          cy={yOf(corticalIndex)}
          r={5}
          fill="#f59e0b"
          stroke="#fff7ed"
          strokeWidth={1.5}
        />

        {/* Offset-Untertyp als eigene Leiste: die dritte Dimension gehört
            sichtbar gemacht, nicht nur als Buchstabe im Code versteckt. */}
        <text x={PAD_LEFT - 4} y={BAR_Y + BAR_H - 1} textAnchor="end" fontSize={9} className="fill-neutral-400">
          FOR
        </text>
        <rect x={PAD_LEFT} y={BAR_Y} width={PLOT_W} height={BAR_H} fill="#0f172a" stroke="#334155" strokeWidth={1} />
        <rect
          x={xHigh}
          y={BAR_Y}
          width={PAD_LEFT + PLOT_W - xHigh}
          height={BAR_H}
          fill="#f59e0b"
          fillOpacity={0.1}
        />
        <line x1={xHigh} y1={BAR_Y - 2} x2={xHigh} y2={BAR_Y + BAR_H + 2} stroke="#475569" strokeWidth={1} />
        <text x={(PAD_LEFT + xHigh) / 2} y={BAR_Y - 5} textAnchor="middle" fontSize={9} className="fill-neutral-400">
          N
        </text>
        <text x={(xHigh + PAD_LEFT + PLOT_W) / 2} y={BAR_Y - 5} textAnchor="middle" fontSize={9} className="fill-neutral-400">
          H
        </text>
        <text x={xHigh} y={BAR_Y + BAR_H + 12} textAnchor="middle" fontSize={8} className="fill-neutral-500">
          {FOR_HIGH_AT.toFixed(2).replace('.', ',')}
        </text>
        <circle
          cx={xForOf(femoralOffsetRatio)}
          cy={BAR_Y + BAR_H / 2}
          r={4}
          fill="#f59e0b"
          stroke="#fff7ed"
          strokeWidth={1.5}
        />
      </svg>

      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-neutral-400">
        <span>CI:</span>
        <span className="text-right text-neutral-200">
          {corticalIndex.toFixed(2).replace('.', ',')}
        </span>
        <span>NSA:</span>
        <span className="text-right text-neutral-200">{nsaDeg.toFixed(1)}°</span>
        <span>FOR:</span>
        <span className="text-right text-neutral-200">
          {femoralOffsetRatio.toFixed(2).replace('.', ',')}
        </span>
        <span>FO:</span>
        <span className="text-right text-neutral-200">
          {femoralOffsetMm.toFixed(1).replace('.', ',')} mm
        </span>
      </div>
    </div>
  )
}
