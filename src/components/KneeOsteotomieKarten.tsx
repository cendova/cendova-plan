import type { WorkflowRaw } from '../lib/knee/recipes'
import type { PlannedCpak } from '../lib/knee/resection'
import type { PaleyWinkel, WinkelBewertung } from '../lib/knee/deformitaet'
import { osteotomieTyp } from '../lib/knee/osteotomie'
import { grad, mm, mmMitVorzeichen, prozent } from '../lib/zahlFormat'
import { Hint } from './Hint'
import { Hinweis, Karte, Kennwerte, type KennwertZeile } from './Ergebnis'
import { useOsteotomie } from './useOsteotomie'

/**
 * Ergebnis-Karten des Kniemoduls (rechte Spalte).
 *
 * Aufteilung nach dem Grundsatz „jeder Wert genau einmal" (Realtest
 * 29.09.2026 — mLDFA stand vorher VIERMAL untereinander: Messliste,
 * Paley-Karte, Osteotomie-Tabelle, CPAK-Zusatz):
 *  - „Beinachse": ALLE Achswerte der Vollvermessung mit Normbereich und
 *    Ampel (Paley). Liegt eine Planung vor, kommt eine zweite Spalte
 *    „geplant" dazu — aus der Umstellungsosteotomie ODER aus den
 *    platzierten Prothesen-Schablonen. So bleiben beide Module unabhängig
 *    nutzbar und teilen sich trotzdem eine Anzeige.
 *  - „Osteotomie": nur, was es NUR dort gibt (Korrektur, Keil,
 *    Schnitt, Beinlänge, Hinweise). Die Vorher/Nachher-Achswerte stehen in
 *    der Beinachse.
 * Die Vorauswahl des Osteotomietyps samt Begründung steht in der linken
 * Steuerung (Abschnitt 6) und wird hier bewusst nicht wiederholt.
 */

const abweichung = (r: WorkflowRaw) => {
  const v = r.hkaDeviationSigned
  if (Math.abs(v) < 0.05) return 'neutral'
  return `${grad(Math.abs(v))} ${v < 0 ? 'Varus' : 'Valgus'}`
}

const norm = (b?: WinkelBewertung) => (b ? `${b.norm[0]}–${b.norm[1]}°` : undefined)
const ampel = (b?: WinkelBewertung) =>
  b ? (b.status === 'normal' ? ('normal' as const) : ('auffaellig' as const)) : undefined
const status = (b?: WinkelBewertung) =>
  b ? (b.status === 'normal' ? `im Normbereich ${norm(b)}` : `${b.status} (Norm ${norm(b)})`) : undefined

