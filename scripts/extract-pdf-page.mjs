/**
 * Extrahiert Text einer PDF und zeigt nur Seiten, die ein Suchwort enthalten.
 * Aufruf: node scripts/extract-pdf-page.mjs [pfad] [suchwort]
 */
import { readFileSync } from 'node:fs'
import { PDFParse } from 'pdf-parse'

const path = process.argv[2] || 'Versafit_Anleitung.pdf'
const query = (process.argv[3] || 'cranial').toLowerCase()

const buffer = readFileSync(path)
const parser = new PDFParse({ data: new Uint8Array(buffer) })
const result = await parser.getText()
const pages = result.pages
console.log(`--- ${path} — ${pages.length} Seiten gesamt — Suche: "${query}" ---\n`)
for (let i = 0; i < pages.length; i++) {
  const text = pages[i].text ?? ''
  if (text.toLowerCase().includes(query)) {
    console.log(`### Seite ${i + 1}\n${text}\n`)
  }
}
await parser.destroy()
