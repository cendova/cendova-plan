// Headless-E2E-Test des Schablonen-Paket-Imports (Stufe C1):
//   1. Paket-ZIP über den versteckten File-Input importieren,
//   2. prüfen, dass Registry aktiv ist und alle drei Bildklassen
//      (Knie, Hüft-Schaft, Tracer-Hintergrund) als Blob-URLs auflösen,
//   3. Seite NEU LADEN und prüfen, dass das Paket aus der IndexedDB
//      wiederkommt (Persistenz!),
//   4. Paket entfernen und prüfen, dass die eingebauten Daten zurück sind.
//
// Nutzt dieselben Umgebungs-Kniffe wie scripts/screenshot.mjs
// (vorinstalliertes Chromium, SwiftShader, Dev-Server-Autostart).
//
// Aufruf:  node scripts/test-template-import.mjs [--zip pfad.zip]
// Exit:    0 = alles grün, 1 = Fehler, 2 = kein Chromium.

import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(__dirname, '..')
const URL_ = 'http://localhost:5173/'

const args = process.argv.slice(2)
const argIdx = args.indexOf('--zip')
let ZIP = argIdx >= 0 ? args[argIdx + 1] : null
if (!ZIP) {
  const candidates = readdirSync(PROJECT_DIR)
    .filter((f) => /^cendova-schablonen-.*\.zip$/.test(f))
    .sort()
    .reverse()
  ZIP = candidates[0] ? join(PROJECT_DIR, candidates[0]) : null
}
if (!ZIP || !existsSync(ZIP)) {
  console.error('[pkg-test] Kein Paket-ZIP gefunden — erst scripts/export-template-package.mjs laufen lassen.')
  process.exit(1)
}

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function isUp(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return r.status < 500
  } catch {
    return false
  }
}
let devProc = null
async function ensureServer() {
  if (await isUp(URL_)) return false
  console.log('[pkg-test] Starte Dev-Server …')
  devProc = spawn('npm', ['run', 'dev'], { cwd: PROJECT_DIR, detached: true, stdio: 'ignore' })
  devProc.unref()
  for (let i = 0; i < 90; i++) {
    if (await isUp(URL_)) return true
    await sleep(1000)
  }
  throw new Error('Dev-Server kam nicht hoch.')
}
function stopServer() {
  if (devProc?.pid) {
    try {
      process.kill(-devProc.pid, 'SIGTERM')
    } catch {}
  }
}

// Registry-Zugriff im Browser (main.tsx legt sie in DEV auf window).
const REG = 'window.__templateRegistry'
async function waitForRegistry(page, predicate, label) {
  await page.waitForFunction(
    `(() => { const r = ${REG}; return r && (${predicate}); })()`,
    undefined,
    { timeout: 20000 },
  ).catch(() => {
    throw new Error(`Timeout: ${label}`)
  })
}

async function main() {
  const exec = findChromium()
  if (!exec) {
    console.error('[pkg-test] Kein Chromium gefunden.')
    process.exit(2)
  }
  const startedByUs = await ensureServer()
  const browser = await chromium.launch({
    executablePath: exec,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const pageErrors = []
  try {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await page.goto(URL_, { waitUntil: 'load', timeout: 60000 })
    await page.waitForFunction(() => document.getElementById('root')?.children.length, { timeout: 60000 })

    // 1) Import über den versteckten File-Input.
    await page.setInputFiles('[data-testid="template-package-input"]', ZIP)
    await waitForRegistry(page, 'r.hasTemplatePackage() === true', 'Paket nach Import aktiv')
    console.log('[pkg-test] 1/4 Import OK')

    // 2) Alle drei Bildklassen müssen als Blob-URL auflösen.
    const probes = await page.evaluate(() => {
      const r = window.__templateRegistry
      return [
        r.resolveTemplateImage('images/knee/genesis-tibia-female__AP__0.png'),
        r.resolveTemplateImage('images/stems/medacta_international_-_stem_-_quadra-p_std/01_12_120_0.png'),
        r.resolveTemplateImage('images/Legion ap.png'),
      ]
    })
    const bad = probes.filter((u) => !String(u).startsWith('blob:'))
    if (bad.length > 0) throw new Error(`Bild-Auflösung liefert keine Blob-URL: ${bad.join(', ')}`)
    console.log('[pkg-test] 2/4 Blob-Auflösung OK (Knie + Schaft + Hintergrund)')

    // 3) Persistenz: Reload → Paket kommt aus der IndexedDB zurück.
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => document.getElementById('root')?.children.length, { timeout: 60000 })
    await waitForRegistry(page, 'r.hasTemplatePackage() === true', 'Paket nach Reload aktiv (IndexedDB)')
    const afterReload = await page.evaluate(() =>
      window.__templateRegistry.resolveTemplateImage('images/knee/genesis-tibia-female__AP__0.png'),
    )
    if (!String(afterReload).startsWith('blob:')) throw new Error('Nach Reload keine Blob-URL')
    console.log('[pkg-test] 3/4 Persistenz über Reload OK')

    // 4) Entfernen → eingebaute Daten zurück.
    await page.evaluate(() => window.__templateRegistry.removeTemplatePackage())
    await waitForRegistry(page, 'r.hasTemplatePackage() === false', 'Paket entfernt')
    console.log('[pkg-test] 4/4 Entfernen OK')

    if (pageErrors.length > 0) {
      throw new Error(`Laufzeitfehler auf der Seite:\n${pageErrors.join('\n')}`)
    }
    console.log('[pkg-test] OK ✅  Import → Blobs → Persistenz → Entfernen alle grün.')
  } finally {
    await browser.close()
    if (startedByUs) stopServer()
  }
}

main().catch((e) => {
  console.error('[pkg-test] FEHLGESCHLAGEN:', e.message ?? e)
  stopServer()
  process.exit(1)
})
