// Abnahme des PDF-Exports im echten Browser (Dev-Server nötig:
// `npm run dev`, dann `node scripts/abnahme-export/pruefe-snapshot.mjs`).
//
// Hintergrund (Realtest 01.10.2026): Beim ersten Export war die AP-Aufnahme
// der Knie-Zwei-Bild-Ansicht im PDF schwarz; der zweite Export klappte. Der
// Export vergleicht seitdem die Helligkeit jedes Snapshots mit dem live
// angezeigten Bild (lib/plan/erfassungPruefung.ts) und erfasst neu.
// Geprüft: kein Fehlalarm (auch nach maximierter Pane), ein geschwärzter
// erster Snapshot wird automatisch neu erfasst, ein dauerhaft schwarzer
// führt zu einer klaren Meldung statt eines schwarzen PDFs. Die Schwärzung
// wird an der Stelle erzeugt, an der html2canvas den Cornerstone-Canvas
// kopiert (getImageData).
import { chromium } from 'playwright-core'
const fehler = []
const ok = (b, t) => { console.log((b ? 'OK   ' : 'FEHL ') + t); if (!b) fehler.push(t) }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
const page = await ctx.newPage()
const warnungen = []
page.on('console', (m) => { if (m.type() === 'warning' && /PDF-Export/.test(m.text())) warnungen.push(m.text()) })
page.on('pageerror', (e) => fehler.push('pageerror ' + e.message))
await page.goto('http://127.0.0.1:5173/?beispiel=knie', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__stores?.knee, null, { timeout: 30000 })
await page.waitForTimeout(3000)
await page.evaluate(async () => {
  const panes = (await import('/src/state/kneePanesStore.ts')).useKneePanesStore
  panes.getState().setSplitView(true)
  await new Promise((r) => setTimeout(r, 800))
  const bytes = await (await fetch('/sample/beispiel-knie.dcm')).arrayBuffer()
  await (await import('/src/lib/cornerstone/viewer2.ts')).loadDicomBytesToPane2(bytes, 'rechts.dcm')
  // Snapshot-Störung: die ersten N Kopien des Cornerstone-Canvas (html2canvas
  // klont mit drawImage(src, 0, 0)) bleiben schwarz.
  window.__schwarz = 0
  // html2canvas kopiert den Cornerstone-Canvas per getImageData — die ersten
  // N Kopien liefern schwarze (leere) Pixel.
  const orig = CanvasRenderingContext2D.prototype.getImageData
  CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h, ...rest) {
    if (this.canvas?.classList?.contains('cornerstone-canvas') && window.__schwarz > 0) {
      window.__schwarz--
      return new ImageData(w, h)
    }
    return orig.call(this, x, y, w, h, ...rest)
  }
})
await page.waitForTimeout(2500)

async function exportiere(schwarz, maximiert) {
  warnungen.length = 0
  return page.evaluate(async ({ schwarz, maximiert }) => {
    const panes = (await import('/src/state/kneePanesStore.ts')).useKneePanesStore
    if (maximiert) { panes.getState().setMaximizedPane('right'); await new Promise((r) => setTimeout(r, 800)) }
    window.__schwarz = schwarz
    const pdf = await import('/src/lib/plan/pdfExport.ts')
    await pdf.triggerPdfExport()
    const { useViewerStore } = await import('/src/state/viewerStore.ts')
    return { status: useViewerStore.getState().status, rest: window.__schwarz }
  }, { schwarz, maximiert })
}

let r = await exportiere(0, true)
ok(/gespeichert/.test(r.status ?? ''), `Normalfall (rechte Pane vorher maximiert): ${r.status}`)
ok(warnungen.length === 0, `kein Fehlalarm (${warnungen.length} Warnungen)`)
r = await exportiere(1, false)
ok(/gespeichert/.test(r.status ?? ''), `Erster Snapshot schwarz -> automatisch neu erfasst: ${r.status}`)
ok(warnungen.length === 1, `genau eine Neu-Erfassung (${warnungen.join(' | ')})`)
r = await exportiere(10, false)
ok(/nicht vollständig erfasst/.test(r.status ?? ''), `Dauerhaft schwarz -> klare Meldung statt schwarzem PDF: ${r.status}`)
await b.close()
console.log(fehler.length ? `\n${fehler.length} FEHLER: ${fehler.join(' | ')}` : '\nAlle Pruefungen bestanden')
process.exit(fehler.length ? 1 : 0)
