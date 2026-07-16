// Kern-Extraktionslogik für Knie-Schablonen aus Referenz-Screenshots.
// Geteilt von extract-knee-contour.mjs (Einzel-Test + Debug-PNG) und
// build-knee-contours.mjs (Batch → kneeContours.ts).
//
// extractContour(imagePath, ballMm) →
//   { mmPerPx, contours: [{ wMm, hMm, isUpper, normPoints, rawPoly }] }
//
// Robustheits-Design (Lehren aus den realen Screenshots):
//  1. Weiße gestrichelte Callout-Linien KREUZEN die blaue Implantat-Kontur
//     und reißen Lücken hinein → die Füllung „leckt" und ganze Teile (Kiel,
//     Inlay) fallen weg. Darum dient als Flutbarriere nicht nur Blau,
//     sondern Blau ∪ helle Overlay-Pixel: die weiße Linie stopft ihr
//     eigenes Loch.
//  2. Die Lücken zerteilen die blaue Zeichnung außerdem in mehrere
//     Komponenten. Darum werden Kandidaten auf der BARRIEREN-Maske
//     gelabelt (zusammenhängend trotz Unterbrechung) und erst NACH dem
//     Füllen + Opening die beste solide Komponente gewählt — und zwar die
//     mit den meisten ORIGINAL-blauen Pixeln (nie die helle Kugel).
//  3. Der Außen-Flood läuft 8-er-Nachbarschaft, damit er durch die
//     Strichlücken GEWOLLT gestrichelter blauer Linien (Achsen, verdeckte
//     Kanten) hindurchkommt — sonst werden Taschen dahinter fälschlich
//     als Implantat-Inneres gefüllt.
//  4. Kugel-Maßstab: Schwellwert-BBox ist beleuchtungsabhängig (±3 %).
//     Stattdessen Subpixel-Kantenfindung: 72 radiale Strahlen, Kante =
//     50 %-Helligkeits-Übergang, Median-Radius. Liegt ein (orangener)
//     Kalibrierring exakt auf der Kante, landet der Übergang im
//     Ring — also auf dem wahren Kreis.
//  5. Linienbreiten-Korrektur ist ADAPTIV: die halbe, pro Bild gemessene
//     Strichstärke (Median der Einwärts-Läufe durch die Blau-Maske),
//     nicht fix 1.5 px.
//  6. Punkt-Ausdünnung per Douglas-Peucker statt „jeder k-te Punkt":
//     Ecken bleiben scharf, Bögen glatt.
import { createCanvas, loadImage } from '@napi-rs/canvas'

const isBlue = (r, g, b) => b > 110 && b > r + 40 && g > r + 10 && g < b + 30 && r < 120
const isBright = (r, g, b) => { const mn = Math.min(r, g, b); return mn > 165 && Math.max(r, g, b) - mn < 40 }
// Heller Overlay-Strich (weiße Dash-Linien, Bubble-Ränder) — bewusst
// großzügiger als isBright, damit auch antialiasete Kreuzungspixel zählen.
const isBrightish = (r, g, b) => { const mn = Math.min(r, g, b); return mn > 130 && Math.max(r, g, b) - mn < 70 }
// Helles Blau: Mischpixel, wo die helle Achsenlinie die Kontur kreuzt
// (z. B. RGB 136,201,231) — zu hell für isBlue (r<120), zu bunt für
// isBrightish. Ohne diese Regel bleibt an jeder Kreuzung ein 1-px-Loch,
// durch das die Außen-Flutung ins Implantat-Innere leckt.
const isLightBlue = (r, g, b) => b > 140 && b - r > 40 && g > r
// Dunkles Blau: ausgefranste Anti-Aliasing-Reste der Konturlinie (z. B.
// RGB 0,75,110), wo der Strich dünn ausläuft — knapp unter der isBlue-
// Schwelle. Nur Barriere, zählt nicht als „echtes" Blau.
const isDimBlue = (r, g, b) => b > 60 && b - r > 35 && g > r

