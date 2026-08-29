// Laufzeit-Nachweis der 10-cm-Hilfslinie (Task 4): Das Femurprofil hat
// noch keinen Toolbar-Knopf (kommt in Task 5), darum wird der Store
// direkt bedient — die Dev-Build legt ihn dafuer aufs window.
//
// Geprueft wird, was die Unit-Tests NICHT sehen koennen: dass die Linie
// tatsaechlich im DOM landet, erst ab Punkt 7 erscheint, ohne
// Kalibrierung ausbleibt und nach Abschluss der Messung verschwindet.
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

/** Zaehlt die gestrichelten Hilfslinien (Farbe der 10-cm-Linie). */
const linien = () =>
  page.$$eval('svg line[stroke="#94a3b8"]', (ls) =>
    ls.map((l) => ({
      x1: +l.getAttribute('x1'),
      y1: +l.getAttribute('y1'),
      x2: +l.getAttribute('x2'),
      y2: +l.getAttribute('y2'),
      dashed: !!l.getAttribute('stroke-dasharray'),
    })),
  )

/** Setzt Kalibrierung + n Draft-Punkte des Femurprofils. */
async function aufbau(kalibriert, anzahl) {
  await page.evaluate(
    ({ kalibriert, anzahl }) => {
      const { hip, viewer } = window.__stores
      hip.getState().cancelTool?.()
      viewer.getState().setCalibration(
        kalibriert ? { mmPerWorldUnit: 1, referenceMm: 100, magnification: 1 } : null,
      )
      hip.getState().toggleTool('femurProfile')
      // Referenz-Anatomie wie in den Unit-Tests (Achse vertikal bei x=0,
      // Trochanter minor bei y=40 -> Linie bei y=140).
      const pts = [
        [-40, -40, 0], [-64, -64, 0], [-88, -40, 0], [-57, -47, 0],
        [0, 0, 0], [0, 100, 0], [0, 40, 0],
        [-22, 140, 0], [-10, 140, 0], [10, 140, 0], [18, 140, 0],
        [-20, 40, 0], [20, 40, 0],
      ]
      for (let i = 0; i < anzahl; i++) hip.getState().addDraftPoint(pts[i])
    },
    { kalibriert, anzahl },
  )
  await page.waitForTimeout(400)
}

// 1) Vor dem Trochanter-minor-Punkt: noch keine Hilfslinie.
await aufbau(true, 6)
ok((await linien()).length === 0, 'Vor Punkt 7 keine Hilfslinie im DOM')

// 2) Ab Punkt 7: Linie ist da, waagerecht (Achse vertikal), gestrichelt.
await aufbau(true, 7)
const l7 = await linien()
ok(l7.length === 1, `Ab Punkt 7 genau eine Hilfslinie (gefunden: ${l7.length})`)
ok(!!l7[0]?.dashed, 'Hilfslinie ist gestrichelt')
ok(Math.abs(l7[0].y1 - l7[0].y2) < 1.5, 'Hilfslinie steht senkrecht auf der Achse (waagerecht)')
ok(Math.abs(l7[0].x2 - l7[0].x1) > 40, 'Hilfslinie hat sichtbare Laenge')
await page.screenshot({
  path: '.test-artifacts/hilfslinie.png',
})

// 3) Ohne Kalibrierung: keine scheinbar metrische Linie.
await aufbau(false, 7)
ok((await linien()).length === 0, 'Ohne Kalibrierung keine Hilfslinie')

// 4) Nach Abschluss der Messung verschwindet die Fuehrung wieder
//    (die fertige Messung zeichnet ihre eigene Linie).
await aufbau(true, 13)
await page.waitForTimeout(500)
const nachher = await linien()
ok(nachher.length <= 1, `Nach Abschluss hoechstens die Mess-Linie (gefunden: ${nachher.length})`)

await b.close()
console.log(fehler.length ? `\n${fehler.length} FEHLER: ${fehler.join(' | ')}` : '\nAlle Pruefungen bestanden')
process.exit(fehler.length ? 1 : 0)
