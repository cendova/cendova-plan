import { useMemo } from 'react'
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
  const vorher = wf ? computeWorkflowRaw(wf.points, mmPerWorldUnit) : null
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
    wf && plan
      ? planeOsteotomie({
          punkte: wf.points,
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

export function useOsteotomie(): OsteotomieDaten {
  const ms = useKneeStore((s) => s.measurements)
  const plan = useKneeOsteotomieStore((s) => s.plan)
  const factor = useViewerStore((s) => s.calibration?.mmPerWorldUnit ?? 1)
  return useMemo(() => berechneOsteotomie(ms, plan, factor), [ms, plan, factor])
}
