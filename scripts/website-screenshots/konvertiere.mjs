// Skaliert und komprimiert die Rohbilder aus erzeuge.mjs für Website/README.
// Aufruf: node scripts/website-screenshots/konvertiere.mjs <quellordner> <zielordner>
// Hero 2400 px breit (3:2, ganzes Fenster), Kacheln exakt 2000 × 1500 (4:3).
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { writeFileSync, statSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const [Q, Z] = process.argv.slice(2)
if (!Q || !Z) { console.error('Aufruf: konvertiere.mjs <quellordner> <zielordner>'); process.exit(1) }
mkdirSync(Z, { recursive: true })
async function schreibe(quelle, ziel, breite, hoehe, q = 0.88) {
  const img = await loadImage(join(Q, quelle))
  const w = breite ?? img.width, h = hoehe ?? Math.round((img.height * w) / img.width)
  const c = createCanvas(w, h); const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  writeFileSync(join(Z, ziel), c.toBuffer('image/jpeg', Math.round(q * 100)))
  console.log(ziel, `${w}x${h}`, Math.round(statSync(join(Z, ziel)).size / 1024) + ' kB')
}
await schreibe('knie-vollvermessung.png', 'knie-vollvermessung.jpg', 2400, null, 0.9)
for (const n of ['knie-vollvermessung', 'knie-beinachse', 'knie-osteotomie', 'huefte-beinlaengen', 'schulter-csa']) {
  await schreibe(`${n}-kachel.png`, `${n}-kachel.jpg`, 2000, 1500)
}
