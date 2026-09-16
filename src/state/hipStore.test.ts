// Charakterisierungs-Tests des Hüft-Stores: Femurprofil-Messung,
// ärztliche Dorr-Bestätigung, CCD-Prefill und Achsen-Übernahme.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Types } from '@cornerstonejs/core'
import {
  findeCcdFuerPrefill,
  findeFemurachseFuerSchaft,
  istGueltigeFemurProfileReview,
  useHipStore,
} from './hipStore'
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

describe('Femurprofil ohne Checkliste', () => {
  it('schließt die Messung ohne Beurteilung ab — und die ist klassifizierbar', () => {
    // Seit 16.09.2026 fragt das Programm die Bildqualität nicht mehr ab:
    // Die Eignung der Aufnahme ist ärztliche Vorarbeit. Eine frische
    // Messung trägt deshalb KEINE Beurteilung — und darf klassifizieren.
    useHipStore.getState().toggleTool('femurProfile')
    for (let i = 0; i < 13; i++) useHipStore.getState().addDraftPoint(p(i, i))
    const m = useHipStore.getState().measurements[0]
    expect(m.femurProfileReview).toBeUndefined()
    expect(isFemurProfileClassifiable(m.femurProfileReview?.imageQuality)).toBe(true)
    expect(useHipStore.getState().activeKind).toBeNull()
  })

  it('respektiert eine gespeicherte Checkliste mit offenen Kriterien weiterhin', () => {
    // Ältere Pläne (vor 16.09.2026) können eine nicht bestandene
    // Checkliste tragen — deren Entscheidung bleibt bestehen.
    const gate: FemurProfileImageQuality = {
      ...leereBildqualitaet(true),
      exclusionReasons: ['Rotation nicht vertretbar'],
    }
    expect(isFemurProfileClassifiable(gate)).toBe(false)
    expect(isFemurProfileClassifiable(bestandenesGate())).toBe(true)
  })
})

