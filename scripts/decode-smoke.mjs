// DICOM-Decode-Smoke-Test: Lädt die gebaute App headless im echten Chrome
// und prüft für ALLE drei Beispielbilder (Hüfte, Knie, Schulter), dass der
// Viewer sie tatsächlich DEKODIERT ("Bild geladen: …" im Konsolen-Log).
//
// Hintergrund: Der Sprung auf Cornerstone 5 (08/2026) brach das DICOM-Laden
// auf Anwender-Macs — `npm run verify` (Typecheck/Tests/Build) konnte das
// prinzipiell nicht sehen, weil der Decode-Pfad (WASM-Codecs, Worker, WebGL)
// erst zur Laufzeit im Browser läuft. Dieser Test schließt genau diese
// Lücke und läuft in der CI auch auf einem echten macOS-Runner.
//
// Aufruf:   node scripts/decode-smoke.mjs [--url http://localhost:4179/]
// Erwartet: laufenden `vite preview` (Produktions-Build!) unter der URL.
// Browser:  echtes Chrome/Chromium (PW_CHROMIUM überschreibt die Suche).
// Exit:     0 = alle Bilder dekodiert, 1 = mindestens eines nicht.

import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const args = process.argv.slice(2)
const argv = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const BASIS = argv('--url', 'http://localhost:4179/').replace(/\/$/, '')
const BEISPIELE = ['huefte', 'knie', 'schulter']

function findeChrome() {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM))
    return process.env.PW_CHROMIUM
  const kandidaten = [
    // macOS (GitHub-Runner und normale Installation)
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Linux (GitHub-Runner)
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    // Windows
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ]
  return kandidaten.find((p) => existsSync(p)) ?? null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function serverAbwarten() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASIS + '/')
      if (r.status < 500) return
    } catch {
      /* noch nicht erreichbar */
    }
    await sleep(1000)
  }
  throw new Error(`Server unter ${BASIS} nicht erreichbar (Timeout 60 s).`)
}

async function pruefeBeispiel(browser, name) {
  const seite = await (
    await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  ).newPage()
  const logs = []
  seite.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  seite.on('pageerror', (e) => logs.push(`[pageerror] ${e}`))
  try {
    await seite.goto(`${BASIS}/?beispiel=${name}`, {
      waitUntil: 'load',
      timeout: 60000,
    })
    // Auf das Decode-Ergebnis im Log warten. "Bild geladen" schreibt der
    // Viewer erst NACH erfolgreichem Dekodieren inkl. Maßangabe.
    const frist = Date.now() + 90000
    while (Date.now() < frist) {
      if (logs.some((z) => z.includes('Bild geladen'))) return { ok: true, logs }
      if (logs.some((z) => /nicht dekodiert/i.test(z)))
        return { ok: false, grund: 'Decode-Fehler', logs }
      await sleep(500)
    }
    return { ok: false, grund: 'Timeout (kein "Bild geladen" nach 90 s)', logs }
  } finally {
    await seite.context().close()
  }
}

const chrome = findeChrome()
if (!chrome) {
  console.error('[decode-smoke] Kein Chrome gefunden (PW_CHROMIUM setzen?).')
  process.exit(1)
}
console.log(`[decode-smoke] Chrome: ${chrome}`)
console.log(`[decode-smoke] Basis-URL: ${BASIS}`)
await serverAbwarten()

// SwiftShader erzwingen: CI-Runner haben keine GPU; so rendert WebGL in
// Software statt gar nicht. Lokal ändert das am Decode-Ergebnis nichts.
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
})

let fehler = 0
try {
  for (const name of BEISPIELE) {
    const r = await pruefeBeispiel(browser, name)
    if (r.ok) {
      const zeile = r.logs.find((z) => z.includes('Bild geladen'))
      console.log(`  ${name}: OK — ${zeile}`)
    } else {
      fehler++
      console.error(`  ${name}: FEHLGESCHLAGEN — ${r.grund}`)
      console.error(
        r.logs
          .filter((z) => /Bild|dekod|Fehler|error|Textur/i.test(z))
          .slice(0, 20)
          .map((z) => '    ' + z)
          .join('\n') || '    (keine relevanten Log-Zeilen)',
      )
    }
  }
} finally {
  await browser.close()
}

if (fehler > 0) {
  console.error(`[decode-smoke] ${fehler} von ${BEISPIELE.length} Bildern NICHT dekodiert.`)
  process.exit(1)
}
console.log('[decode-smoke] OK — alle Beispielbilder dekodiert. ✅')
