// Tests der PDF-Textzeilen des Femurprofils. Die Zeilen tragen klinische
// Werte — sie dürfen weder eine Klasse behaupten, die nicht abgeleitet
// werden darf, noch eine Entscheidung formulieren.
import { describe, expect, it } from 'vitest'
import type { Types } from '@cornerstonejs/core'
import { femurProfilPdfZeilen } from './femurProfilText'
import { leereBildqualitaet } from '../hip/femurProfile'
import type { FemurProfileReview } from '../../state/hipStore'

const p = (x: number, y: number, z = 0): Types.Point3 => [x, y, z]

/** Referenz-Anatomie: CI 0,50 · NSA 135° · FOR 1,60 → Dorr B, CPAH 5H. */
function punkte(): Types.Point3[] {
  return [
    p(-40, -40),
    p(-64, -64),
    p(-88, -40),
    p(-64 + 10 * Math.SQRT1_2, -40 - 10 * Math.SQRT1_2),
    p(0, 0),
    p(0, 100),
    p(0, 40),
    p(-22, 140),
    p(-10, 140),
    p(10, 140),
    p(18, 140),
    p(-20, 40),
    p(20, 40),
  ]
}

const bestanden = () => ({
  ...leereBildqualitaet(true),
  apProjectionAcceptable: true,
  rotationAcceptable: true,
  lesserTrochanterVisible: true,
  cortexVisible: true,
  femurCoverage10cm: true,
})

const alsText = (z: string[]) => z.join('\n')

