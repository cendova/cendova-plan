// Charakterisierungs-Tests: Wem gehoert ein Tastendruck?
//
// Nutzer-Befund 08/2026: Nach dem Platzieren des Schafts sprang Alt+Pfeil
// durch die GROESSEN statt zu drehen, weil der Fokus noch im
// Groessen-Dropdown lag. Der eingeuebte Ausweg (Hand-Werkzeug klicken, dann
// ins leere Bild) diente allein dazu, den Fokus loszuwerden.
import { describe, expect, it } from 'vitest'
import { fokusArt, rotationsDelta, schabloneDarfTaste } from './tastaturFokus'

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

const taste = (
  key: string,
  mod: { altKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent =>
  ({ key, altKey: !!mod.altKey, shiftKey: !!mod.shiftKey }) as KeyboardEvent

describe('rotationsDelta — einheitlich fuer Huefte, Knie und Schulter', () => {
  it('dreht mit Alt + Pfeil rechts/oben im Uhrzeigersinn', () => {
    expect(rotationsDelta(taste('ArrowRight', { altKey: true }))).toBe(0.2)
    expect(rotationsDelta(taste('ArrowUp', { altKey: true }))).toBe(0.2)
  })

  it('dreht mit Alt + Pfeil links/unten gegen den Uhrzeigersinn', () => {
    expect(rotationsDelta(taste('ArrowLeft', { altKey: true }))).toBe(-0.2)
    expect(rotationsDelta(taste('ArrowDown', { altKey: true }))).toBe(-0.2)
  })

  it('OHNE Alt ist eine Pfeiltaste KEINE Rotation (sie verschiebt)', () => {
    expect(rotationsDelta(taste('ArrowRight'))).toBeNull()
    expect(rotationsDelta(taste('ArrowUp'))).toBeNull()
    expect(rotationsDelta(taste('ArrowLeft'))).toBeNull()
    expect(rotationsDelta(taste('ArrowDown'))).toBeNull()
  })

  it('haelt „+" und „−" als Kurzform bei (Knie-Handgriff bleibt gueltig)', () => {
    expect(rotationsDelta(taste('+'))).toBe(0.2)
    expect(rotationsDelta(taste('-'))).toBe(-0.2)
  })

  it('schaltet mit Shift auf den groben Schritt', () => {
    expect(rotationsDelta(taste('ArrowRight', { altKey: true, shiftKey: true }))).toBe(1)
    expect(rotationsDelta(taste('ArrowLeft', { altKey: true, shiftKey: true }))).toBe(-1)
  })

  it('ignoriert alles andere', () => {
    expect(rotationsDelta(taste('a', { altKey: true }))).toBeNull()
    expect(rotationsDelta(taste('Enter'))).toBeNull()
    expect(rotationsDelta(taste('Escape', { altKey: true }))).toBeNull()
  })
})
