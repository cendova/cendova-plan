// Charakterisierungs-Tests (R0): Hüft-Ausrichtungslogik.
// stemAxisAlignment hatte einen dokumentierten Seiten-Bug (L-Varus wurde
// als Valgus angezeigt) — beide Seiten werden hier für immer festgenagelt.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROPOSED_INCLINATION_DEG,
  computeAutoCupPosition,
  cupInclination,
  stemAxisAlignment,
} from './templates'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number, z = 0): Types.Point3 => [x, y, z]

describe('stemAxisAlignment (Seiten-Konvention — Bug-Historie!)', () => {
  it('RECHTS: rotation > Referenz = Varus, < Referenz = Valgus', () => {
    expect(stemAxisAlignment(94, 'R', 90)).toEqual({ degrees: 4, label: 'Varus' })
    expect(stemAxisAlignment(86, 'R', 90)).toEqual({ degrees: 4, label: 'Valgus' })
  })
  it('LINKS (gespiegelt): rotation < Referenz = Varus, > Referenz = Valgus', () => {
    expect(stemAxisAlignment(86, 'L', 90)).toEqual({ degrees: 4, label: 'Varus' })
    expect(stemAxisAlignment(94, 'L', 90)).toEqual({ degrees: 4, label: 'Valgus' })
  })
  it('Toleranz ±0.5° → Neutral mit 0°', () => {
    expect(stemAxisAlignment(90.3, 'R', 90)).toEqual({ degrees: 0, label: 'Neutral' })
    expect(stemAxisAlignment(89.7, 'L', 90)).toEqual({ degrees: 0, label: 'Neutral' })
  })
  it('normiert Wrap-around (Referenz 88°, rotation 92° → +4°, nicht +356°)', () => {
    const r = stemAxisAlignment(88 + 360 + 4, 'R', 88)
    expect(r.degrees).toBeCloseTo(4, 6)
    expect(r.label).toBe('Varus')
  })
})

describe('cupInclination', () => {
  it('43°-Öffnungsebene gegen horizontale Referenz → 43°', () => {
    const a = (43 * Math.PI) / 180
    expect(
      cupInclination(p(0, 0), p(Math.cos(a) * 10, Math.sin(a) * 10), p(0, 0), p(10, 0)),
    ).toBeCloseTo(43, 5)
  })
  it('stumpfe Messrichtung wird auf den spitzen Winkel gefaltet (137° → 43°)', () => {
    const a = (137 * Math.PI) / 180
    expect(
      cupInclination(p(0, 0), p(Math.cos(a) * 10, Math.sin(a) * 10), p(0, 0), p(10, 0)),
    ).toBeCloseTo(43, 5)
  })
})

describe('computeAutoCupPosition (Positionierungsvorschlag)', () => {
  it('Zielwert-Konstante = 43°', () => {
    expect(DEFAULT_PROPOSED_INCLINATION_DEG).toBe(43)
  })
  it('R-Hüfte, horizontale Referenz: Kaudalkante auf Tränenfigur-Höhe, Zentrum lateral', () => {
    const { center, rotationDeg } = computeAutoCupPosition(
      p(0, 0), [p(-10, 0), p(10, 0)], 'R', 1, 52,
    )
    // rotation = 0 + 270 + 0 − 47 = 223°
    expect(rotationDeg).toBeCloseTo(223, 6)
    // Charakterisierung der daraus folgenden Platzierung (r = 26):
    const rad = (223 * Math.PI) / 180
    const dirY = Math.sin(rad)
    const caudalSign = dirY >= 0 ? 1 : -1
    expect(center[0]).toBeCloseTo(-26 * 0.8, 6) // lateral = Bild-links bei R
    expect(center[1]).toBeCloseTo(0 - caudalSign * dirY * 26, 6)
    // Inklinations-Label aus dieser Rotation muss den Zielwert treffen:
    // |signedOffset| = 90 − 43 → cupInclination zeigt 43.
  })
  it('L-Hüfte spiegelt Rotation (+180) und laterale Richtung', () => {
    const { center, rotationDeg } = computeAutoCupPosition(
      p(0, 0), [p(-10, 0), p(10, 0)], 'L', 1, 52,
    )
    expect(rotationDeg).toBeCloseTo(0 + 270 + 180 + 47, 6)
    expect(center[0]).toBeCloseTo(26 * 0.8, 6) // lateral = Bild-rechts bei L
  })
})
