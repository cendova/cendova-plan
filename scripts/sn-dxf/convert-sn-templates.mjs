// Konverter: Smith&Nephew-DXF-Herstellerschablonen → CendovaPlan-Bausteine.
//
// Eingabe:  --src <Ordner>  mit den ENTPACKTEN Hersteller-Lieferungen
//           (die Original-DXFs bleiben außerhalb des Repos, s. .gitignore).
// Ausgabe:  --out <Ordner>  mit
//           - konturen/<familie>/<größe>-<ansicht>.json   (mm-Polygone)
//           - preview/<blatt>.svg                          (Sichtprüfung)
//           - messbericht.txt                              (Soll/Ist-Maße)
//
// Jedes Blatt wird über sein EINGEZEICHNETES Lineal skaliert (100 bzw.
// 220 mm) — damit verifiziert sich die „100% Magnification"-Angabe
// selbst. Implantat-Konturen werden als GESCHLOSSENE Schleifen aus dem
// Liniengraphen extrahiert; offene Ketten (Bemaßung, Beschriftung,
// Strichlinien) fallen dadurch automatisch heraus.
//
// Aufruf:
//   node scripts/sn-dxf/convert-sn-templates.mjs --src <dir> --out <dir>

import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { readSheet } from './lib/sheet.mjs'
import { chainBBox, clusterChains } from './lib/geometry.mjs'
import { outerContour, outerContours, pickedUnionContour } from './lib/raster.mjs'
import { ladeSolldaten } from '../lib/solldaten.mjs'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const SRC = argOf('--src', null)
const OUT = argOf('--out', null)
if (!SRC || !OUT) {
  console.error('Aufruf: node convert-sn-templates.mjs --src <dir> --out <dir>')
  process.exit(1)
}

// ---------------------------------------------------------------------
// Soll-Maße zur automatischen Verifikation (mm) — Herstellerdaten, daher
// bewusst NICHT im Repo: kommen aus scripts/katalog-solldaten.local.json
// (Sektion dxfExpect, Struktur siehe katalog-solldaten.beispiel.json).
// Ohne die Datei läuft die Konvertierung durch, nur die Maß-Gegenkontrolle
// entfällt (Warnung).
// ---------------------------------------------------------------------
const soll = ladeSolldaten({ skript: 'convert-sn-templates' })
const EXPECT = soll?.dxfExpect ?? {
  'legion-narrow-femoral': {},
  'genesis-tibial-g2': {},
}
if (!soll?.dxfExpect) {
  console.warn(
    '⚠ Keine Solldaten (scripts/katalog-solldaten.local.json, Sektion dxfExpect)' +
      ' — Maß-Verifikation wird übersprungen.',
  )
}

const report = []
const log = (s) => {
  console.log(s)
  report.push(s)
}

mkdirSync(join(OUT, 'preview'), { recursive: true })
mkdirSync(join(OUT, 'konturen'), { recursive: true })

// ---------------------------------------------------------------------
// Gemeinsame Bausteine
// ---------------------------------------------------------------------

/** Alle DXF-Dateien unterhalb von dir (ohne __MACOSX). */
function findDxf(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === '__MACOSX') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...findDxf(p))
    else if (/\.dxf$/i.test(name)) out.push(p)
  }
  return out.sort()
}

/**
 * Implantat-Cluster eines Blatts finden: räumliche Cluster bilden und
 * alles verwerfen, was nach Rahmen (blattgroß), Lineal (extrem
 * hochkant am Rand) oder Kleinkram (Schrift) aussieht.
 */
