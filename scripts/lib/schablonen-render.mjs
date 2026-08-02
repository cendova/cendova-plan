// Rendert Schablonen-Bilder aus Quell-Screenshots NEU, statt sie nur
// zuzuschneiden — angeglichen an das Format der Hüft-/Knie-Schablonen.
//
// Warum neu rendern statt hochskalieren (Autor-Feedback: „Linien zu dick,
// teilweise unscharf"): Die Schulter-Screenshots stammen aus zwei Serien
// mit sehr unterschiedlicher Qualität —
//   ReUnion   ~7,5–8,4 px/mm, Strich 0,36–0,53 mm  (≈ Hüfte: 8,5 px/mm)
//   Affinis/Medacta ~3,4–4,0 px/mm, Strich 0,76–1,48 mm
// Reines Hochskalieren fügt keine Information hinzu (bleibt unscharf) und
// lässt die Linien dick. Stattdessen: Linien-Maske extrahieren, auf eine
// einheitliche Soll-Strichstärke verdünnen und in der Zielauflösung mit
// Antialiasing NEU zeichnen. Ergebnis: scharfe Kanten in jeder Zoomstufe,
// gleichmäßig feine Linien — und alle Hilfslinien der Vorlage bleiben
// erhalten (die Maske erfasst jede gezeichnete Linie, nicht nur die
// Außenkontur).
import { createCanvas, loadImage } from '@napi-rs/canvas'

/** Zeichenfarbe der Quell-Screenshots (Cyan). Rot (Referenzkreis) und
 *  Weiß (UI) bleiben bewusst außen vor. */
const istCyan = (r, g, b) =>
  b > 110 && b > r + 40 && g > r + 10 && g < b + 30 && r < 120

/** Exakte quadrierte euklidische Distanztransformation (Felzenszwalb/
 *  Huttenlocher): zwei 1D-Durchläufe über Spalten und Zeilen. */
function edtSquared(f, W, H) {
  const INF = 1e12
  const out = new Float64Array(W * H)
  const d = new Float64Array(Math.max(W, H))
  const v = new Int32Array(Math.max(W, H))
  const z = new Float64Array(Math.max(W, H) + 1)
  const transform = (get, set, n) => {
    let k = 0
    v[0] = 0
    z[0] = -INF
    z[1] = INF
    for (let q = 1; q < n; q++) {
      let s
      for (;;) {
        s = (get(q) + q * q - (get(v[k]) + v[k] * v[k])) / (2 * q - 2 * v[k])
        if (s <= z[k]) k--
        else break
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++
      set(q, (q - v[k]) * (q - v[k]) + get(v[k]))
    }
  }
  // Spalten
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) d[y] = f[y * W + x]
    transform((i) => d[i], (i, val) => (out[i * W + x] = val), H)
    for (let y = 0; y < H; y++) d[y] = out[y * W + x]
  }
  // Zeilen
  for (let y = 0; y < H; y++) {
    const row = new Float64Array(W)
    for (let x = 0; x < W; x++) row[x] = out[y * W + x]
    transform((i) => row[i], (i, val) => (out[y * W + i] = val), W)
  }
  return out
}

/**
 * Zhang-Suen-Thinning: Maske → 1 px breite Mittellinie.
 *
 * Warum Mittellinie statt „Distanz-Schwelle": Die Strichstärke der
 * Vorlagen schwankt lokal (3–5 px). Schneidet man Linien über eine feste
 * Distanzschwelle dünn, brechen die dünneren Stellen auf und es entstehen
 * Flecken. Über die Mittellinie ist die neu gezeichnete Linie überall
 * gleich dick — unabhängig davon, wie dick sie in der Vorlage war.
 */
function thinning(src, W, H) {
  const img = Uint8Array.from(src)
  const P = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? 0 : img[y * W + x])
  let changed = true
  let runde = 0
  while (changed && runde++ < 60) {
    changed = false
    for (const schritt of [0, 1]) {
      const weg = []
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          if (!img[y * W + x]) continue
          const p2 = P(x, y - 1), p3 = P(x + 1, y - 1), p4 = P(x + 1, y)
          const p5 = P(x + 1, y + 1), p6 = P(x, y + 1), p7 = P(x - 1, y + 1)
          const p8 = P(x - 1, y), p9 = P(x - 1, y - 1)
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (B < 2 || B > 6) continue
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
          let A = 0
          for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) A++
          if (A !== 1) continue
          if (schritt === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue
          }
          weg.push(y * W + x)
        }
      }
      if (weg.length) {
        changed = true
        for (const i of weg) img[i] = 0
      }
    }
  }
  return img
}

/** Median der horizontalen Laufweiten durch die Maske = Strichstärke (px). */
function strichbreitePx(mask, W, H) {
  const runs = []
  for (let y = 0; y < H; y++) {
    let run = 0
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x]) run++
      else {
        if (run > 0 && run < 14) runs.push(run)
        run = 0
      }
    }
  }
  if (runs.length < 5) return 0
  runs.sort((a, b) => a - b)
  return runs[(runs.length / 2) | 0]
}

/**
 * @param pfad          Quell-Screenshot
 * @param mmPerPxQuelle Maßstab des Screenshots (aus der Kugel-Kalibrierung)
 * @param opt.zielMmPerPx  Ziel-Auflösung (Default 0.1176 = 216 dpi, Hüft-Format)
 * @param opt.strichMm     Soll-Strichstärke in mm (Default 0.40)
 * @param opt.randMm       Rand um die Zeichnung in mm (Default 1.5)
 * @returns { png, widthPx, heightPx, mmPerPx, quelleStrichMm }
 */
