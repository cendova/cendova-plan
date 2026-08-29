// Abnahme der Femurprofil-Sektion (Task 5) im echten Browser.
// Geprueft wird der Doktrin-Vertrag: Reihenfolge, Nummerierung,
// Statuspunkt-Regel, Kalibrier-Sperre und der komplette Klickweg.
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
await page.waitForTimeout(3500)

const sektionen = () =>
  page.$$eval('aside button[title*="Sektion"]', (bs) =>
    bs.map((h) => {
      const t = h.querySelector('span[title]')
      const dot = h.querySelector('span.rounded-full, span[class*="bg-emerald"], span[class*="bg-amber"]')
      return {
        titel: t ? t.getAttribute('title') : h.innerText.trim(),
        punkt: dot ? (dot.className.match(/bg-(emerald|amber)-500/) || [null, 'keiner'])[1] : 'keiner',
      }
    }),
  )

// --- 1) Reihenfolge und Nummerierung ---------------------------------
const s = await sektionen()
console.log('Sektionen:', JSON.stringify(s.map((x) => x.titel)))
const erwartet = [
  '1 · Kalibrierung',
  '2 · Messungen',
  '3 · Femurprofil',
  '4 · Schablonen',
  '5 · Osteotomie',
  '6 · Osteophyten',
]
erwartet.forEach((t, i) => ok(s[i]?.titel === t, `Sektion ${i + 1} heisst „${t}"`))

// --- 2) Statuspunkt-Doktrin: optional heisst KEIN amber ---------------
const fp = s.find((x) => x.titel === '3 · Femurprofil')
ok(fp?.punkt === 'keiner', `Femurprofil ohne Statuspunkt vor dem Start (ist: ${fp?.punkt})`)

// --- 3) Standardmaessig eingeklappt ----------------------------------
const zustand = await page.$$eval('aside button[title*="Sektion"]', (bs) =>
  bs.map((h) => ({ titel: h.querySelector('span[title]')?.getAttribute('title'), title: h.getAttribute('title') })),
)
ok(
  zustand.find((z) => z.titel === '3 · Femurprofil')?.title === 'Sektion ausklappen',
  'Femurprofil ist standardmaessig eingeklappt',
)

// --- 4) Sperre ohne Kalibrierung -------------------------------------
await page.evaluate(() => window.__stores.viewer.getState().setCalibration(null))
await page.waitForTimeout(300)
await page.locator('aside button[title="Sektion ausklappen"]').filter({ hasText: 'Femurprofil' }).click()
await page.waitForTimeout(400)
const knopf = page.locator('button', { hasText: 'Femurprofil starten' }).first()
ok(await knopf.isDisabled(), 'Ohne Kalibrierung ist der Start gesperrt')
const hinweis = await page.locator('aside').first().innerText()
ok(/Erst kalibrieren/.test(hinweis), 'Sperre wird begruendet („Erst kalibrieren")')
ok(/Optional: Dorr, CPAH/.test(hinweis), 'Hilfetext ist vorhanden')

// --- 5) Mit Kalibrierung startbar, Schrittfuehrung laeuft ------------
await page.evaluate(() =>
  window.__stores.viewer.getState().setCalibration({ mmPerWorldUnit: 1, referenceMm: 100, magnification: 1 }),
)
await page.waitForTimeout(300)
ok(await knopf.isEnabled(), 'Mit Kalibrierung ist der Start frei')
await knopf.click()
await page.waitForTimeout(500)
// Seit dem Bildqualitaets-Gate (Task 5a) oeffnet der Knopf zuerst die
// Checkliste; die Messung startet erst nach deren Bestaetigung.
ok(
  /Bildqualität für das Femurprofil/.test(await page.locator('body').innerText()),
  'Start oeffnet zuerst die Bildqualitaets-Checkliste',
)
await page.locator('button', { hasText: 'Ohne Klassifikation messen' }).last().click()
await page.waitForTimeout(500)
const banner = await page.locator('body').innerText()
ok(/Femurprofil · Schritt 1\/13/.test(banner), 'Schrittfuehrung startet bei 1/13')
await page.screenshot({
  path: '.test-artifacts/femurprofil-sektion.png',
})

// --- 6) Nach Abschluss: gruener Punkt, Mess-Sektion unberuehrt -------
await page.evaluate(() => {
  const hip = window.__stores.hip
  const pts = [
    [-40, -40, 0], [-64, -64, 0], [-88, -40, 0], [-57, -47, 0],
    [0, 0, 0], [0, 100, 0], [0, 40, 0],
    [-22, 140, 0], [-10, 140, 0], [10, 140, 0], [18, 140, 0],
    [-20, 40, 0], [20, 40, 0],
  ]
  pts.forEach((p) => hip.getState().addDraftPoint(p))
})
await page.waitForTimeout(600)
const s2 = await sektionen()
ok(
  s2.find((x) => x.titel === '3 · Femurprofil')?.punkt === 'emerald',
  `Nach Abschluss gruener Punkt (ist: ${s2.find((x) => x.titel === '3 · Femurprofil')?.punkt})`,
)
// Die allgemeine Mess-Sektion darf das Femurprofil NICHT als erledigt zaehlen.
ok(
  s2.find((x) => x.titel === '2 · Messungen')?.punkt === 'amber',
  `Mess-Sektion bleibt offen (ist: ${s2.find((x) => x.titel === '2 · Messungen')?.punkt})`,
)

await b.close()
console.log(fehler.length ? `\n${fehler.length} FEHLER: ${fehler.join(' | ')}` : '\nAlle Pruefungen bestanden')
process.exit(fehler.length ? 1 : 0)
