// Charakterisierungs-Tests (R0, siehe docs/architektur-audit.md):
// frieren das HEUTIGE Verhalten der Geometrie-Basisfunktionen ein.
// Jede Verhaltensänderung muss hier bewusst nachgezogen werden.
import { describe, expect, it } from 'vitest'
import {
  add,
  angleAtVertex,
  angleBetweenLines,
  angleBetweenVectors,
  caudalDistance,
  circleFrom3Points,
  closestPointOnLine,
  dist,
  dot,
  len,
  midpoint,
  perpendicularDistance,
  refLineFrame,
  scale,
  sub,
  unit,
} from './geometry'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number, z = 0): Types.Point3 => [x, y, z]

describe('Vektor-Basis', () => {
  it('sub/add/scale/len/dist/dot/midpoint', () => {
    expect(sub(p(3, 5), p(1, 2))).toEqual([2, 3, 0])
    expect(add(p(1, 2), p(3, 4))).toEqual([4, 6, 0])
    expect(scale(p(1, -2), 3)).toEqual([3, -6, 0])
    expect(len(p(3, 4))).toBe(5)
    expect(dist(p(0, 0), p(3, 4))).toBe(5)
    expect(dot(p(1, 2, 3), p(4, 5, 6))).toBe(32)
    expect(midpoint(p(0, 0), p(4, 6))).toEqual([2, 3, 0])
  })
})

describe('Winkel', () => {
  it('angleBetweenVectors: orthogonal = 90°, parallel = 0°, entgegen = 180°', () => {
    expect(angleBetweenVectors(p(1, 0), p(0, 1))).toBeCloseTo(90, 6)
    expect(angleBetweenVectors(p(2, 0), p(5, 0))).toBeCloseTo(0, 6)
    expect(angleBetweenVectors(p(1, 0), p(-1, 0))).toBeCloseTo(180, 6)
    // Degenerierter Vektor → 0 (dokumentiertes Verhalten).
    expect(angleBetweenVectors(p(0, 0), p(1, 0))).toBe(0)
  })

  it('angleBetweenLines misst über die gezeichnete Richtung (0–180°)', () => {
    // Linie A: →x, Linie B: 120°-Richtung → 120 (nicht 60).
    const b = p(Math.cos((120 * Math.PI) / 180), Math.sin((120 * Math.PI) / 180))
    expect(angleBetweenLines(p(0, 0), p(1, 0), p(0, 0), b)).toBeCloseTo(120, 5)
  })
})

describe('Lot & Projektion', () => {
  it('perpendicularDistance: Punkt über horizontaler Geraden', () => {
    expect(perpendicularDistance(p(5, 7), p(0, 0), p(10, 0))).toBeCloseTo(7, 6)
    // Entartete Gerade (l1 == l2) → Abstand zum Punkt.
    expect(perpendicularDistance(p(3, 4), p(0, 0), p(0, 0))).toBeCloseTo(5, 6)
  })

  it('closestPointOnLine: Lotfußpunkt, auch außerhalb des Segments', () => {
    expect(closestPointOnLine(p(5, 7), p(0, 0), p(10, 0))).toEqual([5, 0, 0])
    expect(closestPointOnLine(p(-3, 2), p(0, 0), p(10, 0))).toEqual([-3, 0, 0])
  })
})

describe('unit / angleAtVertex (R3 — geteilte Basis)', () => {
  it('unit normiert; Nullvektor bleibt [0,0,0]', () => {
    const u = unit(p(3, 4))
    expect(u[0]).toBeCloseTo(0.6, 12)
    expect(u[1]).toBeCloseTo(0.8, 12)
    expect(u[2]).toBe(0)
    expect(len(u)).toBeCloseTo(1, 12)
    expect(unit(p(0, 0))).toEqual([0, 0, 0])
  })
  it('angleAtVertex: rechter Winkel am Scheitel, degeneriert → 0', () => {
    expect(angleAtVertex(p(1, 0), p(0, 0), p(0, 1))).toBeCloseTo(90, 6)
    expect(angleAtVertex(p(5, 5), p(5, 5), p(1, 0))).toBe(0)
  })
})

