// Charakterisierungs-Tests des Schulter-Stores.
//
// Schwerpunkt ist der SEITEN-SCHNAPPSCHUSS: `side` wird beim Anlegen einer
// Messung eingefroren. Ohne das würde ein späterer Wechsel des globalen
// Seiten-Schalters alle bereits gesetzten Messungen still umdeuten — auf
// der a.p.-Aufnahme hängen CSA und Akromion-Index daran, welche Richtung
// „lateral" ist (Plan `docs/schulter-modul-plan.md`, B.9).
//
// Da die echten Rezepte erst in Schritt 2 ff. dazukommen, speist dieser
// Test ein minimales Prüf-Rezept in die Registry ein.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useShoulderStore } from './shoulderStore'
import {
  SHOULDER_RECIPES,
  type ShoulderRecipe,
} from '../lib/shoulder/recipes'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]

// Zwei-Punkt-Rezept, nur als Vehikel für die Store-Logik.
const PRUEF_REZEPT: ShoulderRecipe = {
  kind: 'csa',
  label: 'Prüf-Rezept',
  steps: ['Punkt 1', 'Punkt 2'],
  needsCalibration: false,
  lineGroups: [[0, 1]],
  compute: () => ({ values: [], geometry: { lines: [], circles: [], labels: [] } }),
}

describe('shoulderStore', () => {
  beforeEach(() => {
    SHOULDER_RECIPES.csa = PRUEF_REZEPT
    useShoulderStore.getState().reset()
    useShoulderStore.getState().setSide('R')
    useShoulderStore.getState().setProsthesis('anatomic')
  })
  afterEach(() => {
    delete SHOULDER_RECIPES.csa
  })

  it('friert die Seite beim Anlegen der Messung ein', () => {
    const store = useShoulderStore.getState()
    store.setSide('L')
    store.toggleTool('csa')
    useShoulderStore.getState().addDraftPoint(p(0, 0))
    useShoulderStore.getState().addDraftPoint(p(10, 10))

    expect(useShoulderStore.getState().measurements[0].side).toBe('L')

    // Globalen Schalter umlegen — die bestehende Messung darf sich NICHT
    // ändern (das ist der eigentliche Zweck des Schnappschusses).
    useShoulderStore.getState().setSide('R')
    expect(useShoulderStore.getState().measurements[0].side).toBe('L')
    expect(useShoulderStore.getState().side).toBe('R')
  })

  it('neue Messungen übernehmen die AKTUELLE Seite', () => {
    const store = useShoulderStore.getState()
    store.toggleTool('csa')
    useShoulderStore.getState().addDraftPoint(p(0, 0))
    useShoulderStore.getState().addDraftPoint(p(1, 1))

    useShoulderStore.getState().setSide('L')
    useShoulderStore.getState().toggleTool('csa')
    useShoulderStore.getState().addDraftPoint(p(2, 2))
    useShoulderStore.getState().addDraftPoint(p(3, 3))

    const m = useShoulderStore.getState().measurements
    expect(m).toHaveLength(2)
    expect(m[0].side).toBe('R')
    expect(m[1].side).toBe('L')
  })

  it('nach dem letzten Punkt: Messung angelegt, Draft leer, Werkzeug ZU', () => {
    // Gleiche Zusicherung wie in Hüfte und Knie — ein offen bleibendes
    // Werkzeug würde Klicks abfangen, die der Schablone gelten.
    useShoulderStore.getState().toggleTool('csa')
    useShoulderStore.getState().addDraftPoint(p(0, 0))
    useShoulderStore.getState().addDraftPoint(p(5, 5))

    const s = useShoulderStore.getState()
    expect(s.measurements).toHaveLength(1)
    expect(s.draftPoints).toHaveLength(0)
    expect(s.activeKind).toBeNull()
  })

  it('vor dem letzten Punkt bleibt das Werkzeug aktiv', () => {
    useShoulderStore.getState().toggleTool('csa')
    useShoulderStore.getState().addDraftPoint(p(0, 0))
    expect(useShoulderStore.getState().activeKind).toBe('csa')
    expect(useShoulderStore.getState().draftPoints).toHaveLength(1)
  })

  it('ohne hinterlegtes Rezept passiert nichts (Gerüst-Zustand)', () => {
    // Solange ein Messtyp nur deklariert, aber nicht implementiert ist,
    // darf ein Klick keine unvollständige Messung erzeugen.
    delete SHOULDER_RECIPES.csa
    useShoulderStore.getState().toggleTool('csa')
    useShoulderStore.getState().addDraftPoint(p(0, 0))
    expect(useShoulderStore.getState().measurements).toHaveLength(0)
    expect(useShoulderStore.getState().draftPoints).toHaveLength(0)
  })

  it('Prothesentyp ist umschaltbar und beeinflusst Messungen nicht', () => {
    useShoulderStore.getState().toggleTool('csa')
    useShoulderStore.getState().addDraftPoint(p(0, 0))
    useShoulderStore.getState().addDraftPoint(p(1, 1))
    const vorher = useShoulderStore.getState().measurements[0]

    useShoulderStore.getState().setProsthesis('reverse')
    expect(useShoulderStore.getState().prosthesis).toBe('reverse')
    expect(useShoulderStore.getState().measurements[0]).toEqual(vorher)
  })
})
