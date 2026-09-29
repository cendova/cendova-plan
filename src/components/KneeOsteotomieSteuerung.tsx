import { benoetigteSlots, useKneeOsteotomieStore } from '../state/kneeOsteotomieStore'
import { bereiteOsteotomieSetzenVor } from '../lib/toolControls'
import {
  erwarteteKeilArt,
  OSTEOTOMIE_TYPEN,
  osteotomieTyp,
  scharnierHinweis,
  type OsteotomieTyp,
} from '../lib/knee/osteotomie'
import { ZIEL_VARUS } from '../lib/knee/deformitaet'
import { useOsteotomie } from './useOsteotomie'

/**
 * Steuerung der Umstellungsosteotomie (Knie, Toolbar-Abschnitt 6).
 * Ergebnisse stehen in der Karte im Messungen-Panel; hier nur Eingaben.
 *
 * Schnellwahl der Zielbereiche nach Feucht et al. 2014 (je 5 %-Bereich,
 * hier die Bereichsmitte), dazu 62,5 % als klassischer Fujisawa-Bereich.
 */
const SCHNELLWAHL: { label: string; wert: number; titel: string }[] = [
  { label: '50–55', wert: 52.5, titel: 'Feucht: 50–55 % (Bereichsmitte 52,5 %)' },
  { label: '55–60', wert: 57.5, titel: 'Feucht: 55–60 % (Bereichsmitte 57,5 %)' },
  { label: '60–65', wert: 62.5, titel: 'Feucht: 60–65 % (Bereichsmitte 62,5 %, Fujisawa-Bereich)' },
]

