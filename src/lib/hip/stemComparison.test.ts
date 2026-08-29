// Charakterisierungs-Tests des femurseitigen Schablonen-Abgleichs
// (Task 16). Vorzeichen sind klinischer Vertrag: + = mehr Offset,
// + = Bein wird femurseitig länger (identisch zu PlanningDelta).
import { describe, expect, it } from 'vitest'
import type { Types } from '@cornerstonejs/core'
import { vergleicheSchaftMitFemurprofil } from './stemComparison'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]

/** Vertikale Achse (proximal oben), anatomischer Kopf 40 WU medial. */
function basis(over: Partial<Parameters<typeof vergleicheSchaftMitFemurprofil>[0]> = {}) {
  return vergleicheSchaftMitFemurprofil({
    anatomischesKopfzentrum: p(-40, -10),
    schablonenKopfzentrum: p(-40, -10),
    achse: [p(0, 0), p(0, 100)] as [Types.Point3, Types.Point3],
    mmPerWorldUnit: 1,
    ...over,
  })
}

describe('vergleicheSchaftMitFemurprofil', () => {
  it('meldet null Differenz, wenn die Köpfe deckungsgleich sind', () => {
    const r = basis()!
    expect(r.deltaFoMm).toBeCloseTo(0, 9)
    expect(r.deltaLaengsMm).toBeCloseTo(0, 9)
    expect(r.warnings).toEqual([])
  })

  it('positives ΔFO, wenn die Variante mehr Offset aufbaut', () => {
    const r = basis({ schablonenKopfzentrum: p(-44, -10) })!
    expect(r.deltaFoMm).toBeCloseTo(4, 9)
  })

  it('negatives ΔFO, wenn die Variante das Offset unterbaut', () => {
    const r = basis({ schablonenKopfzentrum: p(-33.5, -10) })!
    expect(r.deltaFoMm).toBeCloseTo(-6.5, 9)
  })

  it('positive Längsdifferenz = Schablonenkopf proximaler = Bein länger', () => {
    const r = basis({ schablonenKopfzentrum: p(-40, -16) })!
    expect(r.deltaLaengsMm).toBeCloseTo(6, 9)
  })

  it('negative Längsdifferenz bei distalerem Schablonenkopf', () => {
    const r = basis({ schablonenKopfzentrum: p(-40, -2) })!
    expect(r.deltaLaengsMm).toBeCloseTo(-8, 9)
  })

  it('rechnet in mm, nicht in Welteinheiten', () => {
    // factor 2: 1 WU = 2 mm → 4 WU Quer-Differenz sind 8 mm.
    const r = basis({ schablonenKopfzentrum: p(-44, -16), mmPerWorldUnit: 2 })!
    expect(r.deltaFoMm).toBeCloseTo(8, 9)
    expect(r.deltaLaengsMm).toBeCloseTo(12, 9)
  })

  it('funktioniert auf einer schrägen Achse', () => {
    // Achse Richtung (0.6, 0.8); Kopfpaar quer dazu versetzt.
    const achse: [Types.Point3, Types.Point3] = [p(0, 0), p(60, 80)]
    const n = [-0.8, 0.6] // Quer-Richtung
    const ka = p(n[0] * 40, n[1] * 40)
    const ks = p(n[0] * 45 + 0.6 * -5, n[1] * 45 + 0.8 * -5)
    const r = vergleicheSchaftMitFemurprofil({
      anatomischesKopfzentrum: ka,
      schablonenKopfzentrum: ks,
      achse,
      mmPerWorldUnit: 1,
    })!
    expect(r.deltaFoMm).toBeCloseTo(5, 6)
    expect(r.deltaLaengsMm).toBeCloseTo(5, 6)
  })

  it('warnt, wenn der Schablonenkopf auf der Gegenseite der Achse liegt', () => {
    const r = basis({ schablonenKopfzentrum: p(40, -10) })!
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('GEGENSEITE')
    // Der Betragsvergleich bleibt definiert (gleicher Abstand → ΔFO 0).
    expect(r.deltaFoMm).toBeCloseTo(0, 9)
  })

  it('liefert ohne Kalibrierung null — keine Pseudo-mm', () => {
    expect(basis({ mmPerWorldUnit: null })).toBeNull()
  })

  it('liefert bei unbrauchbarem Faktor null', () => {
    for (const f of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(basis({ mmPerWorldUnit: f })).toBeNull()
    }
  })

  it('liefert ohne Achsrichtung null statt NaN', () => {
    expect(
      basis({ achse: [p(5, 5), p(5, 5)] as [Types.Point3, Types.Point3] }),
    ).toBeNull()
  })

  it('kehrt das Längs-Vorzeichen um, wenn die Achse verkehrt gesetzt ist', () => {
    // Bewusst NICHT abgefangen (Doktrin der 10-cm-Linie): Punkt 4 IST
    // proximal per Prefill-Vertrag; eine vertauschte Achse fällt im Bild
    // auf, eine stille Korrektur würde echte Fehler verstecken.
    const r = basis({
      schablonenKopfzentrum: p(-40, -16),
      achse: [p(0, 100), p(0, 0)] as [Types.Point3, Types.Point3],
    })!
    expect(r.deltaLaengsMm).toBeCloseTo(-6, 9)
  })
})
