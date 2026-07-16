// Raster-basierte Konturextraktion.
//
// Die alten S&N-Blätter (Plotter-Ära) zeichnen Konturen als viele über-
// lappende Kurzstriche — ein Linien-GRAPH liefert dort keine sauberen
// Zyklen. Robust ist der Umweg über ein Binärbild:
//   1. Chains in ein Raster zeichnen (Standard 16 px/mm),
//   2. von außen fluten → alles Erreichbare ist „außen",
//   3. größte NICHT geflutete Region = Implantat-Inneres,
//   4. deren Außenrand per Moore-Nachbar-Verfolgung ablaufen,
//   5. zurück nach mm + Douglas-Peucker.
// Offene Bemaßungslinien/Schrift fluten beidseitig → verschwinden von
// selbst. Genauigkeit bei 16 px/mm: ±0,06 mm — weit unter Toleranz.

import { chainBBox, simplifyClosed } from './geometry.mjs'

/**
 * Außenkontur eines Chain-Clusters (Einheiten → mm über unitsPerMm).
 * Liefert { points, areaMm2 } oder null.
 */
export function outerContour(chains, unitsPerMm, pxPerMm = 16, strokePx = 2) {
  const all = outerContours(chains, unitsPerMm, { pxPerMm, strokePx, top: 1 })
  return all.length ? all[0] : null
}

/**
 * Die `top` größten EINGESCHLOSSENEN Regionen als Konturen — für Blätter
 * mit verschachtelten Größen (z. B. Tibia-Baseplate „Size 1-2": äußere
 * Kontur = große Größe, innere = kleine).
 */
