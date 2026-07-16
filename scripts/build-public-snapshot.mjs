// Baut den ÖFFENTLICHEN Snapshot — den Initial-Stand für das öffentliche
// Repository (cendova/cendova-plan): exakt der committete HEAD-Stand
// (git archive, keine Arbeitskopie-Streuner) MINUS private Ausschlüsse,
// gefolgt von einem harten Muster-Gate gegen verbotene Inhalte
// (Herstellerdaten-Reste, Personen-/Klinikbezug, alte Namen).
//
// Das Skript ist die REPRODUZIERBARE Quelle des öffentlichen Stands:
// gleicher Commit → gleicher Snapshot. Es verändert dieses Repo nicht.
//
// Aufruf:  node scripts/build-public-snapshot.mjs --out <zielordner>
// Exit:    0 = Snapshot ok (Gate bestanden), 1 = Verstoß/Fehler.

import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(__dirname, '..')
const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const OUT = argOf('--out', null)
if (!OUT) {
  console.error('Aufruf: node scripts/build-public-snapshot.mjs --out <zielordner>')
  process.exit(1)
}

// Private Ausschlüsse (Pfad-Präfixe relativ zur Repo-Wurzel).
const EXCLUDE_PREFIXES = ['docs-privat/']

// Verbotene Muster (case-insensitive), je mit Datei-Allowlist.
// Muster sind zusammengesetzt, damit dieses Skript sich nicht selbst meldet.
const FORBIDDEN = [
  { name: 'Windows-Benutzer (privat)', re: new RegExp('pa' + 'mic', 'i'), allow: [] },
  { name: 'Patientenbezug (DICOM-Export)', re: new RegExp('\\bBar' + 'ra\\b'), allow: [] },
  { name: 'privater GitHub-Namespace', re: new RegExp('pmichel87' + '-png', 'i'), allow: [] },
  { name: 'Hersteller-Spec-Quelle', re: new RegExp('Spec ' + 'Guide', 'i'), allow: [] },
  { name: 'Klinikname Ethianum', re: new RegExp('Ethia' + 'num', 'i'), allow: [] },
  { name: 'Klinikname Salem', re: new RegExp('Salem ' + 'Heidelberg', 'i'), allow: [] },
  { name: 'Klinikname St. Josefs', re: new RegExp('St\\. Jo' + 'sefs', 'i'), allow: [] },
  { name: 'Klinikname Viernheim', re: new RegExp('Viern' + 'heim', 'i'), allow: [] },
  { name: 'Wettbewerber-Namen', re: new RegExp('Trauma' + 'Cad|medi' + 'CAD', 'i'), allow: [] },
  // Klarname: bewusste Entscheidung NUR in Lizenz-/Autorendateien.
  {
    name: 'Klarname außerhalb NOTICE/README',
    re: new RegExp('Philipp A\\. Mi' + 'chel|Priv\\.-Doz', 'i'),
    allow: ['NOTICE', 'README.md'],
  },
  // Alter Arbeitsname: nur die zwei localStorage-Migrations-Keys sind ok.
  {
    name: 'alter Arbeitsname',
    re: new RegExp('endo' + 'micad', 'i'),
    allow: ['src/state/viewerStore.ts', 'src/state/templateTracerStore.ts'],
  },
]

// --- 1) Exakten HEAD-Stand exportieren (git archive → ZIP → fflate) -------
// Bewusst OHNE bash/tar (läuft auch unter Windows-PowerShell): git schreibt
// ein ZIP, fflate entpackt es rein in Node. Ausführungsrechte gehen im ZIP
// verloren → unten anhand der Git-Modi (100755) wiederhergestellt.
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const tmpZip = join(tmpdir(), `cendova-snapshot-${process.pid}.zip`)
execFileSync('git', ['-C', PROJECT_DIR, 'archive', '--format=zip', '-o', tmpZip, 'HEAD'])
const entries = unzipSync(new Uint8Array(readFileSync(tmpZip)))
rmSync(tmpZip, { force: true })
for (const [name, bytes] of Object.entries(entries)) {
  if (name.endsWith('/')) continue
  const abs = join(OUT, name)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, bytes)
}
// Ausführbare Dateien laut Git-Index (Mode 100755) markieren — unter
// Windows wirkungslos (dort zählt der Git-Index beim späteren `git add`
// ohnehin nicht; Doku nennt dafür `git update-index --chmod=+x`).
const executables = execFileSync(
  'git',
  ['-C', PROJECT_DIR, 'ls-files', '-s'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter((l) => l.startsWith('100755'))
  .map((l) => l.split('\t')[1])
  .filter(Boolean)
for (const rel of executables) {
  const abs = join(OUT, rel)
  if (existsSync(abs)) {
    try {
      chmodSync(abs, 0o755)
    } catch {
      /* Windows: kein chmod — siehe Kommentar oben. */
    }
  }
}
if (executables.length) console.log(`• ausführbar markiert: ${executables.join(', ')}`)

// --- 2) Private Ausschlüsse entfernen -------------------------------------
for (const prefix of EXCLUDE_PREFIXES) {
  const p = join(OUT, prefix)
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true })
    console.log(`− ausgeschlossen: ${prefix}`)
  }
}

// --- 3) Muster-Gate über ALLE Snapshot-Dateien (auch Binärdateien) --------
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}
// Der Gate-Scanner überspringt sich selbst (enthält die Muster-Bausteine).
const SELF = 'scripts/build-public-snapshot.mjs'
const violations = []
let fileCount = 0
for (const abs of walk(OUT)) {
  const rel = relative(OUT, abs).replaceAll('\\', '/')
  fileCount++
  if (rel === SELF) continue
  const content = readFileSync(abs, 'latin1')
  for (const f of FORBIDDEN) {
    if (f.allow.includes(rel)) continue
    if (f.re.test(content)) violations.push(`${rel}: ${f.name}`)
  }
}

if (violations.length) {
  console.error(`✗ Muster-Gate verletzt (${violations.length}):`)
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}
console.log(`✓ Snapshot: ${fileCount} Dateien, Muster-Gate bestanden`)
console.log(`→ ${OUT}`)
