/**
 * Piktogramme der Radaelli-Klassen (A–F) — EIGENE Schemazeichnungen,
 * keine Abbildungen aus der Publikation (Elsevier-Copyright). Jedes
 * Piktogramm zeigt zwei Dinge: die koronare Silhouette (Länge, Taper,
 * Flare, Krümmung) und darunter den QUERSCHNITT — denn genau der trennt
 * z. B. A (flach) von B1 (rechteckig) und B2 (quadrangulär), was in der
 * Silhouette allein nicht sichtbar wäre.
 *
 * Rein dekorativ-erklärend: Die Zeichnungen sind bewusst grob und
 * markenneutral; sie sollen den Buchstaben erklären, nicht ein Implantat
 * abbilden. Zeichenfläche 32 × 72, medial links, Farbe = currentColor.
 */
import type { RadaelliKlasse } from '../lib/hip/medactaCatalog'
import { RADAELLI_KLASSEN_INFO, RADAELLI_KLASSEN_LISTE } from '../lib/hip/radaelliKlassen'

/** Silhouetten (Pfad) je Klasse — Körper von y=8 (Resektionsebene) abwärts. */
const SILHOUETTE: Record<RadaelliKlasse, string> = {
  // Schmaler, flacher Keil — geradlinige Verjüngung.
  A: 'M11 8 H23 L19 56 H15 Z',
  // Rechteckiger Taper: breiter, gerade Kanten.
  B1: 'M8 8 H26 L19 56 H15 Z',
  // Quadrangulär mit metaphysärem Flare (Schulter proximal), dann Taper.
  B2: 'M6 8 H28 C27 20 23 24 22 30 L19 56 H15 L12 30 C11 24 7 20 6 8 Z',
  // B3: derselbe Flare, distal verkürzt.
  B3: 'M6 8 H28 C27 20 23 24 22 30 L20 44 H14 L12 30 C11 24 7 20 6 8 Z',
  // Fit-and-fill: füllt proximal UND distal — bauchige Flanken.
  C1: 'M7 8 H27 C29 24 26 40 24 56 H10 C8 40 5 24 7 8 Z',
  // Anatomisch: fit-and-fill mit Bogen (Antekurvation angedeutet).
  C2: 'M6 8 H26 C31 22 32 40 29 56 H16 C14 40 9 26 6 8 Z',
  // Kurzer Fit-and-fill.
  C3: 'M7 8 H27 C29 22 26 34 23 42 H11 C8 34 5 22 7 8 Z',
  // Konisch: gleichmäßiger Kegel bis zur Spitze (Splines als Linien).
  D: 'M9 8 H25 L18 56 H16 Z',
  // Zylindrisch: parallele Flanken ohne Verjüngung.
  E: 'M11 8 H23 V56 H11 Z',
  // Kalkargeführt: kurz, die mediale Flanke folgt dem Kalkarbogen.
  F: 'M6 8 H28 L25 38 C20 42 12 38 8 26 Z',
}

/** Querschnitt-Glyph (unter der Silhouette), Mittelpunkt (17, 65). */
function Querschnitt({ klasse }: { klasse: RadaelliKlasse }) {
  switch (RADAELLI_KLASSEN_INFO[klasse].querschnitt) {
    case 'flach':
      return <rect x="9" y="63" width="16" height="4" rx="1" />
    case 'rechteckig':
      return <rect x="10" y="61" width="14" height="8" />
    case 'quadrangulär':
      return <path d="M10 61 H24 L22 69 H12 Z" />
    case 'oval':
      return <ellipse cx="17" cy="65" rx="7" ry="4.5" />
    case 'rund':
      return <circle cx="17" cy="65" r="5" />
  }
}

export function RadaelliPiktogramm({
  klasse,
  height = 36,
  className,
}: {
  klasse: RadaelliKlasse
  height?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 34 72"
      height={height}
      width={(height * 34) / 72}
      className={className}
      aria-hidden="true"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinejoin="round"
    >
      <path d={SILHOUETTE[klasse]} fillOpacity="0.55" />
      {/* Splines (D) bzw. Vollbeschichtung (E) als Innenzeichnung. */}
      {klasse === 'D' && (
        <g strokeWidth="0.8" fill="none" opacity="0.9">
          <path d="M13 12 L16.5 52" />
          <path d="M21 12 L17.5 52" />
        </g>
      )}
      {klasse === 'E' && (
        <g strokeWidth="0.6" fill="none" opacity="0.7" strokeDasharray="1 1.5">
          <path d="M14 12 V52" />
          <path d="M20 12 V52" />
        </g>
      )}
      {/* Resektionsebene als Referenz. */}
      <path d="M3 8 H31" strokeWidth="0.6" opacity="0.5" />
      <g fillOpacity="0.35">
        <Querschnitt klasse={klasse} />
      </g>
    </svg>
  )
}

/**
 * Legende aller zehn Klassen. Hebt optional die Klasse des platzierten
 * Schafts hervor und markiert die im CPAH-Paper simulierten Klassen.
 */
export function RadaelliLegende({
  hervorgehoben = null,
}: {
  hervorgehoben?: RadaelliKlasse | null
}) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-x-1 gap-y-1.5">
        {RADAELLI_KLASSEN_LISTE.map((info) => {
          const aktiv = info.klasse === hervorgehoben
          return (
            <div
              key={info.klasse}
              title={`${info.klasse} — ${info.name}: ${info.geometrie} Verankerung ${info.verankerung}.${info.cpahSimuliert ? ' Im CPAH-Paper simuliert.' : ''}`}
              className={[
                'flex flex-col items-center rounded border px-0.5 py-1 text-center',
                aktiv
                  ? 'border-violet-500/70 bg-violet-950/40 text-violet-200'
                  : 'border-neutral-800 bg-neutral-900/40 text-neutral-400',
              ].join(' ')}
            >
              <RadaelliPiktogramm klasse={info.klasse} />
              <span className="mt-0.5 text-[10px] font-semibold leading-none">
                {info.klasse}
                {info.cpahSimuliert && (
                  <span className="text-violet-300" title="Im CPAH-Paper simuliert">
                    {' '}
                    ·
                  </span>
                )}
              </span>
              <span className="text-[8px] leading-tight text-neutral-500">{info.name}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-1 text-[9px] leading-snug text-neutral-500">
        Radaelli-Klassen zementfreier Schäfte (Radaelli et al. 2023, J Arthroplasty) —
        eigene Schemazeichnungen: Silhouette und Querschnitt. Punkt = im CPAH-Paper
        simulierte Klasse. Zementierte Schäfte tragen keine Klasse.
      </div>
    </div>
  )
}
