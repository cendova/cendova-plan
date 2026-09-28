import { beforeEach, describe, expect, it } from 'vitest'
import { benoetigteSlots, useKneeOsteotomieStore } from './kneeOsteotomieStore'

const st = () => useKneeOsteotomieStore.getState()

describe('kneeOsteotomieStore', () => {
  beforeEach(() => st().reset())

  it('Slot-Reihenfolge: Femur vor Tibia, Scharnier vor Start', () => {
    expect(benoetigteSlots('htoOeffnend')).toEqual(['tibiaScharnier', 'tibiaStart'])
    expect(benoetigteSlots('dfoSchliessend')).toEqual(['femurScharnier', 'femurStart'])
    expect(benoetigteSlots('dlo')).toEqual([
      'femurScharnier',
      'femurStart',
      'tibiaScharnier',
      'tibiaStart',
    ])
  })

  it('starte legt den Plan an und führt Punkt für Punkt durch das Setzen', () => {
    st().starte('htoOeffnend', 62.5)
    expect(st().setzen).toBe('tibiaScharnier')
    st().setzePunkt([1, 2, 0])
    expect(st().setzen).toBe('tibiaStart')
    st().setzePunkt([3, 4, 0])
    expect(st().setzen).toBeNull()
    expect(st().plan!.tibiaScharnier).toEqual([1, 2, 0])
    expect(st().plan!.tibiaStart).toEqual([3, 4, 0])
  })

  it('zurueck nimmt den letzten Punkt zurück', () => {
    st().starte('htoOeffnend', 62.5)
    st().setzePunkt([1, 2, 0])
    st().zurueck()
    expect(st().plan!.tibiaScharnier).toBeNull()
    expect(st().setzen).toBe('tibiaScharnier')
  })

  it('Typwechsel behält vorhandene Punkte, springt aber nicht ungefragt ins Setzen', () => {
    st().starte('htoOeffnend', 62.5)
    st().setzePunkt([1, 2, 0])
    st().setzePunkt([3, 4, 0])
    st().setTyp('dlo')
    expect(st().setzen).toBeNull()
    expect(st().plan!.tibiaStart).toEqual([3, 4, 0])
  })

  it('punkteNeu leert alle Punkte und startet beim ersten Slot', () => {
    st().starte('dlo', 62.5)
    st().setzePunkt([1, 1, 0])
    st().punkteNeu()
    expect(st().plan!.femurScharnier).toBeNull()
    expect(st().setzen).toBe('femurScharnier')
  })
})
