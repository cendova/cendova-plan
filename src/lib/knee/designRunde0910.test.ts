// Design-Runde Knie-AP 09.10.2026: Größenvorwahl der Tibia aus dem Femur
// und Farbkodierung der tibialen Resektionstiefe.
import { describe, expect, it } from 'vitest'
import { vorwahlGroesseAus } from './groessenVorwahl'
import {
  RESEKTION_GRUEN,
  RESEKTION_ORANGE,
  RESEKTION_ROT,
  RESEKTION_WEISS,
  resektionsFarbe,
} from './resektionsFarbe'

const tab = (...sizes: string[]) => sizes.map((size) => ({ size }))

describe('vorwahlGroesseAus', () => {
  it('nimmt die gleiche Größenbezeichnung aus der Tibia-Tabelle', () => {
    const femur = tab('1', '2', '3', '4', '5', '6', '7', '8')
    const tibia = tab('1', '2', '3', '4', '5', '6', '7', '8')
    expect(vorwahlGroesseAus(femur, 4, tibia)).toBe(4)
  })

  it('findet die Bezeichnung auch bei versetzten Tabellen', () => {
    const femur = tab('3', '4', '5', '6')
    const tibia = tab('1', '2', '3', '4', '5', '6')
    expect(vorwahlGroesseAus(femur, 1, tibia)).toBe(3) // „4"
  })

  it('ignoriert Narrow-Kennungen beim Abgleich', () => {
    const femur = tab('3', '3N', '4', '4N')
    const tibia = tab('1', '2', '3', '4')
    expect(vorwahlGroesseAus(femur, 1, tibia)).toBe(2) // „3N" → „3"
  })

  it('fällt ohne Treffer auf denselben Index zurück, begrenzt auf die Tabelle', () => {
    const femur = tab('A', 'B', 'C', 'D', 'E')
    const tibia = tab('S', 'M', 'L')
    expect(vorwahlGroesseAus(femur, 1, tibia)).toBe(1)
    expect(vorwahlGroesseAus(femur, 4, tibia)).toBe(2)
  })

  it('liefert 0 bei leerer Tibia-Tabelle oder fehlendem Femur-Eintrag', () => {
    expect(vorwahlGroesseAus(tab('1'), 0, [])).toBe(0)
    expect(vorwahlGroesseAus([], 3, tab('1', '2'))).toBe(1) // Index begrenzt
  })
})

describe('resektionsFarbe', () => {
  it('stuft nach den klinischen Grenzen', () => {
    expect(resektionsFarbe(0)).toBe(RESEKTION_WEISS)
    expect(resektionsFarbe(7.0)).toBe(RESEKTION_WEISS)
    expect(resektionsFarbe(7.04)).toBe(RESEKTION_WEISS) // zeigt „7,0"
    expect(resektionsFarbe(7.1)).toBe(RESEKTION_GRUEN)
    expect(resektionsFarbe(10.5)).toBe(RESEKTION_GRUEN)
    expect(resektionsFarbe(10.6)).toBe(RESEKTION_ORANGE)
    expect(resektionsFarbe(11.9)).toBe(RESEKTION_ORANGE)
    expect(resektionsFarbe(11.96)).toBe(RESEKTION_ROT) // zeigt „12,0"
    expect(resektionsFarbe(12.0)).toBe(RESEKTION_ROT)
    expect(resektionsFarbe(15.0)).toBe(RESEKTION_ROT)
    expect(resektionsFarbe(22)).toBe(RESEKTION_ROT)
  })

  it('ist bei negativen oder unbrauchbaren Werten weiß', () => {
    expect(resektionsFarbe(-3)).toBe(RESEKTION_WEISS)
    expect(resektionsFarbe(Number.NaN)).toBe(RESEKTION_WEISS)
  })
})
