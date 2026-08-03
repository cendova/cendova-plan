// Baut das Schulter-Schablonenpaket (ADDON, merge:true) aus dem Output der
// Extraktions-Pipeline:
//   Schablonen_Schulter/schulter-konturen.local.json  (build-shoulder-contours)
//   Schablonen_Schulter/zuordnung.local.json          (build-schulter-zuordnung)
//
// Enthalten: shoulderContours (alle extrahierten Konturen) + shoulderCatalog
// (Familien + Größen-Labels je kind). merge:true — das Addon ergänzt ein
// vorhandenes Hüft-/Knie-Paket, ohne dessen Bestand zu ersetzen; ohne
// Bestandspaket wirkt es allein über den eingebauten (leeren) Tabellen.
//
// WICHTIG: Das erzeugte ZIP enthält herstellerabgeleitete Geometrie und ist
// PRIVAT zu halten — niemals committen (Glob cendova-*.zip in .gitignore).
//
// Aufruf:  node scripts/export-shoulder-package.mjs [--out datei.zip]

// Seit Vite 8 gibt es kein esbuild mehr in node_modules — gebündelt wird
// mit Rolldown (Vites eigener Bundler; Knie-/Template-Export nutzen
// inzwischen dasselbe Muster).
import { rolldown } from 'rolldown'
import { zipSync, strToU8 } from 'fflate'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(__dirname, '..')
const BASIS = join(PROJECT_DIR, 'Schablonen_Schulter')
const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const today = new Date().toISOString().slice(0, 10)
const OUT = argOf('--out', join(PROJECT_DIR, `cendova-addon-schulter-${today}.zip`))

const { konturen, bilder } = JSON.parse(
  readFileSync(join(BASIS, 'schulter-konturen.local.json'), 'utf8'),
)
const { eintraege } = JSON.parse(
  readFileSync(join(BASIS, 'zuordnung.local.json'), 'utf8'),
)

// Familien-Metadaten je kind (öffentliche Katalog-Info; Größenlisten und
// Geometrie kommen aus den lokalen Dateien). prosthesis filtert nur das
// Angebot in der Toolbar, nie Rechenlogik.
const FAMILIEN = {
  'affinis-short-stem': { label: 'Affinis Short — Stem', manufacturer: 'Mathys', prosthesis: 'anatomic', bone: 'Humerus' },
  'affinis-short-head': { label: 'Affinis Short — Head', manufacturer: 'Mathys', prosthesis: 'anatomic', bone: 'Humerus' },
  'affinis-glenoid': { label: 'Affinis Glenoid (zementiert)', manufacturer: 'Mathys', prosthesis: 'anatomic', bone: 'Glenoid' },
  'affinis-glenoid-vitamys': { label: 'Affinis Glenoid vitamys (zementiert)', manufacturer: 'Mathys', prosthesis: 'anatomic', bone: 'Glenoid' },
  'affinis-glenoid-vitamys-uncemented': { label: 'Affinis Glenoid vitamys (zementfrei)', manufacturer: 'Mathys', prosthesis: 'anatomic', bone: 'Glenoid' },
  'medacta-anat-stem-short': { label: 'Medacta Anatomic — Short Stem', manufacturer: 'Medacta', prosthesis: 'anatomic', bone: 'Humerus' },
  'medacta-anat-head': { label: 'Medacta Anatomic — Humeral Head', manufacturer: 'Medacta', prosthesis: 'anatomic', bone: 'Humerus' },
  'medacta-anat-glenoid': { label: 'Medacta Anatomic — Pegged Glenoid', manufacturer: 'Medacta', prosthesis: 'anatomic', bone: 'Glenoid' },
  'medacta-rev-stem-short': { label: 'Medacta Reverse — Short Stem', manufacturer: 'Medacta', prosthesis: 'reverse', bone: 'Humerus' },
  'medacta-rev-stem-standard': { label: 'Medacta Reverse — Standard Stem', manufacturer: 'Medacta', prosthesis: 'reverse', bone: 'Humerus' },
  'medacta-rev-liner': { label: 'Medacta Reverse — HCPE Liner', manufacturer: 'Medacta', prosthesis: 'reverse', bone: 'Humerus' },
  'medacta-rev-baseplate': { label: 'Medacta Reverse — Baseplate', manufacturer: 'Medacta', prosthesis: 'reverse', bone: 'Glenoid' },
  'medacta-rev-glenosphere': { label: 'Medacta Reverse — Glenosphäre', manufacturer: 'Medacta', prosthesis: 'reverse', bone: 'Glenoid' },
  'reunion-s-stem': { label: 'ReUnion S — Press-Fit Stem', manufacturer: 'Stryker', prosthesis: 'anatomic', bone: 'Humerus' },
  'reunion-rsa-cup': { label: 'ReUnion RSA — Humeral Cup', manufacturer: 'Stryker', prosthesis: 'reverse', bone: 'Humerus' },
  'reunion-rsa-insert': { label: 'ReUnion RSA — X3 Insert', manufacturer: 'Stryker', prosthesis: 'reverse', bone: 'Humerus' },
  'reunion-rsa-glenosphere': { label: 'ReUnion RSA — Glenosphäre', manufacturer: 'Stryker', prosthesis: 'reverse', bone: 'Glenoid' },
  'reunion-rsa-baseplate': { label: 'ReUnion RSA — Baseplate', manufacturer: 'Stryker', prosthesis: 'reverse', bone: 'Glenoid' },
}

