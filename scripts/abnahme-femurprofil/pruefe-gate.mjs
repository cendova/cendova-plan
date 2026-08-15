// Abnahme des Bildqualitaets-Gates (Task 5a) im echten Browser.
import { chromium } from 'playwright-core'

const fehler = []
const ok = (b, t) => {
  console.log((b ? 'OK   ' : 'FEHL ') + t)
  if (!b) fehler.push(t)
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
page.on('pageerror', (e) => fehler.push('pageerror: ' + e.message))
await page.goto('http://127.0.0.1:5173/?beispiel=huefte', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__stores?.hip, null, { timeout: 30000 })
await page.waitForTimeout(3000)
// Das Beispielbild kalibriert sich NICHT von selbst — die Kalibrierung ist
// eine bewusste Nutzerentscheidung (Auswahldialog). Fuer den Test wird sie
// direkt gesetzt; ohne sie ist der Start zu Recht gesperrt (Task 5).
await page.evaluate(() =>
  window.__stores.viewer
    .getState()
    .setCalibration({ mmPerWorldUnit: 1, referenceMm: 100, magnification: 1 }),
)
await page.waitForTimeout(400)

const gate = () => useHipGate(page)
const useHipGate = (pg) => pg.evaluate(() => window.__stores.hip.getState().femurProfileGate)

// Sektion aufklappen und Dialog oeffnen
await page.locator('aside button[title="Sektion ausklappen"]').filter({ hasText: 'Femurprofil' }).click()
await page.waitForTimeout(300)
await page.locator('button', { hasText: 'Femurprofil starten' }).first().click()
await page.waitForTimeout(400)

const dialog = page.locator('text=Bildqualität für das Femurprofil')
ok(await dialog.isVisible(), 'Klick auf Start oeffnet zuerst die Checkliste')
ok(
  await page.locator('text=Keine Dorr-/CPAH-Klasse aus dieser Aufnahme').isVisible(),
  'Unbeantwortete Liste warnt vor fehlender Klassifikation',
)
const knopfText = await page.locator('button', { hasText: 'messen' }).last().innerText()
ok(/Ohne Klassifikation messen/.test(knopfText), `Knopf heisst ehrlich „${knopfText}"`)

// Kalibrier-Zeile kommt aus dem Viewer und ist nicht abwaehlbar
const kalibrierBox = page.locator('label', { hasText: 'Kalibrierung' }).locator('input')
ok(await kalibrierBox.isChecked(), 'Kalibrierung ist aus dem Viewer vorbefuellt')
ok(await kalibrierBox.isDisabled(), 'Kalibrierung ist nicht wegklickbar')

// Alle uebrigen Kriterien bestaetigen
for (const frage of [
  'Standardisierte, tief zentrierte AP-Aufnahme',
  'Rotation vertretbar',
  'Trochanter minor sicher erkennbar',
  'Mediale und laterale Kortikalisgrenzen',
  'Femur mindestens 10 cm distal',
]) {
  await page.locator('label', { hasText: frage }).locator('input').check()
}
await page.waitForTimeout(300)
ok(
  !(await page.locator('text=Keine Dorr-/CPAH-Klasse aus dieser Aufnahme').isVisible()),
  'Nach Bestaetigung verschwindet die Warnung',
)
const knopf2 = await page.locator('button', { hasText: 'Messung starten' }).last().innerText()
ok(/Messung starten/.test(knopf2), 'Knopf heisst jetzt „Messung starten"')

// Polaritaets-Falle: Deformitaet anhaken = Ausschlussgrund
await page.locator('label', { hasText: 'Ausgeprägte Deformität' }).locator('input').check()
await page.waitForTimeout(300)
ok(
  await page.locator('li', { hasText: 'Deformität verfälscht die Geometrie' }).isVisible(),
  'Deformitaet anhaken erzeugt einen Ausschlussgrund (umgekehrte Polaritaet)',
)
await page.locator('label', { hasText: 'Ausgeprägte Deformität' }).locator('input').uncheck()
await page.waitForTimeout(200)

await page.screenshot({
  path: '.test-artifacts/gate-dialog.png',
})

// Starten -> Gate liegt im Store, Messung laeuft
await page.locator('button', { hasText: 'Messung starten' }).last().click()
await page.waitForTimeout(500)
const g = await gate()
ok(g != null, 'Bestaetigung liegt im Store')
ok(g?.confirmedAt != null, 'Zeitstempel gesetzt')
ok(Array.isArray(g?.exclusionReasons) && g.exclusionReasons.length === 0, 'Keine Ausschlussgruende')
ok(/Schritt 1\/13/.test(await page.locator('body').innerText()), 'Messung startet nach dem Gate')

// Abbruch verwirft die Bestaetigung
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
ok((await gate()) === null, 'Escape verwirft die Bestaetigung')

// Zweiter Durchlauf beginnt wieder mit leerer Checkliste
await page.locator('button', { hasText: 'Femurprofil starten' }).first().click()
await page.waitForTimeout(400)
ok(
  await page.locator('text=Keine Dorr-/CPAH-Klasse aus dieser Aufnahme').isVisible(),
  'Neustart beginnt wieder mit leerer Checkliste',
)

await b.close()
console.log(fehler.length ? `\n${fehler.length} FEHLER: ${fehler.join(' | ')}` : '\nAlle Pruefungen bestanden')
process.exit(fehler.length ? 1 : 0)
