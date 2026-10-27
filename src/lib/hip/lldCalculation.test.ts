// Charakterisierungs-Tests (R0): Beinlängendifferenz (LLD).
// Vorzeichen-Vertrag: positiv = rechts länger (Bild-y wächst nach kaudal).
import { describe, expect, it } from 'vitest'
import {
  computePreopLLDSigned,
  findPreopLLD,
  formatSignedLLD,
  korrekturKastenZeilen,
} from './lldCalculation'
import type { HipMeasurement } from '../../state/hipStore'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number, z = 0): Types.Point3 => [x, y, z]

function lldMeasurement(points: Types.Point3[]): HipMeasurement {
  return {
    id: 'test-lld-1',
    kind: 'lld',
    points,
    visible: true,
  } as HipMeasurement
}

describe('computePreopLLDSigned', () => {
  it('rechter Trochanter 6 mm kaudaler → +6 (rechts länger)', () => {
    // Referenzlinie horizontal; y wächst nach kaudal (Bild-Konvention).
    const m = lldMeasurement([p(0, 0), p(10, 0), p(2, 50), p(8, 44)])
    expect(computePreopLLDSigned(m, 1)).toBeCloseTo(6, 6)
  })
  it('skaliert mit mmPerWorldUnit', () => {
    const m = lldMeasurement([p(0, 0), p(10, 0), p(2, 50), p(8, 44)])
    expect(computePreopLLDSigned(m, 0.5)).toBeCloseTo(3, 6)
  })
  it('gekippte Referenzlinie: es zählt der Lot-Anteil', () => {
    // Referenz 45°: n = normierte Linkssenkrechte mit n.y ≥ 0.
    const m = lldMeasurement([p(0, 0), p(10, 10), p(0, 10), p(10, 0)])
    // sRight = dot((0,10), n), sLeft = dot((10,0), n) mit n = (−1,1)/√2
    // → (10 − (−10))/√2 … Charakterisierung:
    expect(computePreopLLDSigned(m, 1)).toBeCloseTo(10 * Math.SQRT2, 4)
  })
  it('unvollständige Messung → null', () => {
    const m = lldMeasurement([p(0, 0), p(10, 0), p(2, 50)])
    expect(computePreopLLDSigned(m, 1)).toBeNull()
  })
})

describe('findPreopLLD', () => {
  it('nimmt die JÜNGSTE sichtbare LLD-Messung (von hinten gesucht)', () => {
    const older = lldMeasurement([p(0, 0), p(10, 0), p(2, 50), p(8, 44)]) // +6
    const newer = lldMeasurement([p(0, 0), p(10, 0), p(2, 40), p(8, 44)]) // −4
    expect(findPreopLLD([older, newer], 1)).toBeCloseTo(-4, 6)
    const hiddenNewer = { ...newer, visible: false } as HipMeasurement
    expect(findPreopLLD([older, hiddenNewer], 1)).toBeCloseTo(6, 6)
  })
  it('leer → null', () => {
    expect(findPreopLLD([], 1)).toBeNull()
  })
})

describe('formatSignedLLD (klinischer Berichtstext)', () => {
  it('R-Perspektive: −6 → „Rechts -6.0 mm (kürzer)", +5 → „Rechts +5.0 mm (länger)"', () => {
    expect(formatSignedLLD(-6, 'R')).toBe('Rechts \u22126,0\u00a0mm (kürzer)')
    expect(formatSignedLLD(5, 'R')).toBe('Rechts +5,0\u00a0mm (länger)')
  })
  it('L-Perspektive spiegelt das Vorzeichen: −6 → „Links +6.0 mm (länger)"', () => {
    expect(formatSignedLLD(-6, 'L')).toBe('Links +6,0\u00a0mm (länger)')
  })
  it('unterhalb 0.05 mm → „Ausgeglichen"', () => {
    expect(formatSignedLLD(0.02)).toBe('Ausgeglichen')
    expect(formatSignedLLD(-0.04)).toBe('Ausgeglichen')
  })
})

describe('korrekturKastenZeilen (Kasten im Bild)', () => {
  const NB = '\u00a0'
  // Fall aus dem Realtest 27.10.2026: beidseits geplant, rechts 0,0 mm,
  // links +5,2 mm; prä-OP rechts +5,5 mm länger → post-OP rechts +0,3 mm.
  it('zeigt bei beidseitiger Planung BEIDE Seiten und die Post-OP-Differenz', () => {
    const z = korrekturKastenZeilen(5.5, {
      totalSigned: 0 - 5.2,
      perSide: [
        { side: 'R', mm: 0, offsetMm: 0 },
        { side: 'L', mm: 5.2, offsetMm: 0 },
      ],
    })!
    expect(z[0]).toBe('Korrektur')
    expect(z[1]).toMatch(/^Rechts: \+?0,00/)
    expect(z[2]).toBe(`Links: +0,52${NB}cm · Offset 0,0${NB}mm`)
    expect(z[3]).toBe(`Differenz post-OP: Rechts +0,03${NB}cm`)
  })

  it('zeigt bei einseitiger Planung die Seite im Titel', () => {
    const z = korrekturKastenZeilen(-8, {
      totalSigned: -7,
      perSide: [{ side: 'L', mm: 7, offsetMm: -3.4 }],
    })!
    expect(z[0]).toBe('Korrektur links')
    expect(z[1]).toBe(`Beinlänge: +0,70${NB}cm`)
    expect(z[2]).toMatch(/^Offset: .3,4/)
    // prä-OP links 0,8 cm länger, Korrektur verlängert links um 0,7 → links 1,5 länger
    expect(z[3]).toBe(`Differenz post-OP: Links +1,50${NB}cm`)
  })

  it('lässt die Differenz weg, wenn keine prä-OP-Messung da ist', () => {
    const z = korrekturKastenZeilen(null, { totalSigned: 4, perSide: [{ side: 'R', mm: 4, offsetMm: 1 }] })!
    expect(z).toHaveLength(3)
  })

  it('liefert null ohne geplante Seite', () => {
    expect(korrekturKastenZeilen(3, { totalSigned: 0, perSide: [] })).toBeNull()
  })
})
