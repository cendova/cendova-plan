// Abnahme der Osteotomie-Interaktion im echten Browser (Dev-Server nötig:
// `npm run dev`, dann `node scripts/abnahme-osteotomie/pruefe-ziehen.mjs`).
//
// Hintergrund (Review 29.09.2026): Beim Ziehen einer Landmarke der
// Vollvermessung mit laufender Bildsimulation löste jede Mausbewegung den
// Korrekturwinkel neu — mit dem gezogenen Punkt. Der Punkt blieb im Bild
// stehen, der gespeicherte wanderte unsichtbar weg (Gegenprobe ohne
// Einfrieren: 19,8 px Abweichung, Winkel −8,1° → +10,1°, 85 mm Drift).
// Geprüft wird außerdem: kein Render-Kreislauf im Leerlauf, DLO-Griffe auf
// den Keil-Ecken (mit und ohne Simulation), Verwerfen ohne Vollvermessung.
// Das synthetische Varusbein stammt aus osteotomie.test.ts.
import { chromium } from 'playwright-core'
const fehler = []
const ok = (b, t) => { console.log((b ? 'OK   ' : 'FEHL ') + t); if (!b) fehler.push(t) }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await b.newContext({ viewport: { width: 1500, height: 1100 } })).newPage()
page.on('pageerror', (e) => fehler.push('pageerror: ' + e.message))
await page.goto('http://127.0.0.1:5173/?beispiel=knie', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__stores?.knee, null, { timeout: 30000 })
await page.waitForTimeout(3000)

// Fixture (Varusbein, mm) ins Bild legen
const lage = await page.evaluate(async () => {
  const { getViewport } = await import('/src/lib/cornerstone/viewer.ts')
  const vp = getViewport()
  const r = vp.canvas.getBoundingClientRect()
  const a = vp.canvasToWorld([0, 0]); const z = vp.canvasToWorld([r.width, r.height])
  return { a, z }
})
const minY = Math.min(lage.a[1], lage.z[1]), maxY = Math.max(lage.a[1], lage.z[1])
const midX = (lage.a[0] + lage.z[0]) / 2
const s = ((maxY - minY) * 0.7) / 850
const T = (x, y) => [midX + x * s, minY + (maxY - minY) * 0.07 + (y + 24) * s, 0]
const tib = (y) => (-35 * (y - 428)) / 392
const F = [[-24,0],[0,-24],[24,0],[33,150],[57,150],[3,330],[27,330],[-38,420],[38,420],[-38,428],[38,428],[0,424],
  [tib(550)-12,550],[tib(550)+12,550],[tib(750)-10,750],[tib(750)+10,750],[-35,820]].map(([x,y]) => T(x,y))

await page.evaluate(async ({ F, hs }) => {
  const { knee, viewer } = window.__stores
  viewer.getState().setCalibration({ mmPerWorldUnit: 1, referenceMm: 100, magnification: 1 })
  knee.getState().reset()
  knee.getState().toggleTool('workflow')
  F.forEach((q) => knee.getState().addDraftPoint(q))
  const o = await import('/src/state/kneeOsteotomieStore.ts')
  o.useKneeOsteotomieStore.getState().starte('htoOeffnend', 62.5)
  o.useKneeOsteotomieStore.getState().setzePunkt(hs[0])
  o.useKneeOsteotomieStore.getState().setzePunkt(hs[1])
}, { F, hs: [T(30, 445), T(-36, 470)] })
await page.waitForTimeout(800)

const zustand = () => page.evaluate(async () => {
  const u = await import('/src/components/useOsteotomie.ts')
  const k = await import('/src/lib/knee/osteotomie.ts')
  const { getViewport } = await import('/src/lib/cornerstone/viewer.ts')
  const vp = getViewport(); const r = vp.canvas.getBoundingClientRect()
  const d = u.osteotomieJetzt()
  const wf = window.__stores.knee.getState().measurements[0]
  if (!d.ergebnis?.ok) return { ok: false, fehler: d.ergebnis?.fehler }
  const anz = k.zeigePunkt(d.ergebnis.anzeige, 16, wf.points[16])
  const c = vp.worldToCanvas(anz)
  return { ok: true, grad: d.ergebnis.schnitte[0].grad, x: r.left + c[0], y: r.top + c[1], gesp: wf.points[16] }
})

