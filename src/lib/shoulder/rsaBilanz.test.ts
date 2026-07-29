// Charakterisierungs-Tests der RSA-Bilanz-Winkel (Schritt 5): DSA und LSA.
//
// Beide messen gegen dieselbe Referenz — die Skapulaspina-Achse — mit dem
// Scheitel an der Akromion-Spitze. Sie sind ausschliesslich fuer die
// INVERSE Prothese vorgesehen; das prueft der onlyFor-Test unten mit.
import { describe, expect, it } from 'vitest'
import {
  getShoulderRecipe,
  recipesForProsthesis,
  AVAILABLE_SHOULDER_RECIPES,
} from './recipes'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]
const zahl = (s: string) => Number(s.replace('°', '').replace(',', '.'))

// Spina waagerecht von medial (-100,0) nach lateral (0,0);
// Scheitel ist die Akromion-Spitze bei (0,0).
const SPINA_MED = p(-100, 0)
const SPINA_LAT = p(0, 0)

describe('DSA (Distalisierung)', () => {
  const rez = getShoulderRecipe('dsa')!

  it('ist nur fuer die inverse Prothese vorgesehen', () => {
    expect(rez.onlyFor).toBe('reverse')
    expect(rez.needsCalibration).toBe(false)
    expect(rez.steps).toHaveLength(3)
  })

  it('misst den Winkel an der Akromion-Spitze', () => {
    // Tuberculum genau kaudal der Spitze -> 90 Grad zur waagerechten Spina.
    const r = rez.compute([SPINA_MED, SPINA_LAT, p(0, 100)], 1)
    expect(r.values[0].label).toBe('DSA')
    expect(zahl(r.values[0].value)).toBeCloseTo(90, 1)
  })

  it('wird kleiner, je weiter medial-kaudal das Tuberculum liegt', () => {
    const steil = zahl(rez.compute([SPINA_MED, SPINA_LAT, p(0, 100)], 1).values[0].value)
    const flach = zahl(rez.compute([SPINA_MED, SPINA_LAT, p(-100, 100)], 1).values[0].value)
    expect(flach).toBeLessThan(steil)
    expect(flach).toBeCloseTo(45, 1)
  })

  it('ist laengenunabhaengig', () => {
    const kurz = rez.compute([p(-20, 0), SPINA_LAT, p(0, 20)], 1)
    const lang = rez.compute([p(-400, 0), SPINA_LAT, p(0, 400)], 1)
    expect(kurz.values[0].value).toBe(lang.values[0].value)
  })

  it('nennt die belegte Richtung statt erfundener Zielbereiche', () => {
    const r = rez.compute([SPINA_MED, SPINA_LAT, p(0, 100)], 1)
    expect(r.values[1].label).toBe('Referenz')
    expect(r.values[1].value).toContain('Distalisierung')
    // Keine Schwellen behaupten, fuer die es keinen Beleg gibt.
    expect(r.values[1].value).not.toMatch(/\d+\s*°|\d+\s*-\s*\d+/)
  })

  it('zeichnet Spina-Achse und Messlinie ab der Spitze', () => {
    const r = rez.compute([SPINA_MED, SPINA_LAT, p(0, 100)], 1)
    expect(r.geometry.lines).toHaveLength(2)
    expect(r.geometry.lines[1].from).toEqual(SPINA_LAT)
    expect(r.geometry.labels[0].at).toEqual(SPINA_LAT)
  })
})

describe('LSA (Lateralisierung)', () => {
  const rez = getShoulderRecipe('lsa')!

  it('ist nur fuer die inverse Prothese vorgesehen', () => {
    expect(rez.onlyFor).toBe('reverse')
    expect(rez.steps).toHaveLength(3)
  })

  it('misst den Winkel an der Akromion-Spitze', () => {
    const r = rez.compute([SPINA_MED, SPINA_LAT, p(0, 100)], 1)
    expect(r.values[0].label).toBe('LSA')
    expect(zahl(r.values[0].value)).toBeCloseTo(90, 1)
  })

  it('nennt die belegte Richtung ohne Zielbereich', () => {
    const r = rez.compute([SPINA_MED, SPINA_LAT, p(0, 100)], 1)
    expect(r.values[1].value).toContain('Lateralisierung')
    expect(r.values[1].value).not.toMatch(/\d+\s*°|\d+\s*-\s*\d+/)
  })
})

describe('Angebot nach Prothesentyp', () => {
  it('bietet die Bilanz-Winkel NUR bei der inversen Prothese an', () => {
    const anatomisch = recipesForProsthesis('anatomic').map((r) => r.kind)
    const invers = recipesForProsthesis('reverse').map((r) => r.kind)
    expect(anatomisch).not.toContain('dsa')
    expect(anatomisch).not.toContain('lsa')
    expect(invers).toContain('dsa')
    expect(invers).toContain('lsa')
  })

  it('bietet die uebrigen Messungen bei BEIDEN Typen an', () => {
    const anatomisch = recipesForProsthesis('anatomic').map((r) => r.kind)
    const invers = recipesForProsthesis('reverse').map((r) => r.kind)
    for (const k of ['csa', 'acromionIndex', 'glenoidInclination', 'neckShaftAngle', 'ahd', 'humeralHead']) {
      expect(anatomisch).toContain(k)
      expect(invers).toContain(k)
    }
  })

  it('hat fuer JEDEN deklarierten Messtyp ein Rezept', () => {
    // Nach Schritt 5 ist die Registry vollstaendig — kein Typ ohne Umsetzung.
    const alle = AVAILABLE_SHOULDER_RECIPES.map((r) => r.kind).sort()
    expect(alle).toEqual(
      [
        'acromionIndex',
        'ahd',
        'csa',
        'dsa',
        'glenoidInclination',
        'humeralHead',
        'lsa',
        'neckShaftAngle',
      ].sort(),
    )
  })
})