// Größen-Labels je kind aus der Zuordnung (Index = sizeIndex).
const sizeLabels = {}
for (const e of eintraege) {
  const arr = (sizeLabels[e.kind] ??= [])
  arr[e.sizeIndex] = e.sizeLabel
}

const families = Object.entries(FAMILIEN).map(([kind, meta]) => ({
  kind,
  ...meta,
  sizeCount: sizeLabels[kind]?.length ?? 0,
}))

// App-Validierung per Rolldown bündeln — was hier durchgeht, importiert die App.
const tmp = mkdtempSync(join(tmpdir(), 'cendova-shoulder-'))
const entryFile = join(tmp, 'entry.ts')
const bundleFile = join(tmp, 'data.mjs')
const formatPfad = join(PROJECT_DIR, 'src/lib/templates/packageFormat.ts')
  .replaceAll('\\', '/')
writeFileSync(
  entryFile,
  `export { validateManifest } from '${formatPfad}'`,
)
const bundle = await rolldown({
  input: entryFile,
  logLevel: 'silent',
  resolve: { tsconfigFilename: join(PROJECT_DIR, 'tsconfig.json') },
})
await bundle.write({ file: bundleFile, format: 'esm' })
await bundle.close()
const data = await import(pathToFileURL(bundleFile).href)
rmSync(tmp, { recursive: true, force: true })

// Bild-Overlays: PNGs unter images/schulter/ ins ZIP, Index im Manifest.
// Das BILD hat im Renderer Vorrang (Hilfslinien + pixelscharfe Kanten);
// die Vektor-Konturen bleiben als Fallback + mm-Maßquelle im Paket.
const zipDateien = {}
const shoulderImages = {}
for (const [key, meta] of Object.entries(bilder ?? {})) {
  const name = meta.file.split('/').pop()
  const zipPfad = `images/schulter/${name}`
  // PNGs sind bereits komprimiert → level 0 (nur speichern).
  zipDateien[zipPfad] = [readFileSync(join(BASIS, meta.file)), { level: 0 }]
  shoulderImages[key] = {
    path: zipPfad,
    widthPx: meta.widthPx,
    heightPx: meta.heightPx,
    mmPerPx: meta.mmPerPx,
  }
}

const manifest = {
  format: 'cendova-templates',
  formatVersion: 1,
  name: `Schulter-Schablonen (${today})`,
  createdAt: new Date().toISOString(),
  generator: 'scripts/export-shoulder-package.mjs',
  merge: true,
  shoulderContours: konturen,
  ...(Object.keys(shoulderImages).length > 0 ? { shoulderImages } : {}),
  shoulderCatalog: { families, sizeLabels },
}

const check = data.validateManifest(manifest)
if (!check.ok) {
  console.error(`✗ Manifest ungültig: ${check.error}`)
  process.exit(1)
}

const zip = zipSync({
  'manifest.json': [strToU8(JSON.stringify(manifest)), { level: 6 }],
  ...zipDateien,
})
writeFileSync(OUT, zip)
console.log(
  `Schulter-Paket gebaut: ${Object.keys(konturen).length} Konturen, ` +
    `${Object.keys(shoulderImages).length} Bild-Overlays, ` +
    `${families.length} Familien, merge:true\n→ ${OUT} (${Math.round(zip.length / 1024)} KB)`,
)