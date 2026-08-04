// Charakterisierungs-Tests der automatischen DICOM-Verkleinerung.
//
// Der kritischste Punkt ist die MASSSTABS-Treue: Wird um Faktor n
// verkleinert, muss der Pixelabstand um Faktor n wachsen — sonst wären
// alle Messungen des Programms falsch. Deshalb wird das Ergebnis hier
// mit dicom-parser zurückgelesen und nachgerechnet.
import { describe, expect, it } from 'vitest'
import dicomParser from 'dicom-parser'
import { verkleinereDicomFallsNoetig } from './dicomVerkleinern'

const LONG_VRS = new Set(['OB', 'OW', 'SQ', 'UT', 'UN'])

/** Minimaler Part-10-Writer (Explicit VR LE) für Test-Dateien. */
function element(
  group: number,
  elem: number,
  vr: string,
  value: string | Uint8Array,
): Uint8Array {
  let valueBuf: Uint8Array
  if (value instanceof Uint8Array) valueBuf = value
  else {
    let s = value
    if (s.length % 2 !== 0) s += vr === 'UI' ? '\0' : ' '
    valueBuf = new TextEncoder().encode(s)
  }
  const kopfLen = LONG_VRS.has(vr) ? 12 : 8
  const out = new Uint8Array(kopfLen + valueBuf.length)
  const dv = new DataView(out.buffer)
  dv.setUint16(0, group, true)
  dv.setUint16(2, elem, true)
  out[4] = vr.charCodeAt(0)
  out[5] = vr.charCodeAt(1)
  if (LONG_VRS.has(vr)) dv.setUint32(8, valueBuf.length, true)
  else dv.setUint16(6, valueBuf.length, true)
  out.set(valueBuf, kopfLen)
  return out
}

const us = (v: number) => {
  const b = new Uint8Array(2)
  new DataView(b.buffer).setUint16(0, v, true)
  return b
}

function concat(...teile: Uint8Array[]): Uint8Array {
  const len = teile.reduce((s, t) => s + t.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const t of teile) {
    out.set(t, o)
    o += t.length
  }
  return out
}

interface TestBildOpt {
  cols: number
  rows: number
  spacing?: string
  transferSyntax?: string
  signed?: boolean
  pixelWert?: (x: number, y: number) => number
}

