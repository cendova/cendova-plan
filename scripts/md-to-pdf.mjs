// Rendert eine Markdown-Datei zu einer sauberen, druckfertigen PDF — mit dem
// VORINSTALLIERTEN Chromium (playwright-core; kein Browser-Download, der ist im
// Container geblockt). Wiederverwendbar für beliebige Doku-Seiten.
//
// Nutzung:
//   node scripts/md-to-pdf.mjs <eingabe.md> [ausgabe.pdf]
import {
  readFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
} from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { chromium } from 'playwright-core'
import { marked } from 'marked'

const IN = process.argv[2]
if (!IN || !existsSync(IN)) {
  console.error('Eingabe-Markdown fehlt oder nicht gefunden:', IN)
  process.exit(1)
}
const OUT = process.argv[3] || IN.replace(/\.md$/i, '.pdf')

// Vorinstalliertes Chromium finden — identisch zu scripts/screenshot.mjs.
function findChromium() {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM))
    return process.env.PW_CHROMIUM
  const roots = [
    '/opt/pw-browsers',
    join(process.env.HOME || '/root', '.cache/ms-playwright'),
  ]
  for (const root of roots) {
    if (!existsSync(root)) continue
    const dirs = readdirSync(root)
      .filter((d) => d.startsWith('chromium'))
      .sort()
      .reverse()
    for (const d of dirs) {
      const p = join(root, d, 'chrome-linux', 'chrome')
      if (existsSync(p)) return p
    }
  }
  for (const p of [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ]) {
    if (existsSync(p)) return p
  }
  return null
}

const body = marked.parse(readFileSync(IN, 'utf8'), { gfm: true })
const title = basename(IN).replace(/\.md$/i, '')

const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a; line-height: 1.5; font-size: 11pt; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 4pt; color: #0b1220; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; padding-bottom: 3pt;
    border-bottom: 1px solid #cbd5e1; color: #0b1220; }
  h3 { font-size: 12pt; margin: 12pt 0 4pt; }
  p { margin: 6pt 0; }
  ul, ol { margin: 6pt 0; padding-left: 20pt; }
  li { margin: 2pt 0; }
  code { background: #f1f5f9; border-radius: 3px; padding: 1px 4px;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 9.5pt; }
  pre { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px;
    padding: 8pt 10pt; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 10pt; }
  th, td { border: 1px solid #cbd5e1; padding: 5pt 8pt; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  blockquote { margin: 8pt 0; padding: 6pt 12pt; border-left: 3px solid #94a3b8;
    background: #f8fafc; color: #334155; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 14pt 0; }
  a { color: #1d4ed8; text-decoration: none; }
  strong { color: #0b1220; }
  h1, h2, h3 { break-after: avoid; }
  table, pre, blockquote { break-inside: avoid; }
</style></head><body>${body}</body></html>`

const exec = findChromium()
if (!exec) {
  console.error(
    'Kein vorinstalliertes Chromium gefunden (/opt/pw-browsers/chromium-*/…).',
  )
  process.exit(2)
}

const browser = await chromium.launch({
  executablePath: exec,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
mkdirSync(dirname(OUT) || '.', { recursive: true })
await page.pdf({
  path: OUT,
  format: 'A4',
  printBackground: true,
  margin: { top: '16mm', bottom: '16mm', left: '16mm', right: '16mm' },
})
await browser.close()
console.log('PDF geschrieben:', OUT)
