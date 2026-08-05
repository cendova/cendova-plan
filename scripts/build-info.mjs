// Stempelt nach jedem Build eine maschinenlesbare Visitenkarte nach
// dist/.build-info.json (postbuild-Hook in package.json).
//
// Warum: CendovaView liefert dieses dist/ unter /plan aus. Ob der Build dort
// AKTUELL ist, liess sich bisher nur an einem Commit-Stempel ablesen - und der
// log gleich mehrfach (Build fehlgeschlagen, Ordner-Zwilling, git pull
// gescheitert). Der Nutzer merkte es erst beim Klick auf "Planen", wenn die
// Oberflaeche meldete, der Build kenne den Vertrag noch nicht.
//
// Die Visitenkarte macht das VOR dem Start pruefbar: Vertragsversion,
// Commit und Zeitpunkt stehen als Zahl in der Datei, nicht als Textmuster im
// minifizierten Bundle (dort wird aus `contract: CONTRACT_VERSION` ein
// `contract:yl` - nicht auffindbar).

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Vertragsversion aus der Quelle lesen - eine einzige Wahrheit. */
export function vertragAusQuelle(wurzelPfad = wurzel) {
  const quelle = readFileSync(join(wurzelPfad, 'src/lib/embedded.ts'), 'utf8')
  const treffer = quelle.match(/CONTRACT_VERSION\s*=\s*(\d+)/)
  if (!treffer) throw new Error('CONTRACT_VERSION nicht in src/lib/embedded.ts gefunden')
  return Number(treffer[1])
}

/** Aktueller Commit - ohne git (ZIP-Kopie, Snapshot) einfach null. */
export function commitOderNull(wurzelPfad = wurzel) {
  try {
    return execFileSync('git', ['-C', wurzelPfad, 'log', '-1', '--format=%H'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

// "Direkt aufgerufen?" NUR ueber pathToFileURL vergleichen. Ein handgebautes
// `file://` + process.argv[1] trifft auf WINDOWS nie zu (dort steht da
// C:\...\build-info.mjs, in import.meta.url aber file:///C:/.../build-info.mjs)
// - der Stempel wurde dann still nie geschrieben, waehrend Linux/macOS
// funktionierten. Genau so entstand der "Build ohne Versionsangabe" beim
// Nutzer (Realtest 05.08.).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const info = {
    vertrag: vertragAusQuelle(),
    commit: commitOderNull(),
    gebautAm: new Date().toISOString(),
  }
  mkdirSync(join(wurzel, 'dist'), { recursive: true })
  writeFileSync(join(wurzel, 'dist/.build-info.json'), `${JSON.stringify(info, null, 2)}\n`)
  console.log(`Build gestempelt: Vertrag v${info.vertrag}, Commit ${info.commit?.slice(0, 7) ?? '—'}`)
}
