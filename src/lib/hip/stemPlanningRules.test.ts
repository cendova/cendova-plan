// Charakterisierungs-Tests der Schaft-Planungsregeln (Task 15).
// Die Regeln sind ein KLINISCHER Vertrag: jede Änderung an Auslösern,
// Schweregrad oder Wortlaut muss hier bewusst nachgezogen werden.
import { describe, expect, it } from 'vitest'
import type { StemPlanningProfile } from './medactaCatalog'
import {
  type StemPlanningAnatomie,
  stemPlanningHints,
} from './stemPlanningRules'

/** Unauffällige Basis-Anatomie (Dorr B, norma, Normal-Offset). */
function anatomie(over: Partial<StemPlanningAnatomie> = {}): StemPlanningAnatomie {
  return {
    dorr: 'B',
    dorrBestaetigt: true,
    nsaClass: 'norma',
    offsetSubtype: 'N',
    corticalIndex: 0.55,
    nsaDeg: 130,
    femoralOffsetRatio: 1.4,
    ...over,
  }
}

function zementfrei(over: Partial<StemPlanningProfile> = {}): StemPlanningProfile {
  return {
    fixation: 'cementless',
    radaelliClass: 'B2',
    collar: 'collared',
    primaryFixation: 'metadiaphyseal',
    intendedUse: 'primary',
    ...over,
  }
}

const ZEMENTIERT: StemPlanningProfile = {
  fixation: 'cemented',
  collar: 'none',
  primaryFixation: 'cement',
  intendedUse: 'primary',
}

describe('Dorr-C-Fixationsregel', () => {
  it('warnt ohne Profil mit dem Wortlaut der Karten-Abnahme', () => {
    // Der Text ist Vertrag: scripts/abnahme-femurprofil/pruefe-karte.mjs
    // prüft ihn wörtlich („zementierte Fixation/Alternative aktiv prüfen").
    const hints = stemPlanningHints(anatomie({ dorr: 'C', corticalIndex: 0.15 }))
    expect(hints).toHaveLength(1)
    expect(hints[0].severity).toBe('warning')
    expect(hints[0].code).toBe('DORR_C_FIXATION')
    expect(hints[0].text).toContain('zementierte Fixation/Alternative aktiv prüfen')
    expect(hints[0].evidence).toContain('CI 0,15')
  })

  it('warnt bei zementfreiem Schaft und nennt collarless ausdrücklich', () => {
    const collarless = stemPlanningHints(
      anatomie({ dorr: 'C' }),
      zementfrei({ collar: 'none' }),
    )
    expect(collarless[0].code).toBe('DORR_C_ZEMENTFREI')
    expect(collarless[0].severity).toBe('warning')
    expect(collarless[0].text).toContain('(collarless)')

    const collared = stemPlanningHints(anatomie({ dorr: 'C' }), zementfrei())
    expect(collared[0].code).toBe('DORR_C_ZEMENTFREI')
    expect(collared[0].text).not.toContain('collarless')
  })

  it('gibt bei zementierter Fixation bewusst KEINEN Dorr-C-Hinweis', () => {
    // Regel 2 des Plans: keine PPF-Warnung aus dieser Regel; die
    // Knochenqualität (Bone Health) bleibt eine separate Beurteilung.
    const hints = stemPlanningHints(anatomie({ dorr: 'C' }), ZEMENTIERT)
    expect(hints.filter((h) => h.code.startsWith('DORR_C'))).toEqual([])
  })

  it('feuert nicht bei Dorr A oder B', () => {
    for (const dorr of ['A', 'B'] as const) {
      const hints = stemPlanningHints(anatomie({ dorr }))
      expect(hints.filter((h) => h.code.startsWith('DORR_C'))).toEqual([])
    }
  })
})

describe('Dorr-A-Regel (enger Kanal)', () => {
  it('mahnt distales Verklemmen und metaphysäres Undersizing an', () => {
    const hints = stemPlanningHints(anatomie({ dorr: 'A', corticalIndex: 0.68 }))
    const a = hints.find((h) => h.code === 'DORR_A_ENGER_KANAL')!
    expect(a.severity).toBe('caution')
    expect(a.text).toContain('Verklemmen')
    expect(a.text).toContain('Undersizing')
    expect(a.evidence).toContain('CI 0,68')
  })

  it('feuert nicht bei Dorr B oder C', () => {
    for (const dorr of ['B', 'C'] as const) {
      const hints = stemPlanningHints(anatomie({ dorr }))
      expect(hints.find((h) => h.code === 'DORR_A_ENGER_KANAL')).toBeUndefined()
    }
  })
})