export async function extractContour(imagePath, ballMm = 25, opts = {}) {
  const img = await loadImage(imagePath)
  const W = img.width, H = img.height
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, W, H)
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]] }
  const luma = (x, y) => { const i = (y * W + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] }

  // --- Kugel → mmPerPx (rundeste helle Komponente, Subpixel-Kante) ---
  const bright = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = px(x, y); if (isBright(r, g, b)) bright[y * W + x] = 1 }
  const brightComps = labelComponents(bright, W, H)
  let ball = null, best = -1
  for (const c of brightComps) {
    if (c.w < 20 || c.h < 20) continue
    const aspect = Math.min(c.w, c.h) / Math.max(c.w, c.h)
    const fill = c.area / (c.w * c.h)
    const score = aspect * (1 - Math.abs(fill - 0.785) / 0.785)
    if (score > best) { best = score; ball = c }
  }
  if (!ball) throw new Error('Keine Kalibrierkugel gefunden')
  const ballDiaPx = refineBallDiameter(luma, W, H, ball) ?? (ball.w + ball.h) / 2
  const mmPerPx = ballMm / ballDiaPx

  // --- Barrieren-Maske: blau ∪ helle Overlay-Striche ---
  // Blau separat behalten — sie entscheidet später, welche solide
  // Komponente das Implantat ist und wie dick der Strich ist.
  const blue = new Uint8Array(W * H)
  const barrier = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = px(x, y)
    if (isBlue(r, g, b)) { blue[y * W + x] = 1; barrier[y * W + x] = 1 }
    else if (isBrightish(r, g, b) || isLightBlue(r, g, b) || isDimBlue(r, g, b)) barrier[y * W + x] = 1
  }
  // Mini-Closing (r=1) auf der Barriere: versiegelt echte 1–2-px-Brüche in
  // den Zeichnungs-Linien. Bewusst klein, damit die 4–6-px-Lücken GEWOLLT
  // gestrichelter Linien offen bleiben (deren Taschen sollen NICHT füllen).
  const barrierClosed = morph(morph(barrier, W, H, 1, false), W, H, 1, true)

  // Kandidaten auf der Barrieren-Maske labeln (überbrückt die Lücken, die
  // weiße Linien in die blaue Kontur reißen). Kandidat = genug blaue Pixel.
  const { labels: barLab, comps: barComps } = labelComponentsLabeled(barrierClosed, W, H)
  for (const c of barComps) {
    let nBlue = 0
    for (let y = c.mnY; y <= c.mxY; y++) for (let x = c.mnX; x <= c.mxX; x++) {
      const i = y * W + x
      if (barLab[i] === c.label && blue[i]) nBlue++
    }
    c.blueArea = nBlue
  }
  const cands = barComps.filter((c) => c.blueArea > 400).sort((a, b) => b.blueArea - a.blueArea)

  const contours = []
  const claimed = new Uint8Array(W * H) // verhindert Doppel-Extraktion, wenn zwei Kandidaten dieselbe Region füllen
  for (const comp of cands) {
    if (contours.length >= (opts.maxComponents ?? 2)) break
    // Inneres füllen (Außen-Flood, 8er) und dünne Fortsätze (Achsen-/
    // Callout-Linien) per Opening kappen; Closing danach glättet die
    // Kerben an den Stellen, wo entfernte Linien die Silhouette kreuzten.
    const solids = solidify(barLab, comp, W, H, opts.openRadius ?? 2)
    // Beste solide Teil-Komponente = die mit den meisten BLAUEN Pixeln
    // (verwirft helle Kugel/Bubbles, die über Dash-Linien angebunden sind).
    let bestSolid = null, bestBlue = 0
    for (const s of solids) {
      let nb = 0
      for (let i = 0; i < s.mask.length; i++) if (s.mask[i] && blue[i]) nb++
      if (nb > bestBlue) { bestBlue = nb; bestSolid = s }
    }
    if (!bestSolid || bestBlue < 300) continue
    let overlap = 0, area = 0
    for (let i = 0; i < bestSolid.mask.length; i++) if (bestSolid.mask[i]) { area++; if (claimed[i]) overlap++ }
    if (area === 0 || overlap / area > 0.5) continue
    for (let i = 0; i < bestSolid.mask.length; i++) if (bestSolid.mask[i]) claimed[i] = 1

    const raw = traceContour(bestSolid.mask, 1, W, H)
    if (raw.length < 10) continue
    const cleaned = dropExcursions(raw)
    // Adaptive Linienbreiten-Korrektur: halbe gemessene Strichstärke
    // entlang der LOKALEN KANTENNORMALEN einwärts (Zentroid nur als
    // Innen-Richtungs-Indikator) — gerade Kanten bleiben gerade.
    const inset = Math.min(3, Math.max(1, estimateStrokeWidth(cleaned, blue, W, H) / 2))
    let cxs = 0, cys = 0
    for (const [x, y] of cleaned) { cxs += x; cys += y }
    cxs /= cleaned.length; cys /= cleaned.length
    const nP = cleaned.length
    const look = Math.max(1, Math.round(nP / 200)) // Tangente über mehrere Pixel → stabiler
    const corrFull = cleaned.map(([x, y], i) => {
      const [px_, py_] = cleaned[(i - look + nP) % nP]
      const [qx, qy] = cleaned[(i + look) % nP]
      let tx = qx - px_, ty = qy - py_
      const tl = Math.hypot(tx, ty) || 1
      tx /= tl; ty /= tl
      let nx = -ty, ny = tx
      if (nx * (cxs - x) + ny * (cys - y) < 0) { nx = -nx; ny = -ny }
      return [x + nx * inset, y + ny * inset]
    })
    // Douglas-Peucker: Ecken erhalten, Bögen ausdünnen. Toleranz wächst,
    // bis die Punktzahl im Budget liegt (Bundle-Größe + Render-Last).
    let tol = 0.9, corr = corrFull
    for (let it = 0; it < 6; it++) {
      corr = simplifyClosed(corrFull, tol)
      if (corr.length <= 110) break
      tol *= 1.4
    }
    if (corr.length < 3) continue

    let mnX = W, mxX = -1, mnY = H, mxY = -1
    for (const [x, y] of corr) { if (x < mnX) mnX = x; if (x > mxX) mxX = x; if (y < mnY) mnY = y; if (y > mxY) mxY = y }
    const wMm = (mxX - mnX) * mmPerPx, hMm = (mxY - mnY) * mmPerPx
    // x und y UNABHÄNGIG auf [-1,1] normalisieren (x über halbe Breite, y über
    // halbe Höhe). Erlaubt im Renderer anisotrope Skalierung — Voraussetzung
    // für abgeleitete Narrow-Varianten (nur Breite stauchen, Höhe halten).
    const ncx = (mnX + mxX) / 2, ncy = (mnY + mxY) / 2
    const halfW = (mxX - mnX) / 2 || 1, halfH = (mxY - mnY) / 2 || 1
    const normPoints = corr.map(([x, y]) => ({ x: +((x - ncx) / halfW).toFixed(4), y: +((y - ncy) / halfH).toFixed(4) }))
    // Inlay/Baseplate-Trennlinie: Die Baseplate-Oberkante ist eine durchgehende
    // horizontale Linie über (fast) die volle Breite; Inlay-/Kiel-Ränder sind
    // schräg/gekrümmt und kreuzen jede Zeile nur kurz. Also: oberste Zeile der
    // BLAU-Maske (im BBox-Fenster der soliden Komponente) mit langem
    // horizontalem Lauf = Baseplate-Oberkante. Nur für Tibia-Verbünde sinnvoll;
    // der Batch speichert sie kind-abhängig. y normalisiert wie die Punkte.
    const bx0 = Math.max(0, Math.round(mnX)), bx1 = Math.min(W - 1, Math.round(mxX))
    const by0 = Math.max(0, Math.round(mnY)), by1 = Math.min(H - 1, Math.round(mxY))
    let maxRun = 0
    const runOf = new Int32Array(H)
    for (let y = by0; y <= by1; y++) {
      let run = 0, bestR = 0
      for (let x = bx0; x <= bx1; x++) {
        if (blue[y * W + x]) { if (++run > bestR) bestR = run } else run = 0
      }
      runOf[y] = bestR
      if (bestR > maxRun) maxRun = bestR
    }
    // 0.9·maxRun: nur die (fast) volle Baseplate-Breite zählt. Schmalere
    // horizontale Inlay-Kanten liegen darunter und werden übersprungen.
    let splitPx = Math.round(ncy)
    for (let y = by0; y <= by1; y++) if (runOf[y] >= 0.9 * maxRun) { splitPx = y; break }
    const inlaySplitY = +((splitPx - ncy) / halfH).toFixed(4)
    contours.push({ wMm, hMm, isUpper: comp.mnY < H / 2, normPoints, rawPoly: corr, inlaySplitY, inlaySplitYPx: splitPx })
  }
  // Stabil nach Bildposition (oben zuerst) statt nach Flächengröße.
  contours.sort((a, b) => (a.isUpper === b.isUpper ? 0 : a.isUpper ? -1 : 1))
  return { mmPerPx, ballDiaPx, W, H, canvas, ctx, contours }
}

