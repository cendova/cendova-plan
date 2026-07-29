// Charakterisierungs-Tests des Schulter-Winkelsets aus Schritt 3:
// Akromion-Index, Glenoid-Inklination (β) und Hals-Schaft-Winkel.
//
// Bildkoordinaten: y wächst nach KAUDAL. „Oben"/kranial hat also das
// kleinere y. Für eine RECHTE Schulter zeigt „lateral" nach +x; die
// Links-Tests spiegeln an x, um die Seitenneutralität zu belegen.
import { describe, expect, it } from 'vitest'
import { getShoulderRecipe } from './recipes'
import { beurteileAcromionIndex, AI_SCHWELLEN } from './acromionIndex'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]
const zahl = (s: string) => Number(s.replace('°', '').replace(',', '.'))

describe('Akromion-Index', () => {
  const rez = getShoulderRecipe('acromionIndex')!
  // Glenoidebene senkrecht (x = 0). Abstände sind dann einfach die
  // x-Koordinaten — von Hand nachrechenbar.
  const GL_OBEN = p(0, -100)
  const GL_UNTEN = p(0, 0)

  it('ist registriert, 4 Punkte, ohne Kalibrierung', () => {
    expect(rez.steps).toHaveLength(4)
    expect(rez.needsCalibration).toBe(false)
  })

  it('bildet das Verhältnis der beiden Lot-Abstände', () => {
    // Akromion 70 lateral, Humeruskopf 100 lateral → AI = 0,70
    const r = rez.compute([GL_OBEN, GL_UNTEN, p(70, -60), p(100, -20)], 1)
    expect(r.values[0].label).toBe('Akromion-Index')
    expect(r.values[0].value).toBe('0,70')
  })

  it('ist maßstabsunabhängig (dimensionslos)', () => {
    const klein = rez.compute([GL_OBEN, GL_UNTEN, p(70, -60), p(100, -20)], 1)
    const gross = rez.compute(
      [p(0, -300), GL_UNTEN, p(210, -180), p(300, -60)],
      1,
    )
    expect(klein.values[0].value).toBe(gross.values[0].value)
    // Auch ein anderer Kalibrierfaktor darf nichts ändern.
    const anderer = rez.compute([GL_OBEN, GL_UNTEN, p(70, -60), p(100, -20)], 3.7)
    expect(anderer.values[0].value).toBe(klein.values[0].value)
  })

  it('liefert für die linke (gespiegelte) Schulter denselben Wert', () => {
    const rechts = rez.compute([GL_OBEN, GL_UNTEN, p(70, -60), p(100, -20)], 1)
    const links = rez.compute([GL_OBEN, GL_UNTEN, p(-70, -60), p(-100, -20)], 1)
    expect(links.values[0].value).toBe(rechts.values[0].value)
  })

  it('warnt statt NaN, wenn der Kopfpunkt auf der Glenoidebene liegt', () => {
    const r = rez.compute([GL_OBEN, GL_UNTEN, p(70, -60), p(0, -20)], 1)
    expect(r.values[0].label).toContain('⚠')
    expect(r.values[0].value).not.toContain('NaN')
    expect(r.values[0].value).not.toContain('Infinity')
  })

  it('zeichnet Glenoidebene und beide gemessenen Strecken', () => {
    const r = rez.compute([GL_OBEN, GL_UNTEN, p(70, -60), p(100, -20)], 1)
    expect(r.geometry.lines).toHaveLength(3)
    // Die Lot-Strecken enden auf den gesetzten Punkten.
    expect(r.geometry.lines[1].to).toEqual(p(70, -60))
    expect(r.geometry.lines[2].to).toEqual(p(100, -20))
  })

  it('ordnet an den Referenzbereichen ein (Nyffeler 2006)', () => {
    expect(beurteileAcromionIndex(0.5).bereich).toBe('niedrig')
    expect(beurteileAcromionIndex(0.64).bereich).toBe('mittel')
    expect(beurteileAcromionIndex(0.8).bereich).toBe('hoch')
    expect(AI_SCHWELLEN.niedrigBis).toBe(0.58)
    expect(AI_SCHWELLEN.hochAb).toBe(0.7)
  })

  it('behauptet keine Diagnose, sondern nennt Gruppenwerte', () => {
    for (const w of [0.5, 0.64, 0.8]) {
      const t = beurteileAcromionIndex(w).hinweis.toLowerCase()
      expect(t).not.toMatch(/diagnose|liegt vor|nachgewiesen/)
    }
    expect(beurteileAcromionIndex(0.8).hinweis).toContain('Gruppenmittel')
  })
})

