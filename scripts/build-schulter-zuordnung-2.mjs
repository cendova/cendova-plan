// Zuordnung v2: Screenshot → (kind, sizeIndex, sizeLabel) über BEIDE
// Quellordner. ReUnion bleibt aus der Erstlieferung (Schablonen_Felix);
// Affinis/Medacta kommen aus der Neuaufnahme vom 03.08. („Schablonen
// Felix 2…", ReUnion-Zoomstufe, Neutrallage) und ERSETZEN die alten
// Serien. NEU dazu: Medacta-Anatomic-Familie und die vitamys-Varianten.
//
// Grundlage Neuaufnahme: die Label-Panels der Quell-Software (Serienname
// + Größenliste + Auswahl) stehen jeweils am ENDE ihrer Serie — die
// Serien-Identität ist damit dokumentiert, nicht erschlossen. Kombi-
// Reihenfolgen sind aus den Maßen verifiziert (Kommentare je Serie);
// Doppel-Shots werden übersprungen.
//
// Output: Schablonen_Schulter/zuordnung.local.json (gitignored).
import { readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// Ordnernamen der beiden Lieferungen (der Autor legt sie per Drive-Export
// ab; die Erstlieferung hieß zeitweise „Schablonen_Felix").
const ALT = 'Schablonen_Schulter'
const NEU = 'Schablonen Felix 2-20260803T204933Z-1-001'
// Einzel-Nachtrag (per Chat geliefert): ReUnion-RSA-Baseplate, im
// Quell-Dialog nur EIN Typ („Glenoid") ohne Größenliste.
const NACH = 'Nachtrag-Baseplate'

const dateien = {}
for (const dir of [ALT, NEU, NACH])
  dateien[dir] = readdirSync(join(ROOT, 'Schablonen_Schulter', dir))
    .filter((f) => f.endsWith('.png'))
    .sort()

// [dir, vonZeit, bisZeit, kind, prothese, labels[], skipZeiten[]]
const SERIEN = [
  // --- ReUnion (Erstlieferung, unverändert wie verifiziert) ---
  [ALT, '235614', '235745', 'reunion-s-stem', 'anatomic',
    ['7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'], []],
  // Ø36-Paar MESS-VERIFIZIERT vertauscht geklickt (siehe v1).
  [ALT, '235859', '235935', 'reunion-rsa-cup', 'reverse',
    ['Ø32/T4', 'Ø32/T10', 'Ø36/T10', 'Ø36/T4', 'Ø40/T4', 'Ø40/T10'], []],
  [ALT, '000053', '000212', 'reunion-rsa-insert', 'reverse',
    ['32/+4', '32/+6', '32/+8', '32/+10', '32/+12', '36/+4', '36/+6', '36/+8', '36/+10', '36/+12', '40/+4', '40/+6', '40/+8', '40/+10', '40/+12'], []],
  [ALT, '000532', '000632', 'reunion-rsa-glenosphere', 'reverse',
    ['Ø32/T2', 'Ø32/T6', 'Ø36/T2', 'Ø36/T6', 'Ø40/T2', 'Ø40/T6'], []],
  [NACH, '', 'zzz', 'reunion-rsa-baseplate', 'reverse', ['Glenoid'], []],

  // --- Neuaufnahme 03.08. ---
  // Baseplate: MESS-verifiziert (Breite≈Länge, Höhe≈Ø): erst L15×3Ø,
  // dann die vorhandenen L25/L35 (Ø22/L35 und Ø24.5/L25 nicht im
  // Material). Typ laut Panel-Auswahl: Pegged.
  [NEU, '222317', '222410', 'medacta-rev-baseplate', 'reverse',
    ['Ø22/L15', 'Ø24.5/L15', 'Ø27/L15', 'Ø22/L25', 'Ø24.5/L35', 'Ø27/L25', 'Ø27/L35'], []],
  // Glenosphäre (Profilansicht): Kombis aus Maßen — Kalotten-Sehne = Ø
  // (32/36/39/42), Rückplatten-Höhe = Baseplate-Ø (24,5/27 gemessen;
  // P22-Gruppe aus der Klick-Sequenz). Je Baseplate nur kompatible Ø.
  // 222449 und 222520 sind Doppel-Shots (maßidentisch zum Vorgänger).
  [NEU, '222443', '222549', 'medacta-rev-glenosphere', 'reverse',
    ['P22/Ø32', 'P22/Ø36', 'P24.5/Ø36', 'P24.5/Ø39', 'P24.5/Ø42', 'P27/Ø36', 'P27/Ø39', 'P27/Ø42'],
    ['222449', '222520']],
  // Anatomic Short Stem: 3 Metaphysen-Blöcke à 11 Größen, aufsteigend
  // geklickt (Panel-Auswahl endet bei 142/16).
  [NEU, '222640', '223018', 'medacta-anat-stem-short', 'anatomic',
    kombis(['128°', '135°', '142°'], ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16']), []],
  [NEU, '223208', '223251', 'medacta-anat-head', 'anatomic',
    ['Ø40', 'Ø42', 'Ø44', 'Ø46', 'Ø48', 'Ø50', 'Ø52', 'Ø54', 'Ø56', 'Ø58'], []],
  [NEU, '223310', '223415', 'medacta-anat-glenoid', 'anatomic',
    ['Ø40', 'Ø42', 'Ø44', 'Ø46', 'Ø48', 'Ø50', 'Ø52', 'Ø54', 'Ø56', 'Ø58'], []],
  // Reverse Stems: Panel-Auswahl Metaphyse 0, Cementless.
  [NEU, '223446', '223556', 'medacta-rev-stem-short', 'reverse',
    ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'], []],
  [NEU, '223626', '223734', 'medacta-rev-stem-standard', 'reverse',
    ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'], []],
  // HCPE-Liner: zwei Inklinations-Hälften à 12 (Struktur der Aufnahme:
  // je Hälfte 4×H0, dann 4×H3, 4×H6 — wird per Ø-Zyklus-Monotonie im
  // Build gegengeprüft). Panel-Auswahl endet bei Ø42/H6/155°.
  [NEU, '223807', '224008', 'medacta-rev-liner', 'reverse',
    [...linerHälfte('145°'), ...linerHälfte('155°')], []],
  [NEU, '224059', '224112', 'affinis-glenoid', 'anatomic', ['1', '2', '3', '4'], []],
  [NEU, '224133', '224145', 'affinis-glenoid-vitamys', 'anatomic', ['1', '2', '3', '4'], []],
  [NEU, '224200', '224216', 'affinis-glenoid-vitamys-uncemented', 'anatomic', ['1', '2', '3', '4'], []],
  [NEU, '224312', '224331', 'affinis-short-stem', 'anatomic', ['1', '2', '3', '4', '5', '6'], []],
  // Short Head: Panel-Labels dreiteilig; 224406 ist ein Doppel-Shot.
  [NEU, '224351', '224426', 'affinis-short-head', 'anatomic',
    ['39/13/1', '41/14/1', '43/15/2', '45/16/2', '47/17/3', '49/18/3', '51/19/4', '53/20/4'],
    ['224406']],
]

function kombis(außen, innen) {
  return außen.flatMap((a) => innen.map((i) => `${a}/${i}`))
}
function linerHälfte(incl) {
  return ['H0', 'H3', 'H6'].flatMap((h) =>
    ['Ø32', 'Ø36', 'Ø39', 'Ø42'].map((d) => `${d}/${h}/${incl}`),
  )
}

// Zeitstempel aus dem Dateinamen; Nachtrags-Dateien tragen keinen und
// werden über den leeren Bereich ('' … 'zzz') komplett eingeschlossen.
const zeit = (f) => f.match(/ (\d{6})\.png$/)?.[1] ?? f
const eintraege = []
for (const [dir, von, bis, kind, prothese, labels, skip] of SERIEN) {
  const inSerie = dateien[dir].filter((f) => {
    if (f.startsWith('LABEL_')) return false
    const t = zeit(f)
    return t >= von && t <= bis && !skip.includes(t)
  })
  if (inSerie.length !== labels.length) {
    console.error(`FEHLER ${kind}: ${inSerie.length} Dateien, aber ${labels.length} Labels`)
    process.exitCode = 1
  }
  inSerie.forEach((file, i) => {
    eintraege.push({ dir, file, kind, prothese, sizeIndex: i, sizeLabel: labels[i] ?? `?${i}` })
  })
}

const out = join(ROOT, 'Schablonen_Schulter', 'zuordnung.local.json')
writeFileSync(out, JSON.stringify({ kugelMm: 25, eintraege }, null, 1))
console.log(`${eintraege.length} Konturen zugeordnet -> ${out}`)
const kinds = [...new Set(eintraege.map((e) => e.kind))]
for (const kind of kinds)
  console.log(`  ${kind}: ${eintraege.filter((e) => e.kind === kind).length}`)