describe('Ärztliche Bestätigung und Override', () => {
  /** Legt eine fertige Femurprofil-Messung an und gibt ihre id zurück. */
  function messungAnlegen(): string {
    useHipStore.getState().toggleTool('femurProfile')
    for (let i = 0; i < 13; i++) useHipStore.getState().addDraftPoint(p(i, i))
    return useHipStore.getState().measurements[0].id
  }

  it('speichert die Bestätigung an der richtigen Messung', () => {
    const id = messungAnlegen()
    // Zweite Messung, damit ein Verwechseln auffiele.
    useHipStore.getState().toggleTool('femurProfile')
    for (let i = 0; i < 13; i++) useHipStore.getState().addDraftPoint(p(i + 50, i))
    const zweite = useHipStore.getState().measurements[1].id

    useHipStore.getState().setFemurProfileReview(id, {
      imageQuality: bestandenesGate(),
      dorrSuggested: 'B',
      dorrFinal: 'B',
      confirmedAt: '2026-08-11T13:00:00.000Z',
    })
    const ms = useHipStore.getState().measurements
    expect(ms.find((m) => m.id === id)?.femurProfileReview?.dorrFinal).toBe('B')
    expect(ms.find((m) => m.id === zweite)?.femurProfileReview?.dorrFinal).toBeUndefined()
  })

  it('lehnt eine abweichende Klasse OHNE Grund ab', () => {
    const id = messungAnlegen()
    useHipStore.getState().setFemurProfileReview(id, {
      imageQuality: bestandenesGate(),
      dorrSuggested: 'B',
      dorrFinal: 'C', // abweichend, aber kein Grund
    })
    // Unverändert: die ursprüngliche Beurteilung trägt kein dorrFinal.
    expect(
      useHipStore.getState().measurements[0].femurProfileReview?.dorrFinal,
    ).toBeUndefined()
  })

  it('nimmt eine abweichende Klasse MIT Grund an', () => {
    const id = messungAnlegen()
    useHipStore.getState().setFemurProfileReview(id, {
      imageQuality: bestandenesGate(),
      dorrSuggested: 'B',
      dorrFinal: 'C',
      overrideReason: 'gesamtmorphologie',
      confirmedAt: '2026-08-11T13:00:00.000Z',
    })
    const r = useHipStore.getState().measurements[0].femurProfileReview
    expect(r?.dorrFinal).toBe('C')
    expect(r?.overrideReason).toBe('gesamtmorphologie')
  })

  it('nimmt eine identische Bestätigung ohne Grund an', () => {
    const id = messungAnlegen()
    useHipStore.getState().setFemurProfileReview(id, {
      imageQuality: bestandenesGate(),
      dorrSuggested: 'B',
      dorrFinal: 'B',
    })
    expect(useHipStore.getState().measurements[0].femurProfileReview?.dorrFinal).toBe('B')
  })

  it('prüft die Schlüssigkeit auch als reine Funktion', () => {
    const basis = { imageQuality: bestandenesGate() }
    expect(istGueltigeFemurProfileReview(basis)).toBe(true)
    expect(
      istGueltigeFemurProfileReview({ ...basis, dorrSuggested: 'B', dorrFinal: 'B' }),
    ).toBe(true)
    expect(
      istGueltigeFemurProfileReview({ ...basis, dorrSuggested: 'B', dorrFinal: 'C' }),
    ).toBe(false)
    expect(
      istGueltigeFemurProfileReview({
        ...basis,
        dorrSuggested: 'B',
        dorrFinal: 'C',
        overrideReason: 'rotation',
      }),
    ).toBe(true)
  })

  it('lässt Nicht-Femurprofil-Messungen unberührt', () => {
    useHipStore.getState().toggleTool('ccd')
    for (let i = 0; i < 6; i++) useHipStore.getState().addDraftPoint(p(i, i))
    const id = useHipStore.getState().measurements[0].id
    useHipStore.getState().setFemurProfileReview(id, {
      imageQuality: bestandenesGate(),
      dorrFinal: 'A',
    })
    expect(useHipStore.getState().measurements[0].femurProfileReview).toBeUndefined()
  })

  it('erzeugt ein NEUES measurements-Array — Voraussetzung für Undo', () => {
    // Die Undo-Historie erkennt Änderungen per Referenzvergleich auf
    // `measurements` (historyStore.snapsEqual). Bliebe die Referenz
    // gleich, wäre die Bestätigung nicht rückgängig zu machen.
    const id = messungAnlegen()
    const vorher = useHipStore.getState().measurements
    useHipStore.getState().setFemurProfileReview(id, {
      imageQuality: bestandenesGate(),
      dorrSuggested: 'B',
      dorrFinal: 'B',
    })
    const nachher = useHipStore.getState().measurements
    expect(nachher).not.toBe(vorher)
    // Und die abgelehnte Variante darf KEINEN Undo-Schritt erzeugen.
    const ohneGrund = useHipStore.getState().measurements
    useHipStore.getState().setFemurProfileReview(id, {
      imageQuality: bestandenesGate(),
      dorrSuggested: 'B',
      dorrFinal: 'C',
    })
    expect(useHipStore.getState().measurements).toBe(ohneGrund)
  })

  it('überlebt das Löschen anderer Messungen', () => {
    const id = messungAnlegen()
    useHipStore.getState().setFemurProfileReview(id, {
      imageQuality: bestandenesGate(),
      dorrSuggested: 'B',
      dorrFinal: 'B',
    })
    useHipStore.getState().toggleTool('ccd')
    for (let i = 0; i < 6; i++) useHipStore.getState().addDraftPoint(p(i, i))
    const ccdId = useHipStore.getState().measurements[1].id
    useHipStore.getState().removeMeasurement(ccdId)
    expect(useHipStore.getState().measurements).toHaveLength(1)
    expect(useHipStore.getState().measurements[0].femurProfileReview?.dorrFinal).toBe('B')
  })

  it('verschwindet mit der Messung und mit reset', () => {
    const id = messungAnlegen()
    useHipStore.getState().setFemurProfileReview(id, {
      imageQuality: bestandenesGate(),
      dorrSuggested: 'B',
      dorrFinal: 'B',
    })
    useHipStore.getState().removeMeasurement(id)
    expect(useHipStore.getState().measurements).toHaveLength(0)
    messungAnlegen()
    useHipStore.getState().reset()
    expect(useHipStore.getState().measurements).toHaveLength(0)
  })
})