function testDicom({
  cols,
  rows,
  spacing = '0.140000\\0.140000',
  transferSyntax = '1.2.840.10008.1.2.1',
  signed = false,
  pixelWert = (x, y) => (x + y) % 4096,
}: TestBildOpt): ArrayBuffer {
  const px = new Uint8Array(cols * rows * 2)
  const dv = new DataView(px.buffer)
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const v = pixelWert(x, y)
      if (signed) dv.setInt16((y * cols + x) * 2, v, true)
      else dv.setUint16((y * cols + x) * 2, v, true)
    }

  const meta = concat(
    element(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.1.1'),
    element(0x0002, 0x0003, 'UI', '1.2.3.4'),
    element(0x0002, 0x0010, 'UI', transferSyntax),
  )
  const metaLen = new Uint8Array(4)
  new DataView(metaLen.buffer).setUint32(0, meta.length, true)

  const body = concat(
    element(0x0008, 0x0060, 'CS', 'DX'),
    element(0x0010, 0x0010, 'PN', 'Muster^Max'),
    element(0x0028, 0x0002, 'US', us(1)),
    element(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
    element(0x0028, 0x0010, 'US', us(rows)),
    element(0x0028, 0x0011, 'US', us(cols)),
    element(0x0028, 0x0030, 'DS', spacing),
    element(0x0028, 0x0100, 'US', us(16)),
    element(0x0028, 0x0101, 'US', us(16)),
    element(0x0028, 0x0102, 'US', us(15)),
    element(0x0028, 0x0103, 'US', us(signed ? 1 : 0)),
    element(0x7fe0, 0x0010, 'OW', px),
  )
  const praefix = new Uint8Array(132)
  praefix.set(new TextEncoder().encode('DICM'), 128)
  return concat(
    praefix,
    element(0x0002, 0x0000, 'UL', metaLen),
    meta,
    body,
  ).buffer as ArrayBuffer
}

describe('Auslöse-Bedingungen', () => {
  it('lässt Bilder innerhalb des Limits byte-identisch', () => {
    const eingabe = testDicom({ cols: 100, rows: 40 })
    const r = verkleinereDicomFallsNoetig(eingabe, 128)
    expect(r.skaliert).toBe(false)
    expect(r.bytes).toBe(eingabe)
  })

  it('verkleinert, wenn die längste Kante das Limit übersteigt', () => {
    const r = verkleinereDicomFallsNoetig(testDicom({ cols: 40, rows: 100 }), 64)
    expect(r.skaliert).toBe(true)
    expect(r.faktor).toBe(2)
    expect(r.nachher).toEqual({ cols: 20, rows: 50 })
  })

  it('fasst komprimierte Transfersyntaxen nicht an', () => {
    const eingabe = testDicom({
      cols: 40,
      rows: 100,
      transferSyntax: '1.2.840.10008.1.2.4.70',
    })
    const r = verkleinereDicomFallsNoetig(eingabe, 64)
    expect(r.skaliert).toBe(false)
  })

  it('übersteht Nicht-DICOM-Bytes ohne Exception', () => {
    const r = verkleinereDicomFallsNoetig(new Uint8Array(64).buffer, 64)
    expect(r.skaliert).toBe(false)
  })
})

describe('Ergebnis-Korrektheit', () => {
  it('patcht Maße und ERHÄLT alle übrigen Tags (Patientenname)', () => {
    const r = verkleinereDicomFallsNoetig(testDicom({ cols: 40, rows: 100 }), 64)
    const ds = dicomParser.parseDicom(new Uint8Array(r.bytes))
    expect(ds.uint16('x00280011')).toBe(20)
    expect(ds.uint16('x00280010')).toBe(50)
    expect(ds.string('x00100010')).toBe('Muster^Max')
    expect(ds.string('x00080060')).toBe('DX')
    // Pixeldaten-Länge stimmt mit den neuen Maßen überein.
    expect(ds.elements.x7fe00010.length).toBe(20 * 50 * 2)
  })

  it('MASSSTAB: Pixelabstand wächst exakt um den Faktor', () => {
    const r = verkleinereDicomFallsNoetig(
      testDicom({ cols: 40, rows: 130, spacing: '0.140000\\0.140000' }),
      64,
    )
    expect(r.faktor).toBe(3)
    const ds = dicomParser.parseDicom(new Uint8Array(r.bytes))
    const [zeile, spalte] = ds
      .string('x00280030')!
      .split('\\')
      .map((t) => parseFloat(t))
    expect(zeile).toBeCloseTo(0.42, 6)
    expect(spalte).toBeCloseTo(0.42, 6)
    // Physische Bildhöhe bleibt erhalten (bis auf den Randverlust des
    // Abrundens, maximal faktor-1 Quellzeilen = < 1 neuer Pixelabstand):
    // vorher 130 × 0,14 = 18,2 mm; nachher 43 × 0,42 = 18,06 mm.
    const vorherMm = 130 * 0.14
    const nachherMm = r.nachher.rows * 0.42
    expect(Math.abs(vorherMm - nachherMm)).toBeLessThan(0.42)
  })

  it('mittelt die Pixel flächig (konstantes Bild bleibt konstant)', () => {
    const r = verkleinereDicomFallsNoetig(
      testDicom({ cols: 40, rows: 100, pixelWert: () => 777 }),
      64,
    )
    const ds = dicomParser.parseDicom(new Uint8Array(r.bytes))
    const pd = ds.elements.x7fe00010
    const werte = new Uint16Array(r.bytes, pd.dataOffset, 20 * 50)
    expect(werte[0]).toBe(777)
    expect(werte[werte.length - 1]).toBe(777)
  })

  it('behandelt signed Pixel (PixelRepresentation 1) korrekt', () => {
    const r = verkleinereDicomFallsNoetig(
      testDicom({ cols: 40, rows: 100, signed: true, pixelWert: () => -500 }),
      64,
    )
    expect(r.skaliert).toBe(true)
    const ds = dicomParser.parseDicom(new Uint8Array(r.bytes))
    const pd = ds.elements.x7fe00010
    const werte = new Int16Array(r.bytes, pd.dataOffset, 20 * 50)
    expect(werte[0]).toBe(-500)
  })

  it('ist idempotent: Ergebnis passt ins Limit und wird nicht erneut verkleinert', () => {
    const einmal = verkleinereDicomFallsNoetig(testDicom({ cols: 40, rows: 100 }), 64)
    const zweimal = verkleinereDicomFallsNoetig(einmal.bytes, 64)
    expect(zweimal.skaliert).toBe(false)
  })
})
