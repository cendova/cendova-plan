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
import { extractContour } from './lib/knee-contour-extract.mjs'
import { veredleSchablone } from './lib/schablonen-veredelung.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASIS = join(ROOT, 'Schablonen_Schulter')
const DIR = join(BASIS, 'Schablonen_Felix')
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

// Zwei Chaikin-Pässe glätten die Zickzack-Ecken der Normalen-Korrektur —
// der Vektor-Fallback soll makellos aussehen (Autor-Feedback nach dem
// ersten Klick-Test). Das Bild-Overlay ist davon unabhängig pixelscharf.
const OPTS = { maxComponents: 1, extraBarrier: isRed, chaikinPasses: 2 }

for (const e of eintraege) {
  const pfad = join(DIR, e.file)
  try {
    let res = await extractContour(pfad, kugelMm, OPTS)
    if (res.contours.length === 0) {
      // Sehr dünne/kleine Formen (flache Kalotten in kleinen Screenshots)
      // fallen unter die Knie-Standardschwellen — zweiter Versuch mit
      // kleinerem Opening und niedrigerer Mindest-Pixelzahl.
      res = await extractContour(pfad, kugelMm, {
        ...OPTS,
        openRadius: 1,
        minBlueArea: 200,
      })
    }
    if (res.contours.length === 0) throw new Error('keine Kontur gefunden')
    const c = res.contours[0]
    const key = `${e.kind}|AP|${e.sizeIndex}`
    konturen[key] = {
      wMm: +c.wMm.toFixed(2),
      hMm: +c.hMm.toFixed(2),
      points: c.normPoints,
      approx: true, // Kugel-kalibriert (±2 %), ohne Hersteller-Soll-Snap
    }
    // Bild-Overlay VEREDELN (Original-Treue): Subpixel-Resampling der
    // weichen Maske auf Hüft-Auflösung + sanfte Breitenangleichung via
    // Distanzfeld. Begründung + verworfene Ansätze: lib/schablonen-veredelung.mjs.
    //
    // Qualitäts-Gate: Bilder nur aus Quellen mit ≥ 6 px/mm (ReUnion-Serie
    // 7,5–8,4; Knie-Referenz 6–8,5). Gröbere Serien (Affinis/Medacta,
    // 3,4–4,0 px/mm) erreichen die geforderte Qualität physikalisch nicht —
    // sie laufen bis zur Neuaufnahme über den Vektor-Fallback statt mit
    // sichtbar schlechtem Bild ausgeliefert zu werden.
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
      wMm: +c.wMm.toFixed(1),
      hMm: +c.hMm.toFixed(1),
      punkte: c.normPoints.length,
      kugelPx: +res.ballDiaPx.toFixed(1),
    })
    // Preview-SVG: Kontur in mm-Koordinaten + Maßangabe.
    const pts = c.normPoints
      .map((p) => `${((p.x + 1) * c.wMm / 2).toFixed(1)},${((p.y + 1) * c.hMm / 2).toFixed(1)}`)
      .join(' ')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -8 ${c.wMm + 10} ${c.hMm + 14}" width="${(c.wMm + 10) * 4}">
<text x="0" y="-2" font-size="4" fill="#888">${e.kind} · ${e.sizeLabel} · ${c.wMm.toFixed(1)}×${c.hMm.toFixed(1)} mm · Kugel ${res.ballDiaPx.toFixed(1)}px</text>
<polygon points="${pts}" fill="none" stroke="#0af" stroke-width="0.4"/>
<rect x="0" y="0" width="${c.wMm}" height="${c.hMm}" fill="none" stroke="#333" stroke-width="0.15" stroke-dasharray="1 1"/>
</svg>`
    writeFileSync(join(PREVIEWS, `${e.kind}_${String(e.sizeIndex).padStart(2, '0')}.svg`), svg)
  } catch (err) {
    fehler++
    console.error(`FEHLER ${e.file} (${e.kind}#${e.sizeIndex}): ${err.message}`)
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