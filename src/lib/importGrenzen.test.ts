// Charakterisierungs-Tests der Import-Grenzen (Security-Report §8/§10):
// legitime Eingaben passieren, Bomben/absurde Größen werden abgelehnt.
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  endlichIn,
  MAX_DICOM_BYTES,
  pruefeDicomGroesse,
  unzipMitGrenzen,
  ZIP_GRENZEN,
} from './importGrenzen'
import { pruefePlanGrenzen } from './plan/planGrenzen'
import type { PlanFile } from './plan/serialize'

describe('unzipMitGrenzen', () => {
  it('entpackt ein normales Archiv unverändert', async () => {
    const zip = zipSync({
      'a.dcm': strToU8('DICM-Testdaten'),
      'ordner/b.dcm': strToU8('noch mehr Daten'),
    })
    const out = await unzipMitGrenzen(zip)
    expect(Object.keys(out).sort()).toEqual(['a.dcm', 'ordner/b.dcm'])
    expect(new TextDecoder().decode(out['a.dcm'])).toBe('DICM-Testdaten')
  })

  it('lehnt zu viele Einträge ab', async () => {
    const dateien: Record<string, Uint8Array> = {}
    for (let i = 0; i < 12; i++) dateien[`f${i}.txt`] = strToU8('x')
    const zip = zipSync(dateien)
    await expect(
      unzipMitGrenzen(zip, { ...ZIP_GRENZEN, maxEintraege: 10 }),
    ).rejects.toThrow(/zu viele Dateien/)
  })

  it('lehnt zu große entpackte Gesamtgröße ab', async () => {
    const zip = zipSync({ 'gross.bin': new Uint8Array(64 * 1024) })
    await expect(
      unzipMitGrenzen(zip, { ...ZIP_GRENZEN, maxEntpackt: 32 * 1024 }),
    ).rejects.toThrow(/entpackt zu groß/)
  })

  it('lehnt eine ZIP-Bombe (extremes Kompressionsverhältnis) ab', async () => {
    // 2 MB Nullen komprimieren auf wenige KB → Ratio ≫ 100.
    const zip = zipSync({ 'bombe.bin': new Uint8Array(2 * 1024 * 1024) })
    await expect(unzipMitGrenzen(zip)).rejects.toThrow(/ZIP-Bombe/)
  })

  it('erlaubt hohe Kompression bei kleinen Dateien (DICOMDIR & Co.)', async () => {
    // Unterhalb ratioAbGroesse zählt das Verhältnis nicht.
    const zip = zipSync({ 'DICOMDIR': new Uint8Array(64 * 1024) })
    const out = await unzipMitGrenzen(zip)
    expect(out['DICOMDIR'].length).toBe(64 * 1024)
  })
})

describe('pruefeDicomGroesse', () => {
  it('akzeptiert realistische Ganzbein-Größen (100 MB)', () => {
    expect(() => pruefeDicomGroesse(100 * 1024 * 1024)).not.toThrow()
  })
  it('lehnt absurde Dateigrößen ab', () => {
    expect(() => pruefeDicomGroesse(MAX_DICOM_BYTES + 1, 'riesig.dcm')).toThrow(
      /zu groß/,
    )
  })
})

describe('endlichIn', () => {
  it('prüft Endlichkeit und Bereich', () => {
    expect(endlichIn(1.5, 0, 10)).toBe(true)
    expect(endlichIn(Infinity, 0, 10)).toBe(false)
    expect(endlichIn(NaN, 0, 10)).toBe(false)
    expect(endlichIn('5', 0, 10)).toBe(false)
    expect(endlichIn(-1, 0, 10)).toBe(false)
  })
})

describe('pruefePlanGrenzen', () => {
  const basisPlan = (): PlanFile => ({
    version: 6,
    savedAt: '2026-07-21T00:00:00Z',
    appName: 'CendovaPlan',
    calibration: { mmPerWorldUnit: 0.2, referenceMm: 30, magnificationFactor: 1.15 },
    hipMeasurements: [],
    kneeMeasurements: [],
    templates: { cups: [], stems: [], referenceLine: null },
    notes: [],
  })

  it('akzeptiert einen normalen Plan', () => {
    expect(pruefePlanGrenzen(basisPlan())).toBeNull()
  })

  it('akzeptiert alte Pläne mit fehlenden Feldern', () => {
    const alt = { version: 1, savedAt: 'x', appName: 'CendovaPlan' } as PlanFile
    expect(pruefePlanGrenzen(alt)).toBeNull()
  })

  it('lehnt absurde Array-Größen ab', () => {
    const p = basisPlan()
    p.notes = new Array(5001).fill({ text: 'x' })
    expect(pruefePlanGrenzen(p)).toMatch(/notes.*zu groß/)
  })

  it('lehnt falsche Typen ab (Array erwartet)', () => {
    const p = basisPlan()
    ;(p as unknown as { notes: string }).notes = 'kein-array'
    expect(pruefePlanGrenzen(p)).toMatch(/notes.*kein Array/)
  })

  it('lehnt unplausible Kalibrierung ab', () => {
    const p = basisPlan()
    p.calibration = { mmPerWorldUnit: Infinity, referenceMm: 30, magnificationFactor: 1 }
    expect(pruefePlanGrenzen(p)).toMatch(/mmPerWorldUnit/)
    p.calibration = { mmPerWorldUnit: 0, referenceMm: 30, magnificationFactor: 1 }
    expect(pruefePlanGrenzen(p)).toMatch(/mmPerWorldUnit/)
  })

  it('lehnt überlange Freitexte ab', () => {
    const p = basisPlan()
    p.notes = [{ text: 'x'.repeat(200_001) } as never]
    expect(pruefePlanGrenzen(p)).toMatch(/zu lang/)
  })

  it('lehnt eingebettete Bilder mit falschem Typ ab', () => {
    const p = basisPlan()
    p.embeddedImage = {
      fileName: 'x.dcm',
      base64: { length: 800_000_000 } as unknown as string,
    }
    expect(pruefePlanGrenzen(p)).toMatch(/falschen Typ/)
  })
})
