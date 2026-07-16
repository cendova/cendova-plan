// Batch-Pipeline: schneidet Knie-Schablonen-Screenshots auf das Implantat zu
// und generiert src/lib/knee/kneeImages.ts (Pfad + Pixelmaße + mm/px je Größe)
// — analog zu medactaImages.ts (Hüfte). Das Bild wird im Viewer direkt als
// Overlay über das Röntgen gelegt (SCHWARZER Screenshot-Hintergrund per
// feColorMatrix rausgefiltert, blaue Linie bleibt), statt nur eine Kontur
// nachzubauen.
//
// Reuse der vorhandenen Extraktion (Kugel → mm/px, Implantat-Bounding-Box):
//   scripts/lib/knee-contour-extract.mjs  (gibt mmPerPx, canvas, contours[].rawPoly)
//
// Dateiname-Schema:  <komponente>_<ansicht>_gr<größe>.png
// Aufruf: node scripts/build-knee-images.mjs ["Templates Knee/Medacta_neu"] [kugel_mm]
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { extractContour } from './lib/knee-contour-extract.mjs'
import { ladeSolldaten } from './lib/solldaten.mjs'

// PoC → Rollout: Medacta GMK Sphere + Smith&Nephew (Legion PS, Genesis II,
// Journey II UK). walk() steigt rekursiv auch in den UKA-Unterordner ab.
const DEFAULT_DIRS = [
  'Templates Knee/Medacta_neu',
  'Templates Knee/Smith&Nephew_neu',
]
const srcDirs = process.argv[2] ? [process.argv[2]] : DEFAULT_DIRS
const ballMm = Number(process.argv[3] ?? '25')
const OUT_DIR = 'public/templates/knee'
const PAD = 4 // px transparenter Rand um die Implantat-Bbox

// --- Namens-Mapping (identisch zu build-knee-contours.mjs) ---
const KIND_BY_PREFIX = {
  legionps_femur: 'legion-ps-femur',
  genesis_tibia: 'genesis-tibia-female',
  sphere_femur: 'sphere-femur',
  sphere_tibia: 'sphere-tibia-baseplate',
  journeyII_femur: 'journey-uk-femur',
  journeyII_tibia: 'journey-uk-tibia-medial',
}
const SIZES_BY_KIND = {
  'legion-ps-femur': ['2', '3n', '3', '4n', '4', '5n', '5', '6n', '6', '7', '8'],
  'genesis-tibia-female': ['1', '2', '3', '4', '5', '6', '7', '8'],
  'sphere-femur': ['1', '1+', '2', '2+', '3', '3+', '4', '4+', '5', '5+', '6', '6+', '7'],
  'sphere-tibia-baseplate': ['1', '2', '3', '4', '5', '6', 't3-i4', 't4-i3'],
  'journey-uk-femur': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  'journey-uk-tibia-medial': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
}
// Katalog-AP-Breite (mm) zum Verankern des Maßstabs — Herstellerdaten,
// daher aus scripts/katalog-solldaten.local.json (Sektion catalogApWidth;
// Struktur siehe katalog-solldaten.beispiel.json) — Pflicht (Abbruch).
const CATALOG_AP_WIDTH = ladeSolldaten({
  pflicht: ['catalogApWidth'],
  skript: 'build-knee-images',
}).catalogApWidth
const NO_SNAP = new Set(['sphere-tibia-baseplate|6', 'sphere-tibia-baseplate|7'])

function normSize(raw) {
  let s = raw.toLowerCase().trim()
  const special = { t3i4: 't3-i4', t4i3: 't4-i3' }
  if (special[s]) return special[s]
  s = s.replace(/plus$/, '+').replace(/p$/, '+')
  return s
}
function parseName(file) {
  const base = file.replace(/\.(png|webp|jpg|jpeg)$/i, '')
  for (const prefix of Object.keys(KIND_BY_PREFIX)) {
    const m = base.match(new RegExp(`^${prefix}_(ap|lat)_gr(.+)$`, 'i'))
    if (m) {
      const kind = KIND_BY_PREFIX[prefix]
      const view = m[1].toLowerCase() === 'ap' ? 'AP' : 'lateral'
      const sizeStr = normSize(m[2])
      const sizeIndex = SIZES_BY_KIND[kind].indexOf(sizeStr)
      if (sizeIndex < 0) return { error: `Größe „${sizeStr}" nicht im Katalog von ${kind}` }
      return { kind, view, sizeIndex, sizeStr }
    }
  }
  return { error: 'Dateiname passt zu keinem Komponenten-Präfix' }
}
function walk(dir) {
  const out = []
  let ents
  try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full))
    else if (/\.(png|webp|jpg|jpeg)$/i.test(e.name)) out.push(full)
  }
  return out
}

