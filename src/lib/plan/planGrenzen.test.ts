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
