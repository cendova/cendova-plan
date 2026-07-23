/**
 * Erzeugt eine synthetische AP-Becken-Röntgenaufnahme als gültige
 * DICOM-Part-10-Datei (Explicit VR Little Endian, unkomprimiert).
 *
 * Zweck: Testdaten für den Viewer — echte DICOM-Struktur, korrekter
 * Pixelabstand, zwei Hüftköpfe für Kalibrierung und Hip-Templating.
 *
 * Aufruf:  node scripts/generate-sample-dicom.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { genDicomUid } from './lib/dicom-uid.mjs'

const COLS = 1200
const ROWS = 1000
const PIXEL_SPACING = 0.3 // mm pro Pixel  -> Bildfeld 360 x 300 mm
const MAX = 4095 // 12 Bit gespeichert

// ----------------------------------------------------------------------
// 1) Bildsynthese
// ----------------------------------------------------------------------
const img = new Float32Array(COLS * ROWS)

const AIR = 250
const SOFT = 1350
const BONE = 3500
const CORTEX = 4000
const MARROW = 2950

/** Glatte Hüllkurve einer Ellipse: 1 innen, 0 außen, weicher Rand. */
function ellipse(x, y, cx, cy, rx, ry, edge = 6) {
  const d = Math.hypot((x - cx) / rx, (y - cy) / ry)
  return 1 - smooth(d, 1 - edge / Math.max(rx, ry), 1)
}

function smooth(t, a, b) {
  if (t <= a) return 0
  if (t >= b) return 1
  const u = (t - a) / (b - a)
  return u * u * (3 - 2 * u)
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

function blend(x, y, coverage, value) {
  if (coverage <= 0) return
  const i = y * COLS + x
  img[i] = lerp(img[i], value, coverage)
}

const CX = COLS / 2

// Grundfläche: Weichteil mit leichtem vertikalem Verlauf
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const grad = 1 - 0.18 * (y / ROWS)
    img[y * COLS + x] = SOFT * grad
  }
}

// Körperkontur: außerhalb -> Luft
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const inBody = ellipse(x, y, CX, 470, 600, 540, 40)
    blend(x, y, 1 - inBody, AIR)
  }
}

// Knöcherne Strukturen (Deckkraft x Wert), von hinten nach vorne gemalt
const heads = [
  { cx: CX - 175, cy: 540, side: -1 },
  { cx: CX + 175, cy: 540, side: 1 },
]

for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    // Darmbeinschaufeln (Ala ossis ilii)
    let bone = 0
    bone = Math.max(bone, ellipse(x, y, CX - 235, 320, 215, 260, 30) * 0.9)
    bone = Math.max(bone, ellipse(x, y, CX + 235, 320, 215, 260, 30) * 0.9)
    // Kreuzbein (Sacrum) zentral
    bone = Math.max(bone, ellipse(x, y, CX, 360, 110, 230, 24) * 0.85)
    // Sitz-/Schambein, Foramen obturatum als Aussparung
    bone = Math.max(bone, ellipse(x, y, CX - 135, 690, 150, 150, 20) * 0.85)
    bone = Math.max(bone, ellipse(x, y, CX + 135, 690, 150, 150, 20) * 0.85)
    if (bone > 0) blend(x, y, bone, BONE)

    // Foramen obturatum (Loch im Schambein) -> zurück auf Weichteil
    const foramenL = ellipse(x, y, CX - 150, 720, 78, 100, 16)
    const foramenR = ellipse(x, y, CX + 150, 720, 78, 100, 16)
    blend(x, y, Math.max(foramenL, foramenR), SOFT)

    for (const h of heads) {
      // Proximaler Femurschaft
      const shaftX = h.cx + h.side * 70
      const shaftHalf = 46
      const dxs = Math.abs(x - (shaftX + h.side * (y - 760) * 0.07))
      if (y > 700) {
        const shaft = 1 - smooth(dxs, shaftHalf - 8, shaftHalf)
        if (y < 760) {
          blend(x, y, shaft * smooth(y, 700, 760), CORTEX)
        } else {
          // Kortikalis außen heller, Markraum innen dunkler
          const cortexCov = shaft * (1 - smooth(dxs, shaftHalf - 22, shaftHalf - 8))
          blend(x, y, shaft, CORTEX)
          blend(x, y, 1 - smooth(dxs, 0, shaftHalf - 24), MARROW)
          void cortexCov
        }
      }
      // Schenkelhals (Collum femoris): Hüftkopf -> Trochanter
      const neckCov = capsule(
        x, y,
        h.cx, h.cy,
        h.cx + h.side * 95, h.cy + 150,
        58,
      )
      blend(x, y, neckCov, BONE)
      // Trochanter major
      blend(x, y, ellipse(x, y, h.cx + h.side * 120, h.cy + 130, 70, 80, 16), BONE)
      // Hüftkopf (Caput femoris) — kräftig, runde Sklerosezone
      const head = ellipse(x, y, h.cx, h.cy, 86, 86, 10)
      blend(x, y, head, lerp(BONE, CORTEX, 0.5))
      // Acetabulum-Pfannenerker als heller Bogen lateral-kranial
      const cup = ringArc(x, y, h.cx, h.cy, 104, 132, h.side)
      blend(x, y, cup, CORTEX)
    }
  }
}