// ---------- Kugel: Subpixel-Kantenradius ----------
// 72 Strahlen vom BBox-Zentrum; Kante = Übergang durch die 50 %-Schwelle
// zwischen Innen- und Außen-Helligkeit (linear interpoliert). Median über
// alle Strahlen → unempfindlich gegen Dash-Linien-Anschnitte und den
// Kalibrierring. null bei unplausiblem Ergebnis (Fallback: BBox-Maß).
function refineBallDiameter(luma, W, H, ball) {
  const cx = (ball.mnX + ball.mxX) / 2, cy = (ball.mnY + ball.mxY) / 2
  const R0 = (ball.w + ball.h) / 4
  if (R0 < 12) return null
  const radii = []
  const NRAYS = 72
  for (let k = 0; k < NRAYS; k++) {
    const a = (2 * Math.PI * k) / NRAYS
    const dx = Math.cos(a), dy = Math.sin(a)
    const sample = (r) => {
      const x = cx + dx * r, y = cy + dy * r
      const xi = Math.round(x), yi = Math.round(y)
      if (xi < 0 || xi >= W || yi < 0 || yi >= H) return null
      return luma(xi, yi)
    }
    let innerSum = 0, innerN = 0
    for (let r = 0.3 * R0; r <= 0.6 * R0; r += 1) { const v = sample(r); if (v != null) { innerSum += v; innerN++ } }
    let outerSum = 0, outerN = 0
    for (let r = 1.35 * R0; r <= 1.7 * R0; r += 1) { const v = sample(r); if (v != null) { outerSum += v; outerN++ } }
    if (!innerN || !outerN) continue
    const inner = innerSum / innerN, outer = outerSum / outerN
    if (inner - outer < 40) continue // kein klarer Hell-Dunkel-Übergang auf diesem Strahl
    const thr = (inner + outer) / 2
    let prevR = 0.6 * R0, prevV = sample(prevR)
    let edge = null
    for (let r = 0.6 * R0 + 0.5; r <= 1.6 * R0; r += 0.5) {
      const v = sample(r)
      if (v == null) break
      if (prevV != null && prevV >= thr && v < thr) {
        edge = prevR + 0.5 * ((prevV - thr) / Math.max(1e-6, prevV - v))
        // letzten Übergang nehmen (Ring-Außenkante zählt nicht: der Median
        // über alle Strahlen bügelt Einzel-Ausreißer ohnehin aus)
      }
      prevR = r; prevV = v
    }
    if (edge != null) radii.push(edge)
  }
  if (radii.length < NRAYS / 2) return null
  radii.sort((a, b) => a - b)
  const med = radii[(radii.length / 2) | 0]
  if (Math.abs(med - R0) > 0.3 * R0) return null
  return 2 * med
}

