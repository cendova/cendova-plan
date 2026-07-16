// Baut das ADDON-Schablonenpaket (merge:true) mit den DXF-Konturen des
// LEGION Narrow Femoral aus der Konverter-Ausgabe (convert-sn-templates).
//
// Das Addon ergänzt das bestehende Klinik-Paket beim Import (Merge) um
// die Einträge kind|view|sizeIndex mit quelle:'dxf' — dadurch schaltet
// die App die Narrow-Größen in der Auswahl automatisch wieder frei
// (isHiddenKneeSize) und rendert die echten Herstellerkonturen.
//
// Koordinaten-Konvention der App (KNEE_CONTOURS):
//   x,y normiert auf [-1, 1] (Halbbreite/Halbhöhe), y POSITIV nach UNTEN,
//   Trochlea-/Flansch-Spitze zeigt nach -x (kanonische Seite; die App
//   spiegelt je nach R/L). Die DXF-Blätter sind in mm, y nach OBEN und
//   mit Spitze nach +x gezeichnet → beim Konvertieren y-Flip UND x-Flip.
//   Ein Orientierungs-Assert prüft das gegen die Bestandskonvention.
//
// Aufruf:
//   node scripts/sn-dxf/build-addon-package.mjs --konturen <dir> --out <zip>

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { ladeSolldaten } from '../lib/solldaten.mjs'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const KONTUREN = argOf('--konturen', null)
const OUT = argOf('--out', 'cendova-addon-sn-narrow-dxf.zip')
// --narrow-only: nur die LEGION-Narrow-Femora (3N–6N) — die einzige echte
// Lücke ohne Screenshot. Standard-Femur und Tibia bleiben bewusst bei den
// (qualitativ vorzuziehenden) Screenshots (Nutzer-Entscheid).
const NARROW_ONLY = process.argv.includes('--narrow-only')
if (!KONTUREN) {
  console.error('Aufruf: node build-addon-package.mjs --konturen <dir> [--out zip]')
  process.exit(1)
}

// Größen-Label → sizeIndex im LEGION_PS_FEMUR-Katalog des Klinik-Pakets
// (Reihenfolge '2','3N','3','4N','4','5N','5','6N','6','7','8').
const SIZE_INDEX = { '3N': 1, '4N': 3, '5N': 5, '6N': 7 }
// GENESIS-II-Tibia: gezeichnete Größen der Blätter → sizeIndex ('1'..'8').
const TIBIA_SIZE_INDEX = { 1: 0, 3: 2, 5: 4, 7: 6 }
// Soll-Maße (Zeichnung) zur letzten Gegenkontrolle vor dem Packen —
// Herstellerdaten, daher aus scripts/katalog-solldaten.local.json (Sektion
// addonExpect; Struktur siehe katalog-solldaten.beispiel.json). Ohne die
// Datei wird ohne Maß-Gegenkontrolle gepackt (Warnung).
const soll = ladeSolldaten({ skript: 'build-addon-package' })
const EXPECT_W = soll?.addonExpect?.femurW ?? null
const TIBIA_EXPECT_W = soll?.addonExpect?.tibiaW ?? null
if (!EXPECT_W || !TIBIA_EXPECT_W) {
  console.warn(
    '⚠ Keine Solldaten (scripts/katalog-solldaten.local.json, Sektion addonExpect)' +
      ' — Maß-Gegenkontrolle vor dem Packen entfällt.',
  )
}

