// Abnahme des Plan-Rundlaufs v10 (Task 8): Ueberlebt das Femurprofil
// samt Beurteilung einen echten Speichern-/Laden-Zyklus - und zeigt die
// Karte danach dasselbe wie vorher?
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

// Messung anlegen und aerztlich uebersteuern (C statt B, mit Grund).
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
  const id = hip.getState().measurements[0].id
  hip.getState().setFemurProfileReview(id, {
    imageQuality: hip.getState().measurements[0].femurProfileReview.imageQuality,
    dorrSuggested: 'B', dorrFinal: 'C', overrideReason: 'gesamtmorphologie',
    confirmedAt: '2026-08-11T13:00:00.000Z',
  })
}, PUNKTE)
await page.waitForTimeout(500)

const karte = () => page.locator('div.rounded.border').filter({ hasText: 'Morphologie & Fixation' }).last()
const vorher = await karte().innerText()
ok(/Dorr \(ärztlich\)\s+C/.test(vorher), 'Ausgangszustand: aerztlich C')

// Plan bauen (der echte Serialisierungsweg) und als JSON-Text mitnehmen.
const planJson = await page.evaluate(async () => {
  const m = await import('/src/lib/plan/serialize.ts')
  return JSON.stringify(m.buildPlan())
})
const plan = JSON.parse(planJson)
ok(plan.version === 10, `Plan traegt Version 10 (ist: ${plan.version})`)
const gespeichert = plan.hipMeasurements.find((m) => m.kind === 'femurProfile')
ok(gespeichert != null, 'Femurprofil-Messung im Plan enthalten')
ok(gespeichert.points.length === 13, '13 Punkte gespeichert')
ok(gespeichert.femurProfileReview?.dorrFinal === 'C', 'dorrFinal C gespeichert')
ok(gespeichert.femurProfileReview?.dorrSuggested === 'B', 'Vorschlag B gespeichert')
ok(
  gespeichert.femurProfileReview?.overrideReason === 'gesamtmorphologie',
  'Override-Grund gespeichert',
)
ok(
  gespeichert.femurProfileReview?.imageQuality?.rotationAcceptable === true,
  'Bildqualitaet vollstaendig gespeichert',
)

// Alles wegwerfen und aus dem JSON wiederherstellen.
await page.evaluate((json) => {
  const { hip } = window.__stores
  hip.getState().reset()
  hip.setState({ measurements: JSON.parse(json).hipMeasurements })
}, planJson)
await page.waitForTimeout(600)

const nachher = await karte().innerText()
ok(/Dorr \(ärztlich\)\s+C/.test(nachher), 'Nach dem Laden weiterhin aerztlich C')
ok(/Vorschlag war B/.test(nachher), 'Vorschlag ueberlebt das Laden')
ok(/Gesamtmorphologie spricht dagegen/.test(nachher), 'Grund ueberlebt das Laden')
ok(/Cortical Index:\s*0,50/.test(nachher), 'Rohwerte werden neu berechnet')
ok(
  !/Punkte wurden nach der Bestätigung verändert/.test(nachher),
  'Keine falsche Veraltet-Warnung nach dem Laden',
)

// Die Grenzen-Pruefung muss einen praeparierten Plan abweisen.
const grenzen = await page.evaluate(async () => {
  const m = await import('/src/lib/plan/planGrenzen.ts')
  const boese = {
    version: 10,
    hipMeasurements: [
      {
        id: 'x', kind: 'femurProfile', points: [], visible: true,
        labelOffset: { x: 0, y: 0 },
        labelStyle: { fontSize: 13, color: '#fff', bold: false, underline: false },
        femurProfileReview: { imageQuality: { exclusionReasons: new Array(50000).fill('x') } },
      },
    ],
  }
  return m.pruefePlanGrenzen(boese)
})
ok(typeof grenzen === 'string' && /exclusionReasons/.test(grenzen), `Praeparierter Plan wird abgewiesen: ${grenzen}`)

await page.screenshot({
  path: '.test-artifacts/plan-v10.png',
})
await b.close()
console.log(fehler.length ? `\n${fehler.length} FEHLER: ${fehler.join(' | ')}` : '\nAlle Pruefungen bestanden')
process.exit(fehler.length ? 1 : 0)
