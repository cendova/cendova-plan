// Charakterisierungs-Tests für den DTI (Deltoid Tuberosity Index):
// Verhältnis-Berechnung im Rezept + Einordnung in dti.ts.
//
// Bildkoordinaten: x wächst nach lateral, y nach kaudal. Die beiden
// Messstrecken liegen quer zum Humerusschaft.
import { describe, expect, it } from 'vitest'
import { getShoulderRecipe } from './recipes'
import { beurteileDti, DTI_SCHWELLE } from './dti'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]

const rezept = getShoulderRecipe('dti')!

/** DTI für waagerechte Strecken: außen `aussen` breit, innen `innen`. */
function dtiFuer(aussen: number, innen: number): string {
  const r = rezept.compute(
    [p(0, 0), p(aussen, 0), p((aussen - innen) / 2, 0), p((aussen + innen) / 2, 0)],
    1,
  )
  return r.values[0].value
}

describe('DTI-Rezept', () => {
  it('ist registriert und braucht keine Kalibrierung', () => {
    expect(rezept).toBeDefined()
    expect(rezept.needsCalibration).toBe(false)
    expect(rezept.steps).toHaveLength(4)
  })

  it('berechnet außen/innen', () => {
    expect(dtiFuer(28, 20)).toBe('1,40')
    expect(dtiFuer(30, 20)).toBe('1,50')
    expect(dtiFuer(24, 20)).toBe('1,20')
  })

  it('ist maßstabsunabhängig — der Faktor kürzt sich heraus', () => {
    const klein = rezept.compute(
      [p(0, 0), p(28, 0), p(4, 0), p(24, 0)],
      1,
    )
    const gross = rezept.compute(
      [p(0, 0), p(280, 0), p(40, 0), p(240, 0)],
      0.1,
    )
    expect(klein.values[0].value).toBe(gross.values[0].value)
  })

  it('projiziert die Markraum-Strecke auf die Kortikalis-Richtung', () => {
    // Schräg gesetzte Innenpunkte: die Querkomponente ist 20, die
    // Gesamtlänge wäre 25. Ohne Projektion käme 28/25 = 1,12 heraus.
    const r = rezept.compute([p(0, 0), p(28, 0), p(4, 0), p(24, 15)], 1)
    expect(r.values[0].value).toBe('1,40')
  })

  it('rechnet auch bei gedrehter Messlinie gleich', () => {
    // Dieselbe Geometrie um 30° gedreht.
    const rad = (30 * Math.PI) / 180
    const dreh = (x: number, y: number): Types.Point3 =>
      p(x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad))
    const r = rezept.compute([dreh(0, 0), dreh(28, 0), dreh(4, 0), dreh(24, 0)], 1)
    expect(r.values[0].value).toBe('1,40')
  })

  it('warnt statt zu dividieren, wenn der Markraum null breit ist', () => {
    const r = rezept.compute([p(0, 0), p(28, 0), p(10, 0), p(10, 0)], 1)
    expect(r.values[0].label).toContain('DTI')
    expect(r.values[0].value).toContain('null')
  })

  it('zeichnet beide Strecken, die innere gestrichelt', () => {
    const r = rezept.compute([p(0, 0), p(28, 0), p(4, 0), p(24, 0)], 1)
    expect(r.geometry.lines).toHaveLength(2)
    expect(r.geometry.lines[1].dashed).toBe(true)
  })
})

describe('DTI-Einordnung', () => {
  it('nennt unter 1,4 einen Hinweis auf niedrige Knochendichte', () => {
    expect(beurteileDti(1.33).bereich).toBe('niedrig')
    expect(beurteileDti(1.33).hinweis).toContain('niedrige lokale Knochendichte')
  })

  it('ordnet ab der Schwelle als unauffällig ein', () => {
    expect(beurteileDti(DTI_SCHWELLE).bereich).toBe('ueblich')
    expect(beurteileDti(1.54).bereich).toBe('ueblich')
  })

  it('hält die Schwelle bei 1,4 (Spross et al. 2015)', () => {
    expect(DTI_SCHWELLE).toBe(1.4)
  })
})