export function KneeOsteotomieSteuerung({ hasImage }: { hasImage: boolean }) {
  const { vorher, analyse, plan, ergebnis } = useOsteotomie()
  const setzen = useKneeOsteotomieStore((s) => s.setzen)
  const st = useKneeOsteotomieStore.getState

  if (!vorher) {
    return (
      <div className="flex flex-col gap-1.5 px-1">
        <p className="text-[11px] leading-snug text-neutral-500">
          Voraussetzung ist die Vollvermessung (Abschnitt 3): Achsen, Plateau und
          Traglinie kommen von dort.
          {plan && ' Die begonnene Planung bleibt erhalten und rechnet wieder, sobald die Vollvermessung sichtbar ist.'}
        </p>
        {/* Auch ohne (sichtbare) Vollvermessung muss sich eine begonnene
            Planung verwerfen lassen (Review 29.09.2026). */}
        {plan && (
          <button
            onClick={() => st().verwerfen()}
            className="self-start rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-400 transition hover:bg-neutral-700 hover:text-neutral-200"
          >
            Planung verwerfen
          </button>
        )}
      </div>
    )
  }

  if (!plan) {
    const typ = analyse?.vorschlag ?? 'htoOeffnend'
    return (
      <div className="flex flex-col gap-1.5 px-1">
        <p className="text-[11px] leading-snug text-neutral-400">
          {analyse?.vorschlag
            ? `Vorauswahl: ${osteotomieTyp(typ).kurz}. ${analyse.begruendung}`
            : analyse?.begruendung}
        </p>
        <button
          disabled={!hasImage}
          onClick={() => {
            bereiteOsteotomieSetzenVor()
            st().starte(typ, analyse?.zielWblProzent ?? ZIEL_VARUS)
          }}
          className="rounded border border-violet-900/60 bg-violet-950/30 px-3 py-2 text-left text-sm text-violet-200 transition hover:bg-violet-900/40 disabled:opacity-50"
        >
          Osteotomie planen
        </button>
      </div>
    )
  }

  const richtung =
    ergebnis?.ok
      ? ergebnis.richtung
      : plan.zielWblProzent >= (vorher.wblProzent ?? 50)
        ? 'valgisierend'
        : 'varisierend'
  const knochen = osteotomieTyp(plan.typ).knochen
  const unvollstaendig = benoetigteSlots(plan.typ).some((slot) => plan[slot] == null)

  return (
    <div className="flex flex-col gap-2 px-1 text-[11px] text-neutral-300">
      <label className="flex flex-col gap-0.5">
        <span className="text-neutral-500">Typ</span>
        <select
          value={plan.typ}
          onChange={(e) => st().setTyp(e.target.value as OsteotomieTyp)}
          className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs"
        >
          {OSTEOTOMIE_TYPEN.map((t) => (
            <option key={t.typ} value={t.typ}>
              {t.label}
              {analyse?.vorschlag === t.typ ? ' · Vorauswahl' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-0.5">
        <span className="text-neutral-500">
          Ziel der Traglinie (% der Plateaubreite, 0 % = medial) · jetzt{' '}
          {vorher.wblProzent != null ? `${vorher.wblProzent.toFixed(1).replace('.', ',')} %` : '—'}
        </span>
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            min={30}
            max={80}
            step={0.5}
            value={plan.zielWblProzent}
            onChange={(e) => st().setZiel(Number(e.target.value))}
            className="flex-1"
          />
          <input
            type="number"
            step={0.5}
            value={plan.zielWblProzent}
            onChange={(e) => {
              // Leeres Feld ist kein Wert (wäre sonst 0); der Store klemmt
              // auf die Import-Grenzen (OSTEOTOMIE_GRENZEN).
              const roh = e.target.value.trim()
              if (roh !== '') st().setZiel(Number(roh))
            }}
            className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right tabular-nums"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {SCHNELLWAHL.map((s) => (
            <button
              key={s.label}
              title={s.titel}
              onClick={() => st().setZiel(s.wert)}
              className={[
                'rounded px-1.5 py-0.5 text-[10px] transition',
                plan.zielWblProzent === s.wert
                  ? 'bg-violet-700/50 text-violet-100'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700',
              ].join(' ')}
            >
              {s.label} %
            </button>
          ))}
          <button
            title="Neutrale Traglinie (Plateaumitte)"
            onClick={() => st().setZiel(50)}
            className={[
              'rounded px-1.5 py-0.5 text-[10px] transition',
              plan.zielWblProzent === 50
                ? 'bg-violet-700/50 text-violet-100'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700',
            ].join(' ')}
          >
            50 % neutral
          </button>
        </div>
      </div>

      {plan.typ === 'dlo' && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-neutral-500" title="Der Femur wird auf diesen mLDFA korrigiert, die Tibia übernimmt den Rest bis zum Traglinien-Ziel (Schröter 2019).">
            Ziel-mLDFA femoral
          </span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              step={0.5}
              value={plan.dloZielLdfa}
              onChange={(e) => {
                // Leeres Feld ist kein Wert (wäre sonst 0); der Store klemmt
                // auf die Import-Grenzen (OSTEOTOMIE_GRENZEN).
                const roh = e.target.value.trim()
                if (roh !== '') st().setDloZielLdfa(Number(roh))
              }}
              className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right tabular-nums"
            />
            °
          </span>
        </label>
      )}

      {plan.typ === 'htoOeffnend' && (
        <label className="flex flex-col gap-0.5">
          <span className="text-neutral-500" title="Ryu et al. 2021: geplanter Winkel = Miniaci-Winkel − ⅓ ΔJLCA. ΔJLCA = JLCA in der Valgusstress-Aufnahme minus JLCA im Stand (Vorzeichen: Apex lateral positiv).">
            Laxitätskorrektur: ΔJLCA (Valgusstress − Stand)
          </span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              step={0.5}
              min={0}
              placeholder="aus"
              value={plan.deltaJlca ?? ''}
              onChange={(e) => {
                const roh = e.target.value.trim()
                const v = Number(roh)
                st().setDeltaJlca(roh === '' || !Number.isFinite(v) || v <= 0 ? null : v)
              }}
              className="w-16 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right tabular-nums"
            />
            ° <span className="text-neutral-500">leer = ohne Korrektur</span>
          </span>
        </label>
      )}

      <div className="flex flex-col gap-0.5 rounded bg-neutral-900/60 p-1.5 text-[10px] leading-snug text-neutral-400">
        {knochen.map((k) => (
          <span key={k}>
            <span className="text-neutral-300">{k}:</span>{' '}
            {scharnierHinweis(k, erwarteteKeilArt(plan.typ, k), richtung)}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={plan.bildSimulation}
            onChange={(e) => st().setBildSimulation(e.target.checked)}
          />
          Bildsimulation
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={plan.sichtbar}
            onChange={(e) => st().setSichtbar(e.target.checked)}
          />
          im Bild zeigen
        </label>
      </div>

      {ergebnis && !ergebnis.ok && (
        <p className="rounded border border-amber-900/60 bg-amber-950/30 p-1.5 text-[10px] text-amber-200">
          {ergebnis.fehler}
        </p>
      )}

      <div className="flex gap-1.5">
        <button
          disabled={!hasImage}
          onClick={() => {
            if (setzen) {
              st().abbrechenSetzen()
              return
            }
            bereiteOsteotomieSetzenVor()
            if (unvollstaendig) st().setzeFehlende()
            else st().punkteNeu()
          }}
          className={[
            'flex-1 rounded px-2 py-1.5 text-xs transition',
            setzen
              ? 'bg-violet-700/40 text-violet-100 ring-1 ring-violet-500'
              : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700',
          ].join(' ')}
        >
          {setzen ? 'Setzen beenden' : unvollstaendig ? 'Fehlende Punkte setzen' : 'Punkte neu setzen'}
        </button>
        <button
          onClick={() => st().verwerfen()}
          className="rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-400 transition hover:bg-neutral-700 hover:text-neutral-200"
        >
          Verwerfen
        </button>
      </div>
    </div>
  )
}
