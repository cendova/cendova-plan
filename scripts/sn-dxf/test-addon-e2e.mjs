// E2E-Test des Kontur-Addons (merge:true) in der ECHTEN App (headless):
//
//   1. Synthetisches Basis-Paket importieren (nur LEGION-Katalog, 0 Bilder)
//      → Narrow-Größen (3N…) sind in der Größen-Auswahl AUSGEBLENDET.
//   2. DXF-Addon importieren → Reload (Persistenz über IndexedDB!) →
//      Narrow-Größen sind SICHTBAR, 3N wird mit der DXF-Kontur gerendert.
//
// Nutzt das synthetische Becken-DICOM (scripts/generate-sample-dicom.mjs)
// — keine Patientendaten. Gleiches Chromium-Setup wie screenshot.mjs.
//
// Aufruf: node scripts/sn-dxf/test-addon-e2e.mjs --addon <zip> [--url http://localhost:5173/]

import { chromium } from 'playwright-core'
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { zipSync, strToU8 } from 'fflate'
import { ladeSolldaten } from '../lib/solldaten.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT = join(__dirname, '..', '..')
const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const ADDON = argOf('--addon', null)
const URL = argOf('--url', 'http://localhost:5173/')
const OUT = join(PROJECT, '.test-artifacts')
if (!ADDON || !existsSync(ADDON)) {
  console.error('Addon-ZIP fehlt (--addon <zip>)')
  process.exit(1)
}

// --- Synthetisches Basis-Paket (Katalog ohne Bilder) ---------------------
// Die Katalog-Größentabellen sind Herstellerdaten und kommen aus der
// privaten Lokal-Datei (scripts/katalog-solldaten.local.json) — ohne sie
// kann das Basis-Paket nicht gebaut werden (klare Abbruch-Meldung).
const soll = ladeSolldaten({
  pflicht: ['legionPsFemur', 'genesisTibia'],
  skript: 'test-addon-e2e',
})
const LEGION = soll.legionPsFemur
const GENESIS_TIBIA = soll.genesisTibia
const baseManifest = {
  format: 'cendova-templates',
  formatVersion: 1,
  name: 'E2E-Basis',
  kneeCatalog: {
    legionPsFemur: LEGION,
    genesisTibia: GENESIS_TIBIA,
    tibiaInsert: {
      'genesis-tibia-female': { baseMm: 9, thicknessesMm: [9, 11, 13, 15, 18] },
      'genesis-tibia-male': { baseMm: 9, thicknessesMm: [9, 11, 13, 15, 18] },
    },
    // sizeCount steuert das Klemmen der Größen-Auswahl (clampIdx) — im
    // echten Klinikpaket enthalten, hier für den Test nötig.
    implantFamilies: [
      { kind: 'legion-ps-femur', label: 'Femur (Legion PS)', manufacturer: 'Smith+Nephew', procedure: 'TKA', bone: 'Femur', sizeCount: LEGION.length },
      { kind: 'genesis-tibia-female', label: 'Tibia (Genesis II)', manufacturer: 'Smith+Nephew', procedure: 'TKA', bone: 'Tibia', sizeCount: GENESIS_TIBIA.length },
      { kind: 'genesis-tibia-male', label: 'Tibia (Genesis II male)', manufacturer: 'Smith+Nephew', procedure: 'TKA', bone: 'Tibia', sizeCount: GENESIS_TIBIA.length },
    ],
  },
}
const basePath = join(OUT, 'e2e-basis-paket.zip')
mkdirSync(OUT, { recursive: true })
writeFileSync(basePath, zipSync({ 'manifest.json': strToU8(JSON.stringify(baseManifest)) }))

// --- Browser-Setup (wie screenshot.mjs) -----------------------------------
function findChromium() {
  const roots = ['/opt/pw-browsers', join(process.env.HOME || '/root', '.cache/ms-playwright')]
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const d of readdirSync(root).filter((x) => x.startsWith('chromium'))) {
      const p = join(root, d, 'chrome-linux', 'chrome')
      if (existsSync(p)) return p
    }
  }
  return null
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function isUp(u) {
  try {
    return (await fetch(u)).status < 500
  } catch {
    return false
  }
}
let devProc = null
if (!(await isUp(URL))) {
  devProc = spawn('npm', ['run', 'dev'], { cwd: PROJECT, detached: true, stdio: 'ignore' })
  devProc.unref()
  for (let i = 0; i < 90 && !(await isUp(URL)); i++) await sleep(1000)
}

const fails = []
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) fails.push(msg)
}

const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()

async function boot() {
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 })
  await page.waitForFunction(() => document.getElementById('root')?.children.length > 0, { timeout: 60000 })
  await page.waitForTimeout(1500)
}
async function importZip(path) {
  await page.locator('[data-testid="template-package-input"]').setInputFiles(path)
  await page.waitForTimeout(1200)
}
async function loadImageAndKnee() {
  await page.locator('input[type=file][accept*=".dcm"]').first().setInputFiles(join(PROJECT, 'public/sample/pelvis-ap.dcm'))
  await page.waitForTimeout(3500)
  await page.getByText('Knie', { exact: true }).first().click()
  await page.waitForTimeout(800)
}
async function place(label) {
  await page.getByText(label, { exact: true }).click()
  await page.getByText('Rechts', { exact: true }).click()
  await page.waitForTimeout(800)
}
async function placeLegionFemur() {
  await loadImageAndKnee()
  await place('Femur (Legion PS)')
}
async function sizeOptions() {
  // Größen-Select im „Ausgewählte Schablone"-Panel: das erste <select>,
  // dessen Optionen die Standardgröße '2' enthalten.
  const all = await page.locator('select').all()
  for (const sel of all) {
    const opts = await sel.locator('option').allTextContents()
    if (opts.includes('2') && opts.includes('8')) return { sel, opts }
  }
  return { sel: null, opts: [] }
}