// ---------- Strichstärke schätzen ----------
// Median der Einwärts-Läufe durch die Blau-Maske, gemessen an jedem
// 4. Konturpunkt entlang der Innen-Normalen (Richtung Zentroid).
function estimateStrokeWidth(pts, blue, W, H) {
  const n = pts.length
  let cxs = 0, cys = 0
  for (const [x, y] of pts) { cxs += x; cys += y }
  cxs /= n; cys /= n
  const runs = []
  for (let i = 0; i < n; i += 4) {
    const [x, y] = pts[i]
    const [px_, py_] = pts[(i - 2 + n) % n]
    const [qx, qy] = pts[(i + 2) % n]
    let tx = qx - px_, ty = qy - py_
    const tl = Math.hypot(tx, ty) || 1
    let nx = -ty / tl, ny = tx / tl
    if (nx * (cxs - x) + ny * (cys - y) < 0) { nx = -nx; ny = -ny }
    let run = 0
    for (let s = 0; s <= 10; s += 0.5) {
      const xi = Math.round(x + nx * s), yi = Math.round(y + ny * s)
      if (xi < 0 || xi >= W || yi < 0 || yi >= H || !blue[yi * W + xi]) break
      run = s + 0.5
    }
    if (run > 0.5 && run < 10) runs.push(run)
  }
  if (runs.length < 8) return 3 // Default ≈ typische Strichstärke der Quell-Screenshots
  runs.sort((a, b) => a - b)
  return runs[(runs.length / 2) | 0]
}