export async function rendereSchablonenBild(pfad, mmPerPxQuelle, opt = {}) {
  const zielMmPerPx = opt.zielMmPerPx ?? 0.1176
  const strichMm = opt.strichMm ?? 0.4
  const randMm = opt.randMm ?? 1.5

  const img = await loadImage(pfad)
  const W = img.width
  const H = img.height
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, W, H)

  const mask = new Uint8Array(W * H)
  let mnX = W, mxX = -1, mnY = H, mxY = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      if (!istCyan(data[i], data[i + 1], data[i + 2])) continue
      mask[y * W + x] = 1
      if (x < mnX) mnX = x
      if (x > mxX) mxX = x
      if (y < mnY) mnY = y
      if (y > mxY) mxY = y
    }
  }
  if (mxX < 0) throw new Error('keine Zeichnung (Cyan) gefunden')

  const strichQuellePx = strichbreitePx(mask, W, H) || 3
  const skala = mmPerPxQuelle / zielMmPerPx

  // Zielbild: Zeichnung + Rand, SYMMETRISCH um das BBox-Zentrum (der
  // Renderer setzt Bildmitte = Schablonen-Anker).
  const randPx = randMm / zielMmPerPx
  const halfWz = Math.ceil(((mxX - mnX + 1) / 2) * skala + randPx)
  const halfHz = Math.ceil(((mxY - mnY + 1) / 2) * skala + randPx)
  const ZW = 2 * halfWz
  const ZH = 2 * halfHz
  const cxQ = (mnX + mxX + 1) / 2
  const cyQ = (mnY + mxY + 1) / 2

  // Maske in Zielauflösung: bilinear sampeln (glättet die Treppen der
  // groben Quellserien), dann bei 0.5 binarisieren.
  const ziel = new Float64Array(ZW * ZH)
  for (let y = 0; y < ZH; y++) {
    const sy = cyQ + (y + 0.5 - halfHz) / skala - 0.5
    const y0 = Math.floor(sy)
    const fy = sy - y0
    for (let x = 0; x < ZW; x++) {
      const sx = cxQ + (x + 0.5 - halfWz) / skala - 0.5
      const x0 = Math.floor(sx)
      const fx = sx - x0
      const at = (xx, yy) =>
        xx < 0 || xx >= W || yy < 0 || yy >= H ? 0 : mask[yy * W + xx]
      const v =
        at(x0, y0) * (1 - fx) * (1 - fy) +
        at(x0 + 1, y0) * fx * (1 - fy) +
        at(x0, y0 + 1) * (1 - fx) * fy +
        at(x0 + 1, y0 + 1) * fx * fy
      ziel[y * ZW + x] = v
    }
  }

  // Vor der Skelettierung glätten: Die groben Quellserien (3,4 px/mm)
  // haben Treppenkanten, die sich sonst als Wellen in die Mittellinie
  // fortpflanzen. Separabler Gauß auf der weichen Maske, Radius an die
  // Hochskalierung gekoppelt.
  const sigma = Math.max(0.6, 0.55 * skala)
  const rad = Math.max(1, Math.ceil(2 * sigma))
  const kern = []
  let kernSumme = 0
  for (let i = -rad; i <= rad; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    kern.push(v)
    kernSumme += v
  }
  for (let i = 0; i < kern.length; i++) kern[i] /= kernSumme
  const tmpG = new Float64Array(ZW * ZH)
  for (let y = 0; y < ZH; y++) {
    for (let x = 0; x < ZW; x++) {
      let s = 0
      for (let k = -rad; k <= rad; k++) {
        const xx = Math.min(ZW - 1, Math.max(0, x + k))
        s += ziel[y * ZW + xx] * kern[k + rad]
      }
      tmpG[y * ZW + x] = s
    }
  }
  for (let x = 0; x < ZW; x++) {
    for (let y = 0; y < ZH; y++) {
      let s = 0
      for (let k = -rad; k <= rad; k++) {
        const yy = Math.min(ZH - 1, Math.max(0, y + k))
        s += tmpG[yy * ZW + x] * kern[k + rad]
      }
      ziel[y * ZW + x] = s
    }
  }

  // Binarisieren, Mittellinie bestimmen, mit Soll-Stärke neu zeichnen.
  const bin = new Uint8Array(ZW * ZH)
  for (let i = 0; i < bin.length; i++) bin[i] = ziel[i] >= 0.5 ? 1 : 0
  const skelett = thinning(bin, ZW, ZH)

  // Abstand jedes Pixels zur Mittellinie → antialiasierte Linie konstanter
  // Breite (EDT auf der Skelett-Punktmenge).
  const f = new Float64Array(ZW * ZH)
  for (let i = 0; i < f.length; i++) f[i] = skelett[i] ? 0 : 1e12
  const d2 = edtSquared(f, ZW, ZH)
  const sollHalb = strichMm / zielMmPerPx / 2

  const out = createCanvas(ZW, ZH)
  const octx = out.getContext('2d')
  const imgData = octx.createImageData(ZW, ZH)
  for (let i = 0; i < ZW * ZH; i++) {
    const dist = Math.sqrt(d2[i])
    // Antialiasing über ein Pixel Breite.
    const a = Math.max(0, Math.min(1, sollHalb - dist + 0.5))
    const p = i * 4
    imgData.data[p] = 0
    imgData.data[p + 1] = Math.round(255 * a)
    imgData.data[p + 2] = Math.round(255 * a)
    imgData.data[p + 3] = 255
  }
  octx.putImageData(imgData, 0, 0)

  return {
    png: await out.encode('png'),
    widthPx: ZW,
    heightPx: ZH,
    mmPerPx: zielMmPerPx,
    quelleStrichMm: +(strichQuellePx * mmPerPxQuelle).toFixed(2),
  }
}