// --- Phase 1: nur Basis-Paket → Narrow versteckt ---------------------------
await boot()
await importZip(basePath)
await placeLegionFemur()
let { opts } = await sizeOptions()
ok(opts.length > 0, `Größen-Auswahl gefunden (${opts.join(',')})`)
ok(!opts.includes('3N'), 'Narrow (3N) ist OHNE Addon ausgeblendet')

// --- Phase 2: Addon importieren, RELOAD (Persistenz), Narrow sichtbar -----
await importZip(ADDON)
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => document.getElementById('root')?.children.length > 0, { timeout: 60000 })
await page.waitForTimeout(1800)
await placeLegionFemur()
const res2 = await sizeOptions()
opts = res2.opts
ok(['3N', '4N', '5N', '6N'].every((s) => opts.includes(s)), `Narrow-Größen nach Addon+Reload sichtbar (${opts.join(',')})`)

// 3N auswählen → DXF-Kontur amber + Resektionslinie mit Referenzpunkten
if (res2.sel) {
  // sizeIndex von 3N = 1 (Katalogreihenfolge '2','3N',...). Per value wählen
  // (Label-Match ist bei re-renderndem Panel unzuverlässig).
  await res2.sel.selectOption('1')
  await page.waitForTimeout(800)
  const curVal = await res2.sel.inputValue()
  ok(curVal === '1', `3N ausgewählt (sizeIndex ${curVal})`)
  const polyCount = await page.locator('svg polygon').count()
  ok(polyCount > 0, `3N gerendert (SVG-Polygone: ${polyCount})`)
  const amberPoly = await page.locator('svg polygon[stroke="#FFC400"], svg polygon[stroke="#FFE08A"]').count()
  ok(amberPoly > 0, `3N in Messing/Amber (${amberPoly} Polygone)`)
  const amberDots = await page.locator('svg circle[fill="#FFC400"]').count()
  ok(amberDots >= 3, `Resektions-Referenzpunkte + Anker sichtbar (${amberDots} Punkte)`)
  await page.screenshot({ path: join(OUT, 'addon-e2e-3n.png') })
  console.log(`Screenshot: ${join(OUT, 'addon-e2e-3n.png')}`)
}

// --- Phase 3: Tibia Gr. 3 mit Inlay-Höhen ---------------------------------
await place('Tibia (Genesis II)')
const tibiaSel = await (async () => {
  for (const sel of await page.locator('select').all()) {
    const opts = await sel.locator('option').allTextContents()
    if (opts.includes('1') && opts.includes('8')) return sel
  }
  return null
})()
ok(!!tibiaSel, 'Tibia-Größen-Auswahl gefunden')
if (tibiaSel) {
  await tibiaSel.selectOption({ value: '2' }) // value 2 = Größe '3' (DXF)
  await page.waitForTimeout(800)
  ok((await tibiaSel.inputValue()) === '2', 'Tibia Gr. 3 (DXF) ausgewählt')
  const tibiaPolys = await page.locator('svg polygon').count()
  ok(tibiaPolys > 0, `Tibia Gr. 3 gerendert (${tibiaPolys} Polygone)`)
  let inlayOpts = []
  for (const sel of await page.locator('select').all()) {
    const opts = await sel.locator('option').allTextContents()
    if (opts.some((o) => /mm/.test(o))) inlayOpts = opts
  }
  ok(inlayOpts.includes('9 mm') && inlayOpts.length >= 4,
    `Inlay-Höhen wählbar (${inlayOpts.join(', ')})`)
  const setInlay = async (label) => {
    for (const sel of await page.locator('select').all()) {
      const opts = await sel.locator('option').allTextContents()
      if (opts.some((o) => /mm/.test(o))) await sel.selectOption({ label })
    }
    await page.waitForTimeout(500)
  }
  // Inlay-Höhe MUSS die Darstellung verändern (Artikulationsfläche hebt an):
  // Screenshot bei 9 mm vs 18 mm pixelweise vergleichen.
  await setInlay('9 mm')
  const buf9 = await page.screenshot({ clip: { x: 480, y: 220, width: 640, height: 640 } })
  await setInlay('18 mm')
  const buf18 = await page.screenshot({ clip: { x: 480, y: 220, width: 640, height: 640 } })
  let diff = 0
  const n = Math.min(buf9.length, buf18.length)
  for (let i = 0; i < n; i++) if (buf9[i] !== buf18[i]) diff++
  ok(diff > n * 0.002, `Inlay 9↔18 mm verändert die Darstellung (${((diff / n) * 100).toFixed(1)} % Bytes)`)
  await page.screenshot({ path: join(OUT, 'addon-e2e-tibia3.png') })
}

await browser.close()
if (devProc?.pid) {
  try {
    process.kill(-devProc.pid, 'SIGTERM')
  } catch {
    /* egal */
  }
}
console.log(fails.length ? `\nFEHLGESCHLAGEN: ${fails.length}` : '\nADDON-E2E OK ✅')
process.exit(fails.length ? 1 : 0)
