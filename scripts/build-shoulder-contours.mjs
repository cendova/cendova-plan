// Batch-Pipeline Schulter: extrahiert aus den Screenshot-Serien
// (Schablonen_Schulter/Schablonen_Felix) maßstabsgetreue Pro-Größe-Konturen.
//
// Unterschiede zur Knie-Pipeline:
//  - Zuordnung Datei→(kind,sizeIndex) kommt aus zuordnung.local.json
//    (Dateinamen tragen keine Semantik; Serien-Reihenfolge = Größen-
//    Reihenfolge, vom Autor bestätigt) — erzeugt von
//    scripts/build-schulter-zuordnung.mjs.
//  - Implantatfarbe ist Cyan (matcht das bestehende Blau-Prädikat), aber
//    die Quell-Software zeichnet einen ROTEN Referenzkreis auf die Kontur:
//    er geht als extraBarrier in die Engine (stopft seine Löcher, zählt
//    nie als Implantat).
//  - Genau EINE Kontur pro Bild (maxComponents 1), kein inlaySplit.
//  - Einige Serien sind GEKIPPT gescreenshottet (Autor-Entscheidung:
//    so belassen) — wMm/hMm sind dann die Maße der gekippten BBox und
//    alle Konturen tragen approx:true.
//
// Validierung je Serie: Breiten-/Höhen-Monotonie (deckt Vertauschungen in
// der Zuordnung auf) + Sichtprüfung über Preview-SVGs (previews/).
//
// Aufruf: node scripts/build-shoulder-contours.mjs
// Output: Schablonen_Schulter/schulter-konturen.local.json + previews/*.svg
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { extractContour } from './lib/knee-contour-extract.mjs'
import { veredleSchablone } from './lib/schablonen-veredelung.mjs'
import { silhouettenKontur, entferneHilfslinien } from './lib/schablonen-silhouette.mjs'

/**
 * Soll-Ausdehnung der Zeichnung (mm) direkt aus der Cyan-Maske, ohne
 * die langen dünnen Hilfsachsen. Dient als unabhängiger PRÜFMASSSTAB
 * für die Kontur-Extraktion: liefert sie deutlich weniger, hat die
 * Innenfüllung durch eine offene Umrisslinie geleckt.
 */
async function zeichnungsMasse(pfad, mmPerPx) {
  const img = await loadImage(pfad)
  const W = img.width, H = img.height
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, W, H)
  const maske = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    if (Math.min(g, b) - r >= 128) maske[i] = 1
  }
  // Hilfslinien (auch diagonale) raus, dann die reine Zeichnungs-BBox.
  entferneHilfslinien(maske, W, H)
  let mnX = W, mxX = 0, mnY = H, mxY = 0
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (maske[y * W + x]) {
        if (x < mnX) mnX = x
        if (x > mxX) mxX = x
        if (y < mnY) mnY = y
        if (y > mxY) mxY = y
      }
  if (mxX <= mnX) return null
  return { wMm: (mxX - mnX + 1) * mmPerPx, hMm: (mxY - mnY + 1) * mmPerPx }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASIS = join(ROOT, 'Schablonen_Schulter')
const PREVIEWS = join(BASIS, 'previews')
const BILDER = join(BASIS, 'bilder')
mkdirSync(PREVIEWS, { recursive: true })
mkdirSync(BILDER, { recursive: true })


const { kugelMm, eintraege } = JSON.parse(
  readFileSync(join(BASIS, 'zuordnung.local.json'), 'utf8'),
)

// Roter Referenzkreis (satt) + antialiaste Ränder (gedämpft).
const isRed = (r, g, b) => r > 110 && r - g > 50 && r - b > 50

const konturen = {}
const bilder = {}
const messungen = []
let fehler = 0
let silhouetten = 0

// Zwei Chaikin-Pässe glätten die Zickzack-Ecken der Normalen-Korrektur —
// der Vektor-Fallback soll makellos aussehen (Autor-Feedback nach dem
// ersten Klick-Test). Das Bild-Overlay ist davon unabhängig pixelscharf.
const OPTS = { maxComponents: 1, extraBarrier: isRed, chaikinPasses: 2 }

// Serien, deren Zeichnung aus MEHREREN getrennten Teilen besteht
// (Medacta-Glenosphäre im Profil: Kalotte + abgesetzte Rückplatte).
// Dort greift maxComponents:1 nur das größte Teil — die Kontur wäre
// unvollständig. Zwei Komponenten holen und die BBox vereinen.
const MEHRTEILIG = new Set(['medacta-rev-glenosphere'])

