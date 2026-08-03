// Charakterisierungs-Tests für den CSA (Critical Shoulder Angle):
// Winkel-Berechnung im Rezept + Einordnung in csa.ts.
//
// Bildkoordinaten: y wächst nach KAUDAL (unten). „Glenoid oben" hat also
// ein kleineres y als „Glenoid unten" — die Testpunkte sind entsprechend
// gewählt.
import { describe, expect, it } from 'vitest'
import { getShoulderRecipe } from './recipes'
import { beurteileCsa, CSA_SCHWELLEN } from './csa'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]

/** Punkt im Winkel `gradWert` zur Glenoidlinie, Abstand `laenge` vom Scheitel. */
function akromionBei(gradWert: number, laenge = 120): Types.Point3 {
  const rad = (gradWert * Math.PI) / 180
  // Glenoidlinie zeigt vom Scheitel (0,0) nach oben, also Richtung (0,-1).
  // Drehung um `gradWert` in die +x-Halbebene (lateral).
  return p(Math.sin(rad) * laenge, -Math.cos(rad) * laenge)
}

const rezept = getShoulderRecipe('csa')!
const GLENOID_OBEN = p(0, -100)
const GLENOID_UNTEN = p(0, 0)

function csaFuer(gradWert: number): number {
  const r = rezept.compute(
    [GLENOID_OBEN, GLENOID_UNTEN, akromionBei(gradWert)],
    1,
  )
  return Number(r.values[0].value.replace('°', '').replace(',', '.'))
}

describe('CSA-Rezept', () => {
  it('ist registriert und braucht keine Kalibrierung', () => {
    expect(rezept).toBeDefined()
    expect(rezept.needsCalibration).toBe(false)
    expect(rezept.steps).toHaveLength(3)
  })

  it('misst den Winkel am UNTEREN Glenoidrand', () => {
    // 45°: Akromion diagonal lateral-kranial zum Scheitel.
    const r = rezept.compute([GLENOID_OBEN, GLENOID_UNTEN, p(100, -100)], 1)
    expect(r.values[0].label).toBe('CSA')
    expect(r.values[0].value).toBe('45.0°')
  })

  it('liefert bekannte Winkel exakt', () => {
    expect(csaFuer(25)).toBeCloseTo(25, 1)
    expect(csaFuer(33)).toBeCloseTo(33, 1)
    expect(csaFuer(40)).toBeCloseTo(40, 1)
  })

  it('ist unabhängig von der Länge der Schenkel', () => {
    const kurz = rezept.compute(
      [p(0, -40), GLENOID_UNTEN, akromionBei(33, 30)],
      1,
    )
    const lang = rezept.compute(
      [p(0, -300), GLENOID_UNTEN, akromionBei(33, 400)],
      1,
    )
    expect(kurz.values[0].value).toBe(lang.values[0].value)
  })

  it('zeichnet zwei Schenkel und ein Label, keine Kreise', () => {
    const r = rezept.compute([GLENOID_OBEN, GLENOID_UNTEN, p(100, -100)], 1)
    expect(r.geometry.lines).toHaveLength(2)
    expect(r.geometry.circles).toHaveLength(0)
    expect(r.geometry.labels).toHaveLength(1)
    // Beide Schenkel gehen vom Scheitel (unterer Glenoidrand) aus.
    expect(r.geometry.lines[0].from).toEqual(GLENOID_UNTEN)
    expect(r.geometry.lines[1].from).toEqual(GLENOID_UNTEN)
    expect(r.geometry.labels[0].text).toContain('CSA')
  })

  it('verlängert die Glenoidlinie über den oberen Rand hinaus', () => {
    // Damit der Winkel im Bild ablesbar bleibt — der gezeichnete Endpunkt
    // liegt weiter kranial als der gesetzte obere Glenoidpunkt.
    const r = rezept.compute([GLENOID_OBEN, GLENOID_UNTEN, p(100, -100)], 1)
    expect(r.geometry.lines[0].to[1]).toBeLessThan(GLENOID_OBEN[1])
  })
})

describe('CSA-Einordnung', () => {
  it('teilt an den Schwellen 30 und 35 ein', () => {
    expect(beurteileCsa(25).bereich).toBe('niedrig')
    expect(beurteileCsa(29.9).bereich).toBe('niedrig')
    expect(beurteileCsa(30).bereich).toBe('normal')
    expect(beurteileCsa(33).bereich).toBe('normal')
    expect(beurteileCsa(35).bereich).toBe('normal')
    expect(beurteileCsa(35.1).bereich).toBe('hoch')
    expect(beurteileCsa(42).bereich).toBe('hoch')
  })

  it('nennt die Schwellen konsistent zur Klassifikation', () => {
    expect(CSA_SCHWELLEN.niedrigBis).toBe(30)
    expect(CSA_SCHWELLEN.hochAb).toBe(35)
  })

  it('formuliert als Assoziation, nicht als Diagnose', () => {
    // Bewusst geprüft: CendovaPlan ist kein Medizinprodukt, die
    // Beurteilung darf keine Diagnose behaupten.
    for (const w of [25, 33, 42]) {
      const t = beurteileCsa(w).hinweis.toLowerCase()
      expect(t).not.toMatch(/diagnose|nachgewiesen|liegt vor/)
    }
    expect(beurteileCsa(42).hinweis).toContain('assoziiert')
    expect(beurteileCsa(25).hinweis).toContain('assoziiert')
  })

  it('taucht als zweiter Wert in der Messung auf', () => {
    const r = rezept.compute([GLENOID_OBEN, GLENOID_UNTEN, akromionBei(42)], 1)
    expect(r.values[1].label).toBe('Beurteilung')
    expect(r.values[1].value).toContain('hoch')
  })
})
