// Charakterisierungs-Tests der Genesis-II-Tibia-Entdopplung.
//
// Nutzer-Befund (zum zweiten Mal): „male tapered" und „female tapered"
// tauchten WIEDER beide im Tibia-Dropdown auf. Die erste Loesung hing
// daran, dass das Paket fuer die Male-Variante keine Kontur lieferte —
// sobald sie doch platzierbar wird (Paket mit beiden Konturensaetzen
// oder alte Browser-Traces im localStorage), war das Duplikat zurueck.
// Beide Typen teilen sich in der App dieselbe Masstabelle; das Angebot
// zeigt deshalb genau EINEN Eintrag, ohne den female/male-Zusatz.
import { describe, expect, it } from 'vitest'
import {
  entdoppleGenesisTibia,
  ohneTibiaVariantenZusatz,
  type KneeImplantFamily,
  type KneeImplantKind,
} from './smithNephewCatalog'

const familie = (kind: KneeImplantKind, label: string): KneeImplantFamily => ({
  kind,
  label,
  manufacturer: 'Smith+Nephew',
  procedure: 'TKA',
  bone: 'Tibia',
  sizeCount: 8,
})

describe('ohneTibiaVariantenZusatz', () => {
  it('entfernt female/male aus dem Label', () => {
    expect(ohneTibiaVariantenZusatz('Genesis II female tapered')).toBe(
      'Genesis II tapered',
    )
    expect(ohneTibiaVariantenZusatz('Genesis II male tapered')).toBe(
      'Genesis II tapered',
    )
  })

  it('laesst Labels ohne Zusatz unangetastet', () => {
    expect(ohneTibiaVariantenZusatz('Legion PS')).toBe('Legion PS')
    expect(ohneTibiaVariantenZusatz('Genesis II tapered')).toBe(
      'Genesis II tapered',
    )
  })

  it('trifft nur ganze Woerter, keine Teilstrings', () => {
    // "Malereihe" o. ae. darf nicht zerlegt werden.
    expect(ohneTibiaVariantenZusatz('Maleachi Malerei')).toBe('Maleachi Malerei')
  })
})

describe('entdoppleGenesisTibia', () => {
  const female = familie('genesis-tibia-female', 'Genesis II female tapered')
  const male = familie('genesis-tibia-male', 'Genesis II male tapered')
  const andere = familie('sphere-tibia-baseplate', 'Sphere T')

  it('macht aus beiden Varianten EINEN Eintrag ohne Zusatz', () => {
    const angebot = entdoppleGenesisTibia([female, male, andere])
    expect(angebot).toHaveLength(2)
    expect(angebot[0].label).toBe('Genesis II tapered')
    expect(angebot[1]).toBe(andere)
  })

  it('behaelt die einzige platzierbare Variante — auch die Male-Variante', () => {
    // Die Liste kommt bereits platzierbarkeits-gefiltert an; ist nur
    // male platzierbar, muss male bleiben (sonst waere nichts waehlbar).
    const angebot = entdoppleGenesisTibia([male, andere])
    expect(angebot).toHaveLength(2)
    expect(angebot[0].kind).toBe('genesis-tibia-male')
    expect(angebot[0].label).toBe('Genesis II tapered')
  })

  it('erhaelt die Reihenfolge und laesst fremde Familien unveraendert', () => {
    const angebot = entdoppleGenesisTibia([andere, female, male])
    expect(angebot.map((f) => f.kind)).toEqual([
      'sphere-tibia-baseplate',
      'genesis-tibia-female',
    ])
    expect(angebot[0].label).toBe('Sphere T')
  })

  it('ist ein No-Op ohne Genesis-Eintraege', () => {
    const eingabe = [andere]
    expect(entdoppleGenesisTibia(eingabe)).toEqual(eingabe)
  })

  it('veraendert die Eingabe-Liste nicht (Registry-Arrays sind live)', () => {
    const eingabe = [female, male]
    entdoppleGenesisTibia(eingabe)
    expect(eingabe).toHaveLength(2)
    expect(female.label).toBe('Genesis II female tapered')
  })
})
