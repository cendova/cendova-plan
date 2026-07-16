/**
 * Liest die relevanten Medacta-Schablonen aus dem Osirix-Templates-Ordner
 * und erzeugt daraus einen TypeScript-Katalog mit allen Größen, Bezugs-
 * punkten und Kopfpositionen.
 *
 * Aufruf:  node scripts/extract-medacta-catalog.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = dirname(HERE)
const TEMPLATES_ROOT = join(
  PROJECT_ROOT,
  'Templates Osirix',
  'Fondazione Templates-2',
)
const OUTPUT_FILE = join(PROJECT_ROOT, 'src', 'lib', 'hip', 'medactaCatalog.ts')

/**
 * Welche Schablonen extrahiert werden — mit sauberer Bezeichnung für
 * Familie/Variante (so können wir das Dropdown logisch gruppieren).
 */
const ENTRIES = [
  // --- Pfanne ---
  {
    folder: 'MEDACTA INTERNATIONAL - [Cup] - VersafitCup CC TRIO',
    component: 'Cup',
    family: 'Versafit CC TRIO',
    variant: 'Standard',
  },

  // --- Quadra-P (port. coated) ---
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - Quadra-P STD',           component: 'Stem', family: 'Quadra-P', variant: 'STD' },
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - Quadra-P LAT',           component: 'Stem', family: 'Quadra-P', variant: 'LAT' },
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - Quadra-P COLLARED STD',  component: 'Stem', family: 'Quadra-P', variant: 'COLLARED STD' },
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - Quadra-P COLLARED LAT',  component: 'Stem', family: 'Quadra-P', variant: 'COLLARED LAT' },

  // --- QUADRA Stem (Klassiker, vom User „Quadra-C" gemeint) ---
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - QUADRA Stem STD',            component: 'Stem', family: 'QUADRA Stem', variant: 'STD' },
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - QUADRA Stem LAT',            component: 'Stem', family: 'QUADRA Stem', variant: 'LAT' },
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - QUADRA Stem Short neck STD', component: 'Stem', family: 'QUADRA Stem', variant: 'Short neck STD' },
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - QUADRA Stem Short neck LAT', component: 'Stem', family: 'QUADRA Stem', variant: 'Short neck LAT' },

  // --- SMS Solid ---
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - SMS Solid STD', component: 'Stem', family: 'SMS Solid', variant: 'STD' },
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - SMS Solid LAT', component: 'Stem', family: 'SMS Solid', variant: 'LAT' },

  // --- MasterLoc ---
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - MasterLoc Mectagrip Coated STD',      component: 'Stem', family: 'MasterLoc', variant: 'STD' },
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - MasterLoc Mectagrip Coated LAT',      component: 'Stem', family: 'MasterLoc', variant: 'LAT' },
  { folder: 'MEDACTA INTERNATIONAL - [Stem] - MasterLoc Mectagrip Coated LAT PLUS', component: 'Stem', family: 'MasterLoc', variant: 'LAT PLUS' },
]

/** Parst eine Osirix-Template-Textdatei (Format: `KEY:=:VALUE` pro Zeile).
 *
 * WICHTIG: auf `/[\r\n]+/` splitten, NICHT nur `/\r?\n/`. Manche Medacta-
 * Exporte (z.B. SMS Solid LAT Größen 10-13) nutzen nackte Carriage-Returns
 * (`\r`, altes Mac-Format) statt `\r\n`/`\n` als Zeilentrenner. Mit dem
 * alten Regex wurde so die ganze Datei zu EINER Zeile → REF_NO bekam den
 * kompletten Datei-Inhalt, size/pdfFile blieben leer, und die Schablone
 * fiel im UI auf den schematischen Fallback zurück. `[\r\n]+` deckt alle
 * drei Zeilenenden-Konventionen ab und kollabiert Mehrfach-Trenner. */
function parseTxt(content) {
  const obj = {}
  for (const line of content.split(/[\r\n]+/)) {
    const idx = line.indexOf(':=:')
    if (idx < 0) continue
    obj[line.slice(0, idx).trim()] = line.slice(idx + 3).trim()
  }
  return obj
}

function num(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function extractEntry(entry) {
  const dir = join(TEMPLATES_ROOT, entry.folder)
  if (!existsSync(dir)) {
    console.warn(`  ! Ordner fehlt: ${entry.folder}`)
    return { ...entry, sizes: [] }
  }
  const files = readdirSync(dir).filter(
    (f) => /\.txt$/i.test(f) && !f.startsWith('._'),
  )
  const sizes = []
  for (const f of files) {
    const txt = readFileSync(join(dir, f), 'utf8')
    const m = parseTxt(txt)
    const headPoints = []
    for (let i = 1; i <= 5; i++) {
      const x = m[`AP_HEAD_ROTATION_POINT_${i}_X`]
      const y = m[`AP_HEAD_ROTATION_POINT_${i}_Y`]
      if (x !== undefined && y !== undefined) {
        headPoints.push({ x: num(x), y: num(y) })
      }
    }
    sizes.push({
      size: String(m.SIZE ?? '').trim(),
      refNo: String(m.REF_NO ?? '').trim(),
      apOrigin: { x: num(m.AP_ORIGIN_X), y: num(m.AP_ORIGIN_Y) },
      headPoints,
      pdfFile: String(m.PDF_FILE_AP ?? '').trim(),
    })
  }
  sizes.sort((a, b) => {
    const na = parseFloat(a.size)
    const nb = parseFloat(b.size)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    return a.size.localeCompare(b.size)
  })
  return { ...entry, sizes }
}

const data = ENTRIES.map(extractEntry)

const ts = `// Auto-generiert aus scripts/extract-medacta-catalog.mjs.
// Nicht manuell bearbeiten — neu generieren bei Katalog-Änderungen.

/** Eine konkrete Schablonengröße inkl. Bezugspunkten in PDF-Koordinaten. */
export interface MedactaSize {
  /** Hersteller-Größenangabe (numerisch als String, z. B. "0", "1", "40"). */
  size: string
  /** Referenznummer(n) im Medacta-Katalog. */
  refNo: string
  /** Bezugspunkt im Template-PDF (zur Platzierung). */
  apOrigin: { x: number; y: number }
  /** Mögliche Kopfzentren je Halslänge (5 Stufen). */
  headPoints: { x: number; y: number }[]
  /** Dateiname der PDF-Schablone im Quell-Template-Ordner. */
  pdfFile: string
}

/** Eine Schablonenreihe (Familie + Variante). */
export interface MedactaEntry {
  folder: string
  component: 'Cup' | 'Stem'
  family: string
  variant: string
  sizes: MedactaSize[]
}

/**
 * Halslängen-Versatz in Millimetern, korrespondierend zu den 5
 * AP_HEAD_ROTATION_POINTs (Index 1..5) am Konus 12/14 von Medacta.
 */
export const HEAD_OFFSETS_MM = [-4, 0, 4, 8, 12] as const

export const MEDACTA_CATALOG: MedactaEntry[] = ${JSON.stringify(data, null, 2)}
`

writeFileSync(OUTPUT_FILE, ts)

console.log(`\nGeschrieben: ${OUTPUT_FILE}\n`)
for (const e of data) {
  const sample = e.sizes.length
    ? `(${e.sizes[0].size} … ${e.sizes[e.sizes.length - 1].size})`
    : '(leer)'
  console.log(
    `  ${e.component.padEnd(4)} ${e.family.padEnd(20)} ${e.variant.padEnd(18)} → ${String(e.sizes.length).padStart(2)} Größen ${sample}`,
  )
}
