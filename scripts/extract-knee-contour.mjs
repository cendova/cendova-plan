// Debug-Wrapper: extrahiert die Implantat-Kontur aus EINEM Referenz-Screenshot
// (blaue Kontur + Mess-Kugel) und schreibt ein Kontroll-PNG (rote Kontur über
// Original) + normalisiertes JSON. Nutzt dieselbe Extraktionslogik wie der
// Batch (scripts/lib/knee-contour-extract.mjs) — was hier gut aussieht, landet
// 1:1 in kneeContours.ts.
//
// Aufruf: node scripts/extract-knee-contour.mjs "<bild>" [kugel_mm] [outPrefix]
import { extractContour } from './lib/knee-contour-extract.mjs'
import { writeFileSync } from 'node:fs'

const imgPath = process.argv[2]
const ballMm = Number(process.argv[3] ?? '25')
const outPrefix = process.argv[4] ?? 'contour-debug'
if (!imgPath) { console.error('Pfad fehlt.'); process.exit(1) }

const res = await extractContour(imgPath, ballMm)
console.log(`mmPerPx=${res.mmPerPx.toFixed(5)}`)

const { ctx, canvas } = res
ctx.lineWidth = 2
ctx.strokeStyle = 'red'
for (const c of res.contours) {
  ctx.beginPath()
  c.rawPoly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.stroke()
  // Inlay/Baseplate-Trennlinie (grün) zur Kontrolle — alles darüber = Inlay
  let lo = Infinity, hi = -Infinity
  for (const [x] of c.rawPoly) { if (x < lo) lo = x; if (x > hi) hi = x }
  ctx.strokeStyle = 'lime'
  ctx.beginPath(); ctx.moveTo(lo, c.inlaySplitYPx); ctx.lineTo(hi, c.inlaySplitYPx); ctx.stroke()
  ctx.strokeStyle = 'red'
  console.log(`  Kontur (${c.isUpper ? 'oben' : 'unten'}): ${c.normPoints.length} Pkt → ${c.wMm.toFixed(1)}×${c.hMm.toFixed(1)} mm · Split y=${c.inlaySplitYPx}px (${c.inlaySplitY})`)
}

writeFileSync(`scripts/${outPrefix}.png`, canvas.toBuffer('image/png'))
writeFileSync(
  `scripts/${outPrefix}.json`,
  JSON.stringify(res.contours.map((c) => ({ wMm: c.wMm, hMm: c.hMm, isUpper: c.isUpper, points: c.normPoints })), null, 2),
)
console.log(`PNG: scripts/${outPrefix}.png · JSON: scripts/${outPrefix}.json`)
