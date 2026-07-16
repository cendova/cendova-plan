// Machbarkeits-Test für die „Screenshot-pro-Größe"-Schablonen-Pipeline.
//
// 1) Kalibrierkugel (25 mm) als RUNDESTE zusammenhängende helle Region
//    detektieren (Connected-Components) → mmPerPx.
// 2) Blaue Implantat-Kontur isolieren, Femur (oben) / Tibia (unten) per
//    y-Lücke trennen → je Bounding-Box → reale mm. Vergleich gegen Katalog.
//
// Aufruf: node scripts/analyze-knee-screenshot.mjs "<bildpfad>" [kugel_mm]
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { ladeSolldaten } from './lib/solldaten.mjs'

// Erwartungswerte (Herstellermaße) optional aus der privaten Lokal-Datei.
const analyzeExpect = ladeSolldaten({ skript: 'analyze-knee-screenshot' })?.analyzeExpect ?? null

const imgPath = process.argv[2]
const ballMm = Number(process.argv[3] ?? '25')
if (!imgPath) { console.error('Pfad fehlt.'); process.exit(1) }

const img = await loadImage(imgPath)
const W = img.width, H = img.height
const ctx = createCanvas(W, H).getContext('2d')
ctx.drawImage(img, 0, 0)
const { data } = ctx.getImageData(0, 0, W, H)
const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]] }

const isBlue = (r, g, b) => b > 110 && b > r + 40 && g > r + 10 && g < b + 30 && r < 120
const isBright = (r, g, b) => { const mn = Math.min(r, g, b); return mn > 165 && Math.max(r, g, b) - mn < 40 }

// --- Connected-Components über helle Pixel (4-Nachbarschaft, iterativ) ---
const bright = new Uint8Array(W * H)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const [r, g, b] = px(x, y)
  if (isBright(r, g, b)) bright[y * W + x] = 1
}
const label = new Int32Array(W * H).fill(0)
let nextLabel = 0
const comps = []
const stack = []
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const idx = y * W + x
  if (!bright[idx] || label[idx]) continue
  nextLabel++
  let area = 0, minX = W, maxX = -1, minY = H, maxY = -1
  stack.push(idx)
  label[idx] = nextLabel
  while (stack.length) {
    const p = stack.pop()
    const py = (p / W) | 0, pxx = p % W
    area++
    if (pxx < minX) minX = pxx; if (pxx > maxX) maxX = pxx
    if (py < minY) minY = py; if (py > maxY) maxY = py
    const nb = [p - 1, p + 1, p - W, p + W]
    for (const q of nb) {
      if (q < 0 || q >= W * H) continue
      // Zeilenüberlauf bei -1/+1 vermeiden:
      if (q === p - 1 && pxx === 0) continue
      if (q === p + 1 && pxx === W - 1) continue
      if (bright[q] && !label[q]) { label[q] = nextLabel; stack.push(q) }
    }
  }
  comps.push({ area, minX, maxX, minY, maxY })
}

// Kugel = Komponente, deren Fläche am besten zu π·r² ihrer BBox passt
// (rund + kompakt), mit Mindestgröße.
let ball = null, bestScore = -1
for (const c of comps) {
  const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1
  if (w < 20 || h < 20) continue
  const aspect = Math.min(w, h) / Math.max(w, h) // 1 = quadratisch
  const fill = c.area / (w * h)                   // Kreis ≈ 0.785
  const circScore = aspect * (1 - Math.abs(fill - 0.785) / 0.785)
  if (circScore > bestScore) { bestScore = circScore; ball = { ...c, w, h, aspect, fill } }
}

console.log(`Bild: ${W}×${H} px · helle Komponenten: ${comps.length}`)
if (!ball) { console.log('Keine Kugel gefunden.'); process.exit(0) }
console.log(`\n--- Kugel (rundeste Region) ---`)
console.log(`  BBox: x[${ball.minX}..${ball.maxX}] y[${ball.minY}..${ball.maxY}]`)
console.log(`  ${ball.w}×${ball.h} px · Aspect ${ball.aspect.toFixed(2)} · Füllgrad ${ball.fill.toFixed(2)} (Kreis≈0.79)`)
const ballDiaPx = (ball.w + ball.h) / 2
const mmPerPx = ballMm / ballDiaPx
console.log(`  Durchmesser ${ballDiaPx.toFixed(1)} px → mmPerPx = ${mmPerPx.toFixed(5)}`)

// --- Blaue Pixel → Connected-Components (8-Nachbarschaft) ---
// Die durchgezogene, GESCHLOSSENE Implantatkontur ist EINE große
// Komponente. Gestrichelte Hilfslinien (Achse, Label-Linie) zerfallen in
// viele winzige Fragmente und fallen durch die Größenschwelle raus.
const blue = new Uint8Array(W * H)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const [r, g, b] = px(x, y)
  if (isBlue(r, g, b)) blue[y * W + x] = 1
}
const blab = new Int32Array(W * H)
const blueComps = []
const st2 = []
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const idx = y * W + x
  if (!blue[idx] || blab[idx]) continue
  let area = 0, mnX = W, mxX = -1, mnY = H, mxY = -1
  st2.push(idx); blab[idx] = 1
  while (st2.length) {
    const p = st2.pop()
    const py = (p / W) | 0, pxx = p % W
    area++
    if (pxx < mnX) mnX = pxx; if (pxx > mxX) mxX = pxx
    if (py < mnY) mnY = py; if (py > mxY) mxY = py
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = pxx + dx, ny = py + dy
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
      const q = ny * W + nx
      if (blue[q] && !blab[q]) { blab[q] = 1; st2.push(q) }
    }
  }
  blueComps.push({ area, mnX, mxX, mnY, mxY, w: mxX - mnX, h: mxY - mnY })
}
// nach Fläche sortieren, die zwei größten = Femur + Tibia
blueComps.sort((a, b) => b.area - a.area)
console.log(`\n--- Blaue Komponenten: ${blueComps.length} (Top 5 nach Fläche) ---`)
for (const c of blueComps.slice(0, 5)) {
  console.log(`  area ${String(c.area).padStart(5)} · ${c.w}×${c.h} px · y[${c.mnY}..${c.mxY}]`)
}
const big = blueComps.filter((c) => c.area > 400)
const [c1, c2] = big
// oben/unten nach y-Mittelpunkt zuordnen
const femur = c1 && c2 ? (c1.mnY < c2.mnY ? c1 : c2) : c1
const tibia = c1 && c2 ? (c1.mnY < c2.mnY ? c2 : c1) : null

if (femur) {
  console.log(`\n--- Femur (größte obere Komponente) ---`)
  console.log(`  ${femur.w}×${femur.h} px → M/L ${(femur.w*mmPerPx).toFixed(1)} mm · Höhe ${(femur.h*mmPerPx).toFixed(1)} mm`)
  if (analyzeExpect)
    console.log(`  ERWARTET ${analyzeExpect.femurLabel}: M/L ${analyzeExpect.femurMlMm} mm`)
}
if (tibia) {
  console.log(`\n--- Tibia (zweitgrößte, untere Komponente) ---`)
  console.log(`  ${tibia.w}×${tibia.h} px → M/L ${(tibia.w*mmPerPx).toFixed(1)} mm · Höhe ${(tibia.h*mmPerPx).toFixed(1)} mm`)
  if (analyzeExpect)
    console.log(`  ERWARTET ${analyzeExpect.tibiaLabel}: M/L ${analyzeExpect.tibiaMlMm} mm`)
}
