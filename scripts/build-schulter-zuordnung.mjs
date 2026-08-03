// Erzeugt die Zuordnungstabelle Screenshot → (kind, sizeIndex, sizeLabel)
// für die Schulter-Schablonen.
//
// WICHTIG — was hier NICHT steht: Die Serien-Tabelle selbst (Quellordner,
// Zeitbereiche und vor allem die HERSTELLER-GRÖSSENLABELS) liegt in
// `scripts/schulter-serien.local.json` und ist gitignoriert. Dieses Repo
// enthält bewusst keine Größendaten von Herstellern (siehe DISCLAIMER.md);
// das Knie-Pendant führt aus demselben Grund nur Ordinalgrößen.
//
// Aufbau der lokalen Datei:
//   {
//     "kugelMm": 25,
//     "serien": [
//       { "dir": "<Quellordner unter Schablonen_Schulter/>",
//         "von": "HHMMSS", "bis": "HHMMSS",   // Zeitstempel im Dateinamen
//         "kind": "<ShoulderImplantKind>",
//         "prothese": "anatomic" | "reverse",
//         "labels": ["…"],                    // Klick-Reihenfolge, aufsteigend
//         "skip": ["HHMMSS"] }                // Doppel-Aufnahmen
//     ]
//   }
//
// Grundlage der Zuordnung: Die Label-Dialoge der Quell-Software stehen
// jeweils am ENDE einer aufsteigend durchgeklickten Größenserie und nennen
// Serienname und Größenliste — die Serien-Identität ist damit belegt.
// Mehrdimensionale Serien (Ø × Dicke …) sind als geordnete Label-Liste
// kodiert; die Reihenfolge prüft build-shoulder-contours.mjs per
// Mess-Monotonie gegen.
//
// Output: Schablonen_Schulter/zuordnung.local.json (ebenfalls gitignored).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const KONFIG = join(ROOT, 'scripts', 'schulter-serien.local.json')

if (!existsSync(KONFIG)) {
  console.error(
    `Serien-Konfiguration fehlt: ${KONFIG}\n` +
      'Sie enthält Hersteller-Größenlabels und bleibt deshalb lokal ' +
      '(Aufbau siehe Kopf dieser Datei).',
  )
  process.exit(1)
}

const { kugelMm = 25, serien } = JSON.parse(readFileSync(KONFIG, 'utf8'))

// Dateilisten je Quellordner einmalig einlesen.
const dateien = {}
for (const dir of new Set(serien.map((s) => s.dir)))
  dateien[dir] = readdirSync(join(ROOT, 'Schablonen_Schulter', dir))
    .filter((f) => f.endsWith('.png'))
    .sort()

// Zeitstempel aus dem Dateinamen; Nachträge ohne Stempel fallen über den
// vollen Bereich ('' … 'zzz') hinein.
const zeit = (f) => f.match(/ (\d{6})\.png$/)?.[1] ?? f

const eintraege = []
for (const { dir, von, bis, kind, prothese, labels, skip = [] } of serien) {
  const inSerie = dateien[dir].filter((f) => {
    if (f.startsWith('LABEL_')) return false
    const t = zeit(f)
    return t >= von && t <= bis && !skip.includes(t)
  })
  if (inSerie.length !== labels.length) {
    console.error(
      `FEHLER ${kind}: ${inSerie.length} Dateien, aber ${labels.length} Labels`,
    )
    process.exitCode = 1
  }
  inSerie.forEach((file, i) => {
    eintraege.push({
      dir,
      file,
      kind,
      prothese,
      sizeIndex: i,
      sizeLabel: labels[i] ?? `?${i}`,
    })
  })
}

const out = join(ROOT, 'Schablonen_Schulter', 'zuordnung.local.json')
writeFileSync(out, JSON.stringify({ kugelMm, eintraege }, null, 1))
console.log(`${eintraege.length} Konturen zugeordnet -> ${out}`)
for (const kind of [...new Set(eintraege.map((e) => e.kind))])
  console.log(`  ${kind}: ${eintraege.filter((e) => e.kind === kind).length}`)
