import { describe, expect, it } from 'vitest'
import {
  cm,
  cmMitVorzeichen,
  grad,
  gradMitVorzeichen,
  mm,
  mmMitVorzeichen,
  prozent,
  verhaeltnis,
  zahl,
  zahlMitVorzeichen,
} from './zahlFormat'

describe('zahlFormat — eine Schreibweise für alles', () => {
  it('schreibt deutsches Komma und echtes Minus', () => {
    expect(zahl(176.73)).toBe('176,7')
    expect(zahl(-12.54)).toBe('−12,5')
    expect(zahl(0.5, 2)).toBe('0,50')
  })

  it('unterdrückt „−0,0" bei Werten, die auf null runden', () => {
    expect(zahl(-0.04)).toBe('0,0')
    expect(zahlMitVorzeichen(-0.04)).toBe('0,0')
    expect(zahlMitVorzeichen(0)).toBe('0,0')
  })

  it('setzt das Vorzeichen explizit, wo die Richtung zählt', () => {
    expect(zahlMitVorzeichen(2.4)).toBe('+2,4')
    expect(zahlMitVorzeichen(-1.8)).toBe('−1,8')
    expect(gradMitVorzeichen(3.25)).toBe('+3,3°')
    expect(mmMitVorzeichen(-4.2)).toBe('−4,2 mm')
    expect(cmMitVorzeichen(6)).toBe('+0,60 cm')
  })

  it('klebt Einheiten mit geschütztem Leerzeichen an — kein Umbruch', () => {
    expect(mm(12.5)).toBe('12,5 mm')
    expect(prozent(34.6)).toBe('34,6 %')
    expect(cm(4.5)).toBe('0,45 cm')
    expect(grad(85.9)).toBe('85,9°')
  })

  it('formatiert Verhältnisse zweistellig', () => {
    expect(verhaeltnis(1.6)).toBe('1,60')
  })

  it('nutzt nur Zeichen, die das PDF nach der zentralen Absicherung kennt', () => {
    // U+2212 ersetzt pdfText.ts; alles andere muss Latin-1 sein.
    for (const s of [zahl(-3), mm(-3), prozent(12), cm(-4), grad(-1)]) {
      for (const ch of s.replace(/−/g, '-')) expect(ch.charCodeAt(0)).toBeLessThanOrEqual(0xff)
    }
  })
})
