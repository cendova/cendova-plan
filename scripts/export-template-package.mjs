// Baut das PRIVATE Cendova-Schablonenpaket (ZIP) aus dem aktuellen Repo-Stand:
// alle Hersteller-Bilder (public/templates/**) + die eingebauten Datentabellen
// (Knie-/Hüft-Bild-Indizes, Medacta-/S&N-Kataloge, Tracer-Hintergründe) als
// manifest.json. Das Ergebnis importiert die App über „Schablonen-Paket
// importieren" (HeaderTools) — siehe docs/schablonen-pakete.md.
//
// WICHTIG: Das erzeugte ZIP enthält Hersteller-Material und ist PRIVAT zu
// halten (USB/Drive) — niemals committen oder veröffentlichen. Der Glob
// `cendova-schablonen-*.zip` ist in .gitignore geblockt.
//
// Aufruf:  node scripts/export-template-package.mjs
//          node scripts/export-template-package.mjs --out mein-paket.zip --name "Klinik-Paket"
//
// Technik: Die Datentabellen liegen als TypeScript-Module vor. esbuild
// (bereits via Vite vorhanden) bündelt sie zu einem temporären ESM-File,
// das dieses Skript dynamisch importiert — kein TS-Parsing von Hand.

import { build } from 'esbuild'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(__dirname, '..')
const TEMPLATES_DIR = join(PROJECT_DIR, 'public', 'templates')

const args = process.argv.slice(2)
const argv = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const today = new Date().toISOString().slice(0, 10)
const OUT = argv('--out', join(PROJECT_DIR, `cendova-schablonen-${today}.zip`))
const NAME = argv('--name', `S&N + Medacta (Klinik-Paket ${today})`)

// Nach Stufe C2 enthält das öffentliche Repo keine Vorlagen mehr — dann
// gibt es hier nichts zu exportieren (das private Paket-ZIP aus der
// Sicherung verwenden bzw. eigene Quellen mit den Generator-Skripten
// aufbereiten und diesen Export erneut fahren).
import { existsSync } from 'node:fs'
if (!existsSync(TEMPLATES_DIR)) {
  console.error(
    'Keine Vorlagen im Repo (public/templates fehlt) — nichts zu exportieren.\n' +
      'Das private Schablonen-Paket liegt in deiner Sicherung (USB/Drive).',
  )
  process.exit(1)
}

// --- 1) Datentabellen aus den TS-Modulen holen (esbuild-Bundle) -----------
const entry = `
export { KNEE_IMAGES } from './src/lib/knee/kneeImages'
export { KNEE_CONTOURS } from './src/lib/knee/kneeContours'
export { MEDACTA_IMAGES } from './src/lib/hip/medactaImages'
export { MEDACTA_CATALOG, HEAD_OFFSETS_MM, STEM_CCD_BY_FOLDER } from './src/lib/hip/medactaCatalog'
export { BACKGROUNDS } from './src/lib/knee/templateBackgroundsData'
export * as sn from './src/lib/knee/smithNephewCatalog'
`
const tmp = mkdtempSync(join(tmpdir(), 'cendova-export-'))
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

// --- 2) Manifest bauen (Bild-Pfade: /templates/X → images/X) --------------
const mapPath = (p) =>
  p.startsWith('/templates/') ? `images/${p.slice('/templates/'.length)}` : p

