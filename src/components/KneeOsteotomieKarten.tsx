import type { WorkflowRaw } from '../lib/knee/recipes'
import { computeCpak } from '../lib/knee/cpak'
import { osteotomieTyp, type OsteotomieHinweis } from '../lib/knee/osteotomie'
import { useOsteotomie } from './useOsteotomie'

/**
 * Ergebnis-Karten der Umstellungsosteotomie im Messungen-Panel (Knie):
 *  - „Deformitätsanalyse (Paley)": Normwert-Ampel, Lokalisation,
 *    Vorauswahl — erscheint mit jeder Vollvermessung.
 *  - „Umstellungsosteotomie": Vorher/Nachher, Keile, Hinweise — sobald ein
 *    Plan vollständig ist.
 * Beide lesen dieselbe Berechnung wie Overlay und PDF (useOsteotomie).
 */

const fmt = (v: number, n = 1) => v.toFixed(n).replace('.', ',')

export function KneeDeformitaetKarte() {
  const { analyse } = useOsteotomie()
  if (!analyse) return null
  return (
    <div className="mt-2 rounded border border-neutral-800 bg-neutral-950 p-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Deformitätsanalyse (Paley)
        </span>
        <span className="text-[11px] text-violet-300">{analyse.richtung}</span>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums">
        {analyse.bewertungen.map((b) => (
          <div key={b.winkel} className="contents">
            <span
              className={[
                'inline-block h-2 w-2 rounded-full',
                b.status === 'normal' ? 'bg-emerald-500' : 'bg-amber-500',
              ].join(' ')}
            />
            <span className="text-neutral-400">
              {b.winkel} <span className="text-neutral-600">({b.norm[0]}–{b.norm[1]}°)</span>
            </span>
            <span className={b.status === 'normal' ? 'text-neutral-200' : 'text-amber-200'}>
              {fmt(b.wert)}°{b.status !== 'normal' ? ` ${b.status}` : ''}
            </span>
          </div>
        ))}
      </div>
      {analyse.lokalisation.length > 0 && (
        <div className="mt-1 text-[10px] leading-snug text-neutral-400">
          Lokalisation: {analyse.lokalisation.join(' · ')}
        </div>
      )}
      <div className="mt-1 text-[10px] leading-snug text-neutral-300">{analyse.begruendung}</div>
      <div className="mt-1 text-[9px] leading-snug text-neutral-600">
        mLPFA/mLDTA als Einzelmessung ergänzbar (Abschnitt 4).
      </div>
    </div>
  )
}

export function KneeOsteotomieKarte() {
  const { plan, ergebnis } = useOsteotomie()
  if (!plan || !ergebnis?.ok) return null
  const { vorher, nachher } = ergebnis
  const zeilen: [string, (r: WorkflowRaw) => string][] = [
    ['mHKA-Abweichung', (r) => `${fmt(Math.abs(r.hkaDeviationSigned))}° ${r.hkaDeviationSigned < 0 ? 'Varus' : 'Valgus'}`],
    ['Traglinie (WBL)', (r) => (r.wblProzent != null ? `${fmt(r.wblProzent)} %` : '—')],
    ['Mikulicz-Abstand', (r) => `${fmt(r.mikuliczMm)} mm`],
    ['mLDFA', (r) => `${fmt(r.mLDFA)}°`],
    ['mMPTA', (r) => `${fmt(r.mMPTA)}°`],
    ['JLCA', (r) => `${fmt(r.JLCA)}°`],
    ['JLO (MJLA)', (r) => `${fmt(r.mjla)}°`],
    ['CPAK-Typ', (r) => `Typ ${computeCpak(r.mLDFA, r.mMPTA).type}`],
  ]
  return (
    <div className="mt-2 rounded border border-neutral-800 bg-neutral-950 p-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Umstellungsosteotomie
        </span>
        <span className="text-[11px] text-violet-300">{osteotomieTyp(plan.typ).kurz}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5 text-[10px] tabular-nums">
        <span />
        <span className="text-right text-neutral-500">vorher</span>
        <span className="text-right text-neutral-500">nachher</span>
        {zeilen.map(([label, wert]) => (
          <div key={label} className="contents">
            <span className="text-neutral-400">{label}</span>
            <span className="text-right text-neutral-300">{wert(vorher)}</span>
            <span className="text-right text-emerald-300">{wert(nachher)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5 border-t border-neutral-800 pt-1 text-[10px] tabular-nums text-neutral-300">
        {ergebnis.schnitte.map((s) => (
          <span key={s.knochen}>
            {s.knochen}: Korrektur {fmt(Math.abs(s.grad))}° ·{' '}
            {s.keil === 'oeffnend' ? 'Öffnung' : 'Keilbasis'} {fmt(s.keilhoeheMm)} mm · Schnitt{' '}
            {fmt(s.schnittlaengeMm, 0)} mm
          </span>
        ))}
        <span>
          Beinlänge {ergebnis.beinlaengeDeltaMm >= 0 ? '+' : '−'}
          {fmt(Math.abs(ergebnis.beinlaengeDeltaMm))} mm
        </span>
        {ergebnis.jlcaKorrekturGrad > 0 && (
          <span className="text-neutral-400">
            Ohne Laxitätskorrektur wären {fmt(ergebnis.zielWinkelOhneKorrektur)}° nötig.
          </span>
        )}
      </div>
      {ergebnis.hinweise.map((h) => (
        <HinweisBox key={h.code + h.text} h={h} />
      ))}
      <div className="mt-1.5 border-t border-neutral-800 pt-1 text-[9px] leading-snug text-neutral-500">
        Geometrische Simulation auf der AP-Ganzbeinaufnahme (Miniaci); Slope, Rotation und
        Patellahöhe sind nicht abgebildet. Planungshinweis — keine autonome Therapieentscheidung.
      </div>
    </div>
  )
}

function HinweisBox({ h }: { h: OsteotomieHinweis }) {
  return (
    <div
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
  )
}
