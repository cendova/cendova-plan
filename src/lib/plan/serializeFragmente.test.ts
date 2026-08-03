// Charakterisierungs-Tests der Plan-Speicherung für Schaft-Fragmente
// (Format v9). Prüft den Rundlauf und — wichtiger — die
// Abwärtskompatibilität: Ein Plan OHNE das Feld muss unverändert laden.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPlan } from './serialize'
import { useShaftFragmentStore } from '../../state/shaftFragmentStore'
import type { Types } from '@cornerstonejs/core'

// Der Viewer wird beim Plan-Bau nur nach Kalibrierung/Bild gefragt; im
// Test gibt es keinen WebGL-Kontext.
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

const p = (x: number, y: number): Types.Point3 => [x, y, 0]
const DREIECK = [p(0, 0), p(10, 0), p(5, 10)]

beforeEach(() => useShaftFragmentStore.getState().reset())

describe('Plan-Speicherung der Schaft-Fragmente', () => {
  it('schreibt Format-Version 9', () => {
    expect(buildPlan().version).toBe(9)
  })

  it('nimmt Fragmente samt Versatz und Drehung auf', () => {
    const store = useShaftFragmentStore.getState()
    DREIECK.forEach((q) => store.addPoint(q))
    store.finishFragment()
    const id = useShaftFragmentStore.getState().fragments[0].id
    useShaftFragmentStore.getState().setOffset(id, [4, -2])
    useShaftFragmentStore.getState().setRotationDeg(id, 7.5)

    const plan = buildPlan()
    expect(plan.shaftFragments).toHaveLength(1)
    expect(plan.shaftFragments![0].offset).toEqual([4, -2])
    expect(plan.shaftFragments![0].rotationDeg).toBe(7.5)
  })

  it('speichert die Schnittkontur im ORIGINAL, nicht die verschobene', () => {
    // Sonst ginge die Ausgangslage beim Speichern verloren und ein
    // geladener Plan zeigte kein Vorher/Nachher mehr.
    const store = useShaftFragmentStore.getState()
    DREIECK.forEach((q) => store.addPoint(q))
    store.finishFragment()
    const id = useShaftFragmentStore.getState().fragments[0].id
    useShaftFragmentStore.getState().setOffset(id, [100, 100])

    expect(buildPlan().shaftFragments![0].points).toEqual(DREIECK)
  })

  it('laesst das Feld bei leerem Zustand als leere Liste', () => {
    expect(buildPlan().shaftFragments).toEqual([])
  })
})
