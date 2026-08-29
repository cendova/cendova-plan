// Charakterisierungs-Tests der Plan-Speicherung für das Femurprofil
// (Format v10). Prüft den Rundlauf der ärztlichen Beurteilung und —
// wichtiger — die Abwärtskompatibilität: Ein v9-Plan ohne das Feld muss
// unverändert laden.
//
// Dazu die Grenzen-Prüfung: `exclusionReasons` ist eine Liste von Texten
// aus einer FREMDEN Datei. Ohne Deckel könnte ein präparierter Plan den
// Browser über die Anzeige lahmlegen (Security-Report §8).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPlan, type PlanFile } from './serialize'
import { pruefePlanGrenzen } from './planGrenzen'
import { useHipStore, type FemurProfileReview } from '../../state/hipStore'
import { leereBildqualitaet } from '../hip/femurProfile'
import type { Types } from '@cornerstonejs/core'

vi.mock('../cornerstone/viewer', () => ({
  getCurrentDicomBytes: () => null,
  getCurrentDicomFileName: () => null,
  getGenericMeasurements: () => [],
  loadDicomFromBytes: async () => {},
  restoreGenericMeasurements: () => {},
}))
vi.mock('../cornerstone/viewer2', () => ({
  getCurrentDicomBytes2: () => null,
  getCurrentDicomFileName2: () => null,
  getViewport2: () => null,
  loadDicomBytesToPane2: async () => {},
}))

const p = (x: number, y: number): Types.Point3 => [x, y, 0]

function bestandeneQualitaet() {
  return {
    ...leereBildqualitaet(true),
    apProjectionAcceptable: true,
    rotationAcceptable: true,
    lesserTrochanterVisible: true,
    cortexVisible: true,
    femurCoverage10cm: true,
    confirmedAt: '2026-08-11T12:00:00.000Z',
  }
}

/** Legt eine fertige Femurprofil-Messung an und gibt ihre id zurück. */
function femurProfilMessung(): string {
  useHipStore.getState().setFemurProfileGate(bestandeneQualitaet())
  useHipStore.getState().toggleTool('femurProfile')
  for (let i = 0; i < 13; i++) useHipStore.getState().addDraftPoint(p(i, i))
  return useHipStore.getState().measurements[0].id
}

beforeEach(() => useHipStore.getState().reset())

describe('Plan-Speicherung des Femurprofils', () => {
  it('schreibt Format-Version 10', () => {
    expect(buildPlan().version).toBe(10)
  })

  it('nimmt die Femurprofil-Messung samt Bildqualität auf', () => {
    femurProfilMessung()
    const plan = buildPlan()
    const m = plan.hipMeasurements.find((x) => x.kind === 'femurProfile')
    expect(m).toBeDefined()
    expect(m!.points).toHaveLength(13)
    expect(m!.femurProfileReview?.imageQuality.confirmedAt).toBe(
      '2026-08-11T12:00:00.000Z',
    )
  })

  it('erhält Bestätigung, Vorschlag und Override-Grund im Rundlauf', () => {
    const id = femurProfilMessung()
    const review: FemurProfileReview = {
      imageQuality: bestandeneQualitaet(),
      dorrSuggested: 'B',
      dorrFinal: 'C',
      overrideReason: 'gesamtmorphologie',
      confirmedAt: '2026-08-11T13:00:00.000Z',
    }
    useHipStore.getState().setFemurProfileReview(id, review)

    // Speichern → JSON → Laden (der echte Weg, inkl. Serialisierung).
    const json = JSON.stringify(buildPlan())
    const geladen = JSON.parse(json) as PlanFile
    useHipStore.setState({ measurements: geladen.hipMeasurements })

    const r = useHipStore.getState().measurements[0].femurProfileReview
    expect(r?.dorrSuggested).toBe('B')
    expect(r?.dorrFinal).toBe('C')
    expect(r?.overrideReason).toBe('gesamtmorphologie')
    expect(r?.confirmedAt).toBe('2026-08-11T13:00:00.000Z')
    // Die Bildqualität muss vollständig mitkommen — sonst wüsste die
    // Karte nach dem Laden nicht mehr, ob sie klassifizieren darf.
    expect(r?.imageQuality.rotationAcceptable).toBe(true)
    expect(r?.imageQuality.exclusionReasons).toEqual([])
  })

  it('erhält auch eine NICHT bestandene Bildqualität samt Gründen', () => {
    useHipStore.getState().setFemurProfileGate({
      ...leereBildqualitaet(true),
      exclusionReasons: ['Rotation nicht vertretbar'],
    })
    useHipStore.getState().toggleTool('femurProfile')
    for (let i = 0; i < 13; i++) useHipStore.getState().addDraftPoint(p(i, i))

    const geladen = JSON.parse(JSON.stringify(buildPlan())) as PlanFile
    expect(
      geladen.hipMeasurements[0].femurProfileReview?.imageQuality.exclusionReasons,
    ).toEqual(['Rotation nicht vertretbar'])
  })
})

