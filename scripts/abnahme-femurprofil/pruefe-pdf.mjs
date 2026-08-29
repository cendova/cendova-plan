// Abnahme des PDF-Abschnitts (Task 9) am ECHTEN Export: Der Knopf in der
// Kopfzeile wird geklickt, die heruntergeladene Datei eingelesen und im
// Rohbyte-Strom nach den Textstuecken gesucht (jsPDF schreibt Text
// unkomprimiert als „(...) Tj" in den Content-Stream).
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const fehler = []
const ok = (b, t) => {
  console.log((b ? 'OK   ' : 'FEHL ') + t)
  if (!b) fehler.push(t)
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true })
const page = await ctx.newPage()
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

async function messung(bestanden, mitBestaetigung) {
  await page.evaluate(
    ({ bestanden, mitBestaetigung, punkte }) => {
      const { hip, viewer } = window.__stores
      hip.getState().reset()
      viewer.getState().setCalibration({ mmPerWorldUnit: 1, referenceMm: 100, magnification: 1 })
      hip.getState().setFemurProfileGate({
        calibrated: true,
        apProjectionAcceptable: bestanden, rotationAcceptable: bestanden,
        lesserTrochanterVisible: bestanden, cortexVisible: bestanden,
        femurCoverage10cm: bestanden, deformityAffectsGeometry: false,
        exclusionReasons: bestanden ? [] : ['Rotation nicht vertretbar'],
        confirmedAt: '2026-08-11T12:00:00.000Z',
      })
      hip.getState().toggleTool('femurProfile')
      punkte.forEach((p) => hip.getState().addDraftPoint(p))
      if (mitBestaetigung) {
        const m = hip.getState().measurements[0]
        hip.getState().setFemurProfileReview(m.id, {
          imageQuality: m.femurProfileReview.imageQuality,
          dorrSuggested: 'B', dorrFinal: 'C',
          overrideReason: 'gesamtmorphologie',
          confirmedAt: '2026-08-11T13:00:00.000Z',
        })
      }
    },
    { bestanden, mitBestaetigung, punkte: PUNKTE },
  )
  await page.waitForTimeout(500)
}

/** Klickt den Export-Knopf und liefert den Rohtext der PDF-Datei. */
async function pdfRoh() {
  // Ohne Planungsdaten zeigt der Export erst einen Hinweis statt zu
  // exportieren — ein Feld genuegt, um an ihm vorbeizukommen.
  await page.evaluate(async () => {
    const m = await import('/src/state/planningStore.ts')
    m.usePlanningStore.setState({ hospital: 'Testklinik' })
  })
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.locator('button[title="Plan als PDF exportieren"]').click(),
  ])
  const pfad = await dl.path()
  return readFileSync(pfad, 'latin1')
}

// --- 1) Bestaetigte Qualitaet mit aerztlichem Override -----------------
await messung(true, true)
let roh = await pdfRoh()
ok(roh.startsWith('%PDF'), 'Echte PDF-Datei erzeugt')
ok(roh.includes('Femurprofil'), 'Abschnitt „Femurprofil" steht im PDF')
ok(/Dorr \\\(ärztlich\\\): C - Vorschlag war B/.test(roh), 'Aerztliche Klasse mit sichtbarem Trenner im PDF')
ok(/Vorschlag war B/.test(roh), 'Vorschlag im PDF')
ok(/Gesamtmorphologie spricht dagegen/.test(roh), 'Override-Grund im PDF')
ok(/Cortical Index: 0,50/.test(roh), 'Rohwerte im PDF')
ok(/CPAH 5H/.test(roh), 'CPAH-Code im PDF')
ok(/Planungshinweis - keine autonome Implantatentscheidung/.test(roh), 'Planungshinweis vollstaendig im PDF')
ok(!/2026-08-11/.test(roh), 'Kein Zeitstempel im PDF')

// --- 2) Ungeeignete Aufnahme: keine Klasse im PDF ---------------------
await messung(false, false)
roh = await pdfRoh()
ok(/nicht zuverl.ssig bestimmbar/.test(roh), 'Ohne Bestaetigung: Klasse unterdrueckt')
ok(/Rotation nicht vertretbar/.test(roh), 'Ausschlussgrund im PDF')
ok(!/CPAH 5H/.test(roh), 'KEIN CPAH-Code ohne bestaetigte Bildqualitaet')
ok(/Cortical Index: 0,50/.test(roh), 'Rohwerte trotzdem im PDF')

await b.close()
console.log(fehler.length ? `\n${fehler.length} FEHLER: ${fehler.join(' | ')}` : '\nAlle Pruefungen bestanden')
process.exit(fehler.length ? 1 : 0)
