// Charakterisierungs-Tests: Wem gehoert ein Tastendruck?
//
// Nutzer-Befund 08/2026: Nach dem Platzieren des Schafts sprang Alt+Pfeil
// durch die GROESSEN statt zu drehen, weil der Fokus noch im
// Groessen-Dropdown lag. Der eingeuebte Ausweg (Hand-Werkzeug klicken, dann
// ins leere Bild) diente allein dazu, den Fokus loszuwerden.
import { describe, expect, it } from 'vitest'
import { fokusArt, schabloneDarfTaste } from './tastaturFokus'

const el = (tag: string, contentEditable = false) =>
  ({ tagName: tag, isContentEditable: contentEditable }) as unknown as EventTarget

describe('fokusArt', () => {
  it('erkennt Texteingaben — auch in Grossschreibung des tagName', () => {
    expect(fokusArt(el('INPUT'))).toBe('texteingabe')
    expect(fokusArt(el('TEXTAREA'))).toBe('texteingabe')
    expect(fokusArt(el('DIV', true))).toBe('texteingabe')
  })

  it('erkennt das Dropdown', () => {
    expect(fokusArt(el('SELECT'))).toBe('dropdown')
    expect(fokusArt(el('select'))).toBe('dropdown')
  })

  it('haelt alles andere fuer frei', () => {
    expect(fokusArt(el('BODY'))).toBe('frei')
    expect(fokusArt(el('BUTTON'))).toBe('frei')
    expect(fokusArt(el('CANVAS'))).toBe('frei')
    expect(fokusArt(null)).toBe('frei')
  })
})

describe('schabloneDarfTaste', () => {
  it('DER BEFUND: die Implantat-Geste ueberstimmt ein Dropdown', () => {
    expect(schabloneDarfTaste('dropdown', true)).toBe(true)
  })

  it('blanke Pfeiltasten bleiben beim Dropdown', () => {
    // Sonst liesse sich die Groesse per Tastatur gar nicht mehr waehlen.
    expect(schabloneDarfTaste('dropdown', false)).toBe(false)
  })

  it('Texteingaben behalten IMMER Vorrang — auch bei der Implantat-Geste', () => {
    // Alt+Pfeil springt dort z. B. wortweise; das darf nicht gekapert werden.
    expect(schabloneDarfTaste('texteingabe', true)).toBe(false)
    expect(schabloneDarfTaste('texteingabe', false)).toBe(false)
  })

  it('ohne fangendes Element greift die Steuerung immer', () => {
    expect(schabloneDarfTaste('frei', true)).toBe(true)
    expect(schabloneDarfTaste('frei', false)).toBe(true)
  })
})
