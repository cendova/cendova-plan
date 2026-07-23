/**
 * Verkleinert eine DICOM-Aufnahme, sodass die längste Kante <= 2000 px
 * ist. Hintergrund: Cornerstones GPU-Rendering nutzt 3D-Texturen, die
 * auf vielen GPUs auf 2048 px begrenzt sind — größere Bilder bleiben
 * sonst schwarz.
 *
 * Aufruf:  node scripts/downscale-dicom.mjs <quelle.dcm> [ziel.dcm]
 * Standard-Ziel: public/sample/xray.dcm
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { genDicomUid } from './lib/dicom-uid.mjs'
import dicomParser from 'dicom-parser'

const MAX_EDGE = 2000

// Quelle ist Pflicht-Argument — bewusst KEIN Default: DICOM-Pfade sind
// patientenbezogen und gehören nicht in den Code (Datenschutz-Grundsatz).
const srcPath = process.argv[2]
if (!srcPath) {
  console.error('Aufruf: node scripts/downscale-dicom.mjs <quelle.dcm> [ziel.dcm]')
  process.exit(1)
}
const dstPath =
  process.argv[3] ||
  fileURLToPath(new URL('../public/sample/xray.dcm', import.meta.url))

// --- DICOM einlesen ---------------------------------------------------
const raw = new Uint8Array(readFileSync(srcPath))
const ds = dicomParser.parseDicom(raw)

const cols = ds.uint16('x00280011')
const rows = ds.uint16('x00280010')
const bitsAllocated = ds.uint16('x00280100') ?? 16
const pixelSpacing = ds.string('x00280030') || '1\\1'
const wc = ds.string('x00281050') || '2048'
const ww = ds.string('x00281051') || '4096'
const sopClassUid = ds.string('x00080016') || '1.2.840.10008.5.1.4.1.1.1.1'

if (bitsAllocated !== 16) {
  throw new Error(`Nur 16-Bit-Bilder unterstützt (hier: ${bitsAllocated})`)
}

// Pixeldaten als Uint16 (Explicit VR LE -> little endian)
const pdElem = ds.elements.x7fe00010
const pixelBytes = ds.byteArray.subarray(
  pdElem.dataOffset,
  pdElem.dataOffset + pdElem.length,
)
const src = new Uint16Array(cols * rows)
for (let i = 0; i < src.length; i++) {
  src[i] = pixelBytes[i * 2] | (pixelBytes[i * 2 + 1] << 8)
}

// --- Skalierungsfaktor bestimmen --------------------------------------
const factor = Math.max(1, Math.ceil(Math.max(cols, rows) / MAX_EDGE))
const outCols = Math.floor(cols / factor)
const outRows = Math.floor(rows / factor)

// --- Flächenmittelung -------------------------------------------------
const dst = new Uint16Array(outCols * outRows)
for (let oy = 0; oy < outRows; oy++) {
  for (let ox = 0; ox < outCols; ox++) {
    let sum = 0
    for (let dy = 0; dy < factor; dy++) {
      const sy = oy * factor + dy
      for (let dx = 0; dx < factor; dx++) {
        sum += src[sy * cols + ox * factor + dx]
      }
    }
    dst[oy * outCols + ox] = Math.round(sum / (factor * factor))
  }
}

// Pixelabstand wächst um den Faktor
const psParts = pixelSpacing.split('\\').map((s) => parseFloat(s))
const newSpacing = psParts
  .map((v) => (v * factor).toFixed(6))
  .join('\\')

// --- DICOM Part 10 schreiben (Explicit VR Little Endian) --------------
const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1'
const ROOT = '1.2.826.0.1.3680043.8.498'
const LONG_VRS = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'])

function genUid() {
  return genDicomUid(ROOT)
}

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

function us(value) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(value, 0)
  return b
}
function ul(value) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(value, 0)
  return b
}

const sopInstanceUid = genUid()

const metaBody = Buffer.concat([
  element(0x0002, 0x0001, 'OB', Buffer.from([0x00, 0x01])),
  element(0x0002, 0x0002, 'UI', sopClassUid),
  element(0x0002, 0x0003, 'UI', sopInstanceUid),
  element(0x0002, 0x0010, 'UI', EXPLICIT_VR_LE),
  element(0x0002, 0x0012, 'UI', genUid()),
])
const metaGroupLength = element(0x0002, 0x0000, 'UL', ul(metaBody.length))

const pixelBuf = Buffer.from(dst.buffer, dst.byteOffset, dst.byteLength)

const dataset = Buffer.concat([
  element(0x0008, 0x0016, 'UI', sopClassUid),
  element(0x0008, 0x0018, 'UI', sopInstanceUid),
  element(0x0008, 0x0060, 'CS', ds.string('x00080060') || 'DX'),
  element(0x0008, 0x103e, 'LO', 'Verkleinert fuer Anzeige'),
  element(0x0020, 0x000d, 'UI', genUid()),
  element(0x0020, 0x000e, 'UI', genUid()),
  element(0x0020, 0x0011, 'IS', '1'),
  element(0x0020, 0x0013, 'IS', '1'),
  element(0x0028, 0x0002, 'US', us(1)),
  element(0x0028, 0x0004, 'CS', ds.string('x00280004') || 'MONOCHROME2'),
  element(0x0028, 0x0010, 'US', us(outRows)),
  element(0x0028, 0x0011, 'US', us(outCols)),
  element(0x0028, 0x0030, 'DS', newSpacing),
  element(0x0028, 0x0100, 'US', us(16)),
  element(0x0028, 0x0101, 'US', us(ds.uint16('x00280101') || 12)),
  element(0x0028, 0x0102, 'US', us(ds.uint16('x00280102') || 11)),
  element(0x0028, 0x0103, 'US', us(ds.uint16('x00280103') || 0)),
  element(0x0028, 0x1050, 'DS', wc),
  element(0x0028, 0x1051, 'DS', ww),
  element(0x7fe0, 0x0010, 'OW', pixelBuf),
])

const file = Buffer.concat([
  Buffer.alloc(128),
  Buffer.from('DICM', 'ascii'),
  metaGroupLength,
  metaBody,
  dataset,
])

mkdirSync(dirname(dstPath), { recursive: true })
writeFileSync(dstPath, file)

console.log(
  `Quelle:  ${cols}x${rows}\n` +
    `Faktor:  ${factor}  ->  ${outCols}x${outRows}\n` +
    `Spacing: ${pixelSpacing}  ->  ${newSpacing}\n` +
    `Ziel:    ${dstPath}  (${file.length} Bytes)`,
)