describe('Abwärtskompatibilität zu v9', () => {
  it('lädt eine Hüft-Messung OHNE Beurteilung unverändert', () => {
    // So sieht eine CCD-Messung aus einem v9-Plan aus: kein
    // femurProfileReview, kein neues Feld.
    const v9Messung = {
      id: 'hip-1',
      kind: 'ccd' as const,
      points: [p(0, 0), p(1, 1), p(2, 0), p(1, 2), p(1, 3), p(1, 9)],
      visible: true,
      labelOffset: { x: 16, y: -14 },
      labelStyle: { fontSize: 13, color: '#ffffff', bold: false, underline: false },
    }
    useHipStore.setState({ measurements: [v9Messung] })
    const m = useHipStore.getState().measurements[0]
    expect(m.femurProfileReview).toBeUndefined()
    expect(m.points).toHaveLength(6)
    // Und der neu gebaute Plan trägt sie unverändert weiter.
    expect(buildPlan().hipMeasurements[0]).toEqual(v9Messung)
  })

  it('akzeptiert einen v9-Plan in der Grenzen-Prüfung', () => {
    const v9: PlanFile = {
      version: 9,
      hipMeasurements: [],
    } as unknown as PlanFile
    expect(pruefePlanGrenzen(v9)).toBeNull()
  })
})

describe('Grenzen der Ausschlussgründe (Fremddaten aus dem Plan)', () => {
  /** Baut einen Plan mit genau einer Femurprofil-Messung. */
  const planMit = (exclusionReasons: unknown): PlanFile =>
    ({
      version: 10,
      hipMeasurements: [
        {
          id: 'hip-1',
          kind: 'femurProfile',
          points: [],
          visible: true,
          labelOffset: { x: 0, y: 0 },
          labelStyle: { fontSize: 13, color: '#fff', bold: false, underline: false },
          femurProfileReview: {
            imageQuality: { ...leereBildqualitaet(true), exclusionReasons },
          },
        },
      ],
    }) as unknown as PlanFile

  it('lässt eine normale Gründe-Liste durch', () => {
    expect(pruefePlanGrenzen(planMit(['Rotation nicht vertretbar']))).toBeNull()
    expect(pruefePlanGrenzen(planMit([]))).toBeNull()
  })

  it('weist eine absurd lange Gründe-Liste ab', () => {
    const fehler = pruefePlanGrenzen(planMit(new Array(10_000).fill('x')))
    expect(fehler).toMatch(/exclusionReasons/)
  })

  it('weist einen absurd langen einzelnen Grund ab', () => {
    const fehler = pruefePlanGrenzen(planMit(['y'.repeat(300_000)]))
    expect(fehler).toMatch(/exclusionReasons/)
  })

  it('weist einen falschen Typ ab', () => {
    expect(pruefePlanGrenzen(planMit('kein Array'))).toMatch(/exclusionReasons/)
    expect(pruefePlanGrenzen(planMit([42]))).toMatch(/exclusionReasons/)
  })

  it('bleibt tolerant gegenüber fehlenden Feldern', () => {
    expect(pruefePlanGrenzen(planMit(undefined))).toBeNull()
  })
})