function implantClusters(sheet, u, opts = {}) {
  const minMm = opts.minMm ?? 14
  const maxMm = opts.maxMm ?? 160
  const gapMm = opts.gapMm ?? 1.5
  const maxAspect = opts.maxAspect ?? 8
  const layerFilter = opts.layer ?? null
  const chains = layerFilter
    ? sheet.chains.filter((c) => c.layer === layerFilter)
    : sheet.chains
  const pts = chains.map((c) => c.pts)
  const clusters = clusterChains(pts, gapMm * u)
  // Rahmen-Check immer gegen das GANZE Blatt — bei Layer-Filterung wäre
  // die "Blattgröße" sonst die Layer-Ausdehnung und das Implantat selbst
  // fiele als vermeintlicher Rahmen heraus.
  const sheetBox = chainBBox(sheet.chains.map((c) => c.pts))
  const out = []
  for (const idxs of clusters) {
    const cpts = idxs.map((i) => pts[i])
    const box = chainBBox(cpts)
    const wMm = box.w / u
    const hMm = box.h / u
    if (wMm > (sheetBox.w / u) * 0.85 && hMm > (sheetBox.h / u) * 0.85) continue // Rahmen
    if (wMm < minMm || hMm < minMm) continue // Schrift/Kleinkram
    if (wMm > maxMm || hMm > maxMm) continue // Logo-Bänder etc.
    if (hMm / Math.max(wMm, 1e-6) > maxAspect || wMm / Math.max(hMm, 1e-6) > maxAspect) continue // Lineal
    out.push({ chains: cpts, box, wMm, hMm })
  }
  // Von links nach rechts, dann oben nach unten
  out.sort((a, b) => a.box.minX - b.box.minX)
  return out
}



/** Punkt-in-Polygon (Ray-Cast), poly = [[x,y],...] in mm. */
function pointInPoly(poly, x, y) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** Abstand eines Punkts zu einer Strecke a–b. */
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Innere Schild-/Feature-Linien eines Femur-AP-Clusters: alle Segmente,
 * die INNERHALB der Außenkontur liegen (>1,5 mm von der BBox-Kante), NICHT
 * auf der Achse (>2 mm) und NICHT die horizontale Resektionslinie (near-
 * horizontal auf Höhe der Kondylen). Übrig bleiben die medial/lateralen
 * Schild-Kanten (Anteriorflansch-Ränder). Rückgabe: mm-Segmente.
 */
function extractFeaturesMm(clusterChains, u, ocPoly, ocBox, axisMm, resectY) {
  const [aA, aB] = axisMm ?? [null, null]
  const out = []
  for (const c of clusterChains) {
    for (let i = 0; i < c.length - 1; i++) {
      const x1 = c[i][0] / u, y1 = c[i][1] / u, x2 = c[i + 1][0] / u, y2 = c[i + 1][1] / u
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
      const len = Math.hypot(x2 - x1, y2 - y1)
      if (len < 1.5) continue
      if (!pointInPoly(ocPoly, mx, my)) continue
      if (mx < ocBox.minX + 1.5 || mx > ocBox.maxX - 1.5) continue // Randnah = Kontur
      if (aA && distToSeg(mx, my, aA[0], aA[1], aB[0], aB[1]) < 2.5) continue // Achse
      const horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1) * 0.5
      if (horizontal && resectY != null && Math.abs(my - resectY) < 6) continue // Resektion
      out.push([[x1, y1], [x2, y2]])
    }
  }
  return out
}

/**
 * Extrahiert die eingezeichnete Ausricht-Achse (dash-dot Mittellinie) aus
 * den Blatt-Chains eines Implantat-Clusters: zentrale, near-vertikale
 * Segmente sammeln und per Total-Least-Squares eine Gerade fitten.
 * Liefert zwei Endpunkte (mm) auf Höhe der Kontur-Ober/Unterkante oder null.
 */
