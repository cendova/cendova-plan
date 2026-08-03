// Silhouetten-Kontur für Zeichnungen mit OFFENER Umrisslinie.
//
// Die Standard-Extraktion (knee-contour-extract) füllt das Innere per
// Außen-Flutung — das setzt eine GESCHLOSSENE Umrisslinie voraus. Einige
// Medacta-Ansichten (HCPE-Liner, zwei Standard-Stems) zeichnen die Kontur
// jedoch als mehrere offene Linienzüge; die Flutung läuft aus und übrig
// bleibt nur ein kleines geschlossenes Detail (Befund: 16 Liner-Größen
// lieferten alle dasselbe 16×11 mm große Teil).
//
// Hier stattdessen rein morphologisch: Tinte (ohne die langen dünnen
// Hilfsachsen) um r dilatieren — das überbrückt die Lücken —, das dann
// geschlossene Innere fluten, um r zurück-erodieren und die Außenkante
// nachzeichnen. Es wird NICHTS erfunden: das Ergebnis ist die äußere
// Hüllkurve der tatsächlich gezeichneten Linien.
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { traceContour, simplifyClosed, morph, labelComponents } from './knee-contour-extract.mjs'

/**
 * Entfernt freistehende HILFSLINIEN (Rotations-, Hals-, Winkelachsen)
 * aus einer Tinten-Maske — in place.
 *
 * Kriterium ist GERADHEIT, nicht Orientierung: eine gerade Linie füllt
 * ihre Bounding-Box-Diagonale genau einmal mit Strichbreite, ein
 * Implantat-Umriss deutlich mehr (Faktor ≥ 1,5). Die frühere Regel
 * „sehr breit UND sehr flach" übersah die DIAGONALEN Achsen der
 * Medacta-Ansichten — dadurch wurden Kopf-Schablonen mit 55,8 statt
 * 30,4 mm gemessen.
 */
export function entferneHilfslinien(maske, W, H) {
  // Komponenten einzeln einsammeln (labelComponents liefert nur BBoxen —
  // für die Formanalyse brauchen wir die Pixel selbst).
  const gesehen = new Uint8Array(W * H)
  for (let start = 0; start < W * H; start++) {
    if (!maske[start] || gesehen[start]) continue
    const pixel = [start]
    const st = [start]
    gesehen[start] = 1
    while (st.length) {
      const p = st.pop()
      const px = p % W, py = (p / W) | 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
          const q = ny * W + nx
          if (maske[q] && !gesehen[q]) { gesehen[q] = 1; st.push(q); pixel.push(q) }
        }
    }
    if (pixel.length < 20) continue
    // Hauptachsen-Analyse: Verhältnis der Eigenwerte der Streuungsmatrix.
    // Eine GERADE Linie streut praktisch nur längs (λ2/λ1 ≈ 0), jeder
    // Bogen und jede Kontur deutlich in beide Richtungen. Das trennt
    // Hilfsachsen unabhängig von Länge UND Richtung — die frühere Regel
    // („breit und flach") übersah die diagonalen Achsen der Medacta-
    // Ansichten, eine Längen-Heuristik hätte kurze Achsen übersehen.
    let sx = 0, sy = 0
    for (const p of pixel) { sx += p % W; sy += (p / W) | 0 }
    const mx = sx / pixel.length, my = sy / pixel.length
    let cxx = 0, cyy = 0, cxy = 0
    for (const p of pixel) {
      const dx = (p % W) - mx, dy = ((p / W) | 0) - my
      cxx += dx * dx; cyy += dy * dy; cxy += dx * dy
    }
    cxx /= pixel.length; cyy /= pixel.length; cxy /= pixel.length
    const spur = cxx + cyy
    const wurzel = Math.sqrt(Math.max(0, (cxx - cyy) ** 2 + 4 * cxy * cxy))
    const l1 = (spur + wurzel) / 2, l2 = (spur - wurzel) / 2
    if (l1 <= 0) continue
    if (l2 / l1 < 0.004) for (const p of pixel) maske[p] = 0
  }
}

