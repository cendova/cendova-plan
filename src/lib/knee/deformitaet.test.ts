// Charakterisierungs-Tests der Deformitätsanalyse (Paley-Normbereiche,
// Lokalisation, Vorauswahl des Osteotomietyps).
import { describe, expect, it } from 'vitest'
import { analysiereDeformitaet, bewerteWinkel, ZIEL_VALGUS, ZIEL_VARUS } from './deformitaet'

const basis = { hkaAbweichung: 0, mLDFA: 87, mMPTA: 87, JLCA: 1 }

describe('bewerteWinkel', () => {
  it('Grenzen gehören zum Normbereich', () => {
    expect(bewerteWinkel('mLDFA', 85).status).toBe('normal')
    expect(bewerteWinkel('mLDFA', 90).status).toBe('normal')
    expect(bewerteWinkel('mLDFA', 90.1).status).toBe('zu hoch')
    expect(bewerteWinkel('mMPTA', 84.9).status).toBe('zu niedrig')
    expect(bewerteWinkel('JLCA', 2.5).status).toBe('zu hoch')
  })
})

describe('analysiereDeformitaet', () => {
  it('neutrale Achse → keine Vorauswahl', () => {
    const a = analysiereDeformitaet(basis)
    expect(a.richtung).toBe('Neutral')
    expect(a.vorschlag).toBeNull()
  })
  it('Varus tibial → öffnende HTO, Ziel 62,5 %', () => {
    const a = analysiereDeformitaet({ ...basis, hkaAbweichung: -6, mMPTA: 83 })
    expect(a.vorschlag).toBe('htoOeffnend')
    expect(a.zielWblProzent).toBe(ZIEL_VARUS)
    expect(a.lokalisation).toContain('tibial varisch (mMPTA erniedrigt)')
  })
  it('Varus femoral bei normalem MPTA → schließende DFO', () => {
    const a = analysiereDeformitaet({ ...basis, hkaAbweichung: -5, mLDFA: 93 })
    expect(a.vorschlag).toBe('dfoSchliessend')
  })
  it('Varus femoral UND tibial → DLO', () => {
    const a = analysiereDeformitaet({ ...basis, hkaAbweichung: -11, mLDFA: 93, mMPTA: 83 })
    expect(a.vorschlag).toBe('dlo')
  })
  it('Valgus femoral → öffnende DFO, Ziel 50 %', () => {
    const a = analysiereDeformitaet({ ...basis, hkaAbweichung: 6, mLDFA: 83 })
    expect(a.vorschlag).toBe('dfoOeffnend')
    expect(a.zielWblProzent).toBe(ZIEL_VALGUS)
  })
  it('Valgus tibial → schließende HTO', () => {
    const a = analysiereDeformitaet({ ...basis, hkaAbweichung: 5, mMPTA: 93 })
    expect(a.vorschlag).toBe('htoSchliessend')
  })
  it('bewertet optionale Winkel nur, wenn sie gemessen sind', () => {
    expect(analysiereDeformitaet(basis).bewertungen.map((b) => b.winkel)).toEqual([
      'mLDFA',
      'mMPTA',
      'JLCA',
    ])
    const mit = analysiereDeformitaet({ ...basis, mLPFA: 97, mLDTA: 89 })
    expect(mit.bewertungen.map((b) => b.winkel)).toEqual([
      'mLPFA',
      'mLDFA',
      'mMPTA',
      'mLDTA',
      'JLCA',
    ])
    expect(mit.bewertungen[0].status).toBe('zu hoch')
  })
  it('hält die Sprachregel — keine Empfehlungsvokabel', () => {
    for (const e of [
      { ...basis, hkaAbweichung: -6, mMPTA: 83 },
      { ...basis, hkaAbweichung: -5, mLDFA: 93 },
      { ...basis, hkaAbweichung: -11, mLDFA: 93, mMPTA: 83 },
      { ...basis, hkaAbweichung: 6, mLDFA: 83 },
      { ...basis, hkaAbweichung: 5, mMPTA: 93 },
    ]) {
      expect(analysiereDeformitaet(e).begruendung).not.toMatch(
        /empfohlen|Empfehlung|kontraindiziert|verwenden/i,
      )
    }
  })
})
