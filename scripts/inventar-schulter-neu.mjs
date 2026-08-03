// Inventar der NEUEN Schulter-Screenshots (03.08.): Maßstab (Kugel),
// BBox in mm, Strichbreite, Rotmarker — plus Serien-Vorschlag über
// Zeitstempel-Lücken. Reine Erhebung, baut nichts.
// Aufruf: node scripts/inventar-schulter-neu.mjs "<ordner>"
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { extractContour } from './lib/knee-contour-extract.mjs'

const DIR = process.argv[2]
const isRed = (r, g, b) => r > 110 && r - g > 50 && r - b > 50
const OPTS = { maxComponents: 1, extraBarrier: isRed, chaikinPasses: 2 }

/** Median der horizontalen Läufe (< 16 px) durch die Cyan-Maske. */
async function strichUndRot(pfad) {
  const img = await loadImage(pfad)
  const W = img.width, H = img.height
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, W, H)
  const runs = []
  let rotN = 0
  for (let y = 0; y < H; y++) {
    let run = 0
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (isRed(r, g, b)) rotN++
      const v = Math.min(g, b) - r
      if (v >= 128) run++
      else {
        if (run > 0 && run < 16) runs.push(run)
        run = 0
      }
    }
  }
  runs.sort((a, b) => a - b)
  return {
    strichPx: runs.length >= 5 ? runs[(runs.length / 2) | 0] : 0,
    rotN,
    W,
    H,
  }
}

const dateien = readdirSync(DIR)
  .filter((f) => f.endsWith('.png'))
  .sort()
const zeilen = []
for (const f of dateien) {
  const pfad = join(DIR, f)
  const t = f.match(/(\d{6})\.png$/)?.[1] ?? '0'
  const sek =
    parseInt(t.slice(0, 2)) * 3600 + parseInt(t.slice(2, 4)) * 60 + parseInt(t.slice(4, 6))
  try {
    let res = await extractContour(pfad, 25, OPTS)
    if (res.contours.length === 0)
      res = await extractContour(pfad, 25, { ...OPTS, openRadius: 1, minBlueArea: 200 })
    const c0 = res.contours[0]
    const { strichPx, rotN, W, H } = await strichUndRot(pfad)
    const pxProMm = 1 / res.mmPerPx
    zeilen.push({
      f,
      sek,
      ok: true,
      pxProMm: +pxProMm.toFixed(2),
      strichMm: +(strichPx / pxProMm).toFixed(2),
      wMm: c0 ? +c0.wMm.toFixed(1) : null,
      hMm: c0 ? +c0.hMm.toFixed(1) : null,
      kugelPx: +res.ballDiaPx.toFixed(1),
      rotN,
      px: `${W}x${H}`,
    })
  } catch (err) {
    zeilen.push({ f, sek, ok: false, fehler: err.message })
  }
}

// Serien-Vorschlag: Lücke > 20 s zwischen Aufnahmen = neue Serie.
let serie = 1
for (let i = 0; i < zeilen.length; i++) {
  if (i > 0 && zeilen[i].sek - zeilen[i - 1].sek > 20) serie++
  zeilen[i].serie = serie
}

for (const z of zeilen) {
  if (!z.ok) {
    console.log(`S${String(z.serie).padStart(2)} ${z.f}  FEHLER: ${z.fehler}`)
    continue
  }
  console.log(
    `S${String(z.serie).padStart(2)} ${z.f}  ${z.px}  ${z.pxProMm} px/mm  Strich ${z.strichMm} mm  BBox ${z.wMm}x${z.hMm} mm  Kugel ${z.kugelPx}px  rot ${z.rotN}px`,
  )
}
writeFileSync(join(DIR, '..', 'inventar-neu.local.json'), JSON.stringify(zeilen, null, 1))
console.log(`\n${zeilen.length} Dateien, ${serie} Serien-Kandidaten -> inventar-neu.local.json`)