export function outerContours(chains, unitsPerMm, opts = {}) {
  const pxPerMm = opts.pxPerMm ?? 16
  const strokePx = opts.strokePx ?? 2
  const top = opts.top ?? 1
  // merge: alle eingeschlossenen Regionen zu EINER Maske vereinen und die
  // zusammenhängenden Komponenten tracen — für Profile, die durch
  // Innenlinien (Platte/Kiel, Mittellinien) in Teilregionen zerfallen.
  const merge = opts.merge ?? false
  const box = chainBBox(chains)
  const marginPx = 4
  const W = Math.ceil((box.w / unitsPerMm) * pxPerMm) + 2 * marginPx
  const H = Math.ceil((box.h / unitsPerMm) * pxPerMm) + 2 * marginPx
  if (W < 8 || H < 8 || W * H > 40_000_000) return []
  const grid = new Uint8Array(W * H) // 0 frei, 1 Strich, 2 außen

  const toPx = ([x, y]) => [
    marginPx + ((x - box.minX) / unitsPerMm) * pxPerMm,
    marginPx + ((box.maxY - y) / unitsPerMm) * pxPerMm, // y-Flip: Bildkoord.
  ]

  // 1) Striche zeichnen (dicke Bresenham-Linie)
  const r = Math.max(1, Math.floor(strokePx / 2))
  const stamp = (cx, cy) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx) + dx
        const y = Math.round(cy) + dy
        if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = 1
      }
  }
  for (const c of chains) {
    for (let i = 0; i < c.length - 1; i++) {
      const [x1, y1] = toPx(c[i])
      const [x2, y2] = toPx(c[i + 1])
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)))
      for (let s = 0; s <= steps; s++) {
        stamp(x1 + ((x2 - x1) * s) / steps, y1 + ((y2 - y1) * s) / steps)
      }
    }
  }

  // 2) Außen fluten (vom Rand, 4er-Nachbarschaft, iterativ mit Stack)
  const stack = []
  for (let x = 0; x < W; x++) {
    stack.push(x, (H - 1) * W + x)
  }
  for (let y = 0; y < H; y++) {
    stack.push(y * W, y * W + W - 1)
  }
  while (stack.length) {
    const i = stack.pop()
    if (grid[i] !== 0) continue
    grid[i] = 2
    const x = i % W
    if (x > 0) stack.push(i - 1)
    if (x < W - 1) stack.push(i + 1)
    if (i >= W) stack.push(i - W)
    if (i < W * (H - 1)) stack.push(i + W)
  }

  // 3) Eingeschlossene Regionen sammeln (Label-Flood über freie Zellen)
  const regions = []
  const seen = new Uint8Array(W * H)
  for (let i0 = 0; i0 < W * H; i0++) {
    if (grid[i0] !== 0 || seen[i0]) continue
    const cells = []
    const st = [i0]
    seen[i0] = 1
    while (st.length) {
      const i = st.pop()
      cells.push(i)
      const x = i % W
      const nb = []
      if (x > 0) nb.push(i - 1)
      if (x < W - 1) nb.push(i + 1)
      if (i >= W) nb.push(i - W)
      if (i < W * (H - 1)) nb.push(i + W)
      for (const n of nb)
        if (grid[n] === 0 && !seen[n]) {
          seen[n] = 1
          st.push(n)
        }
    }
    if (cells.length >= 100) regions.push(cells)
  }
  regions.sort((a, b) => b.length - a.length)
  let groups
  if (merge) {
    // Gesamtmaske aus allen Regionen, in Striche wachsen lassen, dann
    // 8er-zusammenhängende Komponenten der Maske als Gruppen tracen.
    const mask = new Uint8Array(W * H)
    for (const reg of regions) for (const i of reg) mask[i] = 1
    for (let pass = 0; pass < r + 1; pass++) {
      const grow = []
      for (let i = 0; i < W * H; i++) {
        if (mask[i] !== 1) continue
        const x = i % W
        if (x > 0 && !mask[i - 1] && grid[i - 1] === 1) grow.push(i - 1)
        if (x < W - 1 && !mask[i + 1] && grid[i + 1] === 1) grow.push(i + 1)
        if (i >= W && !mask[i - W] && grid[i - W] === 1) grow.push(i - W)
        if (i < W * (H - 1) && !mask[i + W] && grid[i + W] === 1) grow.push(i + W)
      }
      for (const i of grow) mask[i] = 1
      if (!grow.length) break
    }
    const seen2 = new Uint8Array(W * H)
    groups = []
    for (let i0 = 0; i0 < W * H; i0++) {
      if (mask[i0] !== 1 || seen2[i0]) continue
      const cells = []
      const st = [i0]
      seen2[i0] = 1
      while (st.length) {
        const i = st.pop()
        cells.push(i)
        const x = i % W, y = (i / W) | 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const n = ny * W + nx
            if (mask[n] === 1 && !seen2[n]) {
              seen2[n] = 1
              st.push(n)
            }
          }
      }
      if (cells.length >= 100) groups.push(cells)
    }
    groups.sort((a, b) => b.length - a.length)
    groups = groups.slice(0, top)
  } else {
    groups = regions.slice(0, top)
  }
  const out = []
  for (const best of groups) {

    // 4) Regionsmaske + Strich-Zugehörigkeit: Maske um Strichbreite dehnen,
    //    damit die Kontur auf der STRICHMITTE liegt, nicht am Innenrand.
    const mask = new Uint8Array(W * H)
    for (const i of best) mask[i] = 1
    for (let pass = 0; pass < r + 1; pass++) {
      const grow = []
      for (let i = 0; i < W * H; i++) {
        if (mask[i] !== 1) continue
        const x = i % W
        if (x > 0 && !mask[i - 1] && grid[i - 1] === 1) grow.push(i - 1)
        if (x < W - 1 && !mask[i + 1] && grid[i + 1] === 1) grow.push(i + 1)
        if (i >= W && !mask[i - W] && grid[i - W] === 1) grow.push(i - W)
        if (i < W * (H - 1) && !mask[i + W] && grid[i + W] === 1) grow.push(i + W)
      }
      for (const i of grow) mask[i] = 1
      if (!grow.length) break
    }

    // 5) Moore-Nachbar-Konturverfolgung auf der Maske
    const boundary = traceBoundary(mask, W, H)
    if (!boundary || boundary.length < 8) continue

    const mmPts = boundary.map(([px, py]) => [
      box.minX / unitsPerMm + (px - marginPx) / pxPerMm,
      box.maxY / unitsPerMm - (py - marginPx) / pxPerMm,
    ])
    out.push({
      points: simplifyClosed(mmPts, 0.08),
      areaMm2: best.length / (pxPerMm * pxPerMm),
    })
  }
  return out
}

