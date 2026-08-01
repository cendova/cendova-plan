// Erzeugt die Zuordnungstabelle Screenshot → (kind, sizeIndex, sizeLabel)
// für die Schulter-Schablonen aus Schablonen_Schulter/Schablonen_Felix.
//
// Grundlage: die Label-Dialoge der Quell-Software stehen jeweils am ENDE
// einer aufsteigend durchgeklickten Größenserie (vom Autor bestätigt).
// Die Serien-Grenzen sind aus der Katalogisierung bekannt und hier als
// Bereiche (erste/letzte Datei) fixiert — bewusst explizit statt heuristisch,
// damit die Zuordnung reviewbar ist.
//
// Output: Schablonen_Schulter/zuordnung.local.json (gitignored — enthält
// Hersteller-Größenlisten). Mehrdimensionale Serien (Ø × Dicke …) sind als
// geordnete Label-Liste kodiert; die Iterations-Reihenfolge wird später von
// build-shoulder-contours.mjs per Mess-Monotonie verifiziert.
import { readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'Schablonen_Schulter', 'Schablonen_Felix')

const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort()

// Serien: [ersteDatei, letzteDatei, kind, prothese, labels[]]
// labels[] in Klick-Reihenfolge (aufsteigend; bei Kombinationen: äußere
// Dimension zuerst — wird per Messung verifiziert).
const SERIEN = [
  ['121110', '121151', 'affinis-short-stem', 'anatomic',
    ['1', '2', '3', '4', '5', '6']],
  ['121215', '121254', 'affinis-short-head', 'anatomic',
    ['39/13', '41/14', '43/15', '45/16', '47/17', '49/18', '51/19', '53/20']],
  ['121554', '121706', 'medacta-rev-stem-short', 'reverse',
    ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16']],
  ['121747', '121851', 'medacta-rev-stem-standard', 'reverse',
    ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16']],
  ['122005', '122043', 'medacta-rev-liner', 'reverse',
    ['Ø32/145°', 'Ø32/155°', 'Ø36/145°', 'Ø36/155°', 'Ø39/145°', 'Ø39/155°', 'Ø42/145°', 'Ø42/155°']],
  // Reihenfolge MESS-VERIFIZIERT (Höhe≈Ø, Breite≈Peg-Länge): erst alle
  // drei Ø bei L15, dann je Ø die Paare L25/L35.
  ['122138', '122231', 'medacta-rev-baseplate', 'reverse',
    ['Ø22/L15', 'Ø24.5/L15', 'Ø27/L15', 'Ø22/L25', 'Ø22/L35', 'Ø24.5/L25', 'Ø24.5/L35', 'Ø27/L25', 'Ø27/L35']],
  ['122309', '122404', 'medacta-rev-glenosphere', 'reverse',
    ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9']], // Kombis unbestätigt — Autor benennt später
  ['125157', '125212', 'affinis-glenoid', 'anatomic',
    ['1', '2', '3', '4']],
  ['125238', '125254', 'affinis-glenoid-vitamys', 'anatomic',
    ['1', '2', '3', '4']],
  ['235614', '235745', 'reunion-s-stem', 'anatomic',
    ['7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']],
  // Ø36-Paar MESS-VERIFIZIERT vertauscht geklickt (38.6 vor 37.0 mm):
  // beim Ø-Wechsel stand Thickness noch auf 10, dann zurück auf 4.
  ['235859', '235935', 'reunion-rsa-cup', 'reverse',
    ['Ø32/T4', 'Ø32/T10', 'Ø36/T10', 'Ø36/T4', 'Ø40/T4', 'Ø40/T10']],
  ['000053', '000212', 'reunion-rsa-insert', 'reverse',
    ['32/+4', '32/+6', '32/+8', '32/+10', '32/+12', '36/+4', '36/+6', '36/+8', '36/+10', '36/+12', '40/+4', '40/+6', '40/+8', '40/+10', '40/+12']],
  ['000532', '000632', 'reunion-rsa-glenosphere', 'reverse',
    ['Ø32/T2', 'Ø32/T6', 'Ø36/T2', 'Ø36/T6', 'Ø40/T2', 'Ø40/T6']],
]

const zeit = (f) => f.replace(/^Screenshot 2026-(\d\d)-(\d\d) (\d{6})\.png$/, '$1$2$3')
const eintraege = []
for (const [von, bis, kind, prothese, labels] of SERIEN) {
  // Datum aus dem "von"-Kürzel ableiten: Suffix-Match auf die Uhrzeit.
  const inSerie = files.filter((f) => {
    const t = f.match(/ (\d{6})\.png$/)?.[1]
    if (!t) return false
    // Kalenderreihenfolge über den vollen Zeitstempel:
    const full = zeit(f)
    const fVon = zeit(files.find((x) => x.includes(` ${von}.png`)) ?? '')
    const fBis = zeit(files.find((x) => x.includes(` ${bis}.png`)) ?? '')
    return full >= fVon && full <= fBis
  })
  if (inSerie.length !== labels.length) {
    console.error(`FEHLER ${kind}: ${inSerie.length} Dateien, aber ${labels.length} Labels`)
    process.exitCode = 1
  }
  inSerie.forEach((file, i) => {
    eintraege.push({ file, kind, prothese, sizeIndex: i, sizeLabel: labels[i] ?? `?${i}` })
  })
}

const out = join(ROOT, 'Schablonen_Schulter', 'zuordnung.local.json')
writeFileSync(out, JSON.stringify({ kugelMm: 25, eintraege }, null, 1))
console.log(`${eintraege.length} Konturen zugeordnet -> ${out}`)
for (const [, , kind] of SERIEN) {
  const n = eintraege.filter((e) => e.kind === kind).length
  console.log(`  ${kind}: ${n}`)
}