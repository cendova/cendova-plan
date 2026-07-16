/**
 * Liest ein PDF (CLI-Argument: Pfad) und schreibt den extrahierten Text
 * seitenweise nach stdout. Wird verwendet, um die Smith&Nephew-
 * Spezifikations-Guides zu sichten, bevor wir daraus einen Maßkatalog
 * extrahieren.
 *
 * Aufruf:  node scripts/extract-pdf-text.mjs <pfad.pdf> [startPage] [endPage]
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// pdfjs-dist verwendet eine "legacy" Build-Variante für Node.js.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

const [, , inPath, startArg, endArg] = process.argv
if (!inPath) {
  console.error('Usage: extract-pdf-text.mjs <pdf> [startPage] [endPage]')
  process.exit(1)
}

const data = new Uint8Array(await readFile(resolve(inPath)))
const doc = await pdfjs.getDocument({ data }).promise
const total = doc.numPages
const start = startArg ? parseInt(startArg, 10) : 1
const end = endArg ? parseInt(endArg, 10) : total

console.error(`PDF: ${inPath}  (${total} Seiten, zeige ${start}–${end})`)

for (let i = start; i <= Math.min(end, total); i++) {
  const page = await doc.getPage(i)
  const tc = await page.getTextContent()
  // Zeilen aus den Text-Items rekonstruieren: Items in tc.items haben
  // jeweils transform[5] = y-Position. Wir gruppieren nach y (mit
  // kleiner Toleranz), sortieren nach x, und joinen mit Leerzeichen.
  const lines = new Map()
  for (const it of tc.items) {
    if (!('str' in it)) continue
    const y = Math.round(it.transform[5])
    const x = it.transform[4]
    if (!lines.has(y)) lines.set(y, [])
    lines.get(y).push({ x, s: it.str })
  }
  const sortedY = [...lines.keys()].sort((a, b) => b - a) // top → bottom
  console.log(`\n===== Seite ${i} =====`)
  for (const y of sortedY) {
    const row = lines
      .get(y)
      .sort((a, b) => a.x - b.x)
      .map((e) => e.s)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (row) console.log(row)
  }
}
