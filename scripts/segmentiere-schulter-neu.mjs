// Segmentierungs-ENTWURF für die neuen Schulter-Screenshots (03.08.):
// Blöcke aus Label-Positionen (jedes UI-Panel schließt seine Serie ab)
// + BBox-Sprüngen innerhalb von Blöcken. Reine Analyse — baut nichts.
// Aufruf: node scripts/segmentiere-schulter-neu.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASIS = 'Schablonen_Schulter'
const inv = JSON.parse(readFileSync(join(BASIS, 'inventar-neu.local.json'), 'utf8'))

// Die 16 Label-Panels, per Sichtung identifiziert (Serienname der
// Quell-Software). Mehrfach-Labels direkt hintereinander = Scroll-
// Ansichten desselben Panels.
const LABELS = {
  222420: 'Medacta Reverse Shoulder Glenoid Baseplate (Ø22/24.5/27 × L15/25/35 × Pegged/Threaded)',
  222559: 'Medacta Reverse Shoulder Glenosphere (Baseplate-Kombi × Ø32/36/39/42)',
  223029: 'Medacta Anatomic Shoulder Short Humeral Stem (Met 128/135/142 × Size)',
  223258: 'Medacta Anatomic Shoulder Humeral Head (Ø40–58)',
  223302: 'Medacta Anatomic Shoulder Humeral Head (Ø40–58)',
  223420: 'Medacta Anatomic Shoulder Pegged Glenoid (Ø40–58)',
  223425: 'Medacta Anatomic Shoulder Pegged Glenoid (Ø40–58)',
  223600: 'Medacta Reverse Short Humeral Stem? (Met 0/9 × Size 6–16; Titel abgeschnitten)',
  223604: 'Medacta Reverse Short Humeral Stem? (Met 0/9 × Size 9–16; Titel abgeschnitten)',
  223741: 'Medacta Reverse Shoulder Standard Humeral Stem (Met 0/9 × Size 6–16 × Cem/Cementless)',
  223747: 'Medacta Reverse Shoulder Standard Humeral Stem (Scroll?)',
  224013: 'Medacta Reverse Shoulder Humeral HCPE Liner (Ø32–42 × H 0/3/6 × 145/155)',
  224116: 'Affinis Glenoid (Size 1–4)',
  224149: 'Affinis Glenoid vitamys Cemented (Size 1–4)',
  224220: 'Affinis Glenoid vitamys Uncemented (Size 1–4)',
  224335: 'Affinis Short Stem (Size 1–6)',
  224430: 'Affinis Short Head (39/13/1 … 53/20/4, 8 Größen)',
}

const zeit = (f) => f.match(/(\d{6})\.png$/)[1]
const sortiert = [...inv].sort((a, b) => zeit(a.f).localeCompare(zeit(b.f)))

// Blöcke: fortlaufende Kontur-Dateien; ein Label (oder Labelfolge)
// schließt den aktuellen Block.
const blöcke = []
let aktuell = null
for (const z of sortiert) {
  const t = zeit(z.f)
  const istLabel = LABELS[t] !== undefined
  if (istLabel) {
    if (aktuell) {
      aktuell.label = aktuell.label ?? LABELS[t]
      blöcke.push(aktuell)
      aktuell = null
    } else if (blöcke.length) {
      // Folge-Label (Scroll-Ansicht) desselben Panels — ignorieren.
    }
    continue
  }
  if (!z.ok || !z.wMm) {
    ;(aktuell ??= { dateien: [] }).dateien.push({ ...z, hinweis: 'FEHLER/keine Kontur' })
    continue
  }
  ;(aktuell ??= { dateien: [] }).dateien.push(z)
}
if (aktuell) blöcke.push(aktuell)

// Innerhalb eines Blocks: Teilblöcke bei BBox-Rücksprung (> 15 %
// kleiner in Breite UND Höhe = neue Untergruppe, z. B. Met-Wechsel).
for (const b of blöcke) {
  let teil = 1
  let vorher = null
  for (const d of b.dateien) {
    if (!d.wMm) { d.teil = teil; continue }
    if (vorher && d.wMm < vorher.wMm * 0.85 && d.hMm < vorher.hMm * 0.85) teil++
    d.teil = teil
    vorher = d
  }
  b.teile = teil
}

let bericht = ''
for (let i = 0; i < blöcke.length; i++) {
  const b = blöcke[i]
  bericht += `\nBlock ${i + 1}: ${b.label ?? 'OHNE LABEL'}\n`
  bericht += `  ${b.dateien.length} Dateien, ${b.teile} Teilblock/-blöcke\n`
  for (let t = 1; t <= b.teile; t++) {
    const ds = b.dateien.filter((d) => d.teil === t)
    const mit = ds.filter((d) => d.wMm)
    bericht += `  Teil ${t} (${ds.length}): `
    bericht += mit.map((d) => `${d.wMm}×${d.hMm}`).join('  ')
    const kaputt = ds.filter((d) => d.hinweis)
    if (kaputt.length) bericht += `  [${kaputt.length}× FEHLER]`
    bericht += '\n'
  }
}
console.log(bericht)
writeFileSync(join(BASIS, 'segmentierung-entwurf.local.json'), JSON.stringify(blöcke, null, 1))
console.log(`-> ${join(BASIS, 'segmentierung-entwurf.local.json')}`)
