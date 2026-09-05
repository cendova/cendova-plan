// Charakterisierungs-Tests des klassenbezogenen CPAH-Hinweises. Die
// Sätze zitieren Paper-Befunde und sind ein fachlicher Vertrag —
// Änderungen hier bewusst nachziehen.
import { describe, expect, it } from 'vitest'
import type { CpahResult, CpahType, OffsetSubtype } from './femurProfile'
import { cpahBausteine, cpahKlassenHinweis } from './cpahKlassenHinweis'

const typ = (type: CpahType, offsetSubtype: OffsetSubtype = 'N'): CpahResult => ({
  type,
  offsetSubtype,
  code: `${type}${offsetSubtype}`,
})

describe('Matrix-Bausteine', () => {
  it('zerlegt 1–9 in Dorr-Zeile und NSA-Spalte', () => {
    expect(cpahBausteine(1)).toEqual({ dorr: 'A', nsa: 'vara' })
    expect(cpahBausteine(5)).toEqual({ dorr: 'B', nsa: 'norma' })
    expect(cpahBausteine(6)).toEqual({ dorr: 'B', nsa: 'valga' })
    expect(cpahBausteine(9)).toEqual({ dorr: 'C', nsa: 'valga' })
  })
})

describe('CPAH-Klassenhinweis', () => {
  it('gibt ohne Morphotyp keinen Hinweis', () => {
    expect(cpahKlassenHinweis(null)).toBeNull()
  })

  it('Varus + Dorr A (1N): Varus-Satz und Dorr-A-Satz', () => {
    const t = cpahKlassenHinweis(typ(1))!.text
    expect(t).toContain('Typ 1N')
    expect(t).toContain('Varus-Typen 1/4/7')
    expect(t).toContain('Dorr A (Typ 1–3)')
    expect(t).not.toContain('High-Offset')
  })

  it('Norma + Dorr B mit High-Offset (5H): Norma-Satz und Offset-Satz', () => {
    const t = cpahKlassenHinweis(typ(5, 'H'))!.text
    expect(t).toContain('Norma-Typen 2N/5N/5H')
    expect(t).toContain('High-Offset-Untertyp')
    expect(t).not.toContain('Dorr A (Typ')
  })

  it('Valgus + Dorr C (9N): Valgus-Satz und Dorr-C-Satz, kein Norma-Satz', () => {
    const t = cpahKlassenHinweis(typ(9))!.text
    expect(t).toContain('Valgus-Typen 3/6/9')
    expect(t).toContain('Dorr C (Typ 7–9)')
    expect(t).not.toContain('Norma-Typen')
  })

  it('Norma + Dorr C (8N): kein Norma-Satz — dort gilt der Dorr-C-Befund', () => {
    const t = cpahKlassenHinweis(typ(8))!.text
    expect(t).not.toContain('Norma-Typen')
    expect(t).toContain('Dorr C (Typ 7–9)')
  })

  it('weist immer die Evidenzgrenze aus und belegt Typ und Quelle', () => {
    const h = cpahKlassenHinweis(typ(5))!
    expect(h.code).toBe('CPAH_KLASSEN_BILANZ')
    expect(h.severity).toBe('info')
    expect(h.text).toContain('keine klinischen Endpunkte')
    expect(h.evidence).toContain('CPAH 5N')
    expect(h.evidence.some((e) => e.includes('Stauss'))).toBe(true)
  })

  it('ergänzt die Klasse des platzierten Schafts als Beleg', () => {
    const h = cpahKlassenHinweis(typ(5), {
      fixation: 'cementless',
      radaelliClass: 'B2',
      collar: 'none',
      primaryFixation: 'metadiaphyseal',
      intendedUse: 'primary',
    })!
    expect(h.evidence).toContain('Platzierter Schaft: Radaelli B2')
  })

  it('hält die Sprachregel — keine Empfehlungs- oder Verbotsvokabel', () => {
    for (const t of [1, 2, 3, 4, 5, 6, 7, 8, 9] as CpahType[]) {
      for (const o of ['N', 'H'] as OffsetSubtype[]) {
        expect(cpahKlassenHinweis(typ(t, o))!.text).not.toMatch(
          /empfohlen|Empfehlung|kontraindiziert|verwenden/i,
        )
      }
    }
  })
})
