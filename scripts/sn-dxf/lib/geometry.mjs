// Geometrie-Werkzeuge für den S&N-DXF-Konverter.
//
// Grundidee: Alle DXF-Entities werden zu POLYLINIEN-KETTEN („Chains")
// tesselliert — Listen von [x,y]-Punkten in Zeichnungseinheiten. Darauf
// bauen Clustering (zusammenhängende Zeichnungsteile finden) und die
// Zyklus-Extraktion auf (geschlossene Implantat-Konturen von offenen
// Bemaßungslinien/Schraffuren trennen).

/** Ein Chain ist eine Punktliste [[x,y], ...] (≥ 2 Punkte). */

const TAU = Math.PI * 2

/** DXF-Winkel: dxf-parser liefert Grad für ARC — defensiv erkennen. */
function toRad(a) {
  return Math.abs(a) > TAU + 0.1 ? (a * Math.PI) / 180 : a
}

/** Kreisbogen → Punktkette (immer CCW von start nach end). */
function tessArc(cx, cy, r, start, end, segPerRad = 12) {
  let a0 = toRad(start)
  let a1 = toRad(end)
  while (a1 <= a0) a1 += TAU
  const n = Math.max(2, Math.ceil((a1 - a0) * segPerRad))
  const pts = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

/** Ellipsenbogen (DXF-Parametrisierung) → Punktkette. */
function tessEllipse(e) {
  const cx = e.center.x
  const cy = e.center.y
  const mx = e.majorAxisEndPoint.x
  const my = e.majorAxisEndPoint.y
  const a = Math.hypot(mx, my)
  const b = a * e.axisRatio
  const rot = Math.atan2(my, mx)
  let t0 = e.startAngle ?? 0
  let t1 = e.endAngle ?? TAU
  while (t1 <= t0) t1 += TAU
  const n = Math.max(8, Math.ceil((t1 - t0) * 12))
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    const px = a * Math.cos(t)
    const py = b * Math.sin(t)
    pts.push([
      cx + px * Math.cos(rot) - py * Math.sin(rot),
      cy + px * Math.sin(rot) + py * Math.cos(rot),
    ])
  }
  return pts
}

/** B-Spline (de Boor) → Punktkette. Nur offene, geklemmte Splines —
 *  reicht für die S&N-Blätter (24 Splines im CPCS-Schaft). */
function tessSpline(e, samples = 64) {
  const ctrl = (e.controlPoints || []).map((p) => [p.x, p.y])
  const k = e.degree ?? 3
  const knots = e.knotValues || []
  if (ctrl.length < 2) return null
  if (knots.length < ctrl.length + k + 1) {
    // Ohne brauchbaren Knotenvektor: Kontrollpolygon als Näherung.
    return ctrl
  }
  const tMin = knots[k]
  const tMax = knots[knots.length - 1 - k]
  const pts = []
  for (let i = 0; i <= samples; i++) {
    const t = tMin + ((tMax - tMin) * i) / samples
    pts.push(deBoor(t, k, ctrl, knots))
  }
  return pts
}

function deBoor(t, k, ctrl, knots) {
  // Segmentindex s mit knots[s] <= t < knots[s+1]
  let s = knots.length - k - 2
  for (let i = k; i < knots.length - k - 1; i++) {
    if (t >= knots[i] && t < knots[i + 1]) {
      s = i
      break
    }
  }
  const d = []
  for (let j = 0; j <= k; j++) {
    const idx = Math.min(Math.max(j + s - k, 0), ctrl.length - 1)
    d.push([...ctrl[idx]])
  }
  for (let r = 1; r <= k; r++) {
    for (let j = k; j >= r; j--) {
      const i = j + s - k
      const den = knots[i + k + 1 - r] - knots[i]
      const alpha = den === 0 ? 0 : (t - knots[i]) / den
      d[j][0] = (1 - alpha) * d[j - 1][0] + alpha * d[j][0]
      d[j][1] = (1 - alpha) * d[j - 1][1] + alpha * d[j][1]
    }
  }
  return d[k]
}

/** DXF-Entity → Array von Chains (meist genau einer). */
export function entityToChains(e) {
  switch (e.type) {
    case 'LINE': {
      const v = e.vertices
      if (!v || v.length < 2) return []
      return [[[v[0].x, v[0].y], [v[1].x, v[1].y]]]
    }
    case 'ARC':
      return [tessArc(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle)]
    case 'CIRCLE': {
      const pts = tessArc(e.center.x, e.center.y, e.radius, 0, TAU)
      pts[pts.length - 1] = pts[0]
      return [pts]
    }
    case 'ELLIPSE':
      return [tessEllipse(e)]
    case 'POLYLINE':
    case 'LWPOLYLINE': {
      const pts = (e.vertices || []).map((p) => [p.x, p.y])
      if (pts.length < 2) return []
      if (e.shape || e.closed) pts.push([...pts[0]])
      return [pts]
    }
    case 'SPLINE': {
      const pts = tessSpline(e)
      return pts ? [pts] : []
    }
    default:
      return []
  }
}

export function chainBBox(chains) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of chains)
    for (const [x, y] of c) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

/**
 * Räumliches Clustering: Chains, deren Punkte näher als `gap` beieinander
 * liegen, gehören zusammen (Union-Find über ein Hash-Gitter). Liefert
 * Cluster als Chain-Index-Listen — so finden wir die einzelnen
 * Zeichnungsteile (Implantat-Ansichten, Lineal, Logo, Rahmen).
 */
