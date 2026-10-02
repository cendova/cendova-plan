// Website-Screenshots aus frei lizenzierten Lehraufnahmen (cendova.de + README).
//
// Erzeugt reproduzierbar:
//   knie-vollvermessung.png          Hero: ganzes Fenster, Vollvermessung (Demo-Ganzbein)
//   knie-vollvermessung-kachel.png   4:3-Kachel derselben Szene
//   knie-beinachse-kachel.png        4:3-Kachel, Kniezoom + Ergebnisspalte (Beinachse, CPAK)
//   knie-osteotomie-kachel.png       4:3-Kachel, öffnende HTO auf dem CC-BY-Ganzbein (Varus,
//                                    Gelenkspalt erhalten — hole-ganzbein-varus.mjs)
//   huefte-beinlaengen-kachel.png    4:3-Kachel, Beinlängen-Bilanz (Demo-Becken)
//   schulter-csa-kachel.png          4:3-Kachel, CSA (Demo-Schulter, Grashey)
//
// „Kachel" = Viewport + rechte Ergebnisspalte ohne linke Werkzeugleiste, exakt 4:3,
// damit die Website-Kacheln (aspect-ratio 4/3, object-fit cover) nichts abschneiden.
// Dafür wird die Fensterbreite so gewählt, dass Viewport+Spalte genau 4:3 ergeben.
//
// Landmarken (Welt-mm): landmarken-ganzbein.json (Demo-Ganzbein, Hellerhoff) und
// landmarken-ganzbein-varus.json (CC-BY-Ganzbein, Stotter 2023; linkes Bein = rechts
// im Bild, medial = kleinere x). Quellen: public/sample/LIESMICH.txt,
// docs/screenshots/QUELLEN.md.
//
// Aufruf:  npm run dev   (zweites Terminal)
//          node scripts/website-screenshots/hole-ganzbein-varus.mjs   (einmalig)
//          node scripts/website-screenshots/erzeuge.mjs [zielordner] [ganzbein-varus.dcm]
// Ausgabe: PNG im Zielordner (Standard: .test-artifacts/website).
// Weiterverarbeitung (JPEG, Breite) siehe konvertiere.mjs daneben.
import { chromium } from 'playwright-core'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HIER = dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? join(HIER, '..', '..', '.test-artifacts', 'website')
const VARUS_DCM = process.argv[3] ?? join(OUT, 'quelle', 'ganzbein-varus.dcm')
mkdirSync(OUT, { recursive: true })
if (!existsSync(VARUS_DCM)) {
  console.error(`Fehlt: ${VARUS_DCM} — zuerst hole-ganzbein-varus.mjs ausführen.`)
  process.exit(1)
}
const P_DEMO = JSON.parse(readFileSync(join(HIER, 'landmarken-ganzbein.json'), 'utf8'))
const P_VARUS = JSON.parse(readFileSync(join(HIER, 'landmarken-ganzbein-varus.json'), 'utf8'))
// Öffnende HTO auf dem CC-BY-Ganzbein (Welt-mm): Scharnier lateral auf Höhe der
// Oberkante des proximalen Tibiofibulargelenks, ~10 mm von der lateralen Kortikalis
// (ESSKA); Startpunkt an der medialen Kortikalis ~40 mm unter dem medialen
// Gelenkspalt. Ziel 55 % statt Fujisawa 62,5 %: milder Varus (3,4°) bei
// erhaltenem Gelenkspalt — moderates Ziel, Überkorrektur vermeiden.
const HTO = { scharnier: [321.0, 722.0, 0], start: [265.1, 730.4, 0], ziel: 55 }
// Nur einzelne Szenen erzeugen: SZENEN=hto,schulter node …/erzeuge.mjs
const NUR = process.env.SZENEN?.split(',').map((s) => s.trim())
const szene = (name) => !NUR || NUR.includes(name)
const FENSTER = { width: 1600, height: 1070 }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

