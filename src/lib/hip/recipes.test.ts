// Charakterisierungs-Tests der Hüft-Rezepte — Start mit dem Osteotomie-
// Planer (Debug-Befund H3: der Wert ist die Kalkar→Trochanter-minor-
// Distanz der GESTRICHELTEN Strecke; er wurde als Länge der roten
// Osteotomie-Linie fehlgelesen. Kalibrierung war korrekt.)
import { describe, expect, it } from 'vitest'
import { getRecipe } from './recipes'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number, z = 0): Types.Point3 => [x, y, z]

describe('osteotomy (Resektionshöhe → Trochanter minor)', () => {
  const recipe = getRecipe('osteotomy')!

  it('misst die Kalkar→TM-Distanz (gestrichelte Strecke), nicht die rote Linie', () => {
    // TM-Spitze im Ursprung; Kalkar-Ende 34.3 WU darüber; rote Linie 19.3 WU.
    const r = recipe.compute([p(0, 0), p(-19.3, -34.3), p(0, -34.3)], 1)
    expect(r.values[0].value).toBe('3,43 cm') // Screenshot-Reproduktion
    // Label trägt jetzt den Kontext „→ TM" und sitzt auf der Mess-Strecke.
    expect(r.geometry.labels[0].text).toBe('→ TM 3,43 cm')
    expect(r.geometry.labels[0].at).toEqual([0, -17.15, 0])
  })

  it('Wert hängt NICHT vom Start der roten Osteotomie-Linie ab', () => {
    const a = recipe.compute([p(0, 0), p(-19.3, -34.3), p(0, -34.3)], 1)
    const b = recipe.compute([p(0, 0), p(-99, -34.3), p(0, -34.3)], 1)
    expect(a.values[0].value).toBe(b.values[0].value)
  })

  it('wendet mmPerWorldUnit genau einmal an', () => {
    // dist(calcar (3,−4) → TM (0,0)) = 5 WU · factor 2 = 10 mm = 1,00 cm.
    const r = recipe.compute([p(0, 0), p(-5, -4), p(3, -4)], 2)
    expect(r.values[0].value).toBe('1,00 cm')
  })
})