await page.evaluate(() => {
  const k = window.__stores.knee.getState()
  k.setLabelOffset(k.measurements[0].id, { x: -350, y: -500 })
})
await page.waitForTimeout(300)
const z0 = await zustand()
ok(z0.ok, `Ausgangsplanung gueltig (Korrektur ${z0.grad?.toFixed(2)}°)`)
await page.mouse.move(z0.x, z0.y)
await page.mouse.down()
let maxAbw = 0
for (let i = 1; i <= 10; i++) {
  const cx = z0.x + i * 2, cy = z0.y + i
  await page.mouse.move(cx, cy)
  await page.waitForTimeout(40)
  const zi = await zustand()
  maxAbw = Math.max(maxAbw, Math.hypot(zi.x - cx, zi.y - cy))
}
ok(maxAbw < 1.5, `Waehrend des Ziehens folgt der angezeigte Punkt dem Cursor (max. Abweichung ${maxAbw.toFixed(2)} px)`)
await page.mouse.up()
await page.waitForTimeout(300)
const z1 = await zustand()
ok(z1.ok, `Nach dem Loslassen gueltig neu geloest (Korrektur ${z1.grad?.toFixed(2)}°)`)
ok(Math.abs(z1.grad - z0.grad) < 5, `Korrektur aendert sich plausibel (${z0.grad.toFixed(2)}° -> ${z1.grad.toFixed(2)}°)`)
const bewegt = Math.hypot(z1.gesp[0] - z0.gesp[0], z1.gesp[1] - z0.gesp[1])
ok(bewegt > 1 && bewegt < 60, `Gespeichertes Sprunggelenk bewegt sich moderat (${bewegt.toFixed(1)} mm)`)

// Kein Dauer-Neuzeichnen im Leerlauf
const renders = await page.evaluate(async () => {
  const { getViewport } = await import('/src/lib/cornerstone/viewer.ts')
  let n = 0; const el = getViewport().element
  const h = () => n++
  el.addEventListener('CORNERSTONE_IMAGE_RENDERED', h)
  await new Promise((r) => setTimeout(r, 2000))
  el.removeEventListener('CORNERSTONE_IMAGE_RENDERED', h)
  return n
})
ok(renders <= 2, `Kein Render-Kreislauf im Leerlauf (${renders} Renders in 2 s)`)

// DLO: Griffe liegen auf den Keil-Scheitelpunkten (mit und ohne Simulation)
await page.evaluate(async ({ fs, ts }) => {
  const o = await import('/src/state/kneeOsteotomieStore.ts')
  const st = o.useKneeOsteotomieStore
  st.getState().setTyp('dlo')
  st.getState().verschiebePunkt('femurScharnier', fs[0])
  st.getState().verschiebePunkt('femurStart', fs[1])
  st.getState().verschiebePunkt('tibiaScharnier', ts[0])
  st.getState().verschiebePunkt('tibiaStart', ts[1])
  st.getState().setDloZielLdfa(88)
}, { fs: [T(-30, 360), T(36, 385)], ts: [T(30, 445), T(-36, 470)] })
for (const sim of [true, false]) {
  await page.evaluate(async (sim) => {
    const o = await import('/src/state/kneeOsteotomieStore.ts')
    o.useKneeOsteotomieStore.getState().setBildSimulation(sim)
  }, sim)
  await page.waitForTimeout(400)
  const r = await page.evaluate(() => {
    const griffe = [...document.querySelectorAll('circle[r="7"]')].map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')])
    const starts = [...document.querySelectorAll('circle[r="5"][fill="#ef4444"]')].map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')])
    const keile = [...document.querySelectorAll('polygon')].filter((p) => /rgba\((56,189,248|244,63,94)/.test(p.getAttribute('fill') || ''))
      .map((p) => p.getAttribute('points').split(' ').map((q) => q.split(',').map(Number)))
    return { griffe, starts, keile }
  })
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
  const abst = r.keile.map((k) => Math.min(...r.griffe.map((g) => d(g, k[0]))))
  const abstS = r.keile.map((k) => Math.min(...r.starts.map((g) => d(g, k[1]))))
  ok(r.keile.length === 2 && Math.max(...abst, ...abstS) < 0.5,
    `DLO ${sim ? 'mit' : 'ohne'} Simulation: Griffe auf den Keil-Ecken (Scharnier ${abst.map((x) => x.toFixed(2)).join('/')} px, Start ${abstS.map((x) => x.toFixed(2)).join('/')} px)`)
  }

// Ohne sichtbare Vollvermessung: Verwerfen moeglich
await page.evaluate(() => {
  const k = window.__stores.knee.getState()
  k.setVisible(k.measurements[0].id, false)
})
await page.waitForTimeout(300)
const knopf = page.getByRole('button', { name: 'Planung verwerfen' })
ok(await knopf.isVisible(), '„Planung verwerfen" ohne sichtbare Vollvermessung vorhanden')
await knopf.click()
const planDanach = await page.evaluate(async () => (await import('/src/state/kneeOsteotomieStore.ts')).useKneeOsteotomieStore.getState().plan)
ok(planDanach === null, 'Plan ist danach verworfen')

await b.close()
console.log(fehler.length ? `\n${fehler.length} FEHLER: ${fehler.join(' | ')}` : '\nAlle Pruefungen bestanden')
process.exit(fehler.length ? 1 : 0)
