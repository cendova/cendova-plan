import { create } from 'zustand'
import { useKneeStore, type KneeMeasurement } from '../state/kneeStore'
import { useViewerStore } from '../state/viewerStore'
import { useKneeOsteotomieStore, type OsteotomiePlan } from '../state/kneeOsteotomieStore'
import {
  computeWorkflowRaw,
  mldtaAusPunkten,
  mlpfaAusPunkten,
  type WorkflowRaw,
} from '../lib/knee/recipes'
import {
  planeOsteotomie,
  type OsteotomieErgebnis,
  type OsteotomieFehler,
} from '../lib/knee/osteotomie'
import { analysiereDeformitaet, type Deformitaetsanalyse } from '../lib/knee/deformitaet'

/**
 * Gemeinsame Datenquelle für Overlay, Steuerung, Ergebnis-Karte und PDF:
 * EINE Berechnung aus Vollvermessung + Osteotomie-Plan. Die Ergebnisse
 * werden nie gespeichert, sondern immer frisch gerechnet — verschiebt der
 * Nutzer einen Landmarkenpunkt, zieht die Planung sofort nach.
 */

/** Die maßgebliche Vollvermessung: die erste vollständige, sichtbare. */
export function findeVollvermessung(ms: KneeMeasurement[]): KneeMeasurement | null {
  return ms.find((m) => m.kind === 'workflow' && m.visible && m.points.length >= 17) ?? null
}

/** Letzte gemessene mLPFA/mLDTA (Einzelmessungen, optional). */
function paleyErgaenzung(ms: KneeMeasurement[]) {
  const letzte = (k: 'mLPFA' | 'mLDTA') =>
    [...ms].reverse().find((m) => m.kind === k && m.visible)
  const lpfa = letzte('mLPFA')
  const ldta = letzte('mLDTA')
  return {
    mLPFA: lpfa ? mlpfaAusPunkten(lpfa.points) : null,
    mLDTA: ldta ? mldtaAusPunkten(ldta.points) : null,
  }
}

export interface OsteotomieDaten {
  vorher: WorkflowRaw | null
  analyse: Deformitaetsanalyse | null
  plan: OsteotomiePlan | null
  ergebnis: OsteotomieErgebnis | OsteotomieFehler | null
}

/** Reine Berechnung (auch außerhalb von React nutzbar, z. B. PDF). */
export function berechneOsteotomie(
  ms: KneeMeasurement[],
  plan: OsteotomiePlan | null,
  mmPerWorldUnit: number,
): OsteotomieDaten {
  const wf = findeVollvermessung(ms)
  // Nur die 17 Landmarken: Ein (präparierter) Plan darf mehr Punkte
  // tragen, und die Simulation dreht sonst jeden davon mit.
  const punkte = wf ? wf.points.slice(0, 17) : null
  const vorher = punkte ? computeWorkflowRaw(punkte, mmPerWorldUnit) : null
  const analyse = vorher
    ? analysiereDeformitaet({
        hkaAbweichung: vorher.hkaDeviationSigned,
        mLDFA: vorher.mLDFA,
        mMPTA: vorher.mMPTA,
        JLCA: vorher.JLCA,
        ...paleyErgaenzung(ms),
      })
    : null
  const ergebnis =
    punkte && plan
      ? planeOsteotomie({
          punkte,
          mmPerWorldUnit,
          typ: plan.typ,
          zielWblProzent: plan.zielWblProzent,
          dloZielLdfa: plan.dloZielLdfa,
          deltaJlca: plan.deltaJlca,
          femur:
            plan.femurScharnier && plan.femurStart
              ? { scharnier: plan.femurScharnier, start: plan.femurStart }
              : null,
          tibia:
            plan.tibiaScharnier && plan.tibiaStart
              ? { scharnier: plan.tibiaScharnier, start: plan.tibiaStart }
              : null,
        })
      : null
  return { vorher, analyse, plan, ergebnis }
}