describe('CCD-Prefill des Femurprofils', () => {
  /** Legt eine vollständige CCD-Messung an und gibt ihre Punkte zurück. */
  function ccdMessung(versatz = 0): Types.Point3[] {
    useHipStore.getState().toggleTool('ccd')
    const pts = [
      p(versatz - 40, -40),
      p(versatz - 64, -64),
      p(versatz - 88, -40),
      p(versatz - 57, -47),
      p(versatz, 0),
      p(versatz, 100),
    ]
    pts.forEach((q) => useHipStore.getState().addDraftPoint(q))
    return pts
  }

  it('übernimmt die sechs Punkte einer vollständigen CCD-Messung', () => {
    const pts = ccdMessung()
    useHipStore.getState().toggleTool('femurProfile')
    const draft = useHipStore.getState().draftPoints
    expect(draft).toHaveLength(6)
    expect(draft).toEqual(pts)
  })

  it('kopiert die Punkte, statt sie mit der CCD-Messung zu teilen', () => {
    // Ein gezogener Draft-Punkt darf die CCD-Messung NICHT mitverändern.
    ccdMessung()
    useHipStore.getState().toggleTool('femurProfile')
    useHipStore.getState().updateDraftPoint(0, p(999, 999))
    const ccd = useHipStore.getState().measurements.find((m) => m.kind === 'ccd')!
    expect(ccd.points[0]).not.toEqual([999, 999, 0])
  })

  it('nimmt die JÜNGSTE CCD-Messung', () => {
    ccdMessung(0)
    const zweite = ccdMessung(500)
    useHipStore.getState().toggleTool('femurProfile')
    expect(useHipStore.getState().draftPoints).toEqual(zweite)
  })

  it('ignoriert eine unvollständige CCD-Messung', () => {
    // Direkt in den Store gelegt, wie sie aus einem fremden Plan käme.
    useHipStore.setState({
      measurements: [
        {
          id: 'hip-x',
          kind: 'ccd',
          points: [p(0, 0), p(1, 1), p(2, 2)], // nur 3 statt 6
          visible: true,
          labelOffset: { x: 0, y: 0 },
          labelStyle: { fontSize: 13, color: '#fff', bold: false, underline: false },
        },
      ],
    })
    useHipStore.getState().toggleTool('femurProfile')
    expect(useHipStore.getState().draftPoints).toEqual([])
  })

  it('übernimmt nichts aus anderen Messarten', () => {
    useHipStore.getState().toggleTool('osteotomy')
    for (let i = 0; i < 3; i++) useHipStore.getState().addDraftPoint(p(i, i))
    useHipStore.getState().toggleTool('femurProfile')
    expect(useHipStore.getState().draftPoints).toEqual([])
  })

  it('startet ohne CCD-Messung ganz normal bei Schritt 1', () => {
    useHipStore.getState().toggleTool('femurProfile')
    expect(useHipStore.getState().draftPoints).toEqual([])
  })

  it('füllt andere Werkzeuge NICHT aus der CCD-Messung vor', () => {
    ccdMessung()
    useHipStore.getState().toggleTool('globalOffset')
    expect(useHipStore.getState().draftPoints).toEqual([])
  })

  it('braucht nach dem Prefill noch sieben Punkte bis zur Messung', () => {
    ccdMessung()
    useHipStore.getState().toggleTool('femurProfile')
    const vorher = useHipStore.getState().measurements.length
    for (let i = 0; i < 6; i++) useHipStore.getState().addDraftPoint(p(i, i))
    // Nach 12 von 13 Punkten darf noch KEINE Messung entstanden sein.
    expect(useHipStore.getState().measurements).toHaveLength(vorher)
    useHipStore.getState().addDraftPoint(p(7, 7))
    expect(useHipStore.getState().measurements).toHaveLength(vorher + 1)
  })

  it('erkennt die Prefill-Quelle auch als reine Funktion', () => {
    expect(findeCcdFuerPrefill([])).toBeNull()
    ccdMessung()
    const gefunden = findeCcdFuerPrefill(useHipStore.getState().measurements)
    expect(gefunden?.kind).toBe('ccd')
  })

  it('startet nach Abschluss einer Femurprofil-Messung frisch', () => {
    ccdMessung()
    useHipStore.getState().toggleTool('femurProfile')
    for (let i = 0; i < 7; i++) useHipStore.getState().addDraftPoint(p(i, i))
    expect(useHipStore.getState().activeKind).toBeNull()
    const nachher = useHipStore.getState().measurements.length
    // Erneutes Öffnen beginnt eine NEUE Messung mit Prefill — und legt
    // keine zweite unbeabsichtigt an.
    useHipStore.getState().toggleTool('femurProfile')
    expect(useHipStore.getState().draftPoints).toHaveLength(6)
    expect(useHipStore.getState().measurements).toHaveLength(nachher)
  })
})