function extractAxisMm(clusterChains, u, ocBox) {
  const cx = (ocBox.minX + ocBox.maxX) / 2
  const P = []
  for (const c of clusterChains) {
    for (let i = 0; i < c.length - 1; i++) {
      const x1 = c[i][0] / u, y1 = c[i][1] / u, x2 = c[i + 1][0] / u, y2 = c[i + 1][1] / u
      const dx = x2 - x1, dy = y2 - y1
      if (Math.hypot(dx, dy) < 0.5) continue
      const mx = (x1 + x2) / 2
      if (Math.abs(dy) > Math.abs(dx) * 2 && Math.abs(mx - cx) < ocBox.w * 0.28) {
        P.push([x1, y1], [x2, y2])
      }
    }
  }
  if (P.length < 8) return null
  const n = P.length
  const mX = P.reduce((a, p) => a + p[0], 0) / n
  const mY = P.reduce((a, p) => a + p[1], 0) / n
  let sxx = 0, syy = 0, sxy = 0
  for (const p of P) {
    const dx = p[0] - mX, dy = p[1] - mY
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const dirx = Math.cos(theta), diry = Math.sin(theta)
  if (Math.abs(diry) < 0.3) return null // muss überwiegend vertikal sein
  const tTop = (ocBox.minY - mY) / diry, tBot = (ocBox.maxY - mY) / diry
  return [
    [mX + dirx * tTop, ocBox.minY],
    [mX + dirx * tBot, ocBox.maxY],
  ]
}

/** Silhouette eines Clusters: Union ALLER nennenswerten eingeschlossenen
 *  Teilregionen — innere Hilfslinien (gestrichelte Achsen, Trennlinien)
 *  zerteilen die Form nur scheinbar und verschwinden in der Vereinigung. */
function loopsOf(cluster, u) {
  const res = pickedUnionContour(cluster.chains, u, (boxes) =>
    boxes.map((b, i) => (b.areaMm2 > 8 ? i : -1)).filter((i) => i >= 0),
  )
  if (!res) return []
  return [{ area: res.areaMm2, points: res.points }]
}

/** Kontur-JSON schreiben (Punkte in mm, Ursprung = Bounding-Box-Mitte).
 *  extras: { resectAbsMm?: [[x,y],[x,y]], inlaySplitYAbsMm?: number } —
 *  werden auf denselben Ursprung umgerechnet mitgespeichert. */
function writeContour(family, size, view, loops, meta, extras = {}) {
  const all = loops.map((l) => l.points)
  const box = chainBBox(all)
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const rel2 = ([x, y]) => [Math.round((x - cx) * 100) / 100, Math.round((y - cy) * 100) / 100]
  const extraOut = {}
  if (extras.resectAbsMm) extraOut.resectMm = extras.resectAbsMm.map(rel2)
  if (extras.axisAbsMm) extraOut.axisMm = extras.axisAbsMm.map(rel2)
  if (extras.featuresAbsMm)
    extraOut.featuresMm = extras.featuresAbsMm.map((seg) => seg.map(rel2))
  if (extras.inlaySplitYAbsMm !== undefined)
    extraOut.inlaySplitYMm = Math.round((extras.inlaySplitYAbsMm - cy) * 100) / 100
  const rel = loops.map((l) => ({
    areaMm2: Math.round(l.area * 10) / 10,
    points: l.points.map(([x, y]) => [
      Math.round((x - cx) * 100) / 100,
      Math.round((y - cy) * 100) / 100,
    ]),
  }))
  const dir = join(OUT, 'konturen', family)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${size}-${view}.json`),
    JSON.stringify(
      {
        family,
        size,
        view,
        units: 'mm',
        widthMm: Math.round(box.w * 100) / 100,
        heightMm: Math.round(box.h * 100) / 100,
        loops: rel,
        ...extraOut,
        ...meta,
      },
      null,
      1,
    ),
  )
  return box
}

/** SVG-Sichtprüfung: alle Chains grau, akzeptierte Konturen farbig. */
function writePreview(name, sheet, u, accepted) {
  const pts = sheet.chains.map((c) => c.pts)
  const box = chainBBox(pts)
  const W = 1400
  const s = W / box.w
  const H = Math.ceil(box.h * s)
  const map = ([x, y]) => `${((x - box.minX) * s).toFixed(1)},${((box.maxY - y) * s).toFixed(1)}`
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="white"/>`
  for (const c of pts)
    svg += `<polyline points="${c.map(map).join(' ')}" fill="none" stroke="#c9d2da" stroke-width="0.7"/>`
  const colors = ['#0284c7', '#d97706', '#059669', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#4d7c0f', '#b45309', '#1d4ed8']
  accepted.forEach((a, i) => {
    for (const loop of a.loops)
      svg += `<polygon points="${loop.points.map(([x, y]) => map([x * u, y * u])).join(' ')}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="2"/>`
    if (a.label)
      svg += `<text x="${((a.box.minX - box.minX) * s).toFixed(1)}" y="${((box.maxY - a.box.maxY) * s - 6).toFixed(1)}" font-size="18" fill="${colors[i % colors.length]}" font-family="sans-serif">${a.label}</text>`
  })
  svg += '</svg>'
  writeFileSync(join(OUT, 'preview', `${name}.svg`), svg)
}

function check(desc, actual, expected, tolMm = 0.6, note = '') {
  const ok = Math.abs(actual - expected) <= tolMm
  log(`  ${ok ? '✓' : '✗ FEHLER'} ${desc}: Soll ${expected} mm · Ist ${actual.toFixed(2)} mm${note ? ` · ${note}` : ''}`)
  return ok
}

// ---------------------------------------------------------------------
// Rezept A: LEGION Narrow Femoral — 1 Datei = 1 Größe, 2 Ansichten
// (links lateral P–A, rechts frontal M–L), Lineal 0–100 mm.
// ---------------------------------------------------------------------
function convertNarrowFemoral(files) {
  log('\n===== LEGION Narrow Femoral =====')
  let allOk = true
  for (const f of files) {
    const sheet = readSheet(f)
    const sizeText = sheet.texts.map((t) => t.text).join(' ').match(/Size\s+(\dN)/)
    const size = sizeText ? sizeText[1] : basename(f)
    const u = sheet.unitsPerMm
    if (!u) {
      log(`  ✗ ${basename(f)}: kein Lineal erkannt — übersprungen`)
      allOk = false
      continue
    }
    log(`Blatt ${basename(f)} → Größe ${size} · Lineal-Skala ${(u * 25.4).toFixed(3)} units/inch`)
    const clusters = implantClusters(sheet, u, { minMm: 20, maxMm: 100 })
    const withLoops = clusters
      .map((c) => ({ ...c, loops: loopsOf(c, u).filter((l) => l.area > 300) }))
      .filter((c) => c.loops.length > 0)
    if (withLoops.length !== 2) {
      log(`  ✗ erwarte 2 Implantat-Ansichten, gefunden: ${withLoops.length}`)
      allOk = false
      continue
    }
    const [lat, ap] = withLoops // x-sortiert: erst lateral, dann AP
    lat.label = `${size} lateral`
    ap.label = `${size} AP`
    const exp = EXPECT['legion-narrow-femoral'][size]
    // Achse (dash-dot Mittellinie) aus dem AP-Cluster fitten.
    const apOcBox = chainBBox(ap.loops.map((l) => l.points)) // mm
    const axisAbsMm = extractAxisMm(ap.chains, u, apOcBox)
    // Resektions-y (Mittel der Kondylen) grob für den Feature-Filter.
    const apOcPoly = ap.loops[0].points
    const condY = Math.max(...apOcPoly.map((p) => p[1]))
    const featuresAbsMm = extractFeaturesMm(ap.chains, u, apOcPoly, apOcBox, axisAbsMm, condY)
    const apBox = writeContour('legion-narrow-femoral', size, 'AP', ap.loops,
      { source: basename(f) }, { axisAbsMm, featuresAbsMm })
    const latBox = writeContour('legion-narrow-femoral', size, 'lateral', lat.loops, { source: basename(f) })
    if (exp) {
      allOk = check(`${size} AP-Breite (M/L)`, apBox.w, exp.ap_w, 0.6, exp.note) && allOk
      allOk = check(`${size} Lateral-Breite (A/P)`, latBox.w, exp.lat_w) && allOk
    }
    writePreview(`narrow-${size}`, sheet, u, withLoops)
  }
  return allOk
}

// ---------------------------------------------------------------------
// Rezept B: GENESIS II Nonporous Tibial — 1 Datei = 2 Größen (verschachtelt),
// 2 Ansichten (links lateral P–A, rechts frontal M–L).
// ---------------------------------------------------------------------
function convertTibialG2(files) {
  log('\n===== GENESIS II Nonporous Tibial =====')
  let allOk = true
  for (const f of files) {
    const sheet = readSheet(f)
    const m = sheet.texts.map((t) => t.text).join(' ').match(/Size\s+(\d)-(\d)/)
    if (!m) {
      log(`  ✗ ${basename(f)}: keine Größenangabe gefunden`)
      allOk = false
      continue
    }
    const [lo, hi] = [m[1], m[2]]
    const u = sheet.unitsPerMm
    if (!u) {
      log(`  ✗ ${basename(f)}: kein Lineal erkannt`)
      allOk = false
      continue
    }
    log(`Blatt ${basename(f)} → Größen ${lo}+${hi} — Kontur gezeichnet für Gr. ${lo}; ` +
      `Gr. ${hi} liegt nur als Messmarken vor (Hersteller-Blattlayout)`)
    // Beide Ansichten teilen Basislinie/Bemaßungen — statt die Zeichnung
    // zu zerschneiden, identifizieren wir die zwei PLATTEN-Regionen
    // (breit + flach) und vereinen je Platte die Kiel-Regionen darunter.
    const clusters = implantClusters(sheet, u, { minMm: 100, maxMm: 250 })
    if (clusters.length !== 1) {
      log(`  ✗ erwarte 1 verbundenen Zeichnungs-Cluster, gefunden: ${clusters.length}`)
      allOk = false
      continue
    }
    const chains = clusters[0].chains
    const views = []
    for (const [view, which] of [['lateral', 'links'], ['AP', 'rechts']]) {
      // Split-/Referenzwerte, die das pickFn als Nebenprodukt ermittelt.
      let plateTopMm = null
      let plateBottomMm = null
      const contour = pickedUnionContour(chains, u, (boxes) => {
        // Kiel DIREKT darunter (Lücke < 3 mm) — nur so ist es die echte
        // Platte. Die Inlay-Bänder darüber haben den Kiel zwar auch
        // „unter sich", aber mit der Platte dazwischen (Abstand ≈ 10 mm).
        const keelBelow = (p) =>
          boxes.some((b) => {
            const overlapX = Math.min(b.maxX, p.maxX) - Math.max(b.minX, p.minX)
            const gap = p.minY - b.maxY
            return b !== p && gap >= -2 && gap <= 3 && overlapX > 2 && b.h > 8
          })
        // Echte Platten: flach + breit + KIEL direkt darunter.
        const plates = boxes
          .map((b, i) => ({ ...b, i }))
          .filter((b) => b.h >= 3 && b.h <= 16 && b.w >= 35 && b.w <= 95 && keelBelow(b))
          .sort((a, b) => a.minX - b.minX)
        if (plates.length < 2) return []
        // Seiten über die Blattmitte trennen; Seed = BREITESTER Kandidat
        // der Seite (die Kiel-Schulter beginnt weiter rechts als die
        // Platte und würde ein reines minX-Kriterium täuschen).
        const midX = (Math.min(...plates.map((p2) => p2.minX)) + Math.max(...plates.map((p2) => p2.maxX))) / 2
        const side = plates.filter((p2) =>
          which === 'links' ? (p2.minX + p2.maxX) / 2 < midX : (p2.minX + p2.maxX) / 2 >= midX,
        )
        if (!side.length) return []
        const seed = side.sort((a, b) => b.w - a.w)[0]
        // Plattenhälften einsammeln: ko-planar (y-Überlappung) und in x
        // direkt angrenzend (Mittellinie teilt die Platte auf manchen
        // Blättern in zwei eingeschlossene Hälften).
        const part = [seed]
        let changed = true
        while (changed) {
          changed = false
          for (const b of boxes.map((bb, i) => ({ ...bb, i }))) {
            if (part.some((p2) => p2.i === b.i)) continue
            if (b.h < 3 || b.h > 16) continue
            const nearPart = part.some((p2) => {
              const yOverlap = Math.min(b.maxY, p2.maxY) - Math.max(b.minY, p2.minY)
              const xGap = Math.max(p2.minX - b.maxX, b.minX - p2.maxX)
              return yOverlap > Math.min(b.h, p2.maxY - p2.minY) * 0.5 && xGap < 2
            })
            if (nearPart) {
              part.push(b)
              changed = true
            }
          }
        }
        const minX = Math.min(...part.map((p2) => p2.minX))
        const maxX = Math.max(...part.map((p2) => p2.maxX))
        const minY = Math.min(...part.map((p2) => p2.minY))
        const maxYPlate = Math.max(...part.map((p2) => p2.maxY))
        plateTopMm = maxYPlate
        plateBottomMm = Math.min(...part.map((p2) => p2.minY)) // Unterkante = Schnitt
        const picked = part.map((p2) => p2.i)
        boxes.forEach((b, i) => {
          if (picked.includes(i)) return
          const overlapX = Math.min(b.maxX, maxX) - Math.max(b.minX, minX)
          if (b.maxY <= minY + 2 && overlapX > 2 && b.h > 8) picked.push(i)
        })
        // Erstes Inlay-Band DIREKT über der Platte einschließen (= 9-mm-
        // Basis-Inlay der physischen Schablone). Höhere Inlays hebt der
        // Renderer über inlaySplitY an (TIBIA_INSERT-Mechanik).
        const bands = boxes
          .map((b, i) => ({ ...b, i }))
          .filter((b) =>
            !picked.includes(b.i) &&
            b.h >= 3 && b.h <= 16 &&
            b.minY >= maxYPlate - 1 && b.minY <= maxYPlate + 5 &&
            Math.min(b.maxX, maxX) - Math.max(b.minX, minX) > (maxX - minX) * 0.5,
          )
          .sort((a, b) => a.minY - b.minY)
        if (bands.length) picked.push(bands[0].i)
        return picked
      }, { closingPasses: Math.ceil(16 * 1.1) })
      if (!contour) {
        log(`  ✗ Gr. ${lo} ${view}: Profil-Union fehlgeschlagen`)
        allOk = false
        continue
      }
      // Resektionslinie = Baseplate-UNTERKANTE (der eigentliche Knochen-
      // schnitt), voller Breite. Schnittpunkte der Kontur-Kanten mit der
      // Horizontalen bei plateBottomMm.
      const cutY = plateBottomMm
      const xsAtCut = []
      if (cutY != null) {
        for (let i = 0; i < contour.points.length; i++) {
          const [x1, y1] = contour.points[i]
          const [x2, y2] = contour.points[(i + 1) % contour.points.length]
          if ((y1 <= cutY && y2 > cutY) || (y2 <= cutY && y1 > cutY)) {
            xsAtCut.push(x1 + ((cutY - y1) / (y2 - y1)) * (x2 - x1))
          }
        }
      }
      const resectAbsMm =
        xsAtCut.length >= 2
          ? [
              [Math.min(...xsAtCut), cutY],
              [Math.max(...xsAtCut), cutY],
            ]
          : undefined
      const box = writeContour('genesis-tibial-g2', lo, view,
        [{ area: contour.areaMm2, points: contour.points }],
        { source: basename(f), note: `Gr. ${hi} nur als Messmarken auf dem Blatt` },
        { resectAbsMm, inlaySplitYAbsMm: plateTopMm ?? undefined })
      const exp = EXPECT['genesis-tibial-g2'][lo]
      if (exp) {
        const soll = view === 'AP' ? exp.ap_w : exp.lat_w
        allOk = check(`Gr. ${lo} ${view}-Breite`, box.w, soll, 1.0) && allOk
      }
      views.push({
        box: { minX: Math.min(...contour.points.map((p) => p[0])) * u, maxY: Math.max(...contour.points.map((p) => p[1])) * u },
        loops: contour.loops ?? [{ points: contour.points }],
        label: `Gr. ${lo} ${view}`,
      })
    }
    writePreview(`tibial-${lo}-${hi}`, sheet, u, views)
  }
  return allOk
}

// ---------------------------------------------------------------------
// Rezept C: Journey II UK — 1 Datei = 1 Ansicht (Femur) bzw. 2 Ansichts-
// Gruppen (Tibia). Die Größen-Zuordnung erfolgt über die BREITE (Implantat-
// Größen wachsen strikt monoton — die ML-Blätter zeigen exakte 2-mm-Stufen).
// ---------------------------------------------------------------------
function convertJourneyUK(files) {
  log('\n===== Journey II UK =====')
  let allOk = true
  for (const f of files) {
    const name = basename(f)
    const kind =
      /Femoral_AP/i.test(name) ? { fam: 'jii-uk-femur', view: 'AP', w: [14, 30], h: [10, 50] } :
      /Femoral_ML/i.test(name) ? { fam: 'jii-uk-femur', view: 'lateral', w: [36, 62], h: [22, 52] } :
      /Medial_Tibial/i.test(name) ? { fam: 'jii-uk-tibia-medial', tibia: true } :
      /Lateral_Tibial/i.test(name) ? { fam: 'jii-uk-tibia-lateral', tibia: true } : null
    if (!kind) continue
    const sheet = readSheet(f)
    const u = sheet.unitsPerMm
    if (!u) {
      log(`  ✗ ${name}: kein Maßstab ermittelbar`)
      allOk = false
      continue
    }
    log(`Blatt ${name} (Maßstab: ${sheet.scaleSource})`)
    const clusters = implantClusters(sheet, u, { minMm: 4, maxMm: 90, gapMm: 0.8, maxAspect: 12 })
    const groups = kind.tibia
      ? [
          { view: 'AP', w: [18, 36], h: [3, 20] },
          { view: 'lateral', w: [38, 62], h: [3, 20] },
        ]
      : [{ view: kind.view, w: kind.w, h: kind.h }]
    for (const g of groups) {
      const members = clusters
        .filter((c) => c.wMm >= g.w[0] && c.wMm <= g.w[1] && c.hMm >= g.h[0] && c.hMm <= g.h[1])
        .map((c) => {
          // Leck-Retry: liefert die Kontur nur ein kleines Innen-Detail
          // (Haarlinien-Lücke im Umriss), mit dickerem Strich neu rastern.
          const unionAll = (boxes) =>
            boxes.map((b, i) => (b.areaMm2 > 8 ? i : -1)).filter((i) => i >= 0)
          let contour = pickedUnionContour(c.chains, u, unionAll)
          if (!contour || chainBBox([contour.points]).w < c.wMm * 0.8) {
            // Haarlinien-Leck: mit dickerem Strich neu rastern.
            contour = pickedUnionContour(c.chains, u, unionAll, { pxPerMm: 24 })
          }
          if (!contour || chainBBox([contour.points]).w < c.wMm * 0.8) {
            contour = outerContour(c.chains, u, 24, 6)
          }
          return { ...c, contour }
        })
        .filter(
          (c) =>
            c.contour &&
            c.contour.areaMm2 > 60 &&
            chainBBox([c.contour.points]).w >= c.wMm * 0.8,
        )
        .sort((a, b) => chainBBox([a.contour.points]).w - chainBBox([b.contour.points]).w)
      log(`  ${g.view}: ${members.length} Größen (Zuordnung nach Breite)`)
      if (members.length < 8) {
        log(`  ✗ zu wenige Größen gefunden (erwartet ~10)`)
        allOk = false
      }
      const widths = []
      members.forEach((c, i) => {
        const size = String(i + 1)
        const box = writeContour(kind.fam, size, g.view, [
          { area: c.contour.areaMm2, points: c.contour.points },
        ], { source: name, sizeAssignment: 'aufsteigende Breite' })
        widths.push(box.w.toFixed(1))
        c.loops = [{ points: c.contour.points }]
        c.label = `Gr. ${size}`
      })
      if (widths.length) log(`  ✓ Breiten: ${widths.join(' / ')} mm`)
      writePreview(`jii-${kind.fam.replace('jii-uk-', '')}-${g.view}`, sheet, u, members)
    }
  }
  return allOk
}

// ---------------------------------------------------------------------
// Rezept D: CPCS-Hüftschaft — 1 Datei = 1 Größe; Ansichten liegen auf
// getrennten Layern (PEN_4_A_P_VIEW / PEN_5_LAT_VIEW), Lineal 0–220 mm.
// Kein Soll-Katalog → Bericht: Konturmaße + gedruckte Blattangaben.
// ---------------------------------------------------------------------
function convertCpcs(files) {
  log('\n===== CPCS 12/14 Taper (Hüftschaft) =====')
  let allOk = true
  for (const f of files) {
    const size = basename(f).replace(/^\d+_/, '').replace(/\.dxf$/i, '')
    const sheet = readSheet(f)
    const u = sheet.unitsPerMm
    if (!u) {
      log(`  ✗ ${basename(f)}: kein Lineal erkannt`)
      allOk = false
      continue
    }
    const meta = {}
    for (const t of sheet.texts) {
      const m = t.text.match(/(Neck Offset|Neck Height|Neck Length|Stem Length):?\s*(\d+)\s*mm/i)
      if (m) meta[m[1]] = parseInt(m[2], 10)
    }
    const views = []
    for (const [view, layer] of [['AP', 'PEN_4_A_P_VIEW'], ['lateral', 'PEN_5_LAT_VIEW']]) {
      const cl = implantClusters(sheet, u, { layer, minMm: 8, maxMm: 250, maxAspect: 30 })
      if (!cl.length) {
        log(`  ✗ ${size}: Ansicht ${view} nicht gefunden`)
        allOk = false
        continue
      }
      // größter Cluster des Layers = Implantat
      const big = cl.sort((a, b) => b.wMm * b.hMm - a.wMm * a.hMm)[0]
      const contour = outerContour(big.chains, u)
      if (!contour) {
        log(`  ✗ ${size}/${view}: keine geschlossene Kontur`)
        allOk = false
        continue
      }
      const box = writeContour('cpcs-1214-standard', size, view, [
        { area: contour.areaMm2, points: contour.points },
      ], { source: basename(f), sheetMeta: meta })
      log(`  ✓ Gr. ${size} ${view}: ${box.w.toFixed(1)} x ${box.h.toFixed(1)} mm` +
        (view === 'AP' && meta['Stem Length'] ? ` (Blatt: Stem Length ${meta['Stem Length']} mm)` : ''))
      big.loops = [{ points: contour.points }]
      big.label = `${size} ${view}`
      views.push(big)
    }
    writePreview(`cpcs-${size}`, sheet, u, views)
  }
  return allOk
}

// ---------------------------------------------------------------------
// Einstieg: Familien anhand der Ordner-/Dateinamen erkennen
// ---------------------------------------------------------------------
const all = findDxf(SRC)
const narrow = all.filter((f) => /narrow/i.test(f))
const tibial = all.filter((f) => /Nonporous-Tibial/i.test(f))
const jii = all.filter((f) => /71282159/.test(f))
const cpcs = all.filter((f) => /CPCS/i.test(f) || /71981037_/.test(basename(f)))
let ok = true
if (narrow.length) ok = convertNarrowFemoral(narrow) && ok
if (tibial.length) ok = convertTibialG2(tibial) && ok
if (jii.length) ok = convertJourneyUK(jii) && ok
if (cpcs.length) ok = convertCpcs(cpcs) && ok

writeFileSync(join(OUT, 'messbericht.txt'), report.join('\n') + '\n')
log(`\n${ok ? 'ALLE MASSPRÜFUNGEN GRÜN ✓' : 'ES GIBT ABWEICHUNGEN ✗'} — Bericht: ${join(OUT, 'messbericht.txt')}`)
process.exit(ok ? 0 : 1)
