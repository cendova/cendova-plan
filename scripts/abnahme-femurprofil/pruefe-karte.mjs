// Abnahme der Ergebnis-Karte + CPAH-Matrix (Task 6).
// Kernfrage: Zeigt die Karte die KLASSE nur bei bestaetigter Bildqualitaet,
// und stimmt das Schaubild mit der Rechenlogik ueberein?
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

// Referenz-Anatomie: CI 0,50 / NSA 135 / FOR 1,60 -> Dorr B, norma, H -> 5H
const PUNKTE = [
  [-40, -40, 0], [-64, -64, 0], [-88, -40, 0], [-57, -47, 0],
  [0, 0, 0], [0, 100, 0], [0, 40, 0],
  [-22, 140, 0], [-10, 140, 0], [10, 140, 0], [18, 140, 0],
  [-20, 40, 0], [20, 40, 0],
]

/** Legt eine Femurprofil-Messung mit gegebener Bildqualitaet an. */
async function messung(bestanden, punkte = PUNKTE) {
  await page.evaluate(
    ({ bestanden, punkte }) => {
      const { hip, viewer } = window.__stores
      hip.getState().reset()
      viewer.getState().setCalibration({ mmPerWorldUnit: 1, referenceMm: 100, magnification: 1 })
      hip.getState().setFemurProfileGate({
        calibrated: true,
        apProjectionAcceptable: bestanden,
        rotationAcceptable: bestanden,
        lesserTrochanterVisible: bestanden,
        cortexVisible: bestanden,
        femurCoverage10cm: bestanden,
        deformityAffectsGeometry: false,
        exclusionReasons: bestanden ? [] : ['Rotation nicht vertretbar'],
        confirmedAt: '2026-08-11T12:00:00.000Z',
      })
      hip.getState().toggleTool('femurProfile')
      punkte.forEach((p) => hip.getState().addDraftPoint(p))
    },
    { bestanden, punkte },
  )
  await page.waitForTimeout(600)
}

// --- 1) Bestandene Qualitaet: Klasse + Matrix ------------------------
await messung(true)
const karte = page.locator('div.rounded.border').filter({ hasText: 'Morphologie & Fixation' }).last()
ok(await karte.isVisible(), 'Ergebnis-Karte erscheint')
const text = await karte.innerText()
ok(/Dorr-Vorschlag\s+B/.test(text), 'Dorr-Vorschlag B wird gezeigt')
ok(/Grenzbereich B\/C/.test(text), 'Grenzbereich B/C wird als solcher benannt')
ok(/5H · Dorr B · coxa norma · High-offset/.test(text), 'CPAH-Klartextzeile stimmt')
ok(/Cortical Index:\s*0,50/.test(text), 'CI 0,50 im Rohwert-Block')
ok(/Canal-Calcar Ratio:\s*0,50/.test(text), 'CCR 0,50 im Rohwert-Block')
ok(/Planungshinweis — keine autonome Implantatentscheidung/.test(text), 'Planungshinweis steht darunter')
// Verbotene Formulierungen
for (const verboten of ['Implantat X verwenden', 'zementfrei kontraindiziert', 'Osteoporose diagnostiziert']) {
  ok(!text.includes(verboten), `Verbotene Formulierung fehlt: „${verboten}"`)
}
// Keine Doppelanzeige: Die Werte stehen in der Karte, nicht zusaetzlich
// in der Messzeile darueber.
const panelOk = await page.locator('aside').last().innerText()
ok(
  (panelOk.match(/Cortical Index/g) || []).length === 1,
  `Cortical Index steht genau einmal im Panel (gefunden: ${(panelOk.match(/Cortical Index/g) || []).length}x)`,
)
ok(/Ergebnisse siehe/.test(panelOk), 'Messzeile verweist auf die Karte')
ok(await page.locator('text=CPAH-Klassifikation').isVisible(), 'CPAH-Matrix wird gezeichnet')
ok(/Typ 5H/.test(await page.locator('text=CPAH-Klassifikation').locator('..').innerText()), 'Matrix nennt Typ 5H')

// Die aktive Zelle muss die 5 sein: fettgedruckte Zahl im SVG suchen.
const aktiv = await page.$$eval('svg text[font-weight="700"]', (ts) => ts.map((t) => t.textContent))
ok(aktiv.includes('5'), `Aktive Zelle ist die 5 (gefunden: ${JSON.stringify(aktiv)})`)

await page.screenshot({
  path: '.test-artifacts/karte-bestanden.png',
})

// --- 2) Nicht bestandene Qualitaet: keine Klasse, keine Matrix -------
await messung(false)
const text2 = await page.locator('div.rounded.border').filter({ hasText: 'Morphologie & Fixation' }).last().innerText()
ok(/nicht zuverlässig bestimmbar/.test(text2), 'Ohne Bestaetigung: „nicht zuverlaessig bestimmbar"')
ok(/Rotation nicht vertretbar/.test(text2), 'Der konkrete Ausschlussgrund wird genannt')
ok(!/5H · Dorr B/.test(text2), 'Keine CPAH-Klartextzeile ohne Bestaetigung')
ok(!(await page.locator('text=CPAH-Klassifikation').isVisible()), 'KEINE Matrix ohne Bestaetigung')
ok(/Cortical Index:\s*0,50/.test(text2), 'Rohwerte bleiben trotzdem sichtbar')

// Entscheidend: das GANZE Panel darf keine Klasse zeigen. Die Messliste
// oberhalb der Karte kommt aus recipe.compute und kennt das Gate NICHT —
// stuende sie dort, waere das Gate ausgehebelt und das Panel widerspraeche
// sich selbst.
const panelGesperrt = await page.locator('aside').last().innerText()
ok(!/Dorr-Vorschlag:?\s*B/.test(panelGesperrt), 'Kein Dorr-Vorschlag IRGENDWO im Panel')
ok(!/CPAH:\s*5H/.test(panelGesperrt), 'Kein CPAH-Code IRGENDWO im Panel')
ok(/nicht zuverlässig bestimmbar/.test(panelGesperrt), 'Panel nennt stattdessen die Unbestimmbarkeit')

await page.screenshot({
  path: '.test-artifacts/karte-gesperrt.png',
})

// --- 3) Dorr C erzeugt die Fixationswarnung -------------------------
// Kanal auf 34 von 40 -> CI 0,15 -> Dorr C -> Typ 8
const dorrC = PUNKTE.map((p) => [...p])
dorrC[8] = [-17, 140, 0]
dorrC[9] = [17, 140, 0]
await messung(true, dorrC)
const text3 = await page.locator('div.rounded.border').filter({ hasText: 'Morphologie & Fixation' }).last().innerText()
ok(/Dorr-Vorschlag\s+C/.test(text3), 'Dorr C wird erkannt')
ok(
  /zementierte Fixation\/Alternative aktiv prüfen/.test(text3),
  'Fixationswarnung bei Dorr C',
)
ok(
  /Geometrischer Fit hebt das Frakturrisiko nicht auf/.test(text3),
  'Warnung relativiert den geometrischen Fit',
)
ok(!/kontraindiziert/.test(text3), 'Warnung bleibt Pruefauftrag, keine Kontraindikation')

await b.close()
console.log(fehler.length ? `\n${fehler.length} FEHLER: ${fehler.join(' | ')}` : '\nAlle Pruefungen bestanden')
process.exit(fehler.length ? 1 : 0)
