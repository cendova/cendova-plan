// Charakterisierungs-Tests der Fragment-Geometrie (Crop-Werkzeug Schaft).
import { describe, expect, it } from 'vitest'
import {
  fragmentPolygon,
  fragmentPunkt,
  polygonSchwerpunkt,
  punktImPolygon,
  verschiebungBetrag,
} from './cropGeometry'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]
/** Quadrat 0..10 — Schwerpunkt (5,5). */
const QUADRAT: Types.Point3[] = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)]

describe('Schwerpunkt', () => {
  it('trifft die Mitte eines Quadrats', () => {
    const s = polygonSchwerpunkt(QUADRAT)
    expect(s[0]).toBeCloseTo(5, 9)
    expect(s[1]).toBeCloseTo(5, 9)
  })

  it('gewichtet nach FLÄCHE, nicht nach Eckenzahl', () => {
    // Zusätzliche Ecken auf einer Kante dürfen den Schwerpunkt nicht ziehen.
    const mitExtraEcken: Types.Point3[] = [
      p(0, 0), p(2, 0), p(4, 0), p(6, 0), p(8, 0), p(10, 0),
      p(10, 10), p(0, 10),
    ]
    const s = polygonSchwerpunkt(mitExtraEcken)
    expect(s[0]).toBeCloseTo(5, 9)
    expect(s[1]).toBeCloseTo(5, 9)
  })

  it('faellt bei entarteten Polygonen auf den Mittelwert zurueck', () => {
    const kollinear: Types.Point3[] = [p(0, 0), p(5, 0), p(10, 0)]
    const s = polygonSchwerpunkt(kollinear)
    expect(Number.isFinite(s[0])).toBe(true)
    expect(s[0]).toBeCloseTo(5, 9)
  })

  it('bleibt bei leerer Eingabe definiert', () => {
    expect(polygonSchwerpunkt([])).toEqual([0, 0, 0])
  })
})

describe('Fragment-Transform', () => {
  it('laesst das Fragment ohne Drehung und Verschiebung liegen', () => {
    const r = fragmentPolygon(QUADRAT, 0, [0, 0])
    r.forEach((q, i) => {
      expect(q[0]).toBeCloseTo(QUADRAT[i][0], 9)
      expect(q[1]).toBeCloseTo(QUADRAT[i][1], 9)
    })
  })

  it('verschiebt starr — alle Punkte um denselben Vektor', () => {
    const r = fragmentPolygon(QUADRAT, 0, [3, -4])
    r.forEach((q, i) => {
      expect(q[0]).toBeCloseTo(QUADRAT[i][0] + 3, 9)
      expect(q[1]).toBeCloseTo(QUADRAT[i][1] - 4, 9)
    })
  })

  it('dreht um den SCHWERPUNKT, nicht um den Ursprung', () => {
    // 90°: Die Ecke (0,0) wandert bei Drehung um (5,5) nach (10,0).
    const r = fragmentPolygon(QUADRAT, 90, [0, 0])
    expect(r[0][0]).toBeCloseTo(10, 6)
    expect(r[0][1]).toBeCloseTo(0, 6)
  })

  it('haelt den Schwerpunkt beim Drehen fest', () => {
    const s = polygonSchwerpunkt(QUADRAT)
    const gedreht = polygonSchwerpunkt(fragmentPolygon(QUADRAT, 37, [0, 0]))
    expect(gedreht[0]).toBeCloseTo(s[0], 6)
    expect(gedreht[1]).toBeCloseTo(s[1], 6)
  })

  it('dreht erst und verschiebt dann — Drehung bleibt vom Versatz unabhaengig', () => {
    const ohneVersatz = fragmentPolygon(QUADRAT, 30, [0, 0])
    const mitVersatz = fragmentPolygon(QUADRAT, 30, [100, 50])
    ohneVersatz.forEach((q, i) => {
      expect(mitVersatz[i][0]).toBeCloseTo(q[0] + 100, 6)
      expect(mitVersatz[i][1]).toBeCloseTo(q[1] + 50, 6)
    })
  })

  it('ist laengentreu (starre Bewegung, keine Verzerrung)', () => {
    const r = fragmentPolygon(QUADRAT, 42, [7, -3])
    const originalKante = Math.hypot(
      QUADRAT[1][0] - QUADRAT[0][0],
      QUADRAT[1][1] - QUADRAT[0][1],
    )
    const neueKante = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1])
    expect(neueKante).toBeCloseTo(originalKante, 6)
  })

  it('haelt die z-Ebene fest', () => {
    const q = fragmentPunkt([1, 2, 7], [0, 0, 7], 45, [5, 5])
    expect(q[2]).toBe(7)
  })
})

describe('Treffererkennung', () => {
  it('erkennt Punkte innerhalb und ausserhalb', () => {
    expect(punktImPolygon([5, 5], QUADRAT)).toBe(true)
    expect(punktImPolygon([15, 5], QUADRAT)).toBe(false)
    expect(punktImPolygon([-1, -1], QUADRAT)).toBe(false)
  })

  it('funktioniert auch fuer konkave Formen', () => {
    // L-Form: die Einbuchtung liegt AUSSERHALB.
    const L: Types.Point3[] = [
      p(0, 0), p(10, 0), p(10, 4), p(4, 4), p(4, 10), p(0, 10),
    ]
    expect(punktImPolygon([2, 2], L)).toBe(true)
    expect(punktImPolygon([8, 8], L)).toBe(false)
  })
})

describe('Verschiebungs-Betrag', () => {
  it('rechnet Welt-Einheiten ueber die Kalibrierung in mm', () => {
    expect(verschiebungBetrag([3, 4], 1)).toBeCloseTo(5, 9)
    expect(verschiebungBetrag([3, 4], 0.5)).toBeCloseTo(2.5, 9)
  })
})
