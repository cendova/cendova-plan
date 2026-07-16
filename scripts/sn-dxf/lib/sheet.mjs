// Blatt-Leser: DXF-Datei → normalisiertes „Sheet" mit
//   - chains  : alle Linienzüge in Zeichnungseinheiten (+ Layer)
//   - texts   : alle Beschriftungen { text, x, y }
//   - unitsPerMm : Maßstab, hergeleitet aus dem EINGEZEICHNETEN Lineal
//     (die S&N-Blätter tragen ein 100- bzw. 220-mm-Lineal mit
//     Zahlen-Beschriftung — die verlässlichste Skalenquelle, weil sie
//     die „100% Magnification"-Zusage direkt im Blatt verifiziert).

import DxfParser from 'dxf-parser'
import { readFileSync } from 'node:fs'
import { entityToChains } from './geometry.mjs'

/** MTEXT-Formatcodes (\W…; \f…; {…}) entfernen. */
function cleanText(raw) {
  return String(raw)
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\P/g, ' ')
    .trim()
}

export function readSheet(path) {
  const parser = new DxfParser()
  const dxf = parser.parseSync(readFileSync(path, 'utf8'))
  const chains = []
  const texts = []
  for (const e of dxf.entities) {
    if (e.type === 'MTEXT' || e.type === 'TEXT') {
      const pos = e.position || e.startPoint || e.insertionPoint
      if (pos) texts.push({ text: cleanText(e.text ?? ''), x: pos.x, y: pos.y })
      continue
    }
    for (const pts of entityToChains(e)) {
      if (pts.length >= 2) chains.push({ pts, layer: e.layer ?? '0' })
    }
  }
  const ruler = detectRulerScale(texts)
  // Fallback: DXF-Einheiten-Code, wenn die Lineal-Zahlen als Vektor-
  // Schrift gezeichnet sind (JII-Blätter). 1 = Zoll, 4 = mm.
  const insunits = dxf.header?.$INSUNITS
  let fallback = null
  if (insunits === 1) fallback = 1 / 25.4
  if (insunits === 4) fallback = 1
  return {
    chains,
    texts,
    unitsPerMm: ruler ?? fallback,
    scaleSource: ruler ? 'Lineal (Blatt)' : fallback ? `INSUNITS=${insunits}` : null,
  }
}

/**
 * Lineal-Erkennung: reine Zahlen-Texte (0, 10, …, 100/220) suchen, die
 * in einer SPALTE (nahezu gleiches x) oder ZEILE stehen und monoton
 * laufen. unitsPerMm = Koordinaten-Spanne / mm-Spanne.
 * Liefert null, wenn kein Lineal gefunden wurde (dann muss das Rezept
 * eine Annahme treffen und sie ausweisen).
 */
export function detectRulerScale(texts) {
  const nums = texts
    .map((t) => ({ ...t, val: /^\d{1,3}$/.test(t.text) ? parseInt(t.text, 10) : null }))
    .filter((t) => t.val !== null)
  if (nums.length < 5) return null

  // Kandidaten-Spalten/Zeilen über Koordinaten-Bänder bilden
  for (const axis of ['x', 'y']) {
    const other = axis === 'x' ? 'y' : 'x'
    const sorted = [...nums].sort((a, b) => a[axis] - b[axis])
    // Band-Gruppierung entlang `axis` (Lineal-Zahlen stehen dort fast gleich)
    const bands = []
    for (const n of sorted) {
      const band = bands.find((b) => Math.abs(b.ref - n[axis]) < spanOf(nums, axis) * 0.03 + 1e-6)
      if (band) {
        band.items.push(n)
      } else {
        bands.push({ ref: n[axis], items: [n] })
      }
    }
    for (const band of bands) {
      if (band.items.length < 5) continue
      const items = band.items.sort((a, b) => a.val - b.val)
      const uniq = items.filter((n, i) => i === 0 || n.val !== items[i - 1].val)
      if (uniq.length < 5) continue
      const first = uniq[0]
      const last = uniq[uniq.length - 1]
      const mmSpan = last.val - first.val
      const unitSpan = Math.abs(last[other] - first[other])
      if (mmSpan < 50 || unitSpan === 0) continue
      // Linearitaets-Check: mittlere Zahl muss ~mittig liegen
      const mid = uniq[Math.floor(uniq.length / 2)]
      const expect = first[other] + ((last[other] - first[other]) * (mid.val - first.val)) / mmSpan
      if (Math.abs(expect - mid[other]) > unitSpan * 0.03) continue
      return unitSpan / mmSpan
    }
  }
  return null
}

function spanOf(items, key) {
  let min = Infinity, max = -Infinity
  for (const it of items) {
    if (it[key] < min) min = it[key]
    if (it[key] > max) max = it[key]
  }
  return max - min
}
