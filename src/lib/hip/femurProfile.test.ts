import { describe, expect, it } from 'vitest'
import {
  DORR_BORDERLINE_ZONES,
  DORR_CI_THRESHOLDS,
  FOR_HIGH_AT,
  NSA_THRESHOLDS,
  classifyDorr,
  classifyNsa,
  classifyOffsetSubtype,
  computeCpah,
} from './femurProfile'

describe('Dorr-Klassifikation', () => {
  it('klassifiziert klare A-, B- und C-Werte', () => {
    expect(classifyDorr(0.63).suggested).toBe('A')
    expect(classifyDorr(0.55).suggested).toBe('B')
    expect(classifyDorr(0.45).suggested).toBe('C')
  })

  it('markiert A/B- und B/C-Grenzbereiche', () => {
    expect(classifyDorr(0.6).borderline).toBe('A/B')
    expect(classifyDorr(0.5).borderline).toBe('B/C')
  })

  it('hat außerhalb der Grenzzonen keinen Grenzbereich', () => {
    expect(classifyDorr(0.63).borderline).toBeNull()
    expect(classifyDorr(0.55).borderline).toBeNull()
    expect(classifyDorr(0.45).borderline).toBeNull()
  })

  // Die Klassengrenzen sind EINSCHLIESSEND für B (Handoff: A ist CI > 0,60,
  // B ist 0,50 <= CI <= 0,60, C ist CI < 0,50). Exakt 0,60 und exakt 0,50
  // gehören also zu B — genau das ist beim Ablesen die Stolperstelle.
  it('ordnet die Klassengrenzen 0,60 und 0,50 dem Typ B zu', () => {
    expect(classifyDorr(DORR_CI_THRESHOLDS.dorrAAbove).suggested).toBe('B')
    expect(classifyDorr(DORR_CI_THRESHOLDS.dorrCBelow).suggested).toBe('B')
  })

  it('klassifiziert knapp jenseits der Grenzen als A bzw. C', () => {
    expect(classifyDorr(0.601).suggested).toBe('A')
    expect(classifyDorr(0.499).suggested).toBe('C')
  })

  // Die Grenzzonen sind eine EIGENE Konvention (siehe Kommentar im Modul),
  // keine Paper-Angabe — ihre Ränder gehören ausdrücklich dazu.
  it.each([
    [0.58, 'B', 'A/B'],
    [0.6, 'B', 'A/B'],
    [0.62, 'A', 'A/B'],
    [0.48, 'C', 'B/C'],
    [0.5, 'B', 'B/C'],
    [0.52, 'B', 'B/C'],
  ] as const)('CI %f → Dorr %s, Grenzbereich %s', (ci, typ, zone) => {
    const r = classifyDorr(ci)
    expect(r.suggested).toBe(typ)
    expect(r.borderline).toBe(zone)
  })

  it('liegt direkt außerhalb der Zonenränder nicht mehr im Grenzbereich', () => {
    expect(classifyDorr(0.579).borderline).toBeNull()
    expect(classifyDorr(0.621).borderline).toBeNull()
    expect(classifyDorr(0.479).borderline).toBeNull()
    expect(classifyDorr(0.521).borderline).toBeNull()
  })

  // Sicherheitsnetz: NaN würde durch alle Vergleiche fallen und still als
  // „C" enden — also als die Klasse, die eine Zementier-Warnung auslöst.
  // Ein lauter Fehler ist hier allemal besser als eine erfundene Klasse.
  it('wirft bei nicht endlichen Werten statt still C zu liefern', () => {
    expect(() => classifyDorr(Number.NaN)).toThrow()
    expect(() => classifyDorr(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('NSA-Klassifikation', () => {
  it('klassifiziert vara, norma und valga', () => {
    expect(classifyNsa(115)).toBe('vara')
    expect(classifyNsa(130)).toBe('norma')
    expect(classifyNsa(145)).toBe('valga')
  })

  // Handoff: vara < 120°, norma 120–140°, valga > 140° — die Grenzwerte
  // selbst gehören also zu norma.
  it('ordnet 120° und 140° dem Bereich norma zu', () => {
    expect(classifyNsa(NSA_THRESHOLDS.varaBelow)).toBe('norma')
    expect(classifyNsa(NSA_THRESHOLDS.valgaAbove)).toBe('norma')
  })

  it('klassifiziert knapp jenseits der Grenzen als vara bzw. valga', () => {
    expect(classifyNsa(119.9)).toBe('vara')
    expect(classifyNsa(140.1)).toBe('valga')
  })

  it('wirft bei nicht endlichen Werten', () => {
    expect(() => classifyNsa(Number.NaN)).toThrow()
  })
})

describe('Offset-Untertyp', () => {
  it('trennt normales und hohes Offset', () => {
    expect(classifyOffsetSubtype(1.4)).toBe('N')
    expect(classifyOffsetSubtype(1.8)).toBe('H')
  })

  // Handoff: N ist FOR < 1,60, H ist FOR >= 1,60 — die Schwelle selbst
  // gehört zu H.
  it('ordnet die Schwelle 1,60 dem Untertyp H zu', () => {
    expect(classifyOffsetSubtype(FOR_HIGH_AT)).toBe('H')
    expect(classifyOffsetSubtype(1.599)).toBe('N')
  })

  it('wirft bei nicht endlichen Werten', () => {
    expect(() => classifyOffsetSubtype(Number.NaN)).toThrow()
  })
})

describe('CPAH', () => {
  it('bildet Dorr B + norma + High-offset auf 5H ab', () => {
    expect(computeCpah('B', 'norma', 'H').code).toBe('5H')
  })

  // Vollständige Matrix: Dorr A = 1/2/3, B = 4/5/6, C = 7/8/9,
  // jeweils vara | norma | valga.
  it.each([
    ['A', 'vara', 1],
    ['A', 'norma', 2],
    ['A', 'valga', 3],
    ['B', 'vara', 4],
    ['B', 'norma', 5],
    ['B', 'valga', 6],
    ['C', 'vara', 7],
    ['C', 'norma', 8],
    ['C', 'valga', 9],
  ] as const)('Dorr %s + %s → Typ %i', (dorr, nsa, typ) => {
    expect(computeCpah(dorr, nsa, 'N').type).toBe(typ)
  })

  it('hängt den Offset-Untertyp an den Code an', () => {
    expect(computeCpah('A', 'vara', 'N').code).toBe('1N')
    expect(computeCpah('C', 'valga', 'H').code).toBe('9H')
  })

  it('gibt den Untertyp auch einzeln zurück', () => {
    const r = computeCpah('B', 'norma', 'H')
    expect(r.offsetSubtype).toBe('H')
    expect(r.type).toBe(5)
  })
})

describe('Schwellen-Konstanten', () => {
  // Die CpahMatrix leitet Zellgrenzen und Grenzbänder aus genau diesen
  // Konstanten ab. Liefe eine Konstante weg, zeigte das Schaubild etwas
  // anderes als die Rechenlogik — deshalb hier festgenagelt.
  it('entsprechen den im Handoff dokumentierten Werten', () => {
    expect(DORR_CI_THRESHOLDS.dorrAAbove).toBe(0.6)
    expect(DORR_CI_THRESHOLDS.dorrCBelow).toBe(0.5)
    expect(DORR_BORDERLINE_ZONES.ab).toEqual([0.58, 0.62])
    expect(DORR_BORDERLINE_ZONES.bc).toEqual([0.48, 0.52])
    expect(NSA_THRESHOLDS.varaBelow).toBe(120)
    expect(NSA_THRESHOLDS.valgaAbove).toBe(140)
    expect(FOR_HIGH_AT).toBe(1.6)
  })

  it('lässt die Grenzzonen die Klassengrenzen einschließen', () => {
    const [abLo, abHi] = DORR_BORDERLINE_ZONES.ab
    const [bcLo, bcHi] = DORR_BORDERLINE_ZONES.bc
    expect(abLo).toBeLessThan(DORR_CI_THRESHOLDS.dorrAAbove)
    expect(abHi).toBeGreaterThan(DORR_CI_THRESHOLDS.dorrAAbove)
    expect(bcLo).toBeLessThan(DORR_CI_THRESHOLDS.dorrCBelow)
    expect(bcHi).toBeGreaterThan(DORR_CI_THRESHOLDS.dorrCBelow)
  })

  it('lässt die beiden Grenzzonen einander nicht überlappen', () => {
    expect(DORR_BORDERLINE_ZONES.bc[1]).toBeLessThan(DORR_BORDERLINE_ZONES.ab[0])
  })
})