// ---------- Douglas-Peucker (geschlossener Polygonzug) ----------
function simplifyClosed(pts, tol) {
  const n = pts.length
  if (n < 8) return pts.slice()
  // Anker: die beiden entferntesten Extrempunkte der BBox-Diagonale
  let iMin = 0, iMax = 0
  for (let i = 1; i < n; i++) {
    if (pts[i][0] + pts[i][1] < pts[iMin][0] + pts[iMin][1]) iMin = i
    if (pts[i][0] + pts[i][1] > pts[iMax][0] + pts[iMax][1]) iMax = i
  }
  const [a, b] = iMin < iMax ? [iMin, iMax] : [iMax, iMin]
  const seg1 = rdp(pts.slice(a, b + 1), tol)
  const seg2 = rdp([...pts.slice(b), ...pts.slice(0, a + 1)], tol)
  return [...seg1.slice(0, -1), ...seg2.slice(0, -1)]
}

function rdp(pts, tol) {
  if (pts.length < 3) return pts.slice()
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [i0, i1] = stack.pop()
    const [x0, y0] = pts[i0], [x1, y1] = pts[i1]
    const dx = x1 - x0, dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1e-9
    let maxD = -1, maxI = -1
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs(dy * (pts[i][0] - x0) - dx * (pts[i][1] - y0)) / len
      if (d > maxD) { maxD = d; maxI = i }
    }
    if (maxD > tol) { keep[maxI] = 1; stack.push([i0, maxI], [maxI, i1]) }
  }
  return pts.filter((_, i) => keep[i])
}

// ---------- Helfer ----------
function labelComponents(mask, W, H) {
  const lab = new Int32Array(W * H), out = [], st = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x
    if (!mask[idx] || lab[idx]) continue
    let area = 0, mnX = W, mxX = -1, mnY = H, mxY = -1
    st.push(idx); lab[idx] = 1
    while (st.length) {
      const p = st.pop(), py = (p / W) | 0, pxx = p % W
      area++
      if (pxx < mnX) mnX = pxx; if (pxx > mxX) mxX = pxx
      if (py < mnY) mnY = py; if (py > mxY) mxY = py
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = pxx + dx, ny = py + dy
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
        const q = ny * W + nx
        if (mask[q] && !lab[q]) { lab[q] = 1; st.push(q) }
      }
    }
    out.push({ area, mnX, mxX, mnY, mxY, w: mxX - mnX + 1, h: mxY - mnY + 1 })
  }
  return out
}

function labelComponentsLabeled(mask, W, H) {
  const labels = new Int32Array(W * H), comps = [], st = []
  let n = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x
    if (!mask[idx] || labels[idx]) continue
    n++
    let area = 0, mnX = W, mxX = -1, mnY = H, mxY = -1
    st.push(idx); labels[idx] = n
    while (st.length) {
      const p = st.pop(), py = (p / W) | 0, pxx = p % W
      area++
      if (pxx < mnX) mnX = pxx; if (pxx > mxX) mxX = pxx
      if (py < mnY) mnY = py; if (py > mxY) mxY = py
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = pxx + dx, ny = py + dy
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
        const q = ny * W + nx
        if (mask[q] && !labels[q]) { labels[q] = n; st.push(q) }
      }
    }
    comps.push({ label: n, area, mnX, mxX, mnY, mxY, w: mxX - mnX + 1, h: mxY - mnY + 1 })
  }
  return { labels, comps }
}