// Sicherer, URL-tauglicher Dateiname aus dem Schlüssel (kein „+", kein Leerzeichen).
const safeName = (kind, view, sizeIndex) => `${kind}__${view}__${sizeIndex}.png`

// --- Resektions-Landmarken (nur AP) aus dem Silhouetten-Polygon ---
// Femur: die zwei DISTALSTEN Kondylenpunkte (größtes y = unten im Bild),
// je einer links/rechts der vertikalen Mittellinie. Tibia: die Baseplate-
// Oberkante (vom Extraktor als inlaySplitYPx geliefert) → linke/rechte Ecke.
// Alle Punkte werden auf den ZUGESCHNITTENEN Rahmen normalisiert (Bildmitte =
// Ursprung, [-1..1]) — exakt die Konvention, mit der das Overlay das Bild legt.
function distalCondylePoints(poly) {
  let cx = 0
  for (const [x] of poly) cx += x
  cx /= poly.length
  let left = null, right = null
  for (const [x, y] of poly) {
    if (x <= cx) { if (!left || y > left[1]) left = [x, y] }
    else { if (!right || y > right[1]) right = [x, y] }
  }
  return left && right ? { left, right } : null
}
// x-Schnittpunkte des geschlossenen Polygons mit der Horizontalen y → [minX, maxX].
function spanAtY(poly, y) {
  const xs = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % n]
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
    }
  }
  if (xs.length < 2) return null
  xs.sort((a, b) => a - b)
  return [xs[0], xs[xs.length - 1]]
}
function baseplateUndersidePoints(poly, splitYpx) {
  // Baseplate-UNTERKANTE = Resektionsebene (nicht die Oberkante inlaySplitY).
  // Wichtig ist v. a. die HÖHE (y); die Ecken nehmen wir in voller Platten-
  // breite (oben gemessen), damit die Schnittlinie nicht in den Kiel einläuft.
  const topSpan = spanAtY(poly, splitYpx + 1)
  if (!topSpan) return null
  const baseW = topSpan[1] - topSpan[0]
  // Unterkante = letzte Zeile mit ~voller Plattenbreite, bevor der Kiel
  // die Breite einbrechen lässt.
  let underY = splitYpx + 1
  for (let y = splitYpx + 2; y <= splitYpx + 400; y++) {
    const s = spanAtY(poly, y)
    if (!s) break
    if (s[1] - s[0] >= 0.82 * baseW) underY = y
    else break
  }
  return { left: [topSpan[0], underY], right: [topSpan[1], underY] }
}
function normPt(px, py, x0, y0, cropW, cropH) {
  return [
    +(((px - x0) - cropW / 2) / (cropW / 2)).toFixed(4),
    +(((py - y0) - cropH / 2) / (cropH / 2)).toFixed(4),
  ]
}
function resectLandmarks(kind, view, c, x0, y0, cropW, cropH) {
  if (view !== 'AP') return null
  const raw = kind.includes('femur')
    ? distalCondylePoints(c.rawPoly)
    : kind.includes('tibia')
      ? baseplateUndersidePoints(c.rawPoly, c.inlaySplitYPx)
      : null
  if (!raw) return null
  return {
    left: normPt(raw.left[0], raw.left[1], x0, y0, cropW, cropH),
    right: normPt(raw.right[0], raw.right[1], x0, y0, cropW, cropH),
  }
}

mkdirSync(OUT_DIR, { recursive: true })
const files = srcDirs.flatMap(walk).sort((a, b) => (basename(a) < basename(b) ? -1 : 1))
if (files.length === 0) { console.error(`Keine Bilder in ${srcDirs.join(', ')}`); process.exit(1) }