async function seite(bsp, dpr = 2) {
  const page = await (await b.newContext({ viewport: FENSTER, deviceScaleFactor: dpr })).newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(`http://127.0.0.1:5173/${bsp ? `?beispiel=${bsp}` : ''}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__stores?.knee, null, { timeout: 30000 })
  await page.waitForTimeout(bsp ? 3500 : 800)
  return page
}
async function ladeDicom(page, pfad, modus) {
  await page.evaluate((m) => window.__stores.viewer.getState().setPlanningMode(m), modus)
  const input = page.locator('input[type="file"][accept*=".dcm"]')
  await input.waitFor({ state: 'attached', timeout: 30000 })
  await input.setInputFiles(pfad)
  await page.waitForFunction(() => /geladen/.test(window.__stores.viewer.getState().status), null, { timeout: 60000 })
  await page.waitForTimeout(2500)
}
async function kamera(page, fx, fy, ps) {
  await page.evaluate(async ([fx, fy, ps]) => {
    const { getViewport } = await import('/src/lib/cornerstone/viewer.ts')
    const vp = getViewport(); const cam = vp.getCamera()
    const d = [fx - cam.focalPoint[0], fy - cam.focalPoint[1]]
    vp.setCamera({ ...cam, parallelScale: ps, focalPoint: [fx, fy, cam.focalPoint[2]], position: [cam.position[0] + d[0], cam.position[1] + d[1], cam.position[2]] })
    vp.render()
  }, [fx, fy, ps])
  await page.waitForTimeout(500)
}
// Lage von Viewport und rechter Spalte (CSS-px) — Grundlage des Kachel-Ausschnitts.
async function layout(page) {
  return page.evaluate(() => {
    const v = document.querySelector('#viewport-capture-root').getBoundingClientRect()
    const as = document.querySelectorAll('aside'); const a = as[as.length - 1].getBoundingClientRect()
    return { x: v.left, y: v.top, h: Math.round(v.height), w: Math.round(a.right - v.left), viewportBreite: v.width }
  })
}
// Fensterbreite so setzen, dass Viewport + Spalte exakt 4:3 ergeben.
async function vierZuDrei(page) {
  const l = await layout(page)
  const soll = Math.round((4 / 3) * l.h)
  const vp = page.viewportSize()
  await page.setViewportSize({ width: vp.width + (soll - l.w), height: vp.height })
  await page.waitForTimeout(900)
  const n = await layout(page)
  if (Math.abs(n.w / n.h - 4 / 3) > 0.002) throw new Error(`Kachel nicht 4:3: ${JSON.stringify(n)}`)
  return n
}
async function kachel(page, name) {
  const l = await layout(page)
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: l.x, y: l.y, width: l.w, height: l.h } })
  console.log(name, `${l.w}x${l.h} CSS-px`)
}
async function knieVermessen(page, P, labelOffset) {
  await page.evaluate(async ([P, off]) => {
    const v = await import('/src/lib/cornerstone/viewer.ts')
    v.applyMagnificationOnlyCalibration(1.0)
    const { knee } = window.__stores
    knee.getState().reset()
    knee.getState().toggleTool('workflow')
    P.forEach(([x, y]) => knee.getState().addDraftPoint([x, y, 0]))
    const m = knee.getState().measurements[0]
    knee.getState().setLabelOffset(m.id, off)
  }, [P, labelOffset])
  await page.waitForTimeout(800)
}
const aside = (page) => page.locator('aside').last()
const zeilen = (txt, re) => txt.split('\n').filter((l) => re.test(l)).join(' | ')

// ---------- Knie: Hero + Kacheln Vollvermessung / Beinachse ----------
if (szene('knie')) {
  const page = await seite('knie')
  await knieVermessen(page, P_DEMO, { x: -215, y: -70 })
  const info = await page.evaluate(async () => {
    const { getViewport } = await import('/src/lib/cornerstone/viewer.ts')
    const vp = getViewport(); const r = vp.canvas.getBoundingClientRect()
    const { knee } = window.__stores
    const m = knee.getState().measurements[0]
    const { computeWorkflowRaw } = await import('/src/lib/knee/recipes.ts')
    const raw = computeWorkflowRaw(m.points, 1)
    const c = (p) => { const q = vp.worldToCanvas(p); return [Math.round((r.left + q[0]) * 2), Math.round((r.top + q[1]) * 2)] }
    return { hip: c(raw.hip), knee: c(m.points[11]), ankle: c(m.points[16]), mHKA: raw.mHKA, dev: raw.hkaDeviationSigned, mLDFA: raw.mLDFA, mMPTA: raw.mMPTA, JLCA: raw.JLCA }
  })
  console.log('HERO (Overlay-Koordinaten im 3200x2140-Bild):', JSON.stringify(info))
  await page.screenshot({ path: `${OUT}/knie-vollvermessung.png` })
  console.log('KNIE', zeilen(await aside(page).innerText(), /^(mHKA|Traglinie|mLDFA|mMPTA|JLCA|aHKA|JLO|\d)/))
  await vierZuDrei(page)
  await kachel(page, 'knie-vollvermessung-kachel')
  // Kniezoom: Tangenten, Kniezentrum und Ergebnisspalte (Beinachse + CPAK) in einem Bild
  const [kx, ky] = P_DEMO[11]
  await page.evaluate(() => { const { knee } = window.__stores; const m = knee.getState().measurements[0]; knee.getState().setLabelOffset(m.id, { x: -150, y: -175 }) })
  await kamera(page, kx, ky + 6, 82)
  await kachel(page, 'knie-beinachse-kachel')
  await page.context().close()
}
// ---------- Knie: öffnende HTO auf dem CC-BY-Ganzbein ----------
if (szene('hto')) {
  const page = await seite(null)
  await ladeDicom(page, VARUS_DCM, 'knee')
  await vierZuDrei(page)
  await knieVermessen(page, P_VARUS, { x: 120, y: -58 })
  console.log('VARUS vorher', zeilen(await aside(page).innerText(), /^(mHKA|Traglinie|mLDFA|mMPTA|JLCA|Typ|aHKA|JLO|\d)/))
  await page.evaluate(async (H) => {
    const o = await import('/src/state/kneeOsteotomieStore.ts')
    o.useKneeOsteotomieStore.getState().starte('htoOeffnend', H.ziel)
    o.useKneeOsteotomieStore.getState().setzePunkt(H.scharnier)
    o.useKneeOsteotomieStore.getState().setzePunkt(H.start)
  }, HTO)
  await page.waitForTimeout(700)
  // Ausschnitt: Kniegelenk bis ~7 cm unter den Schnitt. Die Bildsimulation
  // dreht ein Polygon (Schnittlinie ± 60 % Plateaubreite); dessen seitliche
  // Ränder (≈ 213 mm und ≈ 373 mm) bleiben knapp außerhalb des Bildes, ebenso
  // Lineal und Gegenbein — so ist keine Nahtkante zu sehen.
  const [, ky] = P_VARUS[11]
  await kamera(page, 290, ky + 52, 72)
  console.log('HTO', zeilen(await aside(page).innerText(), /Osteotomie|Korrektur|Öffnung|Keil|Schnitt|Scharnier|Beinlänge|geplant|mHKA|Traglinie|mMPTA|mLDFA|Typ|Ziel|°|mm|%/))
  await kachel(page, 'knie-osteotomie-kachel')
  if (process.env.DEBUG) await page.screenshot({ path: `${OUT}/debug-hto-fenster.png` })
  await page.context().close()
}
// ---------- Hüfte: Beinlängen ----------
if (szene('huefte')) {
  const page = await seite('huefte')
  await vierZuDrei(page)
  await page.evaluate(async () => {
    const v = await import('/src/lib/cornerstone/viewer.ts')
    v.applyMagnificationOnlyCalibration(1.12)
    const { hip } = window.__stores
    hip.getState().reset()
    hip.getState().toggleTool('lld')
    ;[[24.3, 126.3, 0], [361.6, 122.8, 0], [12.7, 232.7, 0], [387, 220.5, 0]].forEach((p) => hip.getState().addDraftPoint(p))
  })
  await page.waitForTimeout(800)
  console.log('HUEFTE', zeilen(await aside(page).innerText(), /TM|Differenz|cm/))
  await kachel(page, 'huefte-beinlaengen-kachel')
  await page.context().close()
}
// ---------- Schulter: CSA ----------
if (szene('schulter')) {
  const page = await seite('schulter')
  await vierZuDrei(page)
  await page.evaluate(async () => {
    const s = await import('/src/state/shoulderStore.ts')
    const st = s.useShoulderStore.getState()
    st.setSide('R')
    st.toggleTool('csa')
    // Glenoid oben, Glenoid unten, Akromion lateral (Welt-mm, 0,1 mm/px)
    ;[[78.1, 35.2, 0], [84.3, 70.4, 0], [45.0, 27.7, 0]].forEach((p) => s.useShoulderStore.getState().addDraftPoint(p))
  })
  await page.waitForTimeout(800)
  console.log('SCHULTER', zeilen(await aside(page).innerText(), /CSA|Beurteilung|Norm/))
  await kamera(page, 66, 62, 58)
  await kachel(page, 'schulter-csa-kachel')
  if (process.env.DEBUG) { await kamera(page, 72, 50, 28); await page.locator('#viewport-capture-root').screenshot({ path: `${OUT}/debug-schulter-glenoid.png` }) }
  await page.context().close()
}
await b.close()
