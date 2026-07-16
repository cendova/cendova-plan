// Charakterisierungs-Tests (R0): CPAK-Klassifikation nach MacDessi 2021.
// Diese Konventionen hatten historisch Inversions-Bugs (Varus-Vorzeichen,
// Apex distal/proximal) — hier werden sie endgültig festgenagelt.
import { describe, expect, it } from 'vitest'
import {
  CPAK_AHKA_THRESHOLDS,
  CPAK_JLO_THRESHOLDS,
  computeCpak,
} from './cpak'

describe('MacDessi-Schwellen (Konstanten)', () => {
  it('aHKA: Varus < −2°, Valgus > +2° · JLO: Apex distal < 177°, proximal > 183°', () => {
    expect(CPAK_AHKA_THRESHOLDS).toEqual({ varusAt: -2, valgusAt: 2 })
    expect(CPAK_JLO_THRESHOLDS).toEqual({ apexDistalAt: 177, apexProximalAt: 183 })
  })
})

describe('computeCpak — die 9 Typen', () => {
  it('Typ I: Varus + Apex distal (mLDFA 88 / mMPTA 84)', () => {
    const r = computeCpak(88, 84)
    expect(r.aHKA).toBeCloseTo(-4, 6)
    expect(r.JLO).toBeCloseTo(172, 6)
    expect(r.alignment).toBe('Varus')
    expect(r.jlo).toBe('Apex distal')
    expect(r.type).toBe('I')
  })
  it('Typ II: Neutral + Apex distal (87/87)', () => {
    const r = computeCpak(87, 87)
    expect(r.aHKA).toBe(0)
    expect(r.JLO).toBe(174)
    expect(r.type).toBe('II')
  })
  it('Typ V: Neutral + Neutral (90/90)', () => {
    expect(computeCpak(90, 90).type).toBe('V')
  })
  it('Typ VI: Valgus + neutrale JLO (87/93)', () => {
    const r = computeCpak(87, 93)
    expect(r.aHKA).toBeCloseTo(6, 6)
    expect(r.alignment).toBe('Valgus')
    expect(r.type).toBe('VI')
  })
  it('Typ VIII: Neutral + Apex proximal (93/93)', () => {
    const r = computeCpak(93, 93)
    expect(r.JLO).toBe(186)
    expect(r.jlo).toBe('Apex proximal')
    expect(r.type).toBe('VIII')
  })
})

describe('Schwellen-Ränder (exakte Grenze zählt als Neutral)', () => {
  it('aHKA = ±2.0 → Neutral; knapp darüber kippt', () => {
    expect(computeCpak(90, 88).alignment).toBe('Neutral') // aHKA = −2.0
    expect(computeCpak(90, 87.9).alignment).toBe('Varus') // aHKA = −2.1
    expect(computeCpak(88, 90).alignment).toBe('Neutral') // aHKA = +2.0
    expect(computeCpak(87.9, 90).alignment).toBe('Valgus') // aHKA = +2.1
  })
  it('JLO = 177/183 → Neutral; knapp außerhalb kippt', () => {
    expect(computeCpak(88.5, 88.5).jlo).toBe('Neutral') // JLO = 177.0
    expect(computeCpak(88.4, 88.4).jlo).toBe('Apex distal') // 176.8
    expect(computeCpak(91.5, 91.5).jlo).toBe('Neutral') // 183.0
    expect(computeCpak(91.6, 91.6).jlo).toBe('Apex proximal') // 183.2
  })
})