const kneeImages = Object.fromEntries(
  Object.entries(data.KNEE_IMAGES).map(([k, v]) => [k, { ...v, path: mapPath(v.path) }]),
)
const medactaImages = Object.fromEntries(
  Object.entries(data.MEDACTA_IMAGES).map(([folder, sizes]) => [
    folder,
    Object.fromEntries(
      Object.entries(sizes).map(([ref, v]) => [ref, { ...v, path: mapPath(v.path) }]),
    ),
  ]),
)
const backgrounds = Object.fromEntries(
  Object.entries(data.BACKGROUNDS).map(([k, v]) => [
    k,
    { ...v, file: v.file.startsWith('images/') ? v.file : `images/${v.file}` },
  ]),
)
const sn = data.sn
const manifest = {
  format: 'cendova-templates',
  formatVersion: 1,
  name: NAME,
  createdAt: new Date().toISOString(),
  generator: 'scripts/export-template-package.mjs',
  kneeImages,
  kneeContours: data.KNEE_CONTOURS,
  medactaImages,
  medactaCatalog: data.MEDACTA_CATALOG,
  headOffsetsMm: [...data.HEAD_OFFSETS_MM],
  stemCcdByFolder: data.STEM_CCD_BY_FOLDER,
  kneeCatalog: {
    legionPsFemur: sn.LEGION_PS_FEMUR,
    genesisTibia: sn.GENESIS_II_TIBIA_FEMALE_TAPERED,
    genesisInserts: sn.GENESIS_II_INSERTS,
    legionPatella: sn.LEGION_PATELLA,
    journeyUkFemur: sn.JOURNEY_UK_FEMUR,
    journeyUkTibiaMedial: sn.JOURNEY_UK_TIBIA_MEDIAL,
    journeyUkTibiaLateral: sn.JOURNEY_UK_TIBIA_LATERAL,
    journeyUkInsertThicknessesMm: [...sn.JOURNEY_UK_INSERT_THICKNESSES_MM],
    sphereFemur: sn.SPHERE_FEMUR,
    sphereTibiaBaseplate: sn.SPHERE_TIBIA_BASEPLATE,
    sphereInsertSizes: sn.SPHERE_INSERT_SIZES,
    sphereInsertThicknessesMm: [...sn.SPHERE_INSERT_THICKNESSES_MM],
    sphereResurfacingPatella: sn.SPHERE_RESURFACING_PATELLA,
    sphereInsetPatella: sn.SPHERE_INSET_PATELLA,
    traceSizeBands: sn.TRACE_SIZE_BANDS,
    tibiaInsert: sn.TIBIA_INSERT,
    implantFamilies: sn.KNEE_IMPLANT_FAMILIES,
  },
  backgrounds,
}

// --- 3) Alle Bilddateien einsammeln ----------------------------------------
function collectFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...collectFiles(p))
    else out.push(p)
  }
  return out
}
const files = collectFiles(TEMPLATES_DIR)
const zipObj = {
  // Manifest normal komprimieren; PNGs sind bereits komprimiert → level 0.
  'manifest.json': [strToU8(JSON.stringify(manifest, null, 1)), { level: 6 }],
}
for (const f of files) {
  const rel = relative(TEMPLATES_DIR, f).split('\\').join('/')
  zipObj[`images/${rel}`] = [new Uint8Array(readFileSync(f)), { level: 0 }]
}

// --- 4) Konsistenz: alle referenzierten Bilder müssen im ZIP liegen --------
const referenced = [
  ...Object.values(kneeImages).map((v) => v.path),
  ...Object.values(medactaImages).flatMap((s) => Object.values(s).map((v) => v.path)),
  ...Object.values(backgrounds).map((v) => v.file),
]
const missing = referenced.filter((p) => !(p in zipObj))
if (missing.length > 0) {
  console.error(`FEHLER: ${missing.length} referenzierte Bilder fehlen auf der Platte:`)
  for (const m of missing.slice(0, 10)) console.error(`  ${m}`)
  process.exit(1)
}

// --- 5) Schreiben + Self-Check (ZIP wieder einlesen und validieren) --------
const zipped = zipSync(zipObj)
writeFileSync(OUT, zipped)

const check = unzipSync(new Uint8Array(readFileSync(OUT)))
const checkManifest = JSON.parse(strFromU8(check['manifest.json']))
const checkImages = Object.keys(check).filter((k) => k.startsWith('images/'))
if (checkManifest.format !== 'cendova-templates' || checkImages.length !== files.length) {
  console.error('FEHLER: Self-Check des geschriebenen ZIPs fehlgeschlagen.')
  process.exit(1)
}

console.log(`OK ✅  ${OUT}`)
console.log(
  `   ${checkImages.length} Bilder · ${Object.keys(kneeImages).length} Knie-Einträge · ` +
    `${Object.keys(medactaImages).length} Medacta-Ordner · ${(zipped.length / 1024 / 1024).toFixed(1)} MB`,
)
console.log('   PRIVAT halten (USB/Drive) — nicht committen, nicht veröffentlichen!')
