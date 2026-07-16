// Lädt die PRIVATE Katalog-Solldaten-Datei für die Generator-/Verifikations-
// Skripte: scripts/katalog-solldaten.local.json (gitignored, *.local.json).
//
// Hintergrund: Hersteller-Größentabellen (Katalog-/Zeichnungsmaße) sind
// bewusst NICHT Teil des öffentlichen Repos (siehe NOTICE/DISCLAIMER).
// Wer die Skripte nutzt, hinterlegt die Maße aus seinen selbst beschafften
// Herstellerunterlagen lokal — Struktur siehe katalog-solldaten.beispiel.json.
//
// Verhalten:
//  - Datei fehlt + keine Pflicht-Sektionen  → null (Aufrufer überspringt
//    seine Maß-Verifikation mit Warnhinweis).
//  - Datei fehlt + Pflicht-Sektionen        → Abbruch mit Anleitung.
//  - Datei da, Pflicht-Sektion fehlt darin  → Abbruch mit Sektionsname.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const SOLLDATEN_PFAD = join(__dirname, '..', 'katalog-solldaten.local.json')
const BEISPIEL = 'scripts/katalog-solldaten.beispiel.json'

export function ladeSolldaten({ pflicht = [], skript = 'Skript' } = {}) {
  if (!existsSync(SOLLDATEN_PFAD)) {
    if (pflicht.length === 0) return null
    console.error(
      `${skript}: scripts/katalog-solldaten.local.json fehlt.\n` +
        `Diese Datei enthält Hersteller-Sollmaße und ist bewusst nicht im Repo\n` +
        `(gitignored). Bitte lokal anlegen — Struktur siehe ${BEISPIEL} —\n` +
        `und mit Maßen aus den eigenen Herstellerunterlagen befüllen.\n` +
        `Benötigte Sektionen: ${pflicht.join(', ')}`,
    )
    process.exit(1)
  }
  const daten = JSON.parse(readFileSync(SOLLDATEN_PFAD, 'utf8'))
  for (const key of pflicht) {
    if (daten[key] === undefined) {
      console.error(
        `${skript}: Sektion '${key}' fehlt in scripts/katalog-solldaten.local.json` +
          ` (Struktur siehe ${BEISPIEL}).`,
      )
      process.exit(1)
    }
  }
  return daten
}