const kneeContours = {}
const report = []
for (const size of Object.keys(SIZE_INDEX)) {
  for (const view of ['AP', 'lateral']) {
    const file = join(KONTUREN, 'legion-narrow-femoral', `${size}-${view}.json`)
    const src = JSON.parse(readFileSync(file, 'utf8'))
    if (src.loops.length !== 1) {
      console.error(`✗ ${size}-${view}: erwarte genau 1 Loop, gefunden ${src.loops.length}`)
      process.exit(1)
    }
    const pts = src.loops[0].points // mm, y nach oben, Ursprung Mitte
    const wMm = src.widthMm
    const hMm = src.heightMm
    // Normieren + Konvention drehen: x-Flip (Spitze nach -x), y-Flip (y ab).
    const norm = pts.map(([x, y]) => ({
      x: Math.round((-x / (wMm / 2)) * 10000) / 10000,
      y: Math.round((-y / (hMm / 2)) * 10000) / 10000,
    }))
    // Orientierungs-Assert: oberster Punkt (min y) muss links liegen (x<0)
    // — wie in den Bestandskonturen (legion-ps-femur|AP|2: Spitze x≈-0.33).
    const top = norm.reduce((a, b) => (b.y < a.y ? b : a))
    if (top.x >= 0) {
      console.error(`✗ ${size}-${view}: Orientierung unerwartet (Spitze x=${top.x})`)
      process.exit(1)
    }
    // Maß-Gegenkontrolle (nur mit lokalen Solldaten)
    const sollW = EXPECT_W?.[view]?.[size]
    if (sollW !== undefined && Math.abs(wMm - sollW) > 0.8) {
      console.error(`✗ ${size}-${view}: Breite ${wMm} mm weicht von Soll ${sollW} ab`)
      process.exit(1)
    }
    const sizeIndex = SIZE_INDEX[size]
    const entry = {
      wMm,
      hMm,
      points: norm,
      quelle: 'dxf',
    }
    if (view === 'AP') {
      // Resektions-Referenz = distalste Kondylenpunkte je Seite (y-ab-
      // Konvention: distal = größtes y). Für die Resektionslinie + die
      // medial/lateralen Tiefen-Messpunkte im Overlay.
      const left = norm.filter((p) => p.x < 0).reduce((a, b) => (b.y > a.y ? b : a))
      const right = norm.filter((p) => p.x > 0).reduce((a, b) => (b.y > a.y ? b : a))
      if (left.y < 0.5 || right.y < 0.5) {
        console.error(`✗ ${size}-AP: Kondylenpunkte unplausibel (y ${left.y}/${right.y})`)
        process.exit(1)
      }
      entry.resect = { left: [left.x, left.y], right: [right.x, right.y] }
      // Achse (dash-dot Mittellinie) — gleicher x/y-Flip wie die Punkte.
      if (src.axisMm) {
        entry.axis = src.axisMm.map(([x, y]) => [
          Math.round((-x / (wMm / 2)) * 10000) / 10000,
          Math.round((-y / (hMm / 2)) * 10000) / 10000,
        ])
      } else {
        console.error(`✗ ${size}-AP: keine Achse extrahiert`)
        process.exit(1)
      }
      // Schild-Feature-Linien (medial/lateral) — gleicher x/y-Flip.
      if (src.featuresMm && src.featuresMm.length) {
        entry.features = src.featuresMm.map((seg) =>
          seg.map(([x, y]) => [
            Math.round((-x / (wMm / 2)) * 10000) / 10000,
            Math.round((-y / (hMm / 2)) * 10000) / 10000,
          ]),
        )
      }
    }
    kneeContours[`legion-ps-femur|${view}|${sizeIndex}`] = entry
    report.push(`  ✓ Narrow ${size} ${view}: ${wMm} x ${hMm} mm · ${norm.length} Punkte → sizeIndex ${sizeIndex}` +
      (entry.resect ? ' · resect ✓' : ''))
  }
}

// --- GENESIS II Tibia (Größen 1/3/5/7, Profil inkl. 9-mm-Basis-Inlay) ----
for (const size of NARROW_ONLY ? [] : Object.keys(TIBIA_SIZE_INDEX)) {
  for (const view of ['AP', 'lateral']) {
    const file = join(KONTUREN, 'genesis-tibial-g2', `${size}-${view}.json`)
    const src = JSON.parse(readFileSync(file, 'utf8'))
    if (src.loops.length !== 1) {
      console.error(`✗ Tibia ${size}-${view}: erwarte 1 Loop, gefunden ${src.loops.length}`)
      process.exit(1)
    }
    const wMm = src.widthMm
    const hMm = src.heightMm
    const sollW = TIBIA_EXPECT_W?.[view]?.[size]
    if (sollW !== undefined && Math.abs(wMm - sollW) > 1.0) {
      console.error(`✗ Tibia ${size}-${view}: Breite ${wMm} mm ≠ Soll ${sollW}`)
      process.exit(1)
    }
    const norm = src.loops[0].points.map(([x, y]) => ({
      x: Math.round((-x / (wMm / 2)) * 10000) / 10000,
      y: Math.round((-y / (hMm / 2)) * 10000) / 10000,
    }))
    const entry = { wMm, hMm, points: norm, quelle: 'dxf' }
    if (src.inlaySplitYMm !== undefined) {
      // y-Flip: Plattenoberkante liegt oberhalb der Mitte → negativ (y-ab).
      entry.inlaySplitY = Math.round((-src.inlaySplitYMm / (hMm / 2)) * 10000) / 10000
      if (!(entry.inlaySplitY < -0.3 && entry.inlaySplitY > -1)) {
        console.error(`✗ Tibia ${size}-${view}: inlaySplitY unplausibel (${entry.inlaySplitY})`)
        process.exit(1)
      }
    }
    if (view === 'AP' && src.resectMm) {
      const pts = src.resectMm.map(([x, y]) => [
        Math.round((-x / (wMm / 2)) * 10000) / 10000,
        Math.round((-y / (hMm / 2)) * 10000) / 10000,
      ])
      pts.sort((a, b) => a[0] - b[0])
      entry.resect = { left: pts[0], right: pts[1] }
    }
    for (const kind of ['genesis-tibia-female', 'genesis-tibia-male']) {
      kneeContours[`${kind}|${view}|${TIBIA_SIZE_INDEX[size]}`] = entry
    }
    report.push(`  ✓ Tibia ${size} ${view}: ${wMm} x ${hMm} mm · split ${entry.inlaySplitY ?? '—'}` +
      (entry.resect ? ' · resect ✓' : ''))
  }
}

const manifest = {
  format: 'cendova-templates',
  formatVersion: 1,
  name: NARROW_ONLY ? 'S&N LEGION Narrow-Femur (DXF)' : 'S&N DXF (Narrow-Femur + Tibia G2)',
  merge: true,
  kneeContours,
}

const zip = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest, null, 1)) })
writeFileSync(OUT, zip)
console.log('Addon-Paket gebaut:')
console.log(report.join('\n'))
console.log(`→ ${OUT} (${Math.round(zip.length / 1024)} KB, ${Object.keys(kneeContours).length} Konturen, merge:true)`)
