// Charakterisierungs-Test des Mess-Abschlusses (Debug-Befund A):
// Nach dem letzten Punkt schließt das Werkzeug — wie im hipStore.
import { beforeEach, describe, expect, it } from 'vitest'
import { useKneeStore } from './kneeStore'
import { getKneeRecipe } from '../lib/knee/recipes'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]

describe('kneeStore.addDraftPoint — Abschluss-Verhalten', () => {
  beforeEach(() => {
    useKneeStore.getState().reset()
  })

  it('nach dem letzten Punkt: Messung angelegt, Draft leer, Werkzeug ZU', () => {
    const store = useKneeStore.getState()
    const recipe = getKneeRecipe('mLDFA')!
    store.toggleTool('mLDFA')
    for (let i = 0; i < recipe.steps.length; i++) {
      useKneeStore.getState().addDraftPoint(p(10 * i, 20 * i + 5))
    }
    const s = useKneeStore.getState()
    expect(s.measurements).toHaveLength(1)
    expect(s.measurements[0].kind).toBe('mLDFA')
    expect(s.draftPoints).toHaveLength(0)
    expect(s.activeKind).toBeNull() // ← Befund A: vorher blieb 'mLDFA' aktiv
  })

  it('vor dem letzten Punkt bleibt das Werkzeug aktiv', () => {
    const store = useKneeStore.getState()
    store.toggleTool('mLDFA')
    useKneeStore.getState().addDraftPoint(p(0, 0))
    expect(useKneeStore.getState().activeKind).toBe('mLDFA')
    expect(useKneeStore.getState().draftPoints).toHaveLength(1)
  })
})