function traceContour(mask, fgValue, W, H) {
  let sx = -1, sy = -1
  outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (mask[y * W + x] === fgValue) { sx = x; sy = y; break outer }
  }
  if (sx < 0) return []
  const isFg = (x, y) => x >= 0 && x < W && y >= 0 && y < H && mask[y * W + x] === fgValue
  const dirs = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
  const contour = [[sx, sy]]
  let cx = sx, cy = sy, backDir = 7
  for (let step = 0; step < 200000; step++) {
    let found = false
    for (let k = 0; k < 8; k++) {
      const d = (backDir + 1 + k) % 8
      const nx = cx + dirs[d][0], ny = cy + dirs[d][1]
      if (isFg(nx, ny)) { contour.push([nx, ny]); backDir = (d + 4) % 8; cx = nx; cy = ny; found = true; break }
    }
    if (!found) break
    if (cx === sx && cy === sy && contour.length > 3) break
  }
  return contour
}

function dropExcursions(pts, bridgeDist = 3, minExcursion = 4, maxExcursion = 60) {
  const n = pts.length
  const remove = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (remove[i]) continue
    let bestJ = -1
    for (let d = minExcursion; d <= maxExcursion; d++) {
      const j = i + d
      if (j >= n) break
      const dist = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
      if (dist <= bridgeDist) bestJ = j
    }
    if (bestJ > i) { for (let k = i + 1; k < bestJ; k++) remove[k] = 1; i = bestJ - 1 }
  }
  return pts.filter((_, i) => !remove[i])
}

