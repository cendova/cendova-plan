// Charakterisierungs-Tests der Plan-Speicherung für die Umstellungs-
// osteotomie (Format v11): Rundlauf, Abwärtskompatibilität und die
// Grenzen-Prüfung manipulierter Pläne.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPlan, normalisiereOsteotomiePlan, type PlanFile } from './serialize'
import { pruefePlanGrenzen } from './planGrenzen'
import { useKneeOsteotomieStore, type OsteotomiePlan } from '../../state/kneeOsteotomieStore'

vi.mock('../cornerstone/viewer', () => ({
  getCurrentDicomBytes: () => null,
  getCurrentDicomFileName: () => null,
  getGenericMeasurements: () => [],
  loadDicomFromBytes: async () => {},
  restoreGenericMeasurements: () => {},
}))
vi.mock('../cornerstone/viewer2', () => ({
  getCurrentDicomBytes2: () => null,
  getCurrentDicomFileName2: () => null,
  getViewport2: () => null,
  loadDicomBytesToPane2: async () => {},
}))

beforeEach(() => useKneeOsteotomieStore.getState().reset())

describe('Plan-Speicherung der Umstellungsosteotomie', () => {
  it('schreibt Format-Version 11 (jüngster Format-Test)', () => {
    expect(buildPlan().version).toBe(11)
  })

  it('nimmt Typ, Ziel, Optionen und Punkte auf', () => {
    const s = useKneeOsteotomieStore.getState()
    s.starte('htoOeffnend', 60)
    s.setzePunkt([1, 2, 0])
    s.setzePunkt([3, 4, 0])
    s.setDeltaJlca(4.5)
    const plan = buildPlan().kneeOsteotomie!
    expect(plan.typ).toBe('htoOeffnend')
    expect(plan.zielWblProzent).toBe(60)
    expect(plan.tibiaScharnier).toEqual([1, 2, 0])
    expect(plan.tibiaStart).toEqual([3, 4, 0])
    expect(plan.deltaJlca).toBe(4.5)
  })

  it('ohne Planung bleibt das Feld null', () => {
    expect(buildPlan().kneeOsteotomie).toBeNull()
  })

  it('normalisiert fehlende Optionsfelder mit den Vorgaben', () => {
    const minimal = { typ: 'dlo', zielWblProzent: 62.5 } as OsteotomiePlan
    const n = normalisiereOsteotomiePlan(minimal)
    expect(n.dloZielLdfa).toBe(88)
    expect(n.deltaJlca).toBeNull()
    expect(n.bildSimulation).toBe(true)
    expect(n.tibiaScharnier).toBeNull()
  })
})

describe('Grenzen-Prüfung (manipulierte Pläne)', () => {
  const basis = (o: unknown) => ({ ...buildPlan(), kneeOsteotomie: o }) as PlanFile
  it('akzeptiert Pläne ohne Feld und gültige Pläne', () => {
    expect(pruefePlanGrenzen(basis(undefined))).toBeNull()
    expect(
      pruefePlanGrenzen(basis({ typ: 'htoOeffnend', zielWblProzent: 62.5, tibiaStart: [1, 2, 0] })),
    ).toBeNull()
  })
  it('lehnt unbekannte Typen, unplausible Ziele und kaputte Punkte ab', () => {
    expect(pruefePlanGrenzen(basis({ typ: 'x', zielWblProzent: 62.5 }))).toMatch(/Typ/)
    expect(pruefePlanGrenzen(basis({ typ: 'dlo', zielWblProzent: Infinity }))).toMatch(/Zielwert/)
    expect(
      pruefePlanGrenzen(basis({ typ: 'dlo', zielWblProzent: 60, femurStart: [1, 'a', 0] })),
    ).toMatch(/femurStart/)
    expect(
      pruefePlanGrenzen(basis({ typ: 'dlo', zielWblProzent: 60, deltaJlca: -3 })),
    ).toMatch(/ΔJLCA/)
  })
})