/**
 * Gezielte Union: pickFn erhält die mm-Bounding-Boxen ALLER eingeschlossenen
 * Regionen und liefert die Indizes, die zu EINEM Profil vereint werden
 * sollen (z. B. Tibia: Platte + Kiel-Hälften, ohne Inlay-Bänder).
 */
export function pickedUnionContour(chains, unitsPerMm, pickFn, opts = {}) {
  const pxPerMm = opts.pxPerMm ?? 16
  // Brücken-Radius des Closings (Dilatation+Erosion). Muss der Rand
  // mittragen, sonst clippt die Dilatation am Canvas und die Erosion
  // frisst danach echte Kontur (Lehre aus dem 1,25-mm-Fehlversuch).
  const closing = opts.closingPasses ?? 3
  const regions = outerContours(chains, unitsPerMm, { top: 24, pxPerMm })
  if (!regions.length) return null
  const boxes = regions.map((r) => {
    const b = chainBBoxLocal(r.points)
    return { ...b, w: b.maxX - b.minX, h: b.maxY - b.minY, areaMm2: r.areaMm2 }
  })
  const idx = pickFn(boxes)
  if (!idx || !idx.length) return null
  const marginPx = 4 + closing
  // Union über Punkt-Raster: gewählte Konturen als gefüllte Polygone
  // stempeln, dann Außenrand der Union tracen.
  const sel = idx.map((i) => regions[i])
  const minX = Math.min(...idx.map((i) => boxes[i].minX)) - 1
  const maxX = Math.max(...idx.map((i) => boxes[i].maxX)) + 1
  const minY = Math.min(...idx.map((i) => boxes[i].minY)) - 1
  const maxY = Math.max(...idx.map((i) => boxes[i].maxY)) + 1
  const W = Math.ceil((maxX - minX) * pxPerMm) + 2 * marginPx
  const H = Math.ceil((maxY - minY) * pxPerMm) + 2 * marginPx
  const mask = new Uint8Array(W * H)
  for (const r of sel) fillPolygon(mask, W, H, r.points.map(([x, y]) => [
    marginPx + (x - minX) * pxPerMm,
    marginPx + (maxY - y) * pxPerMm,
  ]))
  // Morphologisches Closing mit ~1,25 mm Radius: überbrückt auch breitere
  // Leerbänder zwischen den GEWÄHLTEN Regionen (z. B. Basislinien-Zone
  // zwischen Tibia-Platte und Kiel). Da die Maske nur gewählte Regionen
  // enthält, kann dabei nichts Fremdes angeklebt werden; die Erosion
  // danach stellt die Originalmaße wieder her.
  const closingPasses = closing
  for (let pass = 0; pass < closingPasses; pass++) {
    const grow = []
    for (let i = 0; i < W * H; i++) {
      if (mask[i] !== 1) continue
      const x = i % W
      if (x > 0 && !mask[i - 1]) grow.push(i - 1)
      if (x < W - 1 && !mask[i + 1]) grow.push(i + 1)
      if (i >= W && !mask[i - W]) grow.push(i - W)
      if (i < W * (H - 1) && !mask[i + W]) grow.push(i + W)
    }
    for (const i of grow) mask[i] = 1
  }
  // Erosion spiegelbildlich zur Dilatation (morphologisches Closing):
  // Verbindungen bleiben, die Maße kehren auf die Strichmitte zurück.
  for (let pass = 0; pass < closingPasses; pass++) {
    const shrink = []
    for (let i = 0; i < W * H; i++) {
      if (mask[i] !== 1) continue
      const x = i % W
      if (
        (x > 0 && !mask[i - 1]) || (x < W - 1 && !mask[i + 1]) ||
        (i >= W && !mask[i - W]) || (i < W * (H - 1) && !mask[i + W])
      ) shrink.push(i)
    }
    for (const i of shrink) mask[i] = 0
  }
  // ALLE nennenswerten Komponenten tracen (z. B. Tibia: Platte und Kiel
  // sind auf dem Blatt durch die Basislinien-Zone getrennt — das Profil
  // besteht dann ehrlicherweise aus mehreren Polygonen).
  const comps = maskComponents(mask, W, H).filter(
    (c) => c.length >= 30 * pxPerMm, // ≥ ~30 mm² (Pfeilspitzen etc. raus)
  )
  if (!comps.length) return null
  const loops = []
  for (const cells of comps) {
    const sub = new Uint8Array(W * H)
    for (const i of cells) sub[i] = 1
    const boundary = traceBoundary(sub, W, H)
    if (!boundary || boundary.length < 8) continue
    const mmPts = boundary.map(([px, py]) => [minX + (px - 4) / pxPerMm, maxY - (py - 4) / pxPerMm])
    loops.push({
      points: simplifyClosed(mmPts, 0.08),
      areaMm2: cells.length / (pxPerMm * pxPerMm),
    })
  }
  if (!loops.length) return null
  loops.sort((a, b) => b.areaMm2 - a.areaMm2)
  // Kompatibilität: points/areaMm2 = größter Loop; loops = alle.
  return { points: loops[0].points, areaMm2: sel.reduce((a, r) => a + r.areaMm2, 0), loops }
}

