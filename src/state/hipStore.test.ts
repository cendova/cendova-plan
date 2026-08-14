// Charakterisierungs-Tests des Hüft-Stores. Schwerpunkt: der Lebenszyklus
// der Bildqualitäts-Bestätigung (Gate) — sie darf ihre Sitzung NICHT
// überleben, sonst gälte eine Bestätigung stillschweigend für eine andere
// Aufnahme.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Types } from '@cornerstonejs/core'
import { useHipStore } from './hipStore'
import {
  type FemurProfileImageQuality,
  isFemurProfileClassifiable,
  leereBildqualitaet,
} from '../lib/hip/femurProfile'

const p = (x: number, y: number, z = 0): Types.Point3 => [x, y, z]

/** Vollständig bestandene Checkliste mit Zeitstempel. */
function bestandenesGate(): FemurProfileImageQuality {
  return {
    ...leereBildqualitaet(true),
    apProjectionAcceptable: true,
    rotationAcceptable: true,
    lesserTrochanterVisible: true,
    cortexVisible: true,
    femurCoverage10cm: true,
    deformityAffectsGeometry: false,
    confirmedAt: '2026-08-11T12:00:00.000Z',
  }
}

beforeEach(() => {
  useHipStore.getState().reset()
})

describe('Bildqualitäts-Gate im Store', () => {
  it('startet ohne Bestätigung', () => {
    expect(useHipStore.getState().femurProfileGate).toBeNull()
  })

  it('hält eine bestätigte Checkliste', () => {
    useHipStore.getState().setFemurProfileGate(bestandenesGate())
    const gate = useHipStore.getState().femurProfileGate
    expect(gate).not.toBeNull()
    expect(isFemurProfileClassifiable(gate)).toBe(true)
  })

  it('erhält Ausschlussgründe unverändert über den Store-Roundtrip', () => {
    const gate: FemurProfileImageQuality = {
      ...leereBildqualitaet(true),
      apProjectionAcceptable: true,
      rotationAcceptable: false,
      lesserTrochanterVisible: true,
      cortexVisible: true,
      femurCoverage10cm: true,
      exclusionReasons: ['Rotation nicht vertretbar'],
    }
    useHipStore.getState().setFemurProfileGate(gate)
    const zurueck = useHipStore.getState().femurProfileGate!
    expect(zurueck.exclusionReasons).toEqual(['Rotation nicht vertretbar'])
    // Nicht bestanden heißt: keine Klassifikation — aber der Store hält
    // den Befund trotzdem, damit er dokumentiert werden kann.
    expect(isFemurProfileClassifiable(zurueck)).toBe(false)
  })

  it('bleibt beim Einschalten des Femurprofils erhalten', () => {
    // Der Dialog setzt das Gate unmittelbar VOR dem Start — genau dieser
    // eine Übergang darf es nicht wegräumen.
    useHipStore.getState().setFemurProfileGate(bestandenesGate())
    useHipStore.getState().toggleTool('femurProfile')
    expect(useHipStore.getState().activeKind).toBe('femurProfile')
    expect(useHipStore.getState().femurProfileGate).not.toBeNull()
  })

  it('wird von cancelTool verworfen', () => {
    useHipStore.getState().setFemurProfileGate(bestandenesGate())
    useHipStore.getState().toggleTool('femurProfile')
    useHipStore.getState().cancelTool()
    expect(useHipStore.getState().femurProfileGate).toBeNull()
    expect(useHipStore.getState().activeKind).toBeNull()
  })

  it('wird beim Abschalten desselben Werkzeugs verworfen', () => {
    useHipStore.getState().setFemurProfileGate(bestandenesGate())
    useHipStore.getState().toggleTool('femurProfile')
    useHipStore.getState().toggleTool('femurProfile') // aus
    expect(useHipStore.getState().femurProfileGate).toBeNull()
  })

  it('wird beim Wechsel auf ein anderes Werkzeug verworfen', () => {
    useHipStore.getState().setFemurProfileGate(bestandenesGate())
    useHipStore.getState().toggleTool('femurProfile')
    useHipStore.getState().toggleTool('ccd')
    expect(useHipStore.getState().femurProfileGate).toBeNull()
  })

  it('wandert beim Abschluss an die fertige Messung', () => {
    useHipStore.getState().setFemurProfileGate(bestandenesGate())
    useHipStore.getState().toggleTool('femurProfile')
    for (let i = 0; i < 13; i++) useHipStore.getState().addDraftPoint(p(i, i))
    const m = useHipStore.getState().measurements[0]
    expect(m.femurProfileReview?.imageQuality.confirmedAt).toBe(
      '2026-08-11T12:00:00.000Z',
    )
    expect(isFemurProfileClassifiable(m.femurProfileReview?.imageQuality)).toBe(true)
    expect(useHipStore.getState().activeKind).toBeNull()
  })

  it('heftet auch eine NICHT bestandene Bestätigung an', () => {
    // Gerade der Fall muss dokumentiert werden — sonst wüsste die Karte
    // später nicht, warum sie keine Klasse zeigt.
    const gate: FemurProfileImageQuality = {
      ...leereBildqualitaet(true),
      exclusionReasons: ['Rotation nicht vertretbar'],
    }
    useHipStore.getState().setFemurProfileGate(gate)
    useHipStore.getState().toggleTool('femurProfile')
    for (let i = 0; i < 13; i++) useHipStore.getState().addDraftPoint(p(i, i))
    const m = useHipStore.getState().measurements[0]
    expect(m.femurProfileReview?.imageQuality.exclusionReasons).toEqual([
      'Rotation nicht vertretbar',
    ])
    expect(isFemurProfileClassifiable(m.femurProfileReview?.imageQuality)).toBe(false)
  })

  it('heftet an andere Messarten nichts an', () => {
    useHipStore.getState().setFemurProfileGate(bestandenesGate())
    useHipStore.getState().toggleTool('ccd') // verwirft das Gate
    for (let i = 0; i < 6; i++) useHipStore.getState().addDraftPoint(p(i, i))
    expect(useHipStore.getState().measurements[0].femurProfileReview).toBeUndefined()
  })

  it('wird von reset verworfen (neues Bild)', () => {
    useHipStore.getState().setFemurProfileGate(bestandenesGate())
    useHipStore.getState().reset()
    expect(useHipStore.getState().femurProfileGate).toBeNull()
  })
})

describe('Werkzeug-Lebenszyklus', () => {
  it('schließt das Werkzeug nach dem letzten Punkt', () => {
    useHipStore.getState().toggleTool('ccd')
    for (let i = 0; i < 6; i++) useHipStore.getState().addDraftPoint(p(i, i))
    expect(useHipStore.getState().activeKind).toBeNull()
    expect(useHipStore.getState().draftPoints).toEqual([])
    expect(useHipStore.getState().measurements).toHaveLength(1)
  })

  it('zählt das Femurprofil als eigene Messung mit 13 Punkten', () => {
    useHipStore.getState().toggleTool('femurProfile')
    for (let i = 0; i < 13; i++) useHipStore.getState().addDraftPoint(p(i, i))
    const m = useHipStore.getState().measurements[0]
    expect(m.kind).toBe('femurProfile')
    expect(m.points).toHaveLength(13)
  })
})
