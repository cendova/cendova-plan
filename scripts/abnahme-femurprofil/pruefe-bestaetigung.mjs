// Abnahme der aerztlichen Bestaetigung/Uebersteuerung (Task 7).
import { chromium } from 'playwright-core'

const fehler = []
const ok = (b, t) => {
  console.log((b ? 'OK   ' : 'FEHL ') + t)
  if (!b) fehler.push(t)
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await b.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()
page.on('pageerror', (e) => fehler.push('pageerror: ' + e.message))
await page.goto('http://127.0.0.1:5173/?beispiel=huefte', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__stores?.hip, null, { timeout: 30000 })
await page.waitForTimeout(3000)

const PUNKTE = [
  [-40, -40, 0], [-64, -64, 0], [-88, -40, 0], [-57, -47, 0],
  [0, 0, 0], [0, 100, 0], [0, 40, 0],
  [-22, 140, 0], [-10, 140, 0], [10, 140, 0], [18, 140, 0],
  [-20, 40, 0], [20, 40, 0],
]

await page.evaluate((punkte) => {
  const { hip, viewer } = window.__stores
  hip.getState().reset()
  viewer.getState().setCalibration({ mmPerWorldUnit: 1, referenceMm: 100, magnification: 1 })
  hip.getState().setFemurProfileGate({
    calibrated: true, apProjectionAcceptable: true, rotationAcceptable: true,
    lesserTrochanterVisible: true, cortexVisible: true, femurCoverage10cm: true,
    deformityAffectsGeometry: false, exclusionReasons: [],
    confirmedAt: '2026-08-11T12:00:00.000Z',
  })
  hip.getState().toggleTool('femurProfile')
  punkte.forEach((p) => hip.getState().addDraftPoint(p))
}, PUNKTE)
await page.waitForTimeout(600)

const karte = () => page.locator('div.rounded.border').filter({ hasText: 'Morphologie & Fixation' }).last()
const review = () => page.evaluate(() => window.__stores.hip.getState().measurements[0].femurProfileReview)

// --- 1) Ausgangszustand: Vorschlag, nicht bestaetigt ------------------
ok(/Dorr-Vorschlag\s+B/.test(await karte().innerText()), 'Zeigt zunaechst den Vorschlag')
ok(/Noch nicht ärztlich bestätigt/.test(await karte().innerText()), 'Weist auf fehlende Bestaetigung hin')

// --- 2) Identische Bestaetigung ---------------------------------------
await karte().locator('button', { hasText: 'Bestätigen' }).first().click()
await page.waitForTimeout(300)
await karte().locator('button', { hasText: 'Speichern' }).first().click()
await page.waitForTimeout(400)
let r = await review()
ok(r?.dorrFinal === 'B', 'dorrFinal B gespeichert')
ok(r?.dorrSuggested === 'B', 'Vorschlag mitgespeichert')
ok(r?.confirmedAt != null, 'Zeitstempel erst beim Speichern gesetzt')
ok(r?.overrideReason == null, 'Kein Grund noetig bei identischer Bestaetigung')
ok(/Dorr bestätigt\s+B/.test(await karte().innerText()), 'Anzeige wechselt auf „Dorr bestätigt"')

// --- 3) Abweichung braucht einen Grund --------------------------------
await karte().locator('button', { hasText: 'Ändern' }).first().click()
await page.waitForTimeout(300)
await karte().locator('button').filter({ hasText: /^C$/ }).first().click()
await page.waitForTimeout(300)
const speichern = karte().locator('button', { hasText: 'Speichern' }).first()
ok(await speichern.isDisabled(), 'Speichern gesperrt, solange kein Grund gewaehlt ist')
ok(
  /Abweichung vom Vorschlag B — Grund erforderlich/.test(await karte().innerText()),
  'Pflichtgrund wird begruendet verlangt',
)
await page.screenshot({
  path: '.test-artifacts/bestaetigung.png',
})

await karte().locator('select').selectOption('gesamtmorphologie')
await page.waitForTimeout(300)
ok(await speichern.isEnabled(), 'Mit Grund ist Speichern frei')
await speichern.click()
await page.waitForTimeout(400)
r = await review()
ok(r?.dorrFinal === 'C', 'Abweichende Klasse C gespeichert')
ok(r?.overrideReason === 'gesamtmorphologie', 'Grund gespeichert')
ok(r?.dorrSuggested === 'B', 'Vorschlag B bleibt daneben erhalten')
const txt = await karte().innerText()
ok(/Dorr \(ärztlich\)\s+C/.test(txt), 'Anzeige nennt die aerztliche Klasse')
ok(/Vorschlag war B/.test(txt), 'Anzeige nennt den urspruenglichen Vorschlag')
ok(/Gesamtmorphologie spricht dagegen/.test(txt), 'Grund im Klartext sichtbar')

// --- 4) Undo macht die Bestaetigung rueckgaengig ----------------------
await page.evaluate(() => window.__stores.hip.getState())
const vorherFinal = (await review())?.dorrFinal
await page.waitForTimeout(500) // History-Debounce (350 ms)
await page.keyboard.press('Control+z')
await page.waitForTimeout(600)
const nachUndo = (await review())?.dorrFinal
ok(vorherFinal === 'C' && nachUndo !== 'C', `Undo nimmt die Bestaetigung zurueck (${vorherFinal} -> ${nachUndo})`)

// --- 5) Veraltete Bestaetigung wird erkannt ---------------------------
await page.evaluate(() => {
  const hip = window.__stores.hip
  const id = hip.getState().measurements[0].id
  hip.getState().setFemurProfileReview(id, {
    imageQuality: hip.getState().measurements[0].femurProfileReview.imageQuality,
    dorrSuggested: 'A', // so, als waere gegen A bestaetigt worden
    dorrFinal: 'A',
    confirmedAt: '2026-08-11T13:00:00.000Z',
  })
})
await page.waitForTimeout(500)
ok(
  /Punkte wurden nach der Bestätigung verändert/.test(await karte().innerText()),
  'Veraltete Bestaetigung wird als solche erkannt',
)

await b.close()
console.log(fehler.length ? `\n${fehler.length} FEHLER: ${fehler.join(' | ')}` : '\nAlle Pruefungen bestanden')
process.exit(fehler.length ? 1 : 0)