describe('Offset-Regeln (vara/H und valga)', () => {
  it('vara + High-Offset: lateralisierte Variante vergleichen (info)', () => {
    const hints = stemPlanningHints(
      anatomie({ nsaClass: 'vara', offsetSubtype: 'H', nsaDeg: 115, femoralOffsetRatio: 1.72 }),
    )
    const h = hints.find((x) => x.code === 'VARA_HIGH_OFFSET')!
    expect(h.severity).toBe('info')
    expect(h.text).toContain('lateralisierte')
    expect(h.evidence).toContain('NSA 115.0°')
    expect(h.evidence).toContain('FOR 1,72')
  })

  it('vara + Normal-Offset und norma + H lösen die vara-Regel NICHT aus', () => {
    const varaN = stemPlanningHints(anatomie({ nsaClass: 'vara', offsetSubtype: 'N' }))
    expect(varaN.find((x) => x.code === 'VARA_HIGH_OFFSET')).toBeUndefined()
    const normaH = stemPlanningHints(anatomie({ nsaClass: 'norma', offsetSubtype: 'H' }))
    expect(normaH.find((x) => x.code === 'VARA_HIGH_OFFSET')).toBeUndefined()
  })

  it('valga ohne Profil: Überoffset-Mahnung als caution', () => {
    const hints = stemPlanningHints(anatomie({ nsaClass: 'valga', nsaDeg: 148 }))
    const h = hints.find((x) => x.code === 'VALGA_UEBEROFFSET')!
    expect(h.severity).toBe('caution')
    expect(h.text).toContain('Überoffset')
  })

  it('valga + lateralisiertes Profil eskaliert zur warning', () => {
    const hints = stemPlanningHints(
      anatomie({ nsaClass: 'valga' }),
      zementfrei({ offsetVariant: 'lateralized' }),
    )
    const h = hints.find((x) => x.code === 'VALGA_LATERALISIERT')!
    expect(h.severity).toBe('warning')
    expect(hints.find((x) => x.code === 'VALGA_UEBEROFFSET')).toBeUndefined()
  })

  it('valga + Standard-Profil bleibt caution', () => {
    const hints = stemPlanningHints(
      anatomie({ nsaClass: 'valga' }),
      zementfrei({ offsetVariant: 'standard' }),
    )
    expect(hints.find((x) => x.code === 'VALGA_UEBEROFFSET')?.severity).toBe('caution')
  })

  it('übergeht die Offset-Regeln ohne NSA-Klasse still', () => {
    const hints = stemPlanningHints(anatomie({ nsaClass: null, offsetSubtype: null }))
    expect(hints.filter((x) => x.code.startsWith('VA'))).toEqual([])
  })
})

describe('Querschnitts-Verträge', () => {
  it('sortiert warnings vor cautions vor infos', () => {
    // Dorr C (warning) + vara/H (info) in einer Anatomie.
    const hints = stemPlanningHints(
      anatomie({ dorr: 'C', nsaClass: 'vara', offsetSubtype: 'H' }),
    )
    const stufen = hints.map((h) => h.severity)
    expect(stufen).toEqual([...stufen].sort((a, b) => {
      const rang = { warning: 0, caution: 1, info: 2 } as const
      return rang[a] - rang[b]
    }))
    expect(stufen[0]).toBe('warning')
  })

  it('nutzt niemals Empfehlungs- oder Kontraindikations-Sprache', () => {
    // Alle Kombinationen durchdrehen und den Wortlaut prüfen.
    const faelle: [StemPlanningAnatomie, StemPlanningProfile | null][] = []
    for (const dorr of ['A', 'B', 'C'] as const)
      for (const nsaClass of ['vara', 'norma', 'valga'] as const)
        for (const offsetSubtype of ['N', 'H'] as const)
          for (const profil of [null, ZEMENTIERT, zementfrei(), zementfrei({ offsetVariant: 'lateralized' })])
            faelle.push([anatomie({ dorr, nsaClass, offsetSubtype }), profil])
    for (const [a, p] of faelle) {
      for (const h of stemPlanningHints(a, p)) {
        expect(h.text).not.toMatch(/empfohlen|empfehlung|kontraindiziert|verwenden sie/i)
        expect(h.evidence.length).toBeGreaterThan(0)
      }
    }
  })

  it('kennzeichnet einen unbestätigten Dorr in den Belegen', () => {
    const hints = stemPlanningHints(anatomie({ dorr: 'C', dorrBestaetigt: false }))
    expect(hints[0].evidence[0]).toBe('Dorr C (Vorschlag, unbestätigt)')
    const bestaetigt = stemPlanningHints(anatomie({ dorr: 'C' }))
    expect(bestaetigt[0].evidence[0]).toBe('Dorr C (ärztlich bestätigt)')
  })

  it('lässt fehlende Messwerte einfach aus den Belegen weg', () => {
    const hints = stemPlanningHints(anatomie({ dorr: 'C', corticalIndex: null }))
    expect(hints[0].evidence).toEqual(['Dorr C (ärztlich bestätigt)'])
  })
})
