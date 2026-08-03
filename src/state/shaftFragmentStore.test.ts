// Charakterisierungs-Tests des Schaft-Fragment-Stores (Crop-Werkzeug).
import { beforeEach, describe, expect, it } from 'vitest'
import { useShaftFragmentStore } from './shaftFragmentStore'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]
const DREIECK = [p(0, 0), p(10, 0), p(5, 10)]

function setzePunkte(pts: Types.Point3[]) {
  const s = useShaftFragmentStore.getState()
  pts.forEach((q) => s.addPoint(q))
}

beforeEach(() => useShaftFragmentStore.getState().reset())

describe('Schnitt anlegen', () => {
  it('braucht mindestens drei Punkte', () => {
    setzePunkte([p(0, 0), p(10, 0)])
    useShaftFragmentStore.getState().finishFragment()
    expect(useShaftFragmentStore.getState().fragments).toHaveLength(0)
    // Der angefangene Schnitt bleibt erhalten — nichts geht verloren.
    expect(useShaftFragmentStore.getState().draftPoints).toHaveLength(2)
  })

  it('legt aus drei Punkten ein Fragment an und waehlt es aus', () => {
    setzePunkte(DREIECK)
    useShaftFragmentStore.getState().finishFragment()
    const s = useShaftFragmentStore.getState()
    expect(s.fragments).toHaveLength(1)
    expect(s.draftPoints).toHaveLength(0)
    expect(s.selectedId).toBe(s.fragments[0].id)
  })

  it('startet unverschoben und ungedreht', () => {
    setzePunkte(DREIECK)
    useShaftFragmentStore.getState().finishFragment()
    const f = useShaftFragmentStore.getState().fragments[0]
    expect(f.offset).toEqual([0, 0])
    expect(f.rotationDeg).toBe(0)
    expect(f.visible).toBe(true)
  })

  it('nimmt den letzten Punkt zurueck', () => {
    setzePunkte(DREIECK)
    useShaftFragmentStore.getState().removeLastPoint()
    expect(useShaftFragmentStore.getState().draftPoints).toHaveLength(2)
  })

  it('sichert einen ausreichenden Schnitt beim Abschalten des Werkzeugs', () => {
    useShaftFragmentStore.getState().setPlacing(true)
    setzePunkte(DREIECK)
    useShaftFragmentStore.getState().setPlacing(false)
    expect(useShaftFragmentStore.getState().fragments).toHaveLength(1)
  })

  it('verwirft einen zu kleinen Schnitt beim Abschalten', () => {
    useShaftFragmentStore.getState().setPlacing(true)
    setzePunkte([p(0, 0), p(1, 1)])
    useShaftFragmentStore.getState().setPlacing(false)
    const s = useShaftFragmentStore.getState()
    expect(s.fragments).toHaveLength(0)
    expect(s.draftPoints).toHaveLength(0)
  })
})

describe('Fragment bewegen', () => {
  function fragment() {
    setzePunkte(DREIECK)
    useShaftFragmentStore.getState().finishFragment()
    return useShaftFragmentStore.getState().fragments[0].id
  }

  it('speichert Versatz und Drehung', () => {
    const id = fragment()
    useShaftFragmentStore.getState().setOffset(id, [4, -2])
    useShaftFragmentStore.getState().setRotationDeg(id, 12.5)
    const f = useShaftFragmentStore.getState().fragments[0]
    expect(f.offset).toEqual([4, -2])
    expect(f.rotationDeg).toBe(12.5)
  })

  it('laesst die Schnittkontur beim Verschieben unveraendert', () => {
    // Die Kontur beschreibt den Schnitt im ORIGINAL — sie darf sich nie
    // mitbewegen, sonst waere die Ausgangslage verloren.
    const id = fragment()
    useShaftFragmentStore.getState().setOffset(id, [50, 50])
    expect(useShaftFragmentStore.getState().fragments[0].points).toEqual(DREIECK)
  })

  it('entfernt ein Fragment und hebt dessen Auswahl auf', () => {
    const id = fragment()
    useShaftFragmentStore.getState().remove(id)
    const s = useShaftFragmentStore.getState()
    expect(s.fragments).toHaveLength(0)
    expect(s.selectedId).toBeNull()
  })

  it('schaltet die Sichtbarkeit einzeln', () => {
    const id = fragment()
    useShaftFragmentStore.getState().setVisible(id, false)
    expect(useShaftFragmentStore.getState().fragments[0].visible).toBe(false)
  })
})
