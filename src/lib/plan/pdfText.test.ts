import { describe, expect, it } from 'vitest'
import { pdfSicher } from './pdfText'

describe('pdfSicher — zentrale PDF-Zeichenabsicherung', () => {
  it('ersetzt das echte Minus — sonst wird die ganze Zeile unlesbar', () => {
    expect(pdfSicher('Mikulicz-Abstand: −12,5 mm')).toBe('Mikulicz-Abstand: -12,5 mm')
    expect(pdfSicher('LLD: −0,45 cm links')).toBe('LLD: -0,45 cm links')
  })

  it('ersetzt griechische Buchstaben und Symbole lesbar', () => {
    expect(pdfSicher('β-Winkel (Femur-AMA): 6,4°')).toBe('beta-Winkel (Femur-AMA): 6,4°')
    expect(pdfSicher('ΔJLCA ≥ 5° → DLO')).toBe('Delta JLCA >= 5° -> DLO')
    expect(pdfSicher('• Vollvermessung — „Test"')).toBe('- Vollvermessung - "Test"')
  })

  it('lässt Latin-1 unangetastet (°, µ, ·, ×, Umlaute, geschütztes Leerzeichen)', () => {
    const s = 'Größe · 3×2 µm 85,9° Übergang %'
    expect(pdfSicher(s)).toBe(s)
  })

  it('liefert für beliebige Eingaben nur Latin-1', () => {
    const folter = 'Δ≥≤→⅓—–•„“‚’…− 😀 ✓ ∑ ∞ β α'
    for (const ch of pdfSicher(folter)) expect(ch.codePointAt(0)!).toBeLessThanOrEqual(0xff)
  })
})
