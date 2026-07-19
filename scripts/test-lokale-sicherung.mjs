// E2E-Test der lokalen Sicherung (Klinik-Wipe-Szenario).
//
// Klinischer Befund: Auf Klinik-PCs löschen Richtlinien beim Schließen den
// Browser-Speicher (IndexedDB + localStorage) — importiertes Schablonen-
// Paket und Einrichtungs-Profil waren weg. Die App sichert beides jetzt
// zusätzlich als Dateien über den lokalen Server (.cendova-daten/) und
// stellt sich daraus selbst wieder her.
//
// Simulation: Browser-Kontext A importiert Paket + setzt Profil →
// Kontext B (frischer Kontext = komplett leerer Browser-Speicher, exakt
// der Zustand nach einem Richtlinien-Wipe) lädt die App → alles wieder da.
// Danach: bewusstes Entfernen/Zurücksetzen löscht auch die Sicherung →
// Kontext C bleibt leer (nichts kommt „von selbst" wieder).
//
// Umgebung wie scripts/screenshot.mjs (playwright-core + vorinstalliertes
// Chromium). Aufruf: node scripts/test-lokale-sicherung.mjs
// Exit: 0 = alles korrekt, 1 = Fehler, 2 = kein Chromium.

import { chromium } from 'playwright-core'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { zipSync, strToU8 } from 'fflate'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || join(__dirname, '..')
const DATEN_DIR = join(PROJECT_DIR, '.cendova-daten')
const URL = 'http://localhost:5173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function findChromium() {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM
  for (const root of ['/opt/pw-browsers', join(process.env.HOME || '/root', '.cache/ms-playwright')]) {
    if (!existsSync(root)) continue
    for (const d of readdirSync(root).filter((x) => x.startsWith('chromium')).sort().reverse()) {
      const p = join(root, d, 'chrome-linux', 'chrome')
      if (existsSync(p)) return p
    }
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

const results = []
const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`) }

// Synthetisches Test-Paket (1 Bild + 1 Kontur) — keine Herstellerdaten.
const PNG_1x1 = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
const MANIFEST = {
  format: 'cendova-templates',
  formatVersion: 1,
  name: 'Sicherungs-Testpaket',
  kneeImages: {
    'legion-ps-femur|AP|0': { path: 'images/test.png', widthPx: 1, heightPx: 1, mmPerPx: 1 },
  },
  kneeContours: {
    'legion-ps-femur|AP|0': { wMm: 10, hMm: 10, points: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
  },
}
const TEST_ZIP = zipSync({
  'manifest.json': strToU8(JSON.stringify(MANIFEST)),
  'images/test.png': PNG_1x1,
})

async function appState(page) {
  return page.evaluate(async () => {
    const m = await import('/src/lib/knee/kneeContours.ts')
    const o = await import('/src/state/orgProfileStore.ts')
    const t = await import('/src/state/templatePackageStore.ts')
    return {
      contours: Object.keys(m.KNEE_CONTOURS).length,
      subtitle: o.useOrgProfileStore.getState().headerSubtitle,
      pkgName: t.useTemplatePackageStore.getState().info?.name ?? null,
    }
  })
}
async function openApp(ctx) {
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 })
  await page.waitForFunction(() => document.getElementById('root')?.children.length > 0, { timeout: 60000 })
  await page.waitForTimeout(2000) // Registry-Init + evtl. Wiederherstellung
  return page
}

async function main() {
  const exec = findChromium()
  if (!exec) { console.error('[sicherung] Kein Chromium gefunden.'); process.exit(2) }
  rmSync(DATEN_DIR, { recursive: true, force: true })
  const started = await ensureServer()
  const errors = []
  const browser = await chromium.launch({ executablePath: exec, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  try {
    // --- Kontext A: importieren + personalisieren --------------------------
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const pageA = await openApp(ctxA)
    pageA.on('pageerror', (e) => errors.push(String(e?.stack || e)))
    await pageA.evaluate(async (zipBytes) => {
      const r = await import('/src/lib/templates/registry.ts')
      const file = new File([new Uint8Array(zipBytes)], 'test.zip', { type: 'application/zip' })
      const res = await r.importTemplatePackage(file)
      if (!res.ok) throw new Error(res.error)
      const o = await import('/src/state/orgProfileStore.ts')
      o.useOrgProfileStore.getState().setProfile({ headerSubtitle: 'Wipe-Test-Zentrum' })
    }, Array.from(TEST_ZIP))
    await pageA.waitForTimeout(1200) // fire-and-forget-Sicherungen landen lassen
    check('Sicherungsdateien auf Platte', existsSync(join(DATEN_DIR, 'schablonen-paket.zip')) && existsSync(join(DATEN_DIR, 'profil.json')))
    await ctxA.close()

    // --- Kontext B: frischer Browser-Speicher (= Richtlinien-Wipe) ---------
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const pageB = await openApp(ctxB)
    pageB.on('pageerror', (e) => errors.push(String(e?.stack || e)))
    const b = await appState(pageB)
    check('Paket nach Wipe automatisch wiederhergestellt', b.contours === 1 && b.pkgName === 'Sicherungs-Testpaket', JSON.stringify(b))
    check('Profil nach Wipe automatisch wiederhergestellt', b.subtitle === 'Wipe-Test-Zentrum', JSON.stringify(b.subtitle))

    // --- Bewusstes Entfernen löscht auch die Sicherung ---------------------
    await pageB.evaluate(async () => {
      const r = await import('/src/lib/templates/registry.ts')
      await r.removeTemplatePackage()
      const o = await import('/src/state/orgProfileStore.ts')
      o.useOrgProfileStore.getState().resetProfile()
    })
    await pageB.waitForTimeout(1200)
    check('Entfernen/Zurücksetzen löscht Sicherungsdateien', !existsSync(join(DATEN_DIR, 'schablonen-paket.zip')) && !existsSync(join(DATEN_DIR, 'profil.json')))
    await ctxB.close()

    // --- Kontext C: nichts kommt „von selbst" wieder -----------------------
    const ctxC = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const pageC = await openApp(ctxC)
    const c = await appState(pageC)
    check('Nach bewusstem Entfernen bleibt es leer', c.contours === 0 && c.pkgName === null && c.subtitle === '', JSON.stringify(c))
    await ctxC.close()

    check('keine Laufzeitfehler', errors.length === 0, errors.join(' | ') || '')
  } finally {
    await browser.close()
    if (started) stopServer()
    rmSync(DATEN_DIR, { recursive: true, force: true })
  }
  const failed = results.filter((r) => !r).length
  console.log(`\n${results.length - failed}/${results.length} PASS`)
  if (failed) { console.error('[sicherung] FEHLGESCHLAGEN.'); process.exit(1) }
  console.log('[sicherung] OK ✅')
}
main().catch((e) => { console.error('[sicherung] Fehler:', e); stopServer(); process.exit(1) })
