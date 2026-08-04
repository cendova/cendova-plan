// Erzeugt ein GROSSES Test-DICOM (Explicit VR LE, 16 bit, MONOCHROME2),
// indem das mitgelieferte Beispielbild auf die Zielgröße gekachelt wird.
// Zweck: Der Decode-Smoke-Test braucht Aufnahmen in Ganzbein-Größe
// (~9000 px Kante) — echte Aufnahmen dieser Größe dürfen nicht ins Repo
// (Datenschutz), also wird eine synthetische aus dem CC0-Beispiel gebaut.
// Part-10-Writer wie in scripts/downscale-dicom.mjs.
import { readFileSync, writeFileSync } from 'node:fs'
import dicomParser from 'dicom-parser'

const LONG_VRS = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'])

function element(group, elem, vr, value) {
  let valueBuf
  if (Buffer.isBuffer(value)) valueBuf = value
  else {
    let s = String(value)
    if (s.length % 2 !== 0) s += vr === 'UI' ? '\0' : ' '
    valueBuf = Buffer.from(s, 'latin1')
  }
  const tag = Buffer.alloc(4)
  tag.writeUInt16LE(group, 0)
  tag.writeUInt16LE(elem, 2)
  if (LONG_VRS.has(vr)) {
    const head = Buffer.alloc(8)
    head.write(vr, 0, 'ascii')
    head.writeUInt32LE(valueBuf.length, 4)
    return Buffer.concat([tag, head, valueBuf])
  }
  const head = Buffer.alloc(4)
  head.write(vr, 0, 'ascii')
  head.writeUInt16LE(valueBuf.length, 2)
  return Buffer.concat([tag, head, valueBuf])
}

const us = (v) => {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(v, 0)
  return b
}

/** Kachelt `quellePfad` auf cols×rows und schreibt das DICOM nach `zielPfad`. */
export function erzeugeGrossesTestDicom(quellePfad, zielPfad, cols, rows) {
  const raw = new Uint8Array(readFileSync(quellePfad))
  const ds = dicomParser.parseDicom(raw)
  const qCols = ds.uint16('x00280011')
  const qRows = ds.uint16('x00280010')
  const pd = ds.elements.x7fe00010
  const px = ds.byteArray.subarray(pd.dataOffset, pd.dataOffset + pd.length)
  const src = new Uint16Array(qCols * qRows)
  for (let i = 0; i < src.length; i++) src[i] = px[i * 2] | (px[i * 2 + 1] << 8)

  const dst = new Uint16Array(cols * rows)
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      dst[y * cols + x] = src[(y % qRows) * qCols + (x % qCols)]

  // Feste UIDs — reine Testdatei, Eindeutigkeit ist hier egal.
  const sop = '1.2.826.0.1.3680043.8.498.900.1'
  const meta = Buffer.concat([
    element(0x0002, 0x0001, 'OB', Buffer.from([0, 1])),
    element(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.1.1'),
    element(0x0002, 0x0003, 'UI', sop),
    element(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1'),
    element(0x0002, 0x0012, 'UI', '1.2.826.0.1.3680043.8.498.1'),
  ])
  const metaLen = Buffer.alloc(4)
  metaLen.writeUInt32LE(meta.length, 0)

  const body = Buffer.concat([
    element(0x0008, 0x0016, 'UI', '1.2.840.10008.5.1.4.1.1.1.1'),
    element(0x0008, 0x0018, 'UI', sop),
    element(0x0008, 0x0060, 'CS', 'DX'),
    element(0x0010, 0x0010, 'PN', 'Test^Gross'),
    element(0x0020, 0x000d, 'UI', sop + '.2'),
    element(0x0020, 0x000e, 'UI', sop + '.3'),
    element(0x0028, 0x0002, 'US', us(1)),
    element(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
    element(0x0028, 0x0010, 'US', us(rows)),
    element(0x0028, 0x0011, 'US', us(cols)),
    element(0x0028, 0x0030, 'DS', '0.140000\\0.140000'),
    element(0x0028, 0x0100, 'US', us(16)),
    element(0x0028, 0x0101, 'US', us(16)),
    element(0x0028, 0x0102, 'US', us(15)),
    element(0x0028, 0x0103, 'US', us(0)),
    element(0x0028, 0x1050, 'DS', '2048'),
    element(0x0028, 0x1051, 'DS', '4096'),
    element(0x7fe0, 0x0010, 'OW', Buffer.from(dst.buffer)),
  ])
  writeFileSync(
    zielPfad,
    Buffer.concat([
      Buffer.alloc(128),
      Buffer.from('DICM', 'ascii'),
      element(0x0002, 0x0000, 'UL', metaLen),
      meta,
      body,
    ]),
  )
}
