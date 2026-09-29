// PDF-Zeilen der Umstellungsosteotomie: WinAnsi-sichere Zeichen,
// Umbruch langer Hinweise und die Kernwerte in der Ausgabe.
import { describe, expect, it } from 'vitest'
import {
  osteotomiePdfZeilen,
  deformitaetPdfZeilen,
  pdfSicherOsteotomie,
  umbrechen,
} from './osteotomieText'
import { berechneOsteotomie } from '../../components/useOsteotomie'
import type { KneeMeasurement } from '../../state/kneeStore'
import type { OsteotomiePlan } from '../../state/kneeOsteotomieStore'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]
const tib = (y: number) => (-35 * (y - 428)) / 392
const PUNKTE = [
  p(-24, 0), p(0, -24), p(24, 0),
  p(33, 150), p(57, 150), p(3, 330), p(27, 330),
  p(-38, 420), p(38, 420), p(-38, 428), p(38, 428), p(0, 424),
  p(tib(550) - 12, 550), p(tib(550) + 12, 550), p(tib(750) - 10, 750), p(tib(750) + 10, 750),
  p(-35, 820),
]
const MESSUNG = {
  id: 'k1',
  kind: 'workflow',
  points: PUNKTE,
  visible: true,
  labelOffset: { x: 0, y: 0 },
  labelStyle: { fontSize: 13, color: '#fff', bold: false, underline: false },
} as KneeMeasurement
const PLAN: OsteotomiePlan = {
  typ: 'htoOeffnend',
  zielWblProzent: 95,
  dloZielLdfa: 88,
  deltaJlca: null,
  bildSimulation: true,
  sichtbar: true,
  femurScharnier: null,
  femurStart: null,
  tibiaScharnier: p(30, 445),
  tibiaStart: p(-36, 470),
}

describe('osteotomieText', () => {
  it('ersetzt Zeichen, die Helvetica/WinAnsi nicht kann', () => {
    expect(pdfSicherOsteotomie('a → b ≥ ⅓ ΔJLCA — x')).toBe('a -> b >= 1/3 Delta JLCA - x')
  })
  it('bricht lange Zeilen um und rückt Folgezeilen ein', () => {
    const z = umbrechen('wort '.repeat(60))
    expect(z.length).toBeGreaterThan(1)
    expect(z.every((l) => l.length <= 100)).toBe(true)
    expect(z[1].startsWith('   ')).toBe(true)
  })
  it('liefert Korrektur, Vorher/Nachher und die MPTA-Warnung', () => {
    const d = berechneOsteotomie([MESSUNG], PLAN, 1)
    const zeilen = osteotomiePdfZeilen(d)
    const text = zeilen.join('\n')
    expect(text).toContain('öffnende HTO')
    expect(text).toMatch(/Tibia: Korrektur \d+,\d° \| Öffnung/)
    expect(text).toContain('Traglinie: 26,0 % -> 95,0 %')
    expect(text).toContain('(!) Geplanter mMPTA')
    expect(text).toMatch(/CPAK: Typ [IVX]+ -> Typ [IVX]+/)
    // Keine Zeichen außerhalb von WinAnsi-typischem Latin-1 (+ ° · Umlaute).
    expect(text).not.toMatch(/[→≥≤⅓Δ—–]/)
  })
  it('nennt den Grund, wenn die Vollvermessung fehlt', () => {
    const d = berechneOsteotomie([], PLAN, 1)
    expect(osteotomiePdfZeilen(d).join('\n')).toContain(
      'Planung unvollständig: Vollvermessung fehlt oder ist ausgeblendet.',
    )
  })
  it('vermerkt ein unkalibriertes Bild', () => {
    const d = berechneOsteotomie([MESSUNG], PLAN, 1)
    const text = osteotomiePdfZeilen(d, { kalibriert: false }).join('\n')
    expect(text).toContain('Bild nicht kalibriert')
    expect(osteotomiePdfZeilen(d).join('\n')).not.toContain('nicht kalibriert')
    expect(text).not.toMatch(/[^\u0000-\u00ff]/)
  })
  it('Deformitätsanalyse listet die Paley-Bewertung', () => {
    const d = berechneOsteotomie([MESSUNG], null, 1)
    const text = deformitaetPdfZeilen(d).join('\n')
    expect(text).toContain('Achse: Varus')
    expect(text).toContain('mMPTA 84,9° (Norm 85-90°) zu niedrig')
    expect(osteotomiePdfZeilen(d)).toEqual([])
  })
})
