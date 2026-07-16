// Baut ein ADDON-Schablonenpaket (merge:true) mit den Knie-Konturen aus
// src/lib/knee/kneeContours.ts — als Nachzug für Installationen, deren
// Basis-Paket (Stufe C2, Paketformat v1.0) noch keine kneeContours trägt.
// Liegt scripts/katalog-solldaten.local.json mit Sektion stemCcdByFolder
// vor, wandern zusätzlich die Schaft-CCD-Winkel mit ins Addon (gleicher
// Nachzug-Fall: Hersteller-Katalogdaten raus aus dem Code, rein ins Paket).
//
// Hintergrund C3 (öffentliches Repo): Die Konturen sind aus Hersteller-
// Schablonen abgeleitet und werden — wie zuvor Bilder und Kataloge — aus
// dem Repo entfernt. Dieses Skript sichert sie VOR dem Leeren als privates
// Addon-ZIP; danach ist es im Repo nur noch für Nutzer relevant, die mit
// scripts/build-knee-contours.mjs eigene Konturen erzeugt haben und diese
// als Addon (statt Voll-Export) packen wollen.
//
// WICHTIG: Das erzeugte ZIP enthält herstellerabgeleitete Geometrie und ist
// PRIVAT zu halten — niemals committen (Glob cendova-*.zip in .gitignore).
//
// Die LEGION-Narrow-Indizes (3N/4N/5N/6N → sizeIndex 1/3/5/7) werden
// übersprungen, sofern der Eintrag nicht quelle:'dxf' trägt: Die Screenshot-
// Näherungen dort sind (a) in der Auswahl ohnehin versteckt (isHiddenKneeSize)
// und würden (b) beim Merge die echten DXF-Konturen des Narrow-Addons
// überschreiben und die Größen wieder sperren.
//
// Aufruf:  node scripts/export-knee-contours-addon.mjs [--out datei.zip]

import { build } from 'esbuild'
import { zipSync, strToU8 } from 'fflate'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ladeSolldaten } from './lib/solldaten.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(__dirname, '..')
const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const today = new Date().toISOString().slice(0, 10)
const OUT = argOf('--out', join(PROJECT_DIR, `cendova-addon-knie-konturen-${today}.zip`))

// TS-Module per esbuild bündeln (Muster export-template-package.mjs) —
// inkl. der Manifest-Validierung, damit das ZIP garantiert importierbar ist.
const entry = `
export { KNEE_CONTOURS } from './src/lib/knee/kneeContours'
export { validateManifest } from './src/lib/templates/packageFormat'
`
const tmp = mkdtempSync(join(tmpdir(), 'cendova-addon-'))
const bundleFile = join(tmp, 'data.mjs')
await build({
  stdin: { contents: entry, resolveDir: PROJECT_DIR, loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: bundleFile,
  logLevel: 'silent',
})
const data = await import(pathToFileURL(bundleFile).href)
rmSync(tmp, { recursive: true, force: true })

const NARROW_KEYS = new Set(
  [1, 3, 5, 7].flatMap((i) => [`legion-ps-femur|AP|${i}`, `legion-ps-femur|lateral|${i}`]),
)
const kneeContours = {}
let skipped = 0
for (const [key, c] of Object.entries(data.KNEE_CONTOURS)) {
  if (NARROW_KEYS.has(key) && c.quelle !== 'dxf') {
    skipped++
    continue
  }
  kneeContours[key] = c
}
if (Object.keys(kneeContours).length === 0) {
  console.error(
    'KNEE_CONTOURS ist leer — nichts zu exportieren. (Im öffentlichen Repo-' +
      'Stand ist das erwartet; eigene Konturen erst mit build-knee-contours.mjs erzeugen.)',
  )
  process.exit(1)
}

// Schaft-CCD-Winkel (optional) aus der privaten Solldaten-Datei.
const stemCcdByFolder = ladeSolldaten({ skript: 'export-knee-contours-addon' })
  ?.stemCcdByFolder

const manifest = {
  format: 'cendova-templates',
  formatVersion: 1,
  name: `Klinik-Nachzug (Konturen${stemCcdByFolder ? ' + CCD' : ''} ${today})`,
  createdAt: new Date().toISOString(),
  generator: 'scripts/export-knee-contours-addon.mjs',
  merge: true,
  kneeContours,
  ...(stemCcdByFolder ? { stemCcdByFolder } : {}),
}

// Gegen die App-Validierung prüfen — was hier durchgeht, importiert die App.
const check = data.validateManifest(manifest)
if (!check.ok) {
  console.error(`✗ Manifest ungültig: ${check.error}`)
  process.exit(1)
}

const zip = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) })
writeFileSync(OUT, zip)
console.log(
  `Addon gebaut: ${Object.keys(kneeContours).length} Konturen` +
    ` (${skipped} Narrow-Platzhalter übersprungen)` +
    (stemCcdByFolder
      ? ` + ${Object.keys(stemCcdByFolder).length} CCD-Winkel`
      : ' (keine CCD-Winkel — Solldaten-Datei fehlt)') +
    `, merge:true\n→ ${OUT} (${Math.round(zip.length / 1024)} KB)`,
)
