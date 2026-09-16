// Abnahme des CCD-Prefills (Task 10).
import { chromium } from 'playwright-core'
const fehler = []
const ok = (b, t) => { console.log((b ? 'OK   ' : 'FEHL ') + t); if (!b) fehler.push(t) }

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await b.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()
page.on('pageerror', (e) => fehler.push('pageerror: ' + e.message))
await page.goto('http://127.0.0.1:5173/?beispiel=huefte', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__stores?.hip, null, { timeout: 30000 })
await page.waitForTimeout(3000)
await page.evaluate(() =>
  window.__stores.viewer.getState().setCalibration({ mmPerWorldUnit: 1, referenceMm: 100, magnification: 1 }))

const sektionAuf = async () => {
  const zu = page.locator('aside button[title="Sektion ausklappen"]').filter({ hasText: 'Femurprofil' })
  if (await zu.count()) await zu.first().click()
  await page.waitForTimeout(300)
}
const starteFemurprofil = async () => {
  await page.locator('button', { hasText: 'Femurprofil starten' }).first().click()
  await page.waitForTimeout(400)
}

// Seit 16.09.2026 gibt es keinen Dialog mehr vor der Messung; der
// Prefill wird im Hinweis UNTER dem Start-Knopf angekuendigt.
// --- 1) OHNE CCD-Messung: kein Hinweis, Start bei 1/13 ---------------
await sektionAuf()
ok(
  !/Punkte der CCD-Messung werden übernommen/.test(await page.locator('body').innerText()),
  'Ohne CCD kein Prefill-Hinweis',
)
await starteFemurprofil()
ok(/Schritt 1\/13/.test(await page.locator('body').innerText()), 'Ohne CCD Start bei Schritt 1/13')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// --- 2) MIT CCD-Messung: Hinweis + Start bei 7/13 --------------------
await page.evaluate(() => {
  const hip = window.__stores.hip
  hip.getState().reset()
  hip.getState().toggleTool('ccd')
  ;[[-40,-40,0],[-64,-64,0],[-88,-40,0],[-57,-47,0],[0,0,0],[0,100,0]]
    .forEach((p) => hip.getState().addDraftPoint(p))
})
await page.waitForTimeout(400)
await sektionAuf()
const t2 = await page.locator('body').innerText()
ok(/sechs Punkte der CCD-Messung werden übernommen/.test(t2), 'Prefill wird unter dem Knopf angekuendigt')
ok(/Seite prüfen/.test(t2), 'Hinweis mahnt die Seiten-Pruefung an')
await page.screenshot({ path: '.test-artifacts/prefill-hinweis.png' })

await starteFemurprofil()
const draft = await page.evaluate(() => window.__stores.hip.getState().draftPoints)
ok(draft.length === 6, `Sechs Punkte uebernommen (${draft.length})`)
ok(/Schritt 7\/13/.test(await page.locator('body').innerText()), 'Messung startet bei Schritt 7/13')
ok(
  JSON.stringify(draft[0]) === JSON.stringify([-40, -40, 0]),
  'Erster Punkt stimmt mit der CCD-Messung ueberein',
)

// --- 3) Uebernommene Punkte sind editierbar, CCD bleibt unberuehrt ---
await page.evaluate(() => window.__stores.hip.getState().updateDraftPoint(0, [500, 500, 0]))
await page.waitForTimeout(300)
const ccdPunkt = await page.evaluate(
  () => window.__stores.hip.getState().measurements.find((m) => m.kind === 'ccd').points[0])
ok(JSON.stringify(ccdPunkt) === JSON.stringify([-40, -40, 0]), 'CCD-Messung bleibt unveraendert')

await b.close()
console.log(fehler.length ? `\n${fehler.length} FEHLER: ${fehler.join(' | ')}` : '\nAlle Pruefungen bestanden')
process.exit(fehler.length ? 1 : 0)
