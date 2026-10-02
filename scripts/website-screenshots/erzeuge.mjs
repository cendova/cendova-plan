// Website-Screenshots aus den mitgelieferten Demo-Bildern (cendova.de).
//
// Erzeugt reproduzierbar die Ansichten für die Landing-Page und das README:
// Knie-Vollvermessung (Hero), Ergebnisspalte, Doppel-Level-Osteotomie und die
// Beinlängen-Bilanz — alle auf den frei lizenzierten Lehraufnahmen aus
// public/sample (keine Patientendaten, Quellen: public/sample/LIESMICH.txt).
// Die 17 Landmarken des Ganzbeins liegen in landmarken-ganzbein.json
// (Welt-mm, am Demo-Bild abgenommen); die LLD-Punkte stehen unten im Code.
//
// Aufruf:  npm run dev   (zweites Terminal)
//          node scripts/website-screenshots/erzeuge.mjs [zielordner]
// Ausgabe: PNG/JPEG im Zielordner (Standard: .test-artifacts/website).
// Weiterverarbeitung (JPEG, Breite) siehe konvertiere.mjs daneben.
import { chromium } from 'playwright-core'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HIER = dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? join(HIER, '..', '..', '.test-artifacts', 'website')
mkdirSync(OUT, { recursive: true })
const P = JSON.parse(readFileSync(join(HIER, 'landmarken-ganzbein.json'), 'utf8'))
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

async function seite(bsp, dpr = 2, hoehe = 1070) {
  const page = await (await b.newContext({ viewport: { width: 1600, height: hoehe }, deviceScaleFactor: dpr })).newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(`http://127.0.0.1:5173/?beispiel=${bsp}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__stores?.knee, null, { timeout: 30000 })
  await page.waitForTimeout(3500)
  return page
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
async function knieVermessen(page) {
  await page.evaluate(async (P) => {
    const v = await import('/src/lib/cornerstone/viewer.ts')
    v.applyMagnificationOnlyCalibration(1.0)
    const { knee } = window.__stores
    knee.getState().reset()
    knee.getState().toggleTool('workflow')
    P.forEach(([x, y]) => knee.getState().addDraftPoint([x, y, 0]))
    const m = knee.getState().measurements[0]
    knee.getState().setLabelOffset(m.id, { x: -215, y: -70 })
  }, P)
  await page.waitForTimeout(800)
}
const aside = (page) => page.locator('aside').last()

// ---------- Knie: Hero (Vollvermessung) ----------
{
  const page = await seite('knie')
  await knieVermessen(page)
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
  console.log('HERO', JSON.stringify(info))
  await page.screenshot({ path: `${OUT}/knie-vollvermessung.png` })
  console.log((await aside(page).innerText()).split('\n').slice(0, 40).join(' | '))
  await page.context().close()
}
// ---------- Knie: rechte Spalte (DPR 3) ----------
{
  const page = await seite('knie', 3, 1500)
  await knieVermessen(page)
  const clip = await page.evaluate(() => {
    const as = document.querySelectorAll('aside'); const a = as[as.length - 1]
    const kopf = [...a.querySelectorAll('div')].find((d) => d.textContent.trim() === 'Auswertung')
    const karten = [...a.querySelectorAll('section')]
    const cpak = karten.find((s) => /CPAK-Klassifikation/.test(s.textContent))
    const r0 = kopf.getBoundingClientRect(); const r1 = cpak.getBoundingClientRect(); const ra = a.getBoundingClientRect()
    return { x: ra.left + 1, y: r0.top - 2, width: ra.width - 2, height: r1.bottom - r0.top + 6 }
  })
  await page.screenshot({ path: `${OUT}/knie-beinachse-panel.png`, clip })
  await page.context().close()
}
// ---------- Knie: Umstellungsosteotomie ----------
{
  const page = await seite('knie')
  await knieVermessen(page)
  await page.evaluate(async () => {
    const o = await import('/src/state/kneeOsteotomieStore.ts')
    const st = o.useKneeOsteotomieStore.getState()
    // Doppel-Level (Vorauswahl der App bei femoralem UND tibialem Varus):
    // Femur: Scharnier medial, Start lateral (lateral öffnend, Ziel-mLDFA 88°);
    // Tibia: Scharnier lateral, Start medial (medial öffnend).
    st.starte('dlo', 57.5)
    o.useKneeOsteotomieStore.getState().setDloZielLdfa(86)
    o.useKneeOsteotomieStore.getState().setzePunkt([128, 423, 0])
    o.useKneeOsteotomieStore.getState().setzePunkt([68, 412, 0])
    o.useKneeOsteotomieStore.getState().setzePunkt([66, 478, 0])
    o.useKneeOsteotomieStore.getState().setzePunkt([124, 497, 0])
    const { knee } = window.__stores
    const m = knee.getState().measurements[0]
    knee.getState().setLabelOffset(m.id, { x: -260, y: -140 })
  })
  await page.waitForTimeout(600)
  await kamera(page, 95, 462, 125)
  console.log('OSTEO', (await aside(page).innerText()).split('\n').filter((l) => /Osteotomie|Korrektur|Öffnung|Schnitt|Beinlänge|geplant|mHKA|Traglinie|Typ/.test(l)).join(' | '))
  await page.screenshot({ path: `${OUT}/knie-osteotomie.png` })
  await page.context().close()
}
// ---------- Hüfte: Beinlängen ----------
{
  const page = await seite('huefte')
  await page.evaluate(async () => {
    const v = await import('/src/lib/cornerstone/viewer.ts')
    v.applyMagnificationOnlyCalibration(1.12)
    const { hip } = window.__stores
    hip.getState().reset()
    hip.getState().toggleTool('lld')
    ;[[24.3, 126.3, 0], [361.6, 122.8, 0], [12.7, 232.7, 0], [387, 220.5, 0]].forEach((p) => hip.getState().addDraftPoint(p))
  })
  await page.waitForTimeout(800)
  console.log('HUEFTE', (await aside(page).innerText()).split('\n').filter((l) => /TM|Differenz|cm/.test(l)).join(' | '))
  await page.screenshot({ path: `${OUT}/huefte-beinlaengen.jpg`, type: 'jpeg', quality: 90 })
  await page.context().close()
}
await b.close()