/**
 * @param pfad     Quell-Screenshot
 * @param mmPerPx  Maßstab (aus der Kugel-Kalibrierung der Hauptpipeline)
 * @param opt.chaikinPasses  Glättung wie in der Hauptpipeline (Default 2)
 * @returns {wMm, hMm, normPoints} oder null
 */
export async function silhouettenKontur(pfad, mmPerPx, opt = {}) {
  const img = await loadImage(pfad)
  const W = img.width, H = img.height
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, W, H)

  const tinte = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    if (Math.min(g, b) - r >= 100) tinte[i] = 1
  }
  entferneHilfslinien(tinte, W, H)

  // Tintenmenge als Prüfmaßstab: eine brauchbare Silhouette umschließt
  // ein Vielfaches der Strichfläche. Eine BBox-Prüfung wäre untauglich —
  // sie enthielte die AN der Kontur hängenden Hilfsachsen, die sich nur
  // morphologisch (Opening) entfernen lassen.
  let tintenFlaeche = 0
  let sX0 = W, sX1 = 0, sY0 = H, sY1 = 0
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (tinte[y * W + x]) {
        tintenFlaeche++
        if (x < sX0) sX0 = x
        if (x > sX1) sX1 = x
        if (y < sY0) sY0 = y
        if (y > sY1) sY1 = y
      }
  if (tintenFlaeche < 100) return null
  const sollW = sX1 - sX0 + 1, sollH = sY1 - sY0 + 1

  // Varianten in absteigender Güte, erste ausreichende gewinnt:
  // [Achsen-Opening, Strichmitten-Ausgleich]. MIT Opening werden die
  // anhängenden Hilfsachsen gekappt und der Strichmitten-Ausgleich passt
  // zur Standard-Extraktion; flache Formen ohne nennenswertes Inneres
  // (HCPE-Liner) überleben beides nicht — für sie bleibt die reine
  // Hüllkurve der gezeichneten Linien.
  for (const [openR, inset] of [[2, 1], [0, 0]])
  for (const r of [2, 3, 4, 5, 6, 8]) {
    const dil = morph(tinte, W, H, r, false)
    // Außen-Flutung auf dem Komplement → alles Nicht-Erreichbare ist innen.
    const außen = new Uint8Array(W * H)
    const st = []
    for (let x = 0; x < W; x++) {
      for (const y of [0, H - 1]) {
        const i = y * W + x
        if (!dil[i] && !außen[i]) { außen[i] = 1; st.push(i) }
      }
    }
    for (let y = 0; y < H; y++) {
      for (const x of [0, W - 1]) {
        const i = y * W + x
        if (!dil[i] && !außen[i]) { außen[i] = 1; st.push(i) }
      }
    }
    while (st.length) {
      const p = st.pop()
      const px = p % W, py = (p / W) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
        const q = ny * W + nx
        if (!dil[q] && !außen[q]) { außen[q] = 1; st.push(q) }
      }
    }
    const voll = new Uint8Array(W * H)
    let innen = 0
    for (let i = 0; i < W * H; i++) {
      voll[i] = dil[i] || !außen[i] ? 1 : 0
      if (!dil[i] && !außen[i]) innen++
    }
    if (innen < 200) continue // noch nicht geschlossen → größerer Radius

    // Dilatation zurücknehmen. ALLE nennenswerten Teile behalten: eine
    // offen gezeichnete Ansicht kann in mehrere Stücke zerfallen (Liner:
    // Schale + Rand; Stem: Kopf + Schaft) — nur das größte zu nehmen,
    // würde die Schablone beschneiden.
    // Erst die Dilatation zurücknehmen, dann ein Opening (r=2): das
    // kappt die dünnen Fortsätze — Rotations-/Halsachsen, die AN der
    // Kontur hängen und daher nicht als eigene Komponente entfernbar
    // sind (dieselbe Logik wie solidify in der Hauptpipeline).
    // Zurück-Erodieren um r+1: das eine Extra-Pixel ist die halbe
    // Strichbreite (Strich ≈ 3 px). Die Standard-Extraktion setzt die
    // Kontur ebenfalls auf die Strich-MITTE; ohne diesen Ausgleich läge
    // die Silhouette systematisch ~0,3 mm zu groß und Serien, in denen
    // beide Wege vorkommen, hätten einen Sprung.
    const entdilatiert = morph(voll, W, H, r + inset, true)
    const zurück = openR
      ? morph(morph(entdilatiert, W, H, openR, true), W, H, openR, false)
      : entdilatiert
    const komps = labelComponents(zurück, W, H).sort((a, b) => b.area - a.area)
    if (!komps.length) continue
    const teile = komps.filter((k) => k.area >= 0.15 * komps[0].area)

    const ringe = []
    for (const k of teile) {
      const nur = new Uint8Array(W * H)
      for (let y = k.mnY; y <= k.mxY; y++)
        for (let x = k.mnX; x <= k.mxX; x++) {
          const i = y * W + x
          if (zurück[i]) nur[i] = 1
        }
      // Andere Teile ausblenden (labelComponents liefert nur BBoxen).
      for (const a of teile) {
        if (a === k) continue
        for (let y = a.mnY; y <= a.mxY; y++)
          for (let x = a.mnX; x <= a.mxX; x++) {
            if (y >= k.mnY && y <= k.mxY && x >= k.mnX && x <= k.mxX) continue
            nur[y * W + x] = 0
          }
      }
      const roh = traceContour(nur, 1, W, H)
      if (roh.length < 20) continue
      let pts = roh.map(([x, y]) => [x, y])
      for (let pass = 0; pass < (opt.chaikinPasses ?? 2); pass++) {
        const n = pts.length
        const next = []
        for (let i = 0; i < n; i++) {
          const [ax, ay] = pts[i]
          const [bx, by] = pts[(i + 1) % n]
          next.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by])
          next.push([0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by])
        }
        pts = next
      }
      ringe.push(simplifyClosed(pts, 1.2))
    }
    if (!ringe.length) continue

    const alle = ringe.flat()
    const x0 = Math.min(...alle.map((p) => p[0]))
    const x1 = Math.max(...alle.map((p) => p[0]))
    const y0 = Math.min(...alle.map((p) => p[1]))
    const y1 = Math.max(...alle.map((p) => p[1]))
    // Plausibilität — eines von beidem muss zutreffen, sonst ist nur
    // ein Detail übrig geblieben:
    //  (a) VOLUMEN: die umschlossene Fläche ist ein Vielfaches der
    //      Strichfläche (geschlossener Körper; gilt auch, wenn eine
    //      anhängende Hilfsachse die Roh-BBox aufbläht).
    //  (b) AUSDEHNUNG: die Silhouette deckt die Zeichnung ab (offene
    //      Linienzüge wie der HCPE-Liner umschließen kaum Fläche, ihre
    //      Hüllkurve ist aber trotzdem die richtige Kontur).
    let flaeche = 0
    for (const k of teile) flaeche += k.area
    const volumenOk = flaeche >= 3 * tintenFlaeche
    const ausdehnungOk = x1 - x0 >= 0.7 * sollW && y1 - y0 >= 0.7 * sollH
    if (!volumenOk && !ausdehnungOk) continue
    // Ringe im GEMEINSAMEN Rahmen normieren; jeder Ring kehrt zu seinem
    // Startpunkt zurück, damit im Einzel-Polygon des Overlays keine
    // Verbindungsstriche zwischen den Teilen entstehen.
    const normPoints = ringe.flatMap((ring) => {
      const n = ring.map(([x, y]) => ({
        x: +(((x - x0) / (x1 - x0)) * 2 - 1).toFixed(4),
        y: +(((y - y0) / (y1 - y0)) * 2 - 1).toFixed(4),
      }))
      return [...n, n[0]]
    })
    return {
      wMm: (x1 - x0) * mmPerPx,
      hMm: (y1 - y0) * mmPerPx,
      normPoints,
      radiusPx: r,
      openR,
      inset,
      teile: ringe.length,
    }
  }
  return null
}
