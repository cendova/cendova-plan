// Charakterisierungs-Tests (R0): Knie-Geometrie — Vorzeichen- und
// Winkel-Konventionen einfrieren (Mikulicz-Vorzeichen, spitze Winkel).
import { describe, expect, it } from 'vitest'
import {
  acuteAngleBetweenLines,
  lineLineIntersection2D,
  perpendicularThroughMid,
  signedPerpDistance,
} from './geometry'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number, z = 0): Types.Point3 => [x, y, z]

describe('signedPerpDistance (Mikulicz-Vorzeichen)', () => {
  it('Konvention: Punkt bei +y zur +x-Geraden → NEGATIV (Ist-Zustand)', () => {
    expect(signedPerpDistance(p(5, 1), p(0, 0), p(10, 0))).toBeCloseTo(-1, 6)
    expect(signedPerpDistance(p(5, -1), p(0, 0), p(10, 0))).toBeCloseTo(1, 6)
    expect(signedPerpDistance(p(5, 0), p(0, 0), p(10, 0))).toBeCloseTo(0, 6)
  })
  it('degenerierte Gerade (a == b) → 0', () => {
    expect(signedPerpDistance(p(3, 4), p(1, 1), p(1, 1))).toBe(0)
  })
})

describe('acuteAngleBetweenLines (mLDFA/mMPTA-Grundlage)', () => {
  it('faltet stumpfe Winkel auf den spitzen (120° → 60°)', () => {
    const dir120 = p(Math.cos((120 * Math.PI) / 180), Math.sin((120 * Math.PI) / 180))
    expect(
      acuteAngleBetweenLines(p(0, 0), p(1, 0), p(0, 0), dir120),
    ).toBeCloseTo(60, 5)
  })
  it('87°-Tangente bleibt 87° (klinischer Normalfall)', () => {
    const dir87 = p(Math.cos((87 * Math.PI) / 180), Math.sin((87 * Math.PI) / 180))
    expect(
      acuteAngleBetweenLines(p(0, 0), p(1, 0), p(0, 0), dir87),
    ).toBeCloseTo(87, 5)
  })
})

describe('perpendicularThroughMid', () => {
  it('liefert die Mittelsenkrechte mit halber Länge je Seite', () => {
    const { from, to } = perpendicularThroughMid(p(0, 0), p(2, 0), 3)
    expect(from[0]).toBeCloseTo(1, 6)
    expect(from[1]).toBeCloseTo(-3, 6)
    expect(to[0]).toBeCloseTo(1, 6)
    expect(to[1]).toBeCloseTo(3, 6)
  })
})

describe('lineLineIntersection2D', () => {
  it('schneidet zwei orthogonale Geraden im erwarteten Punkt', () => {
    const s = lineLineIntersection2D(p(0, 0), p(10, 0), p(5, -5), p(5, 5))
    expect(s).not.toBeNull()
    expect(s![0]).toBeCloseTo(5, 6)
    expect(s![1]).toBeCloseTo(0, 6)
  })
  it('parallele Geraden → null', () => {
    expect(lineLineIntersection2D(p(0, 0), p(10, 0), p(0, 1), p(10, 1))).toBeNull()
  })
})