/**
 * EINE Rechnung für alle Nutzer (Bild-Overlay, Mess-Overlay, Steuerung,
 * Messliste, Karten): Vorher memoisierte jede Komponente für sich, und
 * beim Ziehen eines Punktes lief der Winkel-Löser 5–6-mal pro Mausbewegung
 * (Review 29.09.2026). Die Store-Werte sind unveränderlich, der Vergleich
 * per Identität genügt.
 */
let letzte: {
  ms: KneeMeasurement[]
  plan: OsteotomiePlan | null
  factor: number
  daten: OsteotomieDaten
} | null = null

function berechneGeteilt(
  ms: KneeMeasurement[],
  plan: OsteotomiePlan | null,
  factor: number,
): OsteotomieDaten {
  if (letzte && letzte.ms === ms && letzte.plan === plan && letzte.factor === factor)
    return letzte.daten
  const daten = berechneOsteotomie(ms, plan, factor)
  letzte = { ms, plan, factor, daten }
  return daten
}

/**
 * Eingefrorener Stand, solange eine Landmarke der Vollvermessung bei
 * laufender Bildsimulation gezogen wird. Ohne ihn löst jede Mausbewegung
 * den Korrekturwinkel neu — mit dem gerade gezogenen Punkt: Das
 * Sprunggelenk bestimmt den Winkel selbst, seine Anzeige-Lage ist durch
 * die Konstruktion festgelegt, und der gespeicherte Punkt wanderte
 * unsichtbar davon (Review 29.09.2026: 20 mm Zug → 0 mm Bewegung im Bild,
 * Winkel −5,8° → +23,6°). Eingefroren folgt der Punkt dem Cursor auf dem
 * gezeigten (gedrehten) Knochen und wird mit DERSELBEN Drehung
 * zurückgerechnet; beim Loslassen wird neu gelöst.
 */
const useEingefroren = create<{
  stand: { plan: OsteotomiePlan | null; factor: number; daten: OsteotomieDaten } | null
}>(() => ({ stand: null }))

export function friereOsteotomieEin(): void {
  const ms = useKneeStore.getState().measurements
  const plan = useKneeOsteotomieStore.getState().plan
  const factor = useViewerStore.getState().calibration?.mmPerWorldUnit ?? 1
  useEingefroren.setState({ stand: { plan, factor, daten: berechneGeteilt(ms, plan, factor) } })
}

export function taueOsteotomieAuf(): void {
  if (useEingefroren.getState().stand) useEingefroren.setState({ stand: null })
}

function waehle(
  ms: KneeMeasurement[],
  plan: OsteotomiePlan | null,
  factor: number,
  stand: ReturnType<typeof useEingefroren.getState>['stand'],
): OsteotomieDaten {
  // Der eingefrorene Stand gilt nur für DENSELBEN Plan und Maßstab — ein
  // Bildwechsel, Rückgängig oder Verwerfen mitten im Ziehen hebt ihn auf.
  if (stand && stand.plan === plan && stand.factor === factor) return stand.daten
  return berechneGeteilt(ms, plan, factor)
}

/** Aktueller Stand außerhalb von React (Tests) — dieselbe Auswahl wie der Hook. */
export function osteotomieJetzt(): OsteotomieDaten {
  return waehle(
    useKneeStore.getState().measurements,
    useKneeOsteotomieStore.getState().plan,
    useViewerStore.getState().calibration?.mmPerWorldUnit ?? 1,
    useEingefroren.getState().stand,
  )
}

export function useOsteotomie(): OsteotomieDaten {
  const ms = useKneeStore((s) => s.measurements)
  const plan = useKneeOsteotomieStore((s) => s.plan)
  const factor = useViewerStore((s) => s.calibration?.mmPerWorldUnit ?? 1)
  const stand = useEingefroren((s) => s.stand)
  return waehle(ms, plan, factor, stand)
}