describe('refLineFrame / caudalDistance (R3 — DIE LLD-Projektion, Befund D3)', () => {
  it('horizontale Referenz: u nach +x, n nach kaudal (+y)', () => {
    const { u, n } = refLineFrame(p(0, 0), p(10, 0))
    expect(u).toEqual([1, 0, 0])
    expect(n[0]).toBeCloseTo(0, 12) // -0 durch [-u1, u0]-Rotation
    expect(n[1]).toBe(1)
    expect(n[2]).toBeCloseTo(0, 12)
  })
  it('Normale zeigt IMMER nach kaudal — unabhängig von der Zeichenrichtung', () => {
    const { n } = refLineFrame(p(10, 0), p(0, 0)) // umgekehrt gezeichnet
    expect(n[0]).toBeCloseTo(0, 12)
    expect(n[1]).toBe(1)
    expect(n[2]).toBeCloseTo(0, 12)
  })
  it('caudalDistance: Punkt 50 unter der Linie → +50, richtungs-stabil', () => {
    expect(caudalDistance(p(2, 50), p(0, 0), p(10, 0))).toBeCloseTo(50, 6)
    expect(caudalDistance(p(2, 50), p(10, 0), p(0, 0))).toBeCloseTo(50, 6)
    expect(caudalDistance(p(2, -30), p(0, 0), p(10, 0))).toBeCloseTo(-30, 6)
  })
  it('gekippte Referenz (45°): Lot-Anteil zählt', () => {
    expect(caudalDistance(p(0, 10), p(0, 0), p(10, 10))).toBeCloseTo(10 / Math.SQRT2, 6)
  })
})

describe('circleFrom3Points (Hüftkopfzentrum — messkritisch)', () => {
  it('Einheitskreis-Punkte → Zentrum (0,0), Radius 1', () => {
    const { center, radius } = circleFrom3Points(p(0, -1), p(1, 0), p(0, 1))
    expect(center[0]).toBeCloseTo(0, 6)
    expect(center[1]).toBeCloseTo(0, 6)
    expect(radius).toBeCloseTo(1, 6)
  })

  it('Hüftkopf-typische Punkte: (80,100) (100,80) (120,100) → (100,100), r=20', () => {
    const { center, radius } = circleFrom3Points(p(80, 100), p(100, 80), p(120, 100))
    expect(center[0]).toBeCloseTo(100, 6)
    expect(center[1]).toBeCloseTo(100, 6)
    expect(radius).toBeCloseTo(20, 6)
  })

  it('übernimmt die z-Ebene von p1', () => {
    const { center } = circleFrom3Points(p(0, -1, 7), p(1, 0, 7), p(0, 1, 7))
    expect(center[2]).toBe(7)
  })

  it('R1 (Befund D15 behoben): (fast) kollineare Eingaben werden als degenerate markiert', () => {
    // Exakt kollinear: Fallback-Zentrum = Mitte p1–p3, halber Abstand —
    // jetzt MIT Signal an den Aufrufer.
    const exact = circleFrom3Points(p(0, 0), p(1, 0), p(2, 0))
    expect(exact.degenerate).toBe(true)
    expect(exact.center).toEqual([1, 0, 0])
    expect(exact.radius).toBeCloseTo(1, 6)
    // Fast kollinear: riesiger Kreis relativ zur Punktspanne → degenerate.
    const near = circleFrom3Points(p(0, 0), p(10, 0.05), p(20, 0))
    expect(near.degenerate).toBe(true)
    expect(near.radius).toBeGreaterThan(100)
    // Gesunde, gut verteilte Kopfkontur: KEIN Flag.
    const ok = circleFrom3Points(p(80, 100), p(100, 80), p(120, 100))
    expect(ok.degenerate).toBeUndefined()
  })
})