export function clusterChains(chains, gap) {
  const parent = chains.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a, b) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  const cell = gap
  const grid = new Map()
  chains.forEach((c, idx) => {
    for (const [x, y] of c) {
      const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`
      if (!grid.has(key)) grid.set(key, [])
      grid.get(key).push(idx)
    }
  })
  for (const [key, members] of grid) {
    const [gx, gy] = key.split(',').map(Number)
    const first = members[0]
    for (const m of members) union(first, m)
    // Nachbarzellen verschmelzen (8er-Nachbarschaft)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const nb = grid.get(`${gx + dx},${gy + dy}`)
        if (nb && nb.length) union(first, nb[0])
      }
  }
  const groups = new Map()
  chains.forEach((_, i) => {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(i)
  })
  return [...groups.values()]
}

/**
 * Geschlossene Konturen aus einem Chain-Satz extrahieren.
 *
 * Endpunkte werden auf ein Toleranz-Gitter gerundet und zu einem Graphen
 * verbunden. Komponenten, in denen (fast) jeder Knoten Grad 2 hat, sind
 * geschlossene Schleifen → als Polygon abgelaufen. Offene Ketten
 * (Bemaßungspfeile, Strichlinien, Schrift) fallen automatisch heraus —
 * genau die Trennung, die wir für Implantat-Konturen brauchen.
 */
export function extractClosedLoops(chains, tol) {
  const key = (p) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`
  const nodes = new Map() // key -> { p, edges: [{to, pts}] }
  const getNode = (p) => {
    const k = key(p)
    if (!nodes.has(k)) nodes.set(k, { p: [...p], edges: [] })
    return k
  }
  for (const c of chains) {
    const a = getNode(c[0])
    const b = getNode(c[c.length - 1])
    if (a === b && c.length <= 2) continue // Null-Segment
    nodes.get(a).edges.push({ to: b, pts: c })
    nodes.get(b).edges.push({ to: a, pts: [...c].reverse() })
  }
  const usedEdges = new Set()
  const loops = []
  for (const [startKey, node] of nodes) {
    for (const edge of node.edges) {
      const edgeId = idOf(startKey, edge)
      if (usedEdges.has(edgeId)) continue
      // Schleife ablaufen: immer weiter, solange Grad-2-Kette
      const poly = []
      let curKey = startKey
      let curEdge = edge
      let closed = false
      const seen = new Set()
      for (let steps = 0; steps < 100000; steps++) {
        usedEdges.add(idOf(curKey, curEdge))
        seen.add(idOf(curKey, curEdge))
        for (const p of curEdge.pts.slice(0, -1)) poly.push(p)
        const nextKey = curEdge.to
        if (nextKey === startKey) {
          closed = true
          break
        }
        const nextNode = nodes.get(nextKey)
        const cands = nextNode.edges.filter(
          (e2) => !seen.has(idOf(nextKey, e2)) && e2.to !== curKey || (e2.to === curKey && e2.pts.length > 2 && !seen.has(idOf(nextKey, e2))),
        )
        const usable = cands.filter((e2) => !usedEdges.has(idOf(nextKey, e2)))
        if (usable.length !== 1) break // Verzweigung oder Sackgasse → keine simple Schleife
        curKey = nextKey
        curEdge = usable[0]
      }
      if (closed && poly.length >= 8) {
        loops.push({ points: poly, area: Math.abs(shoelace(poly)) })
      }
    }
  }
  loops.sort((a, b) => b.area - a.area)
  return loops
}

function idOf(fromKey, edge) {
  // Kante eindeutig über Endpunkte + Punktzahl + ersten Innenpunkt
  const mid = edge.pts[Math.floor(edge.pts.length / 2)]
  return `${fromKey}|${edge.to}|${edge.pts.length}|${mid[0].toFixed(4)},${mid[1].toFixed(4)}`
}

export function shoelace(poly) {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

/**
 * Douglas-Peucker für GESCHLOSSENE Ringe: Der Ring wird am Punkt mit dem
 * größten Abstand zum Startpunkt aufgetrennt und beide Hälften separat
 * vereinfacht — die naive Variante degeneriert bei Start==Ende (Sehne der
 * Länge 0 → alle Abstände 0 → nur 2 Punkte übrig).
 */
export function simplifyClosed(points, eps) {
  if (points.length <= 4) return points
  const closed =
    Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < eps
  const ring = closed ? points.slice(0, -1) : points
  let far = 1
  let maxD = -1
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1])
    if (d > maxD) {
      maxD = d
      far = i
    }
  }
  const a = simplify(ring.slice(0, far + 1), eps)
  const b = simplify([...ring.slice(far), ring[0]], eps)
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

/** Douglas-Peucker-Vereinfachung (Toleranz in mm) — kompaktere Konturen. */
export function simplify(points, eps) {
  if (points.length <= 3) return points
  const keep = new Array(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let maxD = 0, maxI = -1
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const len = Math.hypot(bx - ax, by - ay) || 1e-9
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
      if (d > maxD) {
        maxD = d
        maxI = i
      }
    }
    if (maxD > eps) {
      keep[maxI] = true
      stack.push([a, maxI], [maxI, b])
    }
  }
  return points.filter((_, i) => keep[i])
}