// Feines Rauschen, damit Fenstereinstellung etwas zu tun hat
for (let i = 0; i < img.length; i++) {
  img[i] += (Math.random() - 0.5) * 90
}

// In 16-Bit-Ganzzahl (12 Bit genutzt) wandeln
const pixels = new Uint16Array(COLS * ROWS)
for (let i = 0; i < img.length; i++) {
  pixels[i] = Math.max(0, Math.min(MAX, Math.round(img[i])))
}

/** Deckkraft einer „Kapsel“ (Strecke mit Radius) zwischen zwei Punkten. */
function capsule(px, py, ax, ay, bx, by, radius) {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const len2 = abx * abx + aby * aby
  let t = len2 ? (apx * abx + apy * aby) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const dx = px - (ax + abx * t)
  const dy = py - (ay + aby * t)
  const d = Math.hypot(dx, dy)
  return 1 - smooth(d, radius - 10, radius)
}

/** Heller Bogen (Pfannenerker) lateral-kranial des Hüftkopfs. */
function ringArc(px, py, cx, cy, rInner, rOuter, side) {
  const dx = px - cx
  const dy = py - cy
  const r = Math.hypot(dx, dy)
  const ring =
    smooth(r, rInner - 8, rInner) * (1 - smooth(r, rOuter, rOuter + 8))
  // nur oberer/lateraler Quadrant
  const ang = Math.atan2(-dy, dx * side) // 0 lateral, PI/2 kranial
  const inArc = smooth(ang, -0.2, 0.2) * (1 - smooth(ang, 1.5, 1.9))
  return ring * inArc
}

// ----------------------------------------------------------------------
// 2) DICOM-Part-10-Datei schreiben (Explicit VR Little Endian)
// ----------------------------------------------------------------------
const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1'
const DX_IMAGE_STORAGE = '1.2.840.10008.5.1.4.1.1.1.1'
const ROOT = '1.2.826.0.1.3680043.8.498'

function genUid() {
  return genDicomUid(ROOT)
}

const LONG_VRS = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'])

/** Kodiert ein Datenelement im Explicit-VR-Little-Endian-Format. */
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

const sopInstanceUid = genUid()
const studyUid = genUid()
const seriesUid = genUid()

// --- File Meta Information (Gruppe 0002) ---
const metaElements = [
  element(0x0002, 0x0001, 'OB', Buffer.from([0x00, 0x01])),
  element(0x0002, 0x0002, 'UI', DX_IMAGE_STORAGE),
  element(0x0002, 0x0003, 'UI', sopInstanceUid),
  element(0x0002, 0x0010, 'UI', EXPLICIT_VR_LE),
  element(0x0002, 0x0012, 'UI', genUid()),
]
const metaBody = Buffer.concat(metaElements)
const metaGroupLength = element(0x0002, 0x0000, 'UL', us4(metaBody.length))

function us4(value) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(value, 0)
  return b
}

// --- Hauptdatensatz ---
const pixelBuf = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)
const ps = `${PIXEL_SPACING}\\${PIXEL_SPACING}`

const dataset = Buffer.concat([
  element(0x0008, 0x0016, 'UI', DX_IMAGE_STORAGE),
  element(0x0008, 0x0018, 'UI', sopInstanceUid),
  element(0x0008, 0x0020, 'DA', '20260101'),
  element(0x0008, 0x0060, 'CS', 'DX'),
  element(0x0008, 0x103e, 'LO', 'Synthetisches AP-Becken (Testbild)'),
  element(0x0010, 0x0010, 'PN', 'Testbild^Becken'),
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

const preamble = Buffer.alloc(128)
const magic = Buffer.from('DICM', 'ascii')
const file = Buffer.concat([preamble, magic, metaGroupLength, metaBody, dataset])

const outPath = fileURLToPath(
  new URL('../public/sample/pelvis-ap.dcm', import.meta.url),
)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, file)

console.log(
  `DICOM geschrieben: ${file.length} Bytes  (${COLS} x ${ROWS}, ${PIXEL_SPACING} mm/px)`,
)
