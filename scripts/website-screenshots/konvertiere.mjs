// Skaliert und komprimiert die Rohbilder aus erzeuge.mjs für Website/README.
// Aufruf: node scripts/website-screenshots/konvertiere.mjs <quellordner> <zielordner>
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { writeFileSync, statSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const [Q, Z] = process.argv.slice(2)
if (!Q || !Z) { console.error('Aufruf: konvertiere.mjs <quellordner> <zielordner>'); process.exit(1) }
mkdirSync(Z, { recursive: true })
async function schreibe(quelle, ziel, breite, art, q = 0.9) {
  const img = await loadImage(join(Q, quelle))
  const w = breite ?? img.width, h = Math.round((img.height * w) / img.width)
  const c = createCanvas(w, h); const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const buf = art === 'jpeg' ? c.toBuffer('image/jpeg', Math.round(q * 100)) : c.toBuffer('image/png')
  writeFileSync(join(Z, ziel), buf)
  console.log(ziel, `${w}x${h}`, Math.round(statSync(join(Z, ziel)).size / 1024) + ' kB')
}
await schreibe('knie-vollvermessung.png', 'knie-vollvermessung.jpg', 2400, 'jpeg')
await schreibe('knie-osteotomie.png', 'knie-osteotomie.jpg', 2400, 'jpeg')
await schreibe('huefte-beinlaengen.jpg', 'huefte-beinlaengen.jpg', 2400, 'jpeg')
await schreibe('knie-beinachse-panel.png', 'knie-beinachse.png', null, 'png')
