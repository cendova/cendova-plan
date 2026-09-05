// Charakterisierungs-Tests der Radaelli-Klassenbeschreibungen und des
// klassenbezogenen CPAH-Hinweises. Wortlaut und Evidenzgrenzen sind ein
// fachlicher Vertrag — Änderungen hier bewusst nachziehen.
import { describe, expect, it } from 'vitest'
import { RADAELLI_KLASSEN } from './medactaCatalog'
import type { CpahResult } from './femurProfile'
import { CPAH_SIMULIERTE_KLASSEN } from './stemPlanningRules'
import {
  RADAELLI_KLASSEN_INFO,
  RADAELLI_KLASSEN_LISTE,
  radaelliKlassenHinweis,
} from './radaelliKlassen'

const CPAH_5N: CpahResult = { type: 5, offsetSubtype: 'N', code: '5N' }

describe('Klassenbeschreibungen', () => {
  it('beschreibt jede der zehn Klassen vollständig', () => {
    for (const k of RADAELLI_KLASSEN) {
      const info = RADAELLI_KLASSEN_INFO[k]
      expect(info.klasse).toBe(k)
      expect(info.name.length).toBeGreaterThan(3)
      expect(info.geometrie.length).toBeGreaterThan(20)
    }
    expect(RADAELLI_KLASSEN_LISTE.map((i) => i.klasse)).toEqual([...RADAELLI_KLASSEN])
  })

  it('markiert genau die im CPAH-Paper simulierten Klassen', () => {
    const simuliert = RADAELLI_KLASSEN_LISTE.filter((i) => i.cpahSimuliert).map((i) => i.klasse)
    expect(simuliert).toEqual([...CPAH_SIMULIERTE_KLASSEN])
  })

  it('führt die verkürzten Designs als kurz', () => {
    expect(RADAELLI_KLASSEN_LISTE.filter((i) => i.kurz).map((i) => i.klasse)).toEqual([
      'B3',
      'C3',
      'F',
    ])
  })
})

describe('CPAH-Klassenhinweis', () => {
  it('gibt ohne Morphotyp keinen Hinweis', () => {
    expect(radaelliKlassenHinweis(null)).toBeNull()
  })

  it('nennt Kurzschaft (F) und anatomischen Fit-and-fill (C2) mit Evidenzgrenze', () => {
    const h = radaelliKlassenHinweis(CPAH_5N)
    expect(h?.code).toBe('CPAH_KLASSEN_BILANZ')
    expect(h?.severity).toBe('info')
    expect(h?.text).toContain('(F)')
    expect(h?.text).toContain('(C2)')
    expect(h?.text).toContain('keine Outcome-Endpunkte')
    expect(h?.evidence).toContain('CPAH 5N')
  })

  it('ergänzt die Klasse des platzierten Schafts als Beleg', () => {
    const h = radaelliKlassenHinweis(CPAH_5N, {
      fixation: 'cementless',
      radaelliClass: 'B2',
      collar: 'none',
      primaryFixation: 'metadiaphyseal',
      intendedUse: 'primary',
    })
    expect(h?.evidence).toContain('Platzierter Schaft: Radaelli B2')
  })

  it('hält die Sprachregel — keine Empfehlungs- oder Verbotsvokabel', () => {
    const texte = [
      radaelliKlassenHinweis(CPAH_5N)?.text ?? '',
      ...RADAELLI_KLASSEN_LISTE.map((i) => i.geometrie),
    ]
    for (const t of texte) {
      expect(t).not.toMatch(/empfohlen|Empfehlung|kontraindiziert|verwenden/i)
    }
  })
})