/** Alle 8er-zusammenhängenden Komponenten der Maske (Zell-Listen). */
function maskComponents(mask, W, H) {
  const seen = new Uint8Array(W * H)
  const out = []
  for (let i0 = 0; i0 < W * H; i0++) {
    if (mask[i0] !== 1 || seen[i0]) continue
    const cells = []
    const st = [i0]
    seen[i0] = 1
    while (st.length) {
      const i = st.pop()
      cells.push(i)
      const x = i % W, y = (i / W) | 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          const n = ny * W + nx
          if (mask[n] === 1 && !seen[n]) {
            seen[n] = 1
            st.push(n)
          }
        }
    }
    out.push(cells)
  }
  return out
}

function chainBBoxLocal(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/** Nur die größte 8er-zusammenhängende Komponente der Maske behalten. */
function keepLargestComponent(mask, W, H) {
  const seen = new Uint8Array(W * H)
  let best = null
  for (let i0 = 0; i0 < W * H; i0++) {
    if (mask[i0] !== 1 || seen[i0]) continue
    const cells = []
    const st = [i0]
    seen[i0] = 1
    while (st.length) {
      const i = st.pop()
      cells.push(i)
      const x = i % W, y = (i / W) | 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          const n = ny * W + nx
          if (mask[n] === 1 && !seen[n]) {
            seen[n] = 1
            st.push(n)
          }
        }
    }
    if (!best || cells.length > best.length) best = cells
  }
  if (!best) return
  mask.fill(0)
  for (const i of best) mask[i] = 1
}

/** Scanline-Fuellung eines Polygons in die Maske. */
function fillPolygon(mask, W, H, pts) {
  let minY = Infinity, maxY = -Infinity
  for (const [, y] of pts) {
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
    const xs = []
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[(i + 1) % pts.length]
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.round(xs[k]))
      const b = Math.min(W - 1, Math.round(xs[k + 1]))
      for (let x = a; x <= b; x++) mask[y * W + x] = 1
    }
  }
}

/** Moore-Nachbar-Boundary-Tracing (liefert Pixel-Polygon des Maskenrands). */
function traceBoundary(mask, W, H) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1
  // Startpixel: erstes Maskenpixel von oben links
  let sx = -1, sy = -1
  outer: for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (at(x, y)) {
        sx = x
        sy = y
        break outer
      }
  if (sx < 0) return null
  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ]
  const pts = [[sx, sy]]
  let cx = sx, cy = sy
  let dir = 6 // Suche startet „oben"
  for (let steps = 0; steps < W * H; steps++) {
    let found = false
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8 // links herum beginnen (backtrack -2)
      const nx = cx + dirs[d][0]
      const ny = cy + dirs[d][1]
      if (at(nx, ny)) {
        cx = nx
        cy = ny
        dir = d
        pts.push([cx, cy])
        found = true
        break
      }
    }
    if (!found) break // isoliertes Pixel
    if (cx === sx && cy === sy && pts.length > 4) break
  }
  return pts
}
