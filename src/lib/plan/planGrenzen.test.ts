// Grenzenprüfung für das Schulter-Feld im Plan-Format (v7).
//
// Wichtig sind zwei gegenläufige Zusicherungen:
//  1. Ein fehlendes Feld ist KEIN Fehler — Pläne < v7 kennen es nicht und
//     müssen unverändert laden.
//  2. Ein absurd großes oder falsch typisiertes Feld wird abgewiesen,
//     BEVOR etwas in die Stores wandert (Security-Report §8).
import { describe, expect, it } from 'vitest'
import { pruefePlanGrenzen } from './planGrenzen'
import { MAX_PLAN_ARRAY } from '../importGrenzen'
import type { PlanFile } from './serialize'

/** Minimaler, gültiger Plan als Ausgangspunkt. */
function basisPlan(extra: Partial<PlanFile> = {}): PlanFile {
  return {
    version: 7,
    savedAt: '2026-07-29T00:00:00.000Z',
    appName: 'CendovaPlan',
    calibration: null,
    hipMeasurements: [],
    kneeMeasurements: [],
    templates: { cups: [], stems: [], referenceLine: null },
    notes: [],
    ...extra,
  } as PlanFile
}

describe('pruefePlanGrenzen — Schulter-Feld', () => {
  it('akzeptiert einen Plan OHNE Schulter-Feld (Pläne < v7)', () => {
    expect(pruefePlanGrenzen(basisPlan())).toBeNull()
  })

  it('akzeptiert ein leeres und ein normal großes Schulter-Array', () => {
    expect(pruefePlanGrenzen(basisPlan({ shoulderMeasurements: [] }))).toBeNull()
    const paar = Array.from({ length: 5 }, () => ({}) as never)
    expect(
      pruefePlanGrenzen(basisPlan({ shoulderMeasurements: paar })),
    ).toBeNull()
  })

  it('weist ein zu großes Schulter-Array ab', () => {
    const zuViele = Array.from(
      { length: MAX_PLAN_ARRAY + 1 },
      () => ({}) as never,
    )
    const fehler = pruefePlanGrenzen(
      basisPlan({ shoulderMeasurements: zuViele }),
    )
    expect(fehler).toContain('shoulderMeasurements')
    expect(fehler).toContain('zu groß')
  })

  it('weist ein falsch typisiertes Schulter-Feld ab', () => {
    const fehler = pruefePlanGrenzen(
      basisPlan({ shoulderMeasurements: 'kaputt' as never }),
    )
    expect(fehler).toContain('shoulderMeasurements')
    expect(fehler).toContain('kein Array')
  })
})

describe('pruefePlanGrenzen — Messpunkte', () => {
  const messung = (points: unknown) => ({ id: 'hip-1', kind: 'ccd', points }) as never
  const gut = [
    [0, 0, 0],
    [1, 2, 0],
    [3, 4, 0],
  ]

  it('akzeptiert gültige Punkte in allen drei Mess-Listen', () => {
    expect(pruefePlanGrenzen(basisPlan({ hipMeasurements: [messung(gut)] }))).toBeNull()
    expect(pruefePlanGrenzen(basisPlan({ kneeMeasurements: [messung(gut)] }))).toBeNull()
    expect(pruefePlanGrenzen(basisPlan({ shoulderMeasurements: [messung(gut)] }))).toBeNull()
  })

  it('weist einen Plan ab, dessen NaN-Punkt beim Speichern zu null wurde', () => {
    // Der reale Fehlerweg: JSON.stringify macht aus NaN still `null`.
    const gespeichert = JSON.parse(
      JSON.stringify(basisPlan({ hipMeasurements: [messung([[0, 0, 0], [NaN, 1, 0]])] })),
    ) as PlanFile
    const fehler = pruefePlanGrenzen(gespeichert)
    expect(fehler).toContain('hipMeasurements[0].points')
    expect(fehler).toContain('ungültigen Punkt')
  })

  it('weist falsch typisierte Punkte und Punktlisten ab', () => {
    for (const kaputt of [[null], [['0', '1', 0]], [[Infinity, 1, 0]], [[1]], [[1, 2, 3, 4]], 'x']) {
      expect(
        pruefePlanGrenzen(basisPlan({ kneeMeasurements: [messung(kaputt)] })),
        JSON.stringify(kaputt),
      ).toContain('kneeMeasurements[0].points')
    }
  })

  it('weist Nicht-Objekte als Messung ab', () => {
    expect(pruefePlanGrenzen(basisPlan({ hipMeasurements: [null as never] }))).toContain(
      'hipMeasurements[0]',
    )
  })

  it('toleriert eine Messung ohne points-Feld (Grundsatz: Fehlendes laden)', () => {
    expect(pruefePlanGrenzen(basisPlan({ shoulderMeasurements: [{} as never] }))).toBeNull()
  })
})
