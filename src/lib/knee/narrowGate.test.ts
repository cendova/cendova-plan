// Narrow-Freischaltung: Die N-Größen des LEGION-Femurs sind versteckt,
// bis eine echte Hersteller-Kontur (quelle 'dxf') geladen ist — genau die
// Semantik des S&N-DXF-Addons. Die Tabellen sind im Repo leer und werden
// hier wie beim Paket-Load in-place befüllt.
import { afterEach, describe, expect, it } from 'vitest'
import { isHiddenKneeSize, LEGION_PS_FEMUR } from './smithNephewCatalog'
import { KNEE_CONTOURS } from './kneeContours'

// Bewusst SYNTHETISCHE Maße (10/20/30 …) — die Gate-Logik hängt nur am
// N-Suffix der Größenbezeichnung, echte Katalogmaße gehören nicht ins Repo.
const SIZES = [
  { size: '2', mlMm: 10, apMm: 10, apBoxMm: 5 },
  { size: '3N', mlMm: 10, apMm: 20, apBoxMm: 15 },
  { size: '3', mlMm: 20, apMm: 20, apBoxMm: 15 },
]

afterEach(() => {
  ;(LEGION_PS_FEMUR as unknown as unknown[]).length = 0
  delete KNEE_CONTOURS['legion-ps-femur|AP|1']
})

describe('isHiddenKneeSize', () => {
  it('versteckt N-Größen ohne DXF-Kontur, Standardgrößen nie', () => {
    ;(LEGION_PS_FEMUR as unknown as typeof SIZES).push(...SIZES)
    expect(isHiddenKneeSize('legion-ps-femur', 0)).toBe(false) // '2'
    expect(isHiddenKneeSize('legion-ps-femur', 1)).toBe(true) // '3N' ohne Kontur
    expect(isHiddenKneeSize('legion-ps-femur', 2)).toBe(false) // '3'
    expect(isHiddenKneeSize('genesis-tibia-female', 1)).toBe(false)
  })
  it('schaltet N-Größen mit quelle=dxf frei', () => {
    ;(LEGION_PS_FEMUR as unknown as typeof SIZES).push(...SIZES)
    KNEE_CONTOURS['legion-ps-femur|AP|1'] = {
      wMm: 10,
      hMm: 10,
      points: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
      quelle: 'dxf',
    }
    expect(isHiddenKneeSize('legion-ps-femur', 1)).toBe(false)
  })
})