describe('Glenoid-Inklination (β)', () => {
  const rez = getShoulderRecipe('glenoidInclination')!

  it('misst 90°, wenn die Spina senkrecht auf der Glenoidlinie steht', () => {
    // Spina waagerecht nach lateral, Glenoidlinie senkrecht.
    const r = rez.compute(
      [p(-100, 0), p(0, 0), p(0, -100), p(0, 0)],
      1,
    )
    expect(zahl(r.values[0].value)).toBeCloseTo(90, 1)
  })

  it('liefert den anatomisch typischen Bereich um 80°', () => {
    // Spina leicht nach kranial-lateral geneigt → β < 90°.
    const r = rez.compute(
      [p(-100, 10), p(0, 0), p(0, -100), p(0, 0)],
      1,
    )
    const beta = zahl(r.values[0].value)
    expect(beta).toBeGreaterThan(80)
    expect(beta).toBeLessThan(90)
  })

  it('ist seitenneutral (gespiegelte Schulter, gleicher Winkel)', () => {
    const rechts = rez.compute([p(-100, 10), p(0, 0), p(0, -100), p(0, 0)], 1)
    const links = rez.compute([p(100, 10), p(0, 0), p(0, -100), p(0, 0)], 1)
    expect(links.values[0].value).toBe(rechts.values[0].value)
  })

  it('nennt den Referenzwert als zweite Zeile', () => {
    const r = rez.compute([p(-100, 0), p(0, 0), p(0, -100), p(0, 0)], 1)
    expect(r.values[1].label).toBe('Referenz')
    expect(r.values[1].value).toContain('80')
  })
})

describe('Hals-Schaft-Winkel', () => {
  const rez = getShoulderRecipe('neckShaftAngle')!

  it('liefert 135°, wenn die Kopf-Hals-Achse 45° zum Schaft steht', () => {
    // Hals-Ebene um 45° geneigt → Senkrechte darauf ebenfalls 45° zur
    // senkrechten Schaftachse → stumpfe Variante = 135°.
    const r = rez.compute(
      [p(0, 0), p(100, -100), p(60, 60), p(60, 260)],
      1,
    )
    expect(zahl(r.values[0].value)).toBeCloseTo(135, 1)
  })

  it('wählt immer die stumpfe Variante — unabhängig von der Punktreihenfolge', () => {
    // Dieselbe Hals-Ebene, aber die beiden Punkte vertauscht.
    const a = rez.compute([p(0, 0), p(100, -100), p(60, 60), p(60, 260)], 1)
    const b = rez.compute([p(100, -100), p(0, 0), p(60, 60), p(60, 260)], 1)
    expect(b.values[0].value).toBe(a.values[0].value)
    expect(zahl(a.values[0].value)).toBeGreaterThanOrEqual(90)
  })

  it('liefert 90°, wenn die Hals-Ebene parallel zum Schaft liegt', () => {
    const r = rez.compute([p(0, 0), p(0, -100), p(60, 60), p(60, 260)], 1)
    expect(zahl(r.values[0].value)).toBeCloseTo(90, 1)
  })

  it('zeichnet Hals-Ebene, Schaftachse und die Kopf-Hals-Achse', () => {
    const r = rez.compute([p(0, 0), p(100, -100), p(60, 60), p(60, 260)], 1)
    expect(r.geometry.lines).toHaveLength(3)
    // Die Kopf-Hals-Achse ist gestrichelt und startet in der Hals-Mitte.
    expect(r.geometry.lines[2].dashed).toBe(true)
    expect(r.geometry.lines[2].from).toEqual(p(50, -50))
  })

  it('zeichnet die Kopf-Hals-Achse WEG vom Schaft (Richtung Kopf)', () => {
    // Schaft liegt kaudal (y groß) → die Achse muss nach kranial zeigen.
    const r = rez.compute([p(0, 0), p(100, -100), p(60, 60), p(60, 260)], 1)
    const [von, nach] = [r.geometry.lines[2].from, r.geometry.lines[2].to]
    expect(nach[1]).toBeLessThan(von[1])
  })
})