describe('Femurprofil-Zeilen im PDF', () => {
  it('nennt den Vorschlag, solange nichts bestätigt ist', () => {
    const t = alsText(
      femurProfilPdfZeilen(punkte(), 1, { imageQuality: bestanden() }),
    )
    expect(t).toContain('Dorr-Vorschlag: B')
    expect(t).toContain('Grenzbereich B/C')
    expect(t).toContain('ärztlich nicht bestätigt')
  })

  it('nennt die Rohwerte und den CPAH-Code', () => {
    const t = alsText(
      femurProfilPdfZeilen(punkte(), 1, { imageQuality: bestanden() }),
    )
    expect(t).toContain('Cortical Index: 0,50')
    expect(t).toContain('Canal-Calcar Ratio: 0,50')
    expect(t).toContain('NSA (CCD): 135.0°')
    expect(t).toContain('Femorales Offset: 64,0 mm')
    expect(t).toContain('FOR: 1,60')
    expect(t).toContain('CPAH 5H · coxa norma · High-offset')
  })

  it('trägt immer den Planungshinweis', () => {
    const t = alsText(
      femurProfilPdfZeilen(punkte(), 1, { imageQuality: bestanden() }),
    )
    expect(t).toContain('Planungshinweis - keine autonome Implantatentscheidung.')
  })

  it('zeigt die bestätigte Klasse statt des Vorschlags', () => {
    const review: FemurProfileReview = {
      imageQuality: bestanden(),
      dorrSuggested: 'B',
      dorrFinal: 'B',
      confirmedAt: '2026-08-11T13:00:00.000Z',
    }
    const t = alsText(femurProfilPdfZeilen(punkte(), 1, review))
    expect(t).toContain('Dorr bestätigt: B')
    expect(t).not.toContain('Dorr-Vorschlag')
  })

  it('nennt bei Abweichung beide Klassen und den Grund', () => {
    const review: FemurProfileReview = {
      imageQuality: bestanden(),
      dorrSuggested: 'B',
      dorrFinal: 'C',
      overrideReason: 'gesamtmorphologie',
    }
    const t = alsText(femurProfilPdfZeilen(punkte(), 1, review))
    expect(t).toContain('Dorr (ärztlich): C - Vorschlag war B')
    expect(t).toContain('Grund: Gesamtmorphologie spricht dagegen')
  })

  it('warnt, wenn nach der Bestätigung Punkte verschoben wurden', () => {
    // Bestätigt wurde gegen A, gerechnet wird jetzt B.
    const review: FemurProfileReview = {
      imageQuality: bestanden(),
      dorrSuggested: 'A',
      dorrFinal: 'A',
    }
    const t = alsText(femurProfilPdfZeilen(punkte(), 1, review))
    expect(t).toContain('Punkte nach der Bestätigung verändert')
    expect(t).toContain('lautet jetzt B')
  })

  it('unterdrückt die Klasse ohne bestätigte Bildqualität — Rohwerte bleiben', () => {
    const review: FemurProfileReview = {
      imageQuality: {
        ...leereBildqualitaet(true),
        exclusionReasons: ['Rotation nicht vertretbar'],
      },
    }
    const t = alsText(femurProfilPdfZeilen(punkte(), 1, review))
    expect(t).toContain('nicht zuverlässig bestimmbar')
    expect(t).toContain('Rotation nicht vertretbar')
    expect(t).not.toContain('CPAH 5H')
    expect(t).not.toMatch(/Dorr bestätigt|Dorr-Vorschlag: B/)
    // Die gemessenen Zahlen erscheinen trotzdem.
    expect(t).toContain('Cortical Index: 0,50')
  })

  it('unterdrückt die Klasse auch ganz ohne Beurteilung', () => {
    const t = alsText(femurProfilPdfZeilen(punkte(), 1, undefined))
    expect(t).toContain('nicht zuverlässig bestimmbar')
    expect(t).toContain('Bildqualität nicht bestätigt')
  })

  it('warnt bei Dorr C vorsichtig — Prüfauftrag, keine Entscheidung', () => {
    // Kanal 34 von 40 → CI 0,15 → Dorr C → Typ 8.
    const pts = punkte()
    pts[8] = p(-17, 140)
    pts[9] = p(17, 140)
    const t = alsText(femurProfilPdfZeilen(pts, 1, { imageQuality: bestanden() }))
    expect(t).toContain('zementierte Fixation/Alternative aktiv prüfen')
    expect(t).toContain('hebt das Frakturrisiko nicht auf')
    for (const verboten of [
      'kontraindiziert',
      'Implantat X verwenden',
      'Osteoporose diagnostiziert',
    ]) {
      expect(t).not.toContain(verboten)
    }
  })

  it('zeigt fehlende Werte als Strich, nicht als 0', () => {
    // Calcar-Punkte zusammenfallen lassen → CCR nicht bestimmbar.
    const pts = punkte()
    pts[11] = p(5, 40)
    pts[12] = p(5, 41)
    const t = alsText(femurProfilPdfZeilen(pts, 1, { imageQuality: bestanden() }))
    expect(t).toContain('Canal-Calcar Ratio: -')
    expect(t).not.toContain('Canal-Calcar Ratio: 0,00')
  })

  it('reicht Mess-Warnungen der Geometrie durch', () => {
    const pts = punkte()
    ;[pts[9], pts[10]] = [pts[10], pts[9]] // ein Seitenpaar vertauscht
    const t = alsText(femurProfilPdfZeilen(pts, 1, { imageQuality: bestanden() }))
    expect(t).toContain('Hinweis:')
    expect(t).toContain('geordnet')
  })

  it('liefert bei unbrauchbarer Messung gar keine Zeilen', () => {
    expect(femurProfilPdfZeilen([], 1, { imageQuality: bestanden() })).toEqual([])
    expect(femurProfilPdfZeilen(punkte(), Number.NaN, undefined)).toEqual([])
  })

  // jsPDF kodiert die Standardschrift in WinAnsi und verschluckt alles
  // darüber hinaus STILL. Am erzeugten PDF nachgemessen: aus „C — Vorschlag
  // war B" wurde „C  Vorschlag war B". Dieser Test hält die Zeilen
  // dauerhaft im darstellbaren Bereich — auch die Warntexte aus der
  // Geometrie, die durch denselben Filter laufen.
  it('verwendet nur Zeichen, die jsPDF ausgeben kann', () => {
    const faelle: string[][] = [
      femurProfilPdfZeilen(punkte(), 1, { imageQuality: bestanden() }),
      femurProfilPdfZeilen(punkte(), 1, {
        imageQuality: bestanden(),
        dorrSuggested: 'B',
        dorrFinal: 'C',
        overrideReason: 'gesamtmorphologie',
      }),
      femurProfilPdfZeilen(punkte(), 1, {
        imageQuality: bestanden(),
        dorrSuggested: 'A',
        dorrFinal: 'A',
      }),
      femurProfilPdfZeilen(punkte(), 1, undefined),
    ]
    // Auch mit Geometrie-Warnung (die Warntexte tragen Gedankenstriche).
    const pts = punkte()
    ;[pts[9], pts[10]] = [pts[10], pts[9]]
    faelle.push(femurProfilPdfZeilen(pts, 1, { imageQuality: bestanden() }))

    for (const zeilen of faelle) {
      for (const z of zeilen) {
        const unsichtbar = [...z].filter((c) => c.codePointAt(0)! > 0xff)
        expect(
          unsichtbar,
          `Zeile „${z}" enthält nicht darstellbare Zeichen`,
        ).toEqual([])
      }
    }
  })

  it('ersetzt Gedankenstriche, statt sie verschlucken zu lassen', () => {
    const t = alsText(
      femurProfilPdfZeilen(punkte(), 1, {
        imageQuality: bestanden(),
        dorrSuggested: 'B',
        dorrFinal: 'C',
        overrideReason: 'rotation',
      }),
    )
    // Der Trenner muss SICHTBAR bleiben — ohne ihn läse sich die Zeile
    // als „C Vorschlag war B".
    expect(t).toContain('Dorr (ärztlich): C - Vorschlag war B')
    expect(t).not.toContain('—')
  })

  it('enthält keine Patientendaten', () => {
    const t = alsText(
      femurProfilPdfZeilen(punkte(), 1, {
        imageQuality: bestanden(),
        dorrSuggested: 'B',
        dorrFinal: 'B',
        confirmedAt: '2026-08-11T13:00:00.000Z',
      }),
    )
    // Der Zeitstempel ist gespeichert, gehört aber NICHT in den Ausdruck —
    // er sagt nichts über die Planung und lädt zur Personenzuordnung ein.
    expect(t).not.toContain('2026-08-11')
  })
})