const entries = {} // key -> { kind, view, sizeIndex, path, widthPx, heightPx, mmPerPx, wMm }
let ok = 0, skip = 0
for (const full of files) {
  const file = basename(full)
  const parsed = parseName(file)
  if (parsed.error) { console.warn(`SKIP ${file}: ${parsed.error}`); skip++; continue }
  const { kind, view, sizeIndex, sizeStr } = parsed
  try {
    const res = await extractContour(full, ballMm, { maxComponents: 1 })
    const c = res.contours[0]
    if (!c) { console.warn(`SKIP ${file}: keine Kontur`); skip++; continue }
    // Pixel-Bbox aus dem Roh-Polygon (Originalkoordinaten).
    let mnX = res.W, mxX = -1, mnY = res.H, mxY = -1
    for (const [x, y] of c.rawPoly) {
      if (x < mnX) mnX = x; if (x > mxX) mxX = x
      if (y < mnY) mnY = y; if (y > mxY) mxY = y
    }
    const x0 = Math.max(0, Math.floor(mnX) - PAD)
    const y0 = Math.max(0, Math.floor(mnY) - PAD)
    const x1 = Math.min(res.W, Math.ceil(mxX) + PAD)
    const y1 = Math.min(res.H, Math.ceil(mxY) + PAD)
    const cropW = x1 - x0, cropH = y1 - y0
    if (cropW < 4 || cropH < 4) { console.warn(`SKIP ${file}: Bbox zu klein`); skip++; continue }
    // Aus dem Original-Canvas zuschneiden.
    const crop = createCanvas(cropW, cropH)
    crop.getContext('2d').drawImage(res.canvas, x0, y0, cropW, cropH, 0, 0, cropW, cropH)
    const outName = safeName(kind, view, sizeIndex)
    writeFileSync(join(OUT_DIR, outName), crop.toBuffer('image/png'))

    entries[`${kind}|${view}|${sizeIndex}`] = {
      kind, view, sizeIndex,
      path: `/templates/knee/${outName}`,
      widthPx: cropW, heightPx: cropH,
      mmPerPx: res.mmPerPx,
      wMm: c.wMm,
      resect: resectLandmarks(kind, view, c, x0, y0, cropW, cropH),
    }
    console.log(`OK  ${file} → ${kind} ${view} Gr.${sizeStr} · ${cropW}×${cropH}px · ${c.wMm.toFixed(1)}mm · ${res.mmPerPx.toFixed(4)}mm/px`)
    ok++
  } catch (e) {
    console.warn(`SKIP ${file}: ${e.message}`); skip++
  }
}

// --- Katalog-Snap: mm/px so anpassen, dass die AP-Breite exakt dem Katalog
// entspricht; denselben Faktor auf die laterale Ansicht derselben Größe. ---
let snapped = 0
for (const [kind, widths] of Object.entries(CATALOG_AP_WIDTH)) {
  for (let idx = 0; idx < widths.length; idx++) {
    if (NO_SNAP.has(`${kind}|${idx}`)) continue
    const ap = entries[`${kind}|AP|${idx}`]
    if (!ap) continue
    const f = widths[idx] / ap.wMm
    if (Math.abs(1 - f) > 0.06) {
      console.warn(`WARN ${kind}|AP|${idx}: ${(100 * (f - 1)).toFixed(1)}% vom Katalog — kein Snap`)
      continue
    }
    ap.mmPerPx = +(ap.mmPerPx * f).toFixed(5)
    const lat = entries[`${kind}|lateral|${idx}`]
    if (lat) lat.mmPerPx = +(lat.mmPerPx * f).toFixed(5)
    snapped++
  }
}
console.log(`Katalog-Snap: ${snapped} Größen verankert`)

// --- kneeImages.ts generieren ---
const out = Object.fromEntries(
  Object.entries(entries).map(([k, v]) => [
    k,
    {
      path: v.path,
      widthPx: v.widthPx,
      heightPx: v.heightPx,
      mmPerPx: +v.mmPerPx.toFixed(5),
      ...(v.resect ? { resect: v.resect } : {}),
    },
  ]),
)
const header = `// Per-Größe-Bild-Overlays für Knie-Schablonen — GENERIERT von
// scripts/build-knee-images.mjs aus Referenz-Screenshots (25-mm-Kugel +
// Katalog-Verankerung der AP-Breite). NICHT manuell bearbeiten.
import type { KneeImplantKind } from './smithNephewCatalog'
import type { KneeView } from '../../state/kneeTemplateStore'

export interface KneeImage {
  /** URL des zugeschnittenen PNG (blaue Implantat-Zeichnung auf SCHWARZ). */
  path: string
  /** Bildmaße in Pixeln (zugeschnitten inkl. ${PAD}px Rand). */
  widthPx: number
  heightPx: number
  /** Echte Millimeter pro Bildpixel (für maßstabsgetreue Skalierung). */
  mmPerPx: number
  /** Resektions-Referenzpunkte (normalisiert, Bildmitte = Ursprung, [-1..1]),
   *  links/rechts im Bild. Femur: distalste Kondylenpunkte. Tibia: Baseplate-
   *  Oberkante. Nur AP; fehlt, wenn nicht ableitbar. */
  resect?: { left: [number, number]; right: [number, number] }
}

export const KNEE_IMAGES: Record<string, KneeImage> = `
const body = JSON.stringify(out, null, 2)
const footer = `

export function getKneeImage(
  kind: KneeImplantKind,
  view: KneeView,
  sizeIndex: number,
): KneeImage | null {
  return KNEE_IMAGES[\`\${kind}|\${view}|\${sizeIndex}\`] ?? null
}
`
writeFileSync('src/lib/knee/kneeImages.ts', header + body + footer)
console.log(`\n${Object.keys(entries).length} Bilder (${ok} ok, ${skip} übersprungen) → src/lib/knee/kneeImages.ts + ${OUT_DIR}/`)
