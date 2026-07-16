// Charakterisierungs-Tests (R0): Beinlängendifferenz (LLD).
// Vorzeichen-Vertrag: positiv = rechts länger (Bild-y wächst nach kaudal).
import { describe, expect, it } from 'vitest'
import { computePreopLLDSigned, findPreopLLD, formatSignedLLD } from './lldCalculation'
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
    expect(formatSignedLLD(-6, 'R')).toBe('Rechts -6.0 mm (kürzer)')
    expect(formatSignedLLD(5, 'R')).toBe('Rechts +5.0 mm (länger)')
  })
  it('L-Perspektive spiegelt das Vorzeichen: −6 → „Links +6.0 mm (länger)"', () => {
    expect(formatSignedLLD(-6, 'L')).toBe('Links +6.0 mm (länger)')
  })
  it('unterhalb 0.05 mm → „Ausgeglichen"', () => {
    expect(formatSignedLLD(0.02)).toBe('Ausgeglichen')
    expect(formatSignedLLD(-0.04)).toBe('Ausgeglichen')
  })
})
