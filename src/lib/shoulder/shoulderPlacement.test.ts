// Charakterisierungs-Tests der Schablonen-Platzierung: Halbmaße und die
// Spiegel-/Dreh-Transform.
//
// SEITEN-KONVENTION — dieselbe Fehlerklasse wie bei der Hüfte
// (`src/lib/hip/templates.test.ts`, „Bug-Historie"): Die Quell-Screenshots
// zeigen alle Serien in EINER Orientierung; nur die Gegenseite spiegelt.
// Kippt diese Einordnung, muss GENAU EINE Konstante wechseln — die Tests
// hier sind so geschrieben, dass sie das erzwingen und nicht bloß die
// aktuelle Wahl zementieren.
import { describe, expect, it } from 'vitest'
import {
  SHOULDER_KANONISCHE_SEITE,
  shoulderGruppenTransform,
  shoulderHalbmasse,
  shoulderSpiegelt,
} from './shoulderPlacement'

const GEGENSEITE = SHOULDER_KANONISCHE_SEITE === 'R' ? 'L' : 'R'

describe('Seiten-Konvention', () => {
  it('zeichnet die kanonische Seite ungespiegelt', () => {
    expect(shoulderSpiegelt(SHOULDER_KANONISCHE_SEITE)).toBe(false)
  })

  it('spiegelt genau die Gegenseite', () => {
    expect(shoulderSpiegelt(GEGENSEITE)).toBe(true)
  })

  it('spiegelt nie beide Seiten gleich', () => {
    expect(shoulderSpiegelt('R')).not.toBe(shoulderSpiegelt('L'))
  })
})

describe('Gruppen-Transform', () => {
  it('dreht ohne Spiegelung nur um das Zentrum', () => {
    expect(shoulderGruppenTransform(SHOULDER_KANONISCHE_SEITE, 12, 100, 50)).toBe(
      'rotate(12 100 50)',
    )
  })

  it('haengt die Spiegelung RECHTS an die Rotation (SVG wertet rechts→links)', () => {
    // Reihenfolge ist kritisch: Erst spiegeln, dann drehen. Andersherum
    // liefe die Rotation gegensinnig.
    const t = shoulderGruppenTransform(GEGENSEITE, 12, 100, 50)
    expect(t).toBe('rotate(12 100 50) translate(100 0) scale(-1 1) translate(-100 0)')
    expect(t.indexOf('rotate')).toBeLessThan(t.indexOf('scale(-1 1)'))
  })

  it('spiegelt an der Senkrechten DURCH das Zentrum', () => {
    // translate(cx) · scale(-1) · translate(-cx) bildet cx auf sich selbst
    // ab — die Schablone bleibt beim Seitenwechsel an Ort und Stelle.
    const cx = 240
    const t = shoulderGruppenTransform(GEGENSEITE, 0, cx, 0)
    expect(t).toContain(`translate(${cx} 0)`)
    expect(t).toContain(`translate(${-cx} 0)`)
  })
})

describe('Halbmaße', () => {
  it('nimmt das Bild-Overlay, wenn vorhanden (inkl. Rand)', () => {
    const r = shoulderHalbmasse(
      { img: { widthPx: 400, heightPx: 200, mmPerPx: 0.1176 }, contour: { wMm: 10, hMm: 10 } },
      2,
      3,
    )
    expect(r.halfWpx).toBeCloseTo((400 * 0.1176 * 2) / 2, 6)
    expect(r.halfHpx).toBeCloseTo((200 * 0.1176 * 3) / 2, 6)
  })

  it('faellt ohne Bild auf die Vektor-Kontur zurueck', () => {
    const r = shoulderHalbmasse({ contour: { wMm: 30, hMm: 40 } }, 2, 3)
    expect(r.halfWpx).toBe(30)
    expect(r.halfHpx).toBe(60)
  })

  it('skaliert X und Y getrennt (anisotroper Zoom)', () => {
    const r = shoulderHalbmasse({ contour: { wMm: 10, hMm: 10 } }, 4, 1)
    expect(r.halfWpx).toBe(20)
    expect(r.halfHpx).toBe(5)
  })

  it('meldet den Fall ohne jede Groessenquelle statt still zu rechnen', () => {
    expect(() => shoulderHalbmasse({}, 1, 1)).toThrow()
  })
})
