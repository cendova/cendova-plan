// Render-Test der PDF-Fußzeile „Planung durchgeführt von …".
//
// Zweck: sichert die Vorrang-Kette des Planer-Namens im exportierten PDF
// ab — Kern der Personalisierung/Neutralität (kein Klarname mehr fest im
// Code). Fährt den ECHTEN Export (triggerPdfExport) headless; ein DICOM ist
// NICHT nötig (der Viewport-Snapshot ist nur das leere Platzhalter-Bild, die
// Fußzeile zeichnet jsPDF unabhängig davon aus planning.planner ||
// Profil-Default).
//
// Drei Fälle:
//   A  Dialog-Planer gesetzt  → „von <Dialog>"               (Dialog gewinnt)
//   B  nur Profil-Default      → „von <Profil>"               (Profil-Fallback)
//   C  beides leer (neutral)   → „Planung durchgeführt am …"  (kein „von")
//
// Umgebung wie scripts/screenshot.mjs: playwright-core + vorinstalliertes
// Chromium (Browser-Download geblockt). Text wird direkt aus den PDF-Bytes
// gelesen (jsPDF komprimiert per Default nicht) — keine Extra-Abhängigkeit.
//
// Aufruf:  node scripts/test-pdf-footer.mjs
// Exit:    0 = alle Fälle korrekt, 1 = Abweichung/Laufzeitfehler, 2 = kein Chromium.

import { chromium } from 'playwright-core'
import { existsSync, readdirSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || join(__dirname, '..')
const OUT = join(PROJECT_DIR, '.test-artifacts')
const URL = process.env.SHOT_URL || 'http://localhost:5173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function findChromium() {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM
  const roots = ['/opt/pw-browsers', join(process.env.HOME || '/root', '.cache/ms-playwright')]
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const d of readdirSync(root).filter((x) => x.startsWith('chromium')).sort().reverse()) {
      const p = join(root, d, 'chrome-linux', 'chrome')
      if (existsSync(p)) return p
    }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p
  }
  return null
}
async function isUp() { try { const r = await fetch(URL); return r.status < 500 } catch { return false } }
let devProc = null
async function ensureServer() {
  if (await isUp()) return false
  devProc = spawn('npm', ['run', 'dev'], { cwd: PROJECT_DIR, detached: true, stdio: 'ignore', env: process.env })
  devProc.unref()
  for (let i = 0; i < 90; i++) { if (await isUp()) return true; await sleep(1000) }
  throw new Error('Dev-Server kam nicht hoch (Timeout 90s).')
}
function stopServer() { if (devProc?.pid) { try { process.kill(-devProc.pid, 'SIGTERM') } catch {} } }

// planning.planner + Profil-Default setzen (dieselben Store-Singletons, die
// die laufende App und der Export nutzen — Vite dedupt das Modul).
async function setState(page, planner, profileDefault) {
  await page.evaluate(async ([pl, pd]) => {
    const P = await import('/src/state/planningStore.ts')
    const O = await import('/src/state/orgProfileStore.ts')
    O.useOrgProfileStore.getState().setProfile({ defaultPlanner: pd })
    P.usePlanningStore.getState().setField('planner', pl)
  }, [planner, profileDefault])
}
async function exportOnce(page, outPath) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    page.evaluate(async () => {
      const m = await import('/src/lib/plan/pdfExport.ts')
      await m.triggerPdfExport()
    }),
  ])
  await download.saveAs(outPath)
}
// jsPDF schreibt Text unkomprimiert als (…)Tj; latin1 bildet 0xFC→ü ab.
function footerLine(pdfPath) {
  const raw = readFileSync(pdfPath, 'latin1')
  const m = raw.match(/Planung durchgef[^)]*/)
  return m ? m[0] : '(Fußzeile nicht gefunden)'
}

const results = []
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        → ${JSON.stringify(detail)}`) }

async function main() {
  const exec = findChromium()
  if (!exec) { console.error('[pdf-footer] Kein Chromium gefunden (Download geblockt).'); process.exit(2) }
  mkdirSync(OUT, { recursive: true })
  const started = await ensureServer()
  const errors = []
  const browser = await chromium.launch({ executablePath: exec, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(String(e?.stack || e)))
    await page.goto(URL, { waitUntil: 'load', timeout: 60000 })
    await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0 }, { timeout: 60000 })
    await page.waitForTimeout(2000)

    await setState(page, 'Dr. Dialog Render', 'Dr. Profil Fallback')
    await exportOnce(page, join(OUT, 'footer-A.pdf'))
    const a = footerLine(join(OUT, 'footer-A.pdf'))
    check('A · Dialog-Planer gewinnt', a.includes('von Dr. Dialog Render'), a)

    await setState(page, '', 'Dr. Profil Fallback')
    await exportOnce(page, join(OUT, 'footer-B.pdf'))
    const b = footerLine(join(OUT, 'footer-B.pdf'))
    check('B · Profil-Default als Fallback', b.includes('von Dr. Profil Fallback'), b)

    await setState(page, '', '')
    await exportOnce(page, join(OUT, 'footer-C.pdf'))
    const c = footerLine(join(OUT, 'footer-C.pdf'))
    check('C · neutral, ohne „von"', c.startsWith('Planung durchgeführt am') && !c.includes(' von '), c)

    check('keine Laufzeitfehler', errors.length === 0, errors.join(' | ') || '(keine)')
  } finally {
    await browser.close()
    if (started) stopServer()
  }
  const failed = results.filter((r) => !r).length
  console.log(`\n${results.length - failed}/${results.length} PASS`)
  if (failed) { console.error('[pdf-footer] FEHLGESCHLAGEN.'); process.exit(1) }
  console.log('[pdf-footer] OK ✅')
}
main().catch((e) => { console.error('[pdf-footer] Fehler:', e); stopServer(); process.exit(1) })