// Komponente → solide Körper ohne dünne Fortsätze:
//  1) Maske der Komponente in ihrer BBox (+ Rand m).
//  2) Eingeschlossenes Inneres füllen: Außen-Flood (8er!) vom Rand durch
//     Nicht-Masken-Pixel — 8er, damit der Flood durch die Strichlücken
//     gewollt gestrichelter Linien kommt und deren Taschen NICHT füllt.
//  3) Opening (Radius r): entfernt dünne Fortsätze ≤ 2r+1 px.
//  4) Closing (Radius r+1): glättet Kerben, wo entfernte Linien die
//     Silhouette kreuzten, und verschmilzt minimal getrennte Teile wieder.
//  5) ALLE verbleibenden Komponenten zurückgeben (Wahl trifft der Aufrufer
//     anhand der Blau-Überdeckung).
function solidify(labels, comp, W, H, r) {
  const m = r + 3
  const x0 = Math.max(0, comp.mnX - m), y0 = Math.max(0, comp.mnY - m)
  const x1 = Math.min(W - 1, comp.mxX + m), y1 = Math.min(H - 1, comp.mxY + m)
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  const mask = new Uint8Array(bw * bh)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    if (labels[y * W + x] === comp.label) mask[(y - y0) * bw + (x - x0)] = 1
  // Außen-Flood. Diagonalschritte nur, wenn mindestens einer der beiden
  // angrenzenden Orthogonal-Nachbarn frei ist: echte Lücken (Dash-Gaps,
  // ≥1 px orthogonal) bleiben passierbar, aber der Flood kann NICHT
  // diagonal durch die „X"-Kreuzung zweier dünner Linien schlüpfen
  // (das war das Leck, das halbe Inlay-Taschen geleert hat).
  const ext = new Uint8Array(bw * bh), st = []
  const free = (i) => !mask[i] && !ext[i]
  const pushIf = (i) => { if (free(i)) { ext[i] = 1; st.push(i) } }
  for (let x = 0; x < bw; x++) { pushIf(x); pushIf((bh - 1) * bw + x) }
  for (let y = 0; y < bh; y++) { pushIf(y * bw); pushIf(y * bw + bw - 1) }
  while (st.length) {
    const p = st.pop(), py = (p / bw) | 0, pxx = p % bw
    const xm = pxx > 0, xp = pxx < bw - 1, ym = py > 0, yp = py < bh - 1
    if (xm) pushIf(p - 1)
    if (xp) pushIf(p + 1)
    if (ym) pushIf(p - bw)
    if (yp) pushIf(p + bw)
    if (xm && ym && (!mask[p - 1] || !mask[p - bw])) pushIf(p - bw - 1)
    if (xp && ym && (!mask[p + 1] || !mask[p - bw])) pushIf(p - bw + 1)
    if (xm && yp && (!mask[p - 1] || !mask[p + bw])) pushIf(p + bw - 1)
    if (xp && yp && (!mask[p + 1] || !mask[p + bw])) pushIf(p + bw + 1)
  }
  const filled = new Uint8Array(bw * bh)
  for (let i = 0; i < filled.length; i++) filled[i] = (mask[i] || !ext[i]) ? 1 : 0
  // Taschen-Rückgewinnung: Manche Zeichnungen lassen Ecken offen (z. B.
  // trifft die Artikulationslinie die Inlay-Außenkante nicht ganz —
  // ~10 px Loch), wodurch eine ganze Inlay-Tasche „ausläuft". Erkennung:
  // ein großzügiges Closing (r=5) versiegelt ALLE Lücken ≤ ~10 px; was
  // dann zusätzlich innen liegt, sind Taschen-Kandidaten. Übernommen wird
  // eine Tasche nur, wenn ihre Gesamt-Öffnung zum echten Außenraum schmal
  // ist (≤ 18 Pixel-Kontakte) — Taschen hinter GEWOLLT gestrichelten
  // Linien haben viele Lücken-Kontakte und bleiben draußen.
  const sealed = morph(morph(mask, bw, bh, 5, false), bw, bh, 5, true)
  const ext2 = new Uint8Array(bw * bh), st2 = []
  const pushIf2 = (i) => { if (!sealed[i] && !ext2[i]) { ext2[i] = 1; st2.push(i) } }
  for (let x = 0; x < bw; x++) { pushIf2(x); pushIf2((bh - 1) * bw + x) }
  for (let y = 0; y < bh; y++) { pushIf2(y * bw); pushIf2(y * bw + bw - 1) }
  while (st2.length) {
    const p = st2.pop(), py = (p / bw) | 0, pxx = p % bw
    if (pxx > 0) pushIf2(p - 1)
    if (pxx < bw - 1) pushIf2(p + 1)
    if (py > 0) pushIf2(p - bw)
    if (py < bh - 1) pushIf2(p + bw)
  }
  const pocket = new Uint8Array(bw * bh)
  for (let i = 0; i < pocket.length; i++) pocket[i] = (!filled[i] && !ext2[i]) ? 1 : 0
  const { labels: pockLab, comps: pockComps } = labelComponentsLabeled(pocket, bw, bh)
  for (const pc of pockComps) {
    let aperture = 0
    for (let y = pc.mnY; y <= pc.mxY; y++) for (let x = pc.mnX; x <= pc.mxX; x++) {
      const i = y * bw + x
      if (pockLab[i] !== pc.label) continue
      // Kontakt zu echtem Außenraum (ext aus dem Haupt-Flood, außerhalb
      // der Tasche und nicht Maske) = Teil der Leck-Öffnung.
      const nb = [i - 1, i + 1, i - bw, i + bw]
      for (const q of nb) {
        if (q < 0 || q >= bw * bh) continue
        if (ext[q] && !pocket[q] && !mask[q]) { aperture++; break }
      }
    }
    if (aperture <= 18) {
      for (let y = pc.mnY; y <= pc.mxY; y++) for (let x = pc.mnX; x <= pc.mxX; x++) {
        const i = y * bw + x
        if (pockLab[i] === pc.label) filled[i] = 1
      }
    }
  }
  const opened = morph(morph(filled, bw, bh, r, true), bw, bh, r, false)
  const closed = morph(morph(opened, bw, bh, r + 1, false), bw, bh, r + 1, true)
  const { labels: subLab, comps: subComps } = labelComponentsLabeled(closed, bw, bh)
  const out = []
  for (const sc of subComps) {
    if (sc.area < 400) continue
    const full = new Uint8Array(W * H)
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++)
      if (subLab[y * bw + x] === sc.label) full[(y + y0) * W + (x + x0)] = 1
    out.push({ mask: full, area: sc.area })
  }
  return out
}

// Quadratisches Strukturelement (Chebyshev-Radius r). erode=min, dilate=max.
function morph(src, W, H, r, erode) {
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let hit = erode
    for (let dy = -r; dy <= r && (erode ? hit : !hit); dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy
        const s = (nx >= 0 && nx < W && ny >= 0 && ny < H) ? src[ny * W + nx] : 0
        if (erode) { if (!s) { hit = false; break } }
        else { if (s) { hit = true; break } }
      }
    out[y * W + x] = hit ? 1 : 0
  }
  return out
}
