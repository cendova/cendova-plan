/**
 * Wandelt ein Graustufen-Röntgenbild (JPG/PNG) in eine gültige DICOM-
 * Part-10-Datei (Explicit VR Little Endian, unkomprimiert, MONOCHROME2).
 *
 * Zweck: frei lizenzierte Röntgenbilder (z. B. von Wikimedia Commons) als
 * DICOM in den Viewer laden, um Doku-Screenshots zu erzeugen — OHNE echte
 * Patientendaten. Die DICOM-Kopfdaten tragen bewusst neutrale Demo-Werte.
 *
 * Aufruf:
 *   node scripts/bild-zu-dicom.mjs --in bild.jpg --out out.dcm \
 *        --mm-per-px 0.25 --name "Demo^Becken" --desc "Becken AP (Demo)"
 *
 * Die Bildquelle/Lizenz gehört NICHT ins DICOM, sondern in die
 * Quellen-Doku neben die erzeugten Screenshots.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import { genDicomUid } from './lib/dicom-uid.mjs'

const require = createRequire(import.meta.url)
const { loadImage, createCanvas } = require('@napi-rs/canvas')

// ---------------------------------------------------------------- Argumente
const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const IN = arg('--in')
const OUT = arg('--out')
const MM_PER_PX = Number(arg('--mm-per-px', '0.25'))
const PATIENT = arg('--name', 'Demo^Roentgen')
const DESC = arg('--desc', 'Demo-Roentgen (frei lizenziert)')
if (!IN || !OUT) {
  console.error('Fehlt: --in <bild> und --out <datei.dcm>')
  process.exit(2)
}

// ------------------------------------------------------------ Bild -> Pixel
const image = await loadImage(IN)
const COLS = image.width
const ROWS = image.height
const canvas = createCanvas(COLS, ROWS)
const ctx = canvas.getContext('2d')
ctx.drawImage(image, 0, 0)
const rgba = ctx.getImageData(0, 0, COLS, ROWS).data

const MAX = 4095 // 12 Bit gespeichert (BitsStored 12)
const pixels = new Uint16Array(COLS * ROWS)
for (let i = 0; i < COLS * ROWS; i++) {
  const r = rgba[i * 4]
  const g = rgba[i * 4 + 1]
  const b = rgba[i * 4 + 2]
  // Luminanz (Bilder sind i. d. R. schon grau) -> 0..4095, MONOCHROME2:
  // heller Knochen bleibt hell.
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  pixels[i] = Math.round((lum / 255) * MAX)
}

// -------------------------------------------------- DICOM-Bausteine (wie
// scripts/generate-sample-dicom.mjs: Explicit VR Little Endian)
const DX_IMAGE_STORAGE = '1.2.840.10008.5.1.4.1.1.1.1'
const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1'
const ROOT = '1.2.826.0.1.3680043.8.498'

// Kein Date.now()/Math.random() nötig zur Reproduzierbarkeit? Der Generator
// nutzt Zufalls-UIDs; hier ebenso ok — die Datei ist ein Wegwerf-Testbild.
function genUid() {
  return genDicomUid(ROOT)
}
const LONG_VRS = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'])
function element(group, elem, vr, value) {
  let valueBuf
  if (Buffer.isBuffer(value)) {
    valueBuf = value
  } else {
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
const us4 = (v) => {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(v, 0)
  return b
}

const sopInstanceUid = genUid()
const studyUid = genUid()
const seriesUid = genUid()

const metaBody = Buffer.concat([
  element(0x0002, 0x0001, 'OB', Buffer.from([0x00, 0x01])),
  element(0x0002, 0x0002, 'UI', DX_IMAGE_STORAGE),
  element(0x0002, 0x0003, 'UI', sopInstanceUid),
  element(0x0002, 0x0010, 'UI', EXPLICIT_VR_LE),
  element(0x0002, 0x0012, 'UI', genUid()),
])
const metaGroupLength = element(0x0002, 0x0000, 'UL', us4(metaBody.length))

const pixelBuf = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)
const ps = `${MM_PER_PX}\\${MM_PER_PX}`

const dataset = Buffer.concat([
  element(0x0008, 0x0016, 'UI', DX_IMAGE_STORAGE),
  element(0x0008, 0x0018, 'UI', sopInstanceUid),
  element(0x0008, 0x0020, 'DA', '20260101'),
  element(0x0008, 0x0060, 'CS', 'DX'),
  element(0x0008, 0x103e, 'LO', DESC),
  element(0x0010, 0x0010, 'PN', PATIENT),
  element(0x0010, 0x0020, 'LO', 'CENDOVA-DEMO'),
  element(0x0010, 0x0040, 'CS', 'O'),
  element(0x0020, 0x000d, 'UI', studyUid),
  element(0x0020, 0x000e, 'UI', seriesUid),
  element(0x0020, 0x0011, 'IS', '1'),
  element(0x0020, 0x0013, 'IS', '1'),
  element(0x0028, 0x0002, 'US', us(1)),
  element(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
  element(0x0028, 0x0010, 'US', us(ROWS)),
  element(0x0028, 0x0011, 'US', us(COLS)),
  element(0x0028, 0x0030, 'DS', ps),
  element(0x0028, 0x0100, 'US', us(16)),
  element(0x0028, 0x0101, 'US', us(12)),
  element(0x0028, 0x0102, 'US', us(11)),
  element(0x0028, 0x0103, 'US', us(0)),
  element(0x0028, 0x1050, 'DS', '2048'),
  element(0x0028, 0x1051, 'DS', '4096'),
  element(0x7fe0, 0x0010, 'OW', pixelBuf),
])

const file = Buffer.concat([
  Buffer.alloc(128),
  Buffer.from('DICM', 'ascii'),
  metaGroupLength,
  metaBody,
  dataset,
])
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, file)
console.log(
  `DICOM geschrieben: ${OUT}  (${COLS} x ${ROWS}, ${MM_PER_PX} mm/px, ${file.length} Bytes)`,
)