export function KneeBeinachseKarte({ implantat }: { implantat: PlannedCpak | null }) {
  const { vorher, analyse, plan, ergebnis } = useOsteotomie()
  if (!vorher) return null

  // Quelle der Spalte „geplant": Die Osteotomie hat Vorrang (beides
  // zugleich ist kein klinisches Szenario) — dieselbe Regel wie die CPAK.
  const osteo = plan?.sichtbar && ergebnis?.ok ? ergebnis.nachher : null
  const mitPlan = osteo != null || implantat != null

  const b = new Map<PaleyWinkel, WinkelBewertung>(
    (analyse?.bewertungen ?? []).map((x) => [x.winkel, x]),
  )

  /** Zeile aus einer WorkflowRaw-Größe: gemessen + (optional) geplant. */
  const zeile = (
    label: string,
    wert: (r: WorkflowRaw) => string | null,
    extra: Partial<KennwertZeile> = {},
    implantatWert: string | null = null,
  ): KennwertZeile => ({
    label,
    werte: mitPlan
      ? [wert(vorher), osteo ? wert(osteo) : implantatWert]
      : [wert(vorher)],
    ...extra,
  })

  const zeilen: KennwertZeile[] = [
    // mHKA und die Abweichung von 180° sind DIESELBE Größe — die
    // Abweichung trägt nur zusätzlich die Richtung. Deshalb eine Zeile,
    // die Richtung klein unter dem Winkel.
    {
      ...zeile('mHKA', (r) => grad(r.mHKA)),
      unter: mitPlan ? [abweichung(vorher), osteo ? abweichung(osteo) : null] : [abweichung(vorher)],
      titel: 'mHKA (Hüfte–Knie–Sprunggelenk); darunter die Abweichung von 180° mit Richtung',
    },
    zeile('Traglinie', (r) => (r.wblProzent != null ? prozent(r.wblProzent) : null), {
      titel: 'Traglinie (WBL): Durchtritt in % der Tibiaplateau-Breite (0 % medial, 100 % lateral)',
    }),
    zeile('Mikulicz', (r) => mmMitVorzeichen(r.mikuliczMm), {
      titel: 'Mikulicz-Abstand: Traglinie zur Kniemitte; negativ = medial',
    }),
    zeile(
      'mLDFA',
      (r) => grad(r.mLDFA),
      { norm: norm(b.get('mLDFA')), status: ampel(b.get('mLDFA')), titel: status(b.get('mLDFA')) },
      implantat?.femPlaced ? grad(implantat.ldfa) : null,
    ),
    zeile(
      'mMPTA',
      (r) => grad(r.mMPTA),
      { norm: norm(b.get('mMPTA')), status: ampel(b.get('mMPTA')), titel: status(b.get('mMPTA')) },
      implantat?.tibPlaced ? grad(implantat.mpta) : null,
    ),
    zeile('JLCA', (r) => grad(r.JLCA), {
      norm: norm(b.get('JLCA')),
      status: ampel(b.get('JLCA')),
      titel: status(b.get('JLCA')),
    }),
    zeile('MJLA', (r) => grad(r.mjla), {
      titel: 'MJLA: Winkel der Gelenklinie zur Traglinie (Mikulicz)',
    }),
    zeile('β-Winkel', (r) => grad(r.betaAngle), {
      titel: 'β-Winkel (AMA): anatomische gegen mechanische Femurachse',
    }),
  ]
  // Paley-Ergänzung aus den Einzelmessungen — nur wenn gemessen; eine
  // Planung verändert sie in diesem Modell nicht.
  for (const w of ['mLPFA', 'mLDTA'] as const) {
    const x = b.get(w)
    if (!x) continue
    zeilen.push({
      label: w,
      werte: mitPlan ? [grad(x.wert), null] : [grad(x.wert)],
      norm: norm(x),
      status: ampel(x),
      titel: status(x),
    })
  }

  const quelle = osteo
    ? `Geplant = nach Osteotomie (${osteotomieTyp(plan!.typ).kurz})`
    : implantat
      ? `Geplant = Implantate${
          !implantat.femPlaced ? ' (nur Tibia, mLDFA = gemessen)' : !implantat.tibPlaced ? ' (nur Femur, mMPTA = gemessen)' : ''
        }`
      : null
  const fehltPaley = !b.has('mLPFA') || !b.has('mLDTA')

  return (
    <Karte
      titel="Beinachse"
      kennung={analyse?.richtung}
      fuss={
        quelle || (analyse && analyse.lokalisation.length > 0) || fehltPaley ? (
          <>
            {analyse && analyse.lokalisation.length > 0 && (
              <div>Lokalisation: {analyse.lokalisation.join(' · ')}</div>
            )}
            {quelle && <div>{quelle}</div>}
            {fehltPaley && (
              <Hint>
                <div>mLPFA/mLDTA als Einzelmessung ergänzbar (Abschnitt 4).</div>
              </Hint>
            )}
          </>
        ) : undefined
      }
    >
      <Kennwerte spalten={mitPlan ? ['gemessen', 'geplant'] : undefined} zeilen={zeilen} />
    </Karte>
  )
}

export function KneeOsteotomieKarte() {
  const { plan, ergebnis } = useOsteotomie()
  if (!plan || !ergebnis?.ok) return null
  const zeilen: KennwertZeile[] = ergebnis.schnitte.flatMap((s) => [
    { label: `${s.knochen}: Korrektur`, werte: [grad(Math.abs(s.grad))] },
    {
      label: `${s.knochen}: ${s.keil === 'oeffnend' ? 'Öffnung' : 'Keilbasis'}`,
      werte: [mm(s.keilhoeheMm)],
    },
    { label: `${s.knochen}: Schnittlänge`, werte: [mm(s.schnittlaengeMm, 0)] },
  ])
  zeilen.push({ label: 'Beinlänge', werte: [mmMitVorzeichen(ergebnis.beinlaengeDeltaMm)] })
  return (
    <Karte
      titel="Osteotomie"
      kennung={osteotomieTyp(plan.typ).kurz}
      fuss={
        <>
          Achswerte vorher/nachher: siehe „Beinachse". Geometrische Simulation auf der
          AP-Ganzbeinaufnahme (Miniaci); Slope, Rotation und Patellahöhe sind nicht abgebildet.
          Planungshinweis — keine autonome Therapieentscheidung.
        </>
      }
    >
      <Kennwerte zeilen={zeilen} />
      {ergebnis.jlcaKorrekturGrad > 0 && (
        <div className="mt-1 text-[10px] text-neutral-400">
          Laxitätskorrektur eingerechnet — ohne sie wären {grad(ergebnis.zielWinkelOhneKorrektur)} nötig.
        </div>
      )}
      {/* Ohne Belegzeile: Die Belege sind die Vorher/Nachher-Werte, und die
          stehen schon in der Beinachse (im PDF bleiben sie beim Hinweis). */}
      {ergebnis.hinweise.map((h) => (
        <Hinweis key={h.code + h.text} stufe={h.severity}>
          {h.text}
        </Hinweis>
      ))}
    </Karte>
  )
}
