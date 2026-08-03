// Charakterisierungs-Tests der Schulter-Längenmaße (Schritt 4):
// AHD und Humeruskopf. Beide brauchen — anders als die vier Winkel —
// eine Kalibrierung; der Faktor muss deshalb GENAU EINMAL wirken.
import { describe, expect, it } from 'vitest'
import { getShoulderRecipe } from './recipes'
import { beurteileAhd, AHD_SCHWELLE_MM } from './ahd'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]
const zahl = (s: string) => Number(s.replace(' mm', '').replace(',', '.'))

describe('AHD (akromiohumeraler Abstand)', () => {
  const rez = getShoulderRecipe('ahd')!

  it('ist als kalibrierungspflichtig markiert', () => {
    // Das steuert den „· unkalibriert"-Hinweis in Werteliste und PDF.
    expect(rez.needsCalibration).toBe(true)
    expect(rez.steps).toHaveLength(2)
  })

  it('misst den Abstand der beiden Punkte in mm', () => {
    // 8 Welteinheiten bei Faktor 1 → 8,0 mm
    const r = rez.compute([p(0, 0), p(0, 8)], 1)
    expect(r.values[0].label).toBe('AHD')
    expect(r.values[0].value).toBe('8.0 mm')
  })

  it('wendet mmPerWorldUnit genau EINMAL an', () => {
    // 4 WU · Faktor 2 = 8 mm. Doppelte Anwendung ergäbe 16 mm.
    const r = rez.compute([p(0, 0), p(0, 4)], 2)
    expect(r.values[0].value).toBe('8.0 mm')
  })

  it('misst schräge Strecken korrekt (3-4-5-Dreieck)', () => {
    const r = rez.compute([p(0, 0), p(3, 4)], 1)
    expect(zahl(r.values[0].value)).toBeCloseTo(5, 3)
  })

  it('beurteilt NICHT ohne Kalibrierung (Faktor 1)', () => {
    // Ohne Maßstab ist die Zahl eine Welt-Einheit, kein Millimeterwert —
    // eine Einordnung waere unbegruendet.
    const ohne = rez.compute([p(0, 0), p(0, 42)], 1)
    expect(ohne.values[1].value).toContain('nicht beurteilbar')
    expect(ohne.values[1].value).not.toContain('üblichen Bereich')
    // Mit Maßstab kommt die Einordnung.
    const mit = rez.compute([p(0, 0), p(0, 42)], 0.2) // 8,4 mm
    expect(mit.values[1].value).toContain('üblichen Bereich')
  })

  it('zeigt den Messwert auch unkalibriert an', () => {
    const r = rez.compute([p(0, 0), p(0, 42)], 1)
    expect(r.values[0].value).toBe('42.0 mm')
  })

  it('ordnet an der 6-mm-Schwelle ein', () => {
    expect(beurteileAhd(4).bereich).toBe('vermindert')
    expect(beurteileAhd(5.9).bereich).toBe('vermindert')
    expect(beurteileAhd(6).bereich).toBe('ueblich')
    expect(beurteileAhd(10).bereich).toBe('ueblich')
    expect(AHD_SCHWELLE_MM).toBe(6)
  })

  it('formuliert zurückhaltend, ohne Diagnose', () => {
    for (const w of [3, 8]) {
      const t = beurteileAhd(w).hinweis.toLowerCase()
      expect(t).not.toMatch(/diagnose|liegt vor|nachgewiesen|ruptur besteht/)
    }
    expect(beurteileAhd(3).hinweis).toContain('hinweisend')
  })

  it('zeichnet die gemessene Strecke und beschriftet sie mittig', () => {
    const r = rez.compute([p(0, 0), p(0, 10)], 1)
    expect(r.geometry.lines).toHaveLength(1)
    expect(r.geometry.labels[0].at).toEqual(p(0, 5))
    expect(r.geometry.labels[0].text).toContain('AHD')
  })
})

describe('Humeruskopf', () => {
  const rez = getShoulderRecipe('humeralHead')!
  // Drei Punkte auf einem Kreis mit Radius 20 um (50, 50).
  const AUF_KREIS: Types.Point3[] = [p(70, 50), p(50, 30), p(30, 50)]

  it('ist als kalibrierungspflichtig markiert', () => {
    expect(rez.needsCalibration).toBe(true)
    expect(rez.steps).toHaveLength(3)
  })

  it('rekonstruiert Zentrum und Durchmesser aus drei Konturpunkten', () => {
    const r = rez.compute(AUF_KREIS, 1)
    expect(r.values[0].label).toBe('Durchmesser')
    expect(zahl(r.values[0].value)).toBeCloseTo(40, 1)
    expect(zahl(r.values[1].value)).toBeCloseTo(20, 1)
    const kreis = r.geometry.circles[0]
    expect(kreis.center[0]).toBeCloseTo(50, 3)
    expect(kreis.center[1]).toBeCloseTo(50, 3)
    expect(kreis.radius).toBeCloseTo(20, 3)
  })

  it('wendet mmPerWorldUnit genau EINMAL an', () => {
    const r = rez.compute(AUF_KREIS, 2)
    expect(zahl(r.values[0].value)).toBeCloseTo(80, 1)
    // Der gezeichnete Kreis bleibt in WELT-Einheiten — der Faktor darf
    // nur in die Zahlenwerte, nicht in die Geometrie.
    expect(r.geometry.circles[0].radius).toBeCloseTo(20, 3)
  })

  it('warnt bei fast kollinearen Punkten statt still zu rechnen', () => {
    const r = rez.compute([p(0, 0), p(100, 0.01), p(200, 0)], 1)
    expect(r.values[0].label).toContain('⚠')
    expect(r.values[0].value).toContain('kollinear')
  })

  it('zeigt ohne Warnung genau zwei Werte', () => {
    const r = rez.compute(AUF_KREIS, 1)
    expect(r.values).toHaveLength(2)
  })
})