describe('Femurachse für die Schaft-Platzierung', () => {
  /** Legt eine vollständige Femurprofil-Messung an (13 Punkte). */
  function femurProfilMessung(versatz = 0): Types.Point3[] {
    useHipStore.getState().toggleTool('femurProfile')
    const pts = Array.from({ length: 13 }, (_, i) => p(versatz + i, versatz + 10 * i))
    pts.forEach((q) => useHipStore.getState().addDraftPoint(q))
    return pts
  }

  it('liefert die Schaftachse (Punkte 4/5) der jüngsten vollständigen Messung', () => {
    femurProfilMessung(0)
    const zweite = femurProfilMessung(500)
    const achse = findeFemurachseFuerSchaft(useHipStore.getState().measurements)
    expect(achse).toEqual([zweite[4], zweite[5]])
  })

  it('liefert KOPIEN — die Schablone darf die Messpunkte nicht teilen', () => {
    femurProfilMessung()
    const achse = findeFemurachseFuerSchaft(useHipStore.getState().measurements)!
    achse[0][0] = 9999
    const m = useHipStore.getState().measurements.find((x) => x.kind === 'femurProfile')!
    expect(m.points[4][0]).not.toBe(9999)
  })

  it('liefert null ohne Femurprofil — eine CCD-Messung genügt bewusst NICHT', () => {
    // Die Automatik greift nur beim expliziten Femurprofil-Arbeitsfluss;
    // eine bloße CCD-Messung soll die zwei Achsen-Klicks nicht ersetzen.
    expect(findeFemurachseFuerSchaft([])).toBeNull()
    useHipStore.getState().toggleTool('ccd')
    for (let i = 0; i < 6; i++) useHipStore.getState().addDraftPoint(p(i, i))
    expect(findeFemurachseFuerSchaft(useHipStore.getState().measurements)).toBeNull()
  })

  it('ignoriert eine unvollständige Femurprofil-Messung', () => {
    useHipStore.setState({
      measurements: [
        {
          id: 'hip-y',
          kind: 'femurProfile',
          points: Array.from({ length: 7 }, (_, i) => p(i, i)),
          visible: true,
          labelOffset: { x: 0, y: 0 },
          labelStyle: { fontSize: 13, color: '#fff', bold: false, underline: false },
        },
      ],
    })
    expect(findeFemurachseFuerSchaft(useHipStore.getState().measurements)).toBeNull()
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
