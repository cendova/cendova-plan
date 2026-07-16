// Headless-Smoke-Test + Screenshots der laufenden App.
//
// Zweck: In der Cloud-Container-Umgebung (Claude Code on the web) prüfen, ob die
// App zur LAUFZEIT lädt (nicht nur baut): React mountet, Knie-Modus rendert,
// keine Laufzeitfehler in der Konsole. Erzeugt 01-initial.png + 02-knee.png.
//
// Besonderheiten dieser Umgebung (siehe docs/test-runbook.md):
//  - Der Playwright-Browser-DOWNLOAD ist durch die Netzwerk-Policy geblockt.
//    Deshalb `playwright-core` (lädt nichts) + ein VORINSTALLIERTES Chromium
//    unter /opt/pw-browsers/chromium-*/chrome-linux/chrome.
//  - WebGL/Cornerstone läuft headless über SwiftShader (--use-angle=swiftshader).
//
// Aufruf:  npm run shot            (startet Dev-Server bei Bedarf selbst)
//          node scripts/screenshot.mjs --url http://localhost:5173/ --no-knee
//
// Exit-Code: 0 = OK, 1 = nicht gemountet/Laufzeitfehler, 2 = kein Chromium.

import { chromium } from 'playwright-core'
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || join(__dirname, '..')

const args = process.argv.slice(2)
const argv = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const URL = argv('--url', 'http://localhost:5173/')
const OUT = argv('--out', join(PROJECT_DIR, '.test-artifacts'))
const WITH_KNEE = !args.includes('--no-knee')

// Vorinstalliertes Chromium finden – KEIN Download (CDN ist geblockt).
function findChromium() {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM
  const roots = ['/opt/pw-browsers', join(process.env.HOME || '/root', '.cache/ms-playwright')]
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
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function isUp(url, timeoutMs = 2000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    return r.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

let devProc = null
async function ensureServer() {
  if (await isUp(URL)) {
    console.log(`[shot] Dev-Server läuft bereits: ${URL}`)
    return false
  }
  console.log('[shot] Dev-Server nicht erreichbar – starte `npm run dev` …')
  devProc = spawn('npm', ['run', 'dev'], { cwd: PROJECT_DIR, detached: true, stdio: 'ignore', env: process.env })
  devProc.unref()
  for (let i = 0; i < 90; i++) {
    if (await isUp(URL)) {
      console.log('[shot] Dev-Server bereit.')
      return true
    }
    await sleep(1000)
  }
  throw new Error('Dev-Server kam nicht hoch (Timeout 90s).')
}

function stopServer() {
  if (devProc?.pid) {
    try {
      process.kill(-devProc.pid, 'SIGTERM')
    } catch {}
  }
}

async function main() {
  const exec = findChromium()
  if (!exec) {
    console.error(
      '[shot] Kein Chromium gefunden. Erwartet vorinstalliertes Binary unter\n' +
        '       /opt/pw-browsers/chromium-*/chrome-linux/chrome (oder ~/.cache/ms-playwright).\n' +
        '       Der Playwright-Browser-Download ist hier geblockt. Notfalls: PW_CHROMIUM=/pfad/chrome.',
    )
    process.exit(2)
  }
  console.log(`[shot] Chromium: ${exec}`)
  mkdirSync(OUT, { recursive: true })
  const startedByUs = await ensureServer()

  const consoleMsgs = []
  const pageErrors = []
  const badResponses = []
  let mounted = false
  let kneeClicked = false
  let bodyText = ''

  const browser = await chromium.launch({
    executablePath: exec,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  })
  try {
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
    page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => pageErrors.push(String(e?.stack || e)))
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) badResponses.push(`${r.status()} ${r.url()}`)
    })

    await page.goto(URL, { waitUntil: 'load', timeout: 60000 })
    mounted = await page
      .waitForFunction(() => {
        const r = document.getElementById('root')
        return !!r && r.children.length > 0
      }, { timeout: 60000 })
      .then(() => true)
      .catch(() => false)
    await page.waitForTimeout(2500) // Tailwind/Cornerstone settle
    await page.screenshot({ path: join(OUT, '01-initial.png') })

    if (WITH_KNEE) {
      try {
        await page.getByRole('button', { name: 'Knie', exact: true }).first().click({ timeout: 5000 })
        kneeClicked = true
      } catch {
        try {
          await page.getByText('Knie', { exact: true }).first().click({ timeout: 5000 })
          kneeClicked = true
        } catch {}
      }
      await page.waitForTimeout(1200)
      await page.screenshot({ path: join(OUT, '02-knee.png') })
    }
    bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1800))
  } finally {
    await browser.close()
    if (startedByUs) stopServer()
  }

  const report =
    `URL: ${URL}\nMOUNTED: ${mounted}\nKNEE_CLICKED: ${kneeClicked}\n\n` +
    `PAGE_ERRORS (${pageErrors.length}):\n${pageErrors.join('\n---\n') || '(keine)'}\n\n` +
    `BAD_RESPONSES (${badResponses.length}, favicon ignoriert):\n${badResponses.join('\n') || '(keine)'}\n\n` +
    `CONSOLE (${consoleMsgs.length}):\n${consoleMsgs.slice(0, 60).join('\n') || '(keine)'}\n\n` +
    `BODY_TEXT (Auszug):\n${bodyText}\n`
  writeFileSync(join(OUT, 'report.txt'), report)
  console.log('\n' + report)
  console.log(`[shot] Artefakte: ${OUT}/01-initial.png, 02-knee.png, report.txt`)

  if (!mounted || pageErrors.length > 0) {
    console.error('[shot] FEHLGESCHLAGEN: App nicht gemountet oder Laufzeitfehler vorhanden.')
    process.exit(1)
  }
  console.log('[shot] OK ✅  (gemountet, 0 Laufzeitfehler)')
}

main().catch((e) => {
  console.error('[shot] Fehler:', e)
  stopServer()
  process.exit(1)
})