for (const e of eintraege) {
  const pfad = join(BASIS, e.dir, e.file)
  try {
    const opts = MEHRTEILIG.has(e.kind) ? { ...OPTS, maxComponents: 2 } : OPTS
    let res = await extractContour(pfad, kugelMm, opts)
    if (res.contours.length === 0) {
      // Sehr dünne/kleine Formen (flache Kalotten in kleinen Screenshots)
      // fallen unter die Knie-Standardschwellen — zweiter Versuch mit
      // kleinerem Opening und niedrigerer Mindest-Pixelzahl.
      res = await extractContour(pfad, kugelMm, {
        ...opts,
        openRadius: 1,
        minBlueArea: 200,
      })
    }
    // Selbstprüfung gegen die Zeichnung: deckt die Kontur weniger als
    // 60 % der Ausdehnung ab, ist die Umrisslinie OFFEN und die Innen-
    // Flutung ausgelaufen (Befund: 16 Liner-Größen und zwei Stems
    // lieferten immer dasselbe kleine geschlossene Detail). Dann greift
    // der morphologische Silhouetten-Weg (lib/schablonen-silhouette.mjs).
    const soll = await zeichnungsMasse(pfad, res.mmPerPx)
    let silhouette = null
    if (soll) {
      const k = res.contours[0]
      if (!k || k.wMm < 0.6 * soll.wMm || k.hMm < 0.6 * soll.hMm) {
        silhouette = await silhouettenKontur(pfad, res.mmPerPx, { chaikinPasses: 2 })
        if (silhouette) silhouetten++
      }
    }
    if (res.contours.length === 0 && !silhouette) throw new Error('keine Kontur gefunden')
    const c = res.contours[0]
    const key = `${e.kind}|AP|${e.sizeIndex}`
    // Mehrteilige Zeichnungen: Punkte aller Teile in EINEN gemeinsamen
    // Rahmen umrechnen (die Engine normiert jede Kontur einzeln auf
    // [-1,1]) — der Vektor-Fallback zeigt sonst nur ein Teil.
    let wMm = c?.wMm, hMm = c?.hMm, points = c?.normPoints
    if (silhouette) {
      wMm = silhouette.wMm
      hMm = silhouette.hMm
      points = silhouette.normPoints
    } else if (res.contours.length > 1) {
      const rahmen = res.contours.map((k) => ({
        x0: k.rawPoly.reduce((m, p) => Math.min(m, p.x), Infinity),
        y0: k.rawPoly.reduce((m, p) => Math.min(m, p.y), Infinity),
        x1: k.rawPoly.reduce((m, p) => Math.max(m, p.x), -Infinity),
        y1: k.rawPoly.reduce((m, p) => Math.max(m, p.y), -Infinity),
      }))
      const gX0 = Math.min(...rahmen.map((r) => r.x0))
      const gY0 = Math.min(...rahmen.map((r) => r.y0))
      const gX1 = Math.max(...rahmen.map((r) => r.x1))
      const gY1 = Math.max(...rahmen.map((r) => r.y1))
      wMm = (gX1 - gX0) * res.mmPerPx
      hMm = (gY1 - gY0) * res.mmPerPx
      // Größtes Teil führt; die weiteren als getrennte Ringe anhängen
      // (die Overlay-Komponente zeichnet ein einzelnes Polygon — daher
      // Rückkehr zum Startpunkt, damit kein Verbindungsstrich entsteht).
      points = res.contours.flatMap((k) => {
        const norm = k.rawPoly.map((p) => ({
          x: +(((p.x - gX0) / (gX1 - gX0)) * 2 - 1).toFixed(4),
          y: +(((p.y - gY0) / (gY1 - gY0)) * 2 - 1).toFixed(4),
        }))
        return [...norm, norm[0]]
      })
    }
    konturen[key] = {
      wMm: +wMm.toFixed(2),
      hMm: +hMm.toFixed(2),
      points,
      approx: true, // Kugel-kalibriert (±2 %), ohne Hersteller-Soll-Snap
    }
    // Bild-Overlay VEREDELN (Original-Treue): Subpixel-Resampling der
    // weichen Maske auf Hüft-Auflösung + sanfte Breitenangleichung via
    // Distanzfeld. Begründung + verworfene Ansätze: lib/schablonen-veredelung.mjs.
    //
    // Qualitäts-Gate: Bilder nur aus Quellen mit ≥ 6 px/mm (Knie-Referenz
    // 6–8,5). Seit der Neuaufnahme vom 03.08. (8,16 px/mm) erfüllen ALLE
    // Serien das Gate; das Gate bleibt als Schutz für künftige Nachträge.
    const pxProMm = 1 / res.mmPerPx
    if (pxProMm >= 6) {
      const bildDatei = `${e.kind}_${String(e.sizeIndex).padStart(2, '0')}.png`
      const bild = await veredleSchablone(pfad, res.mmPerPx)
      writeFileSync(join(BILDER, bildDatei), bild.png)
      bilder[key] = {
        file: `bilder/${bildDatei}`,
        widthPx: bild.widthPx,
        heightPx: bild.heightPx,
        mmPerPx: bild.mmPerPx,
      }
    }
    messungen.push({
      key,
      file: e.file,
      sizeLabel: e.sizeLabel,
      wMm: +wMm.toFixed(1),
      hMm: +hMm.toFixed(1),
      punkte: points.length,
      kugelPx: +res.ballDiaPx.toFixed(1),
    })
    // Preview-SVG: Kontur in mm-Koordinaten + Maßangabe.
    const pts = points
      .map((p) => `${((p.x + 1) * wMm / 2).toFixed(1)},${((p.y + 1) * hMm / 2).toFixed(1)}`)
      .join(' ')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -8 ${wMm + 10} ${hMm + 14}" width="${(wMm + 10) * 4}">
<text x="0" y="-2" font-size="4" fill="#888">${e.kind} · ${e.sizeLabel} · ${wMm.toFixed(1)}×${hMm.toFixed(1)} mm · Kugel ${res.ballDiaPx.toFixed(1)}px</text>
<polygon points="${pts}" fill="none" stroke="#0af" stroke-width="0.4"/>
<rect x="0" y="0" width="${wMm}" height="${hMm}" fill="none" stroke="#333" stroke-width="0.15" stroke-dasharray="1 1"/>
</svg>`
    writeFileSync(join(PREVIEWS, `${e.kind}_${String(e.sizeIndex).padStart(2, '0')}.svg`), svg)
  } catch (err) {
    fehler++
    console.error(`FEHLER ${e.file} (${e.kind}#${e.sizeIndex}): ${err.message}`)
  }
}

// --- Serien-Plausibilität: Ausreißer gegen den Serien-Median ---
// Letzte Sicherung gegen still fehlgeschlagene Extraktionen (offene
// Umrisslinien, angeschnittene Ansichten). Größen einer Familie liegen
// dicht beieinander; wer massiv abweicht, ist kein Implantat, sondern
// ein Detail oder eine mitgemessene Hilfslinie.
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const unsicher = []
for (const kind of [...new Set(messungen.map((m) => m.key.split('|')[0]))]) {
  const serie = messungen.filter((m) => m.key.startsWith(kind + '|'))
  if (serie.length < 3) continue
  const mw = median(serie.map((m) => m.wMm)), mh = median(serie.map((m) => m.hMm))
  for (const m of serie) {
    const abw = Math.max(Math.abs(m.wMm - mw) / mw, Math.abs(m.hMm - mh) / mh)
    if (abw > 0.45) unsicher.push({ ...m, mw, mh, abw })
  }
}

// --- Monotonie-Report je kind (Breite/Höhe sollten mit sizeIndex wachsen,
// bei Kombi-Serien blockweise) ---
console.log(`\n${messungen.length} Konturen extrahiert, ${fehler} Fehler\n`)
const kinds = [...new Set(messungen.map((m) => m.key.split('|')[0]))]
for (const kind of kinds) {
  const serie = messungen.filter((m) => m.key.startsWith(kind + '|'))
  console.log(`── ${kind}`)
  let prevW = 0
  for (const m of serie) {
    const warnung = m.wMm + 0.3 < prevW ? '  ⚠ Breite fällt' : ''
    console.log(
      `   ${m.sizeLabel.padEnd(10)} ${String(m.wMm).padStart(6)}×${String(m.hMm).padEnd(6)} mm  (${m.punkte} Pkt)${warnung}`,
    )
    prevW = m.wMm
  }
}

writeFileSync(
  join(BASIS, 'schulter-konturen.local.json'),
  JSON.stringify({ kugelMm, konturen, bilder }, null, 1),
)
console.log(`\n-> ${join(BASIS, 'schulter-konturen.local.json')}`)
console.log(`-> Bild-Overlays: ${BILDER} (${Object.keys(bilder).length})`)
console.log(`-> Previews: ${PREVIEWS}`)
console.log(`-> Silhouetten-Fallback benutzt: ${silhouetten}`)
if (unsicher.length) {
  console.log(`
⚠ ${unsicher.length} Vektor-Kontur(en) weichen stark vom Serien-Median ab`)
  console.log('  (Bild-Overlay ist davon unberührt — es kommt direkt aus der Maske):')
  for (const u of unsicher)
    console.log(
      `   ${u.key.padEnd(38)} ${u.wMm}×${u.hMm} mm  vs. Median ${u.mw}×${u.mh}`,
    )
} else {
  console.log('-> Serien-Plausibilität: alle Konturen im Rahmen')
}