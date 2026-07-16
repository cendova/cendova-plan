// Batch-Pipeline: verarbeitet ALLE Knie-Screenshots in einem Ordner und
// generiert src/lib/knee/kneeContours.ts mit maßstabsgetreuen Pro-Größe-
// Konturen.
//
// Dateiname-Schema:  <komponente>_<ansicht>_gr<größe>.png
//   komponente: legionps_femur | genesis_tibia | sphere_femur | sphere_tibia
//   ansicht:    ap | lat
//   größe:      Katalog-Größe (z. B. 5, 3n, 2p, 1plus …)
//
// Aufruf: node scripts/build-knee-contours.mjs ["Templates Knee/screenshots"] [kugel_mm]
import { readdirSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { extractContour } from './lib/knee-contour-extract.mjs'
import { ladeSolldaten } from './lib/solldaten.mjs'

// Standardmäßig beide Hersteller-Ordner einlesen (eine gemeinsame Ausgabe).
// Alte, anders benannte Ordner matchen das Schema nicht → automatisch ignoriert.
const DEFAULT_DIRS = ['Templates Knee/Smith&Nephew_neu', 'Templates Knee/Medacta_neu']
const srcDirs = process.argv[2] ? [process.argv[2]] : DEFAULT_DIRS
const ballMm = Number(process.argv[3] ?? '25')

// Komponenten-Präfix → kind. Genesis Female als Kanon (Male teilt Kontur).
const KIND_BY_PREFIX = {
  legionps_femur: 'legion-ps-femur',
  genesis_tibia: 'genesis-tibia-female',
  sphere_femur: 'sphere-femur',
  sphere_tibia: 'sphere-tibia-baseplate',
  // Journey II UK (Schlitten): Femur nur lateral, Tibia = mediale Reihe
  // (Größen 1–10; die laterale Reihe hätte nur 0–7).
  journeyII_femur: 'journey-uk-femur',
  journeyII_tibia: 'journey-uk-tibia-medial',
}

// Größen-Strings je kind (aus smithNephewCatalog) — Index = Position.
// Dupliziert, weil das .mjs-Skript die TS-Kataloge nicht direkt importiert;
// die Größen sind herstellerseitig stabil. „n"-Varianten klein geschrieben.
const SIZES_BY_KIND = {
  'legion-ps-femur': ['2', '3n', '3', '4n', '4', '5n', '5', '6n', '6', '7', '8'],
  'genesis-tibia-female': ['1', '2', '3', '4', '5', '6', '7', '8'],
  'sphere-femur': ['1', '1+', '2', '2+', '3', '3+', '4', '4+', '5', '5+', '6', '6+', '7'],
  'sphere-tibia-baseplate': ['1', '2', '3', '4', '5', '6', 't3-i4', 't4-i3'],
  'journey-uk-femur': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  'journey-uk-tibia-medial': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
}

// Katalog-M/L je AP-Sicht (mm) — zur Plausibilitäts-Prüfung der Extraktion.
// Herstellerdaten, daher aus scripts/katalog-solldaten.local.json (Sektion
// catalogApWidth; Struktur siehe katalog-solldaten.beispiel.json) — ohne
// die Datei ist keine maßhaltige Extraktion möglich (Abbruch).
const CATALOG_AP_WIDTH = ladeSolldaten({
  pflicht: ['catalogApWidth'],
  skript: 'build-knee-contours',
}).catalogApWidth

// Dateinamen-Größe normalisieren: „5n"→„5n", „2plus"/„2p"→„2+", Groß/klein.
// Sphere-Tibia-Spezialgrößen: „t3i4"→„t3-i4", „t4i3"→„t4-i3".
function normSize(raw) {
  let s = raw.toLowerCase().trim()
  const special = { t3i4: 't3-i4', t4i3: 't4-i3' }
  if (special[s]) return special[s]
  s = s.replace(/plus$/, '+').replace(/p$/, '+')
  return s
}

function parseName(file) {
  const base = file.replace(/\.(png|webp|jpg|jpeg)$/i, '')
  // greedy: komponente = bekannter Präfix, danach _<view>_gr<size>
  for (const prefix of Object.keys(KIND_BY_PREFIX)) {
    const re = new RegExp(`^${prefix}_(ap|lat)_gr(.+)$`, 'i')
    const m = base.match(re)
    if (m) {
      const kind = KIND_BY_PREFIX[prefix]
      const view = m[1].toLowerCase() === 'ap' ? 'AP' : 'lateral'
      const sizeStr = normSize(m[2])
      const sizes = SIZES_BY_KIND[kind]
      const sizeIndex = sizes.indexOf(sizeStr)
      if (sizeIndex < 0) {
        return { error: `Größe „${sizeStr}" nicht im Katalog von ${kind} (${sizes.join(',')})` }
      }
      return { kind, view, sizeIndex, sizeStr }
    }
  }
  return { error: 'Dateiname passt zu keinem Komponenten-Präfix' }
}

// Bilder REKURSIV aus allen Ordnern sammeln (Unterordner wie UKA/ inklusive).
function walk(dir) {
  const out = []
  let ents
  try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full))
    else if (/\.(png|webp|jpg|jpeg)$/i.test(e.name)) out.push(full)
  }
  return out
}
const files = srcDirs.flatMap((d) => walk(d))
if (files.length === 0) { console.error(`Keine Bilder in ${srcDirs.join(', ')}`); process.exit(1) }
files.sort((a, b) => (basename(a) < basename(b) ? -1 : basename(a) > basename(b) ? 1 : 0))

const entries = {} // key → { wMm, hMm, points }
let ok = 0, skip = 0
for (const full of files) {
  const file = basename(full)
  const parsed = parseName(file)
  if (parsed.error) { console.warn(`SKIP ${file}: ${parsed.error}`); skip++; continue }
  const { kind, view, sizeIndex, sizeStr } = parsed
  try {
    const res = await extractContour(full, ballMm, { maxComponents: 1 })
    const c = res.contours[0]
    if (!c) { console.warn(`SKIP ${file}: keine Kontur extrahiert`); skip++; continue }
    const key = `${kind}|${view}|${sizeIndex}`
    // inlaySplitY nur bei Tibia-Verbünden (Inlay/Baseplate-Trennung) speichern.
    const isTibia = kind.includes('tibia')
    entries[key] = {
      wMm: +c.wMm.toFixed(2), hMm: +c.hMm.toFixed(2), points: c.normPoints,
      ...(isTibia ? { inlaySplitY: c.inlaySplitY } : {}),
    }
    console.log(`OK  ${file} → ${kind} ${view} Gr.${sizeStr} (idx ${sizeIndex}) · ${c.wMm.toFixed(1)}×${c.hMm.toFixed(1)} mm · ${c.normPoints.length} Pkt`)
    ok++
  } catch (e) {
    console.warn(`SKIP ${file}: ${e.message}`); skip++
  }
}

// --- Katalog-Verankerung (Snap) ---
// Die Kugel-Kalibrierung ist auf ~±2 % genau; der Restfehler ist pro
// Screenshot-Serie SYSTEMATISCH (z. B. Genesis −3 %, Sphere-Femur +1.6 %).
// Wo der Katalog die führende AP-Breite eindeutig definiert, skalieren wir
// die Kontur UNIFORM (Breite+Höhe) exakt auf den Katalogwert — die Schablone
// trägt dann verbindlich die Hersteller-Maße. Der gleiche Faktor gilt für
// die laterale Ansicht derselben Größe (gleiche Screenshot-Serie, gleicher
// Bias). Sphere-Tibia-Kombigrößen (t3-i4/t4-i3) bleiben Kugel-skaliert —
// dort überragt das größere Inlay die Baseplate, der Katalogwert passt nicht.
const NO_SNAP = new Set(['sphere-tibia-baseplate|6', 'sphere-tibia-baseplate|7'])
let snapped = 0, snapWarn = 0
for (const [kind, widths] of Object.entries(CATALOG_AP_WIDTH)) {
  for (let idx = 0; idx < widths.length; idx++) {
    if (NO_SNAP.has(`${kind}|${idx}`)) continue
    const ap = entries[`${kind}|AP|${idx}`]
    if (!ap) continue
    const f = widths[idx] / ap.wMm
    if (Math.abs(1 - f) > 0.06) {
      console.warn(`WARN ${kind}|AP|${idx}: ${(100 * (f - 1)).toFixed(1)} % vom Katalog entfernt — kein Snap (Screenshot prüfen!)`)
      snapWarn++
      continue
    }
    ap.wMm = +(ap.wMm * f).toFixed(2)
    ap.hMm = +(ap.hMm * f).toFixed(2)
    const lat = entries[`${kind}|lateral|${idx}`]
    if (lat) {
      lat.wMm = +(lat.wMm * f).toFixed(2)
      lat.hMm = +(lat.hMm * f).toFixed(2)
    }
    snapped++
  }
}
console.log(`Katalog-Snap: ${snapped} Größen verankert${snapWarn ? `, ${snapWarn} verweigert` : ''}`)

// --- Narrow-Varianten ableiten (nur Legion PS Femur) ---
// Die Narrow (z. B. 5N) hat dieselbe AP-Geometrie wie die gleichnamige volle
// Größe, ist aber medio-lateral schmaler. Wir stauchen die volle Kontur in der
// Breite auf das Katalog-Verhältnis (AP-Ansicht: ML; laterale Ansicht: AP); die
// Höhe bleibt unverändert. approx=true → Label „(ca.)". Fehlt die volle Größe,
// wird nichts abgeleitet und der bisherige skalierte Trace greift als Fallback.
const LEGION_DIMS = {
  0: { ml: 58, ap: 50 }, 1: { ml: 58, ap: 54 }, 2: { ml: 62, ap: 55 },
  3: { ml: 62, ap: 58 }, 4: { ml: 66, ap: 59 }, 5: { ml: 66, ap: 61 },
  6: { ml: 70, ap: 62 }, 7: { ml: 70, ap: 65 }, 8: { ml: 73, ap: 66 },
  9: { ml: 77, ap: 70 }, 10: { ml: 80, ap: 75 },
}
const LEGION_NARROW_FROM = { 1: 2, 3: 4, 5: 6, 7: 8 } // N-Index → volle Größe
let derived = 0
for (const [nIdxStr, fullIdx] of Object.entries(LEGION_NARROW_FROM)) {
  const nIdx = +nIdxStr
  for (const view of ['AP', 'lateral']) {
    const full = entries[`legion-ps-femur|${view}|${fullIdx}`]
    if (!full) continue
    const r = view === 'AP'
      ? LEGION_DIMS[nIdx].ml / LEGION_DIMS[fullIdx].ml
      : LEGION_DIMS[nIdx].ap / LEGION_DIMS[fullIdx].ap
    entries[`legion-ps-femur|${view}|${nIdx}`] = {
      wMm: +(full.wMm * r).toFixed(2),
      hMm: full.hMm,
      points: full.points,
      approx: true,
    }
    derived++
    console.log(`~   legion-ps-femur ${view} Gr.${LEGION_DIMS[nIdx].ml}ML (idx ${nIdx}) abgeleitet aus idx ${fullIdx} · ×${r.toFixed(3)}`)
  }
}
if (derived) console.log(`+ ${derived} Narrow-Varianten abgeleitet`)

// --- Validierung: Katalog-Abgleich + Größen-Monotonie ---
// Fängt fehlerhafte Screenshots/Extraktionen automatisch ab, BEVOR sie in
// der App landen. Warnungen blockieren nicht (die Kontur ist trotzdem
// brauchbarer als der Fallback), machen das Problem aber sichtbar.
let warnings = 0
for (const [key, v] of Object.entries(entries)) {
  const [kind, view, idxStr] = key.split('|')
  const idx = +idxStr
  if (view === 'AP' && CATALOG_AP_WIDTH[kind]?.[idx] != null) {
    const expect = CATALOG_AP_WIDTH[kind][idx]
    const devPct = ((v.wMm - expect) / expect) * 100
    if (Math.abs(devPct) > 4) {
      console.warn(`WARN ${key}: Breite ${v.wMm} mm weicht ${devPct.toFixed(1)} % vom Katalog (${expect} mm) ab`)
      warnings++
    }
  }
}
// Monotonie: innerhalb (kind, view) muss die Breite mit der Größe wachsen
// (Toleranz 0.5 mm; Sphere-Tibia-Spezialgrößen idx 6/7 ausgenommen, das
// sind Wiederholungen von Gr. 3/4).
const byKindView = {}
for (const [key, v] of Object.entries(entries)) {
  const [kind, view, idxStr] = key.split('|')
  if (kind === 'sphere-tibia-baseplate' && +idxStr >= 6) continue
  ;(byKindView[`${kind}|${view}`] ??= []).push({ idx: +idxStr, wMm: v.wMm, hMm: v.hMm })
}
for (const [kv, list] of Object.entries(byKindView)) {
  list.sort((a, b) => a.idx - b.idx)
  for (let i = 1; i < list.length; i++) {
    if (list[i].wMm < list[i - 1].wMm - 0.5) {
      console.warn(`WARN ${kv}: Breite fällt von Gr.idx ${list[i - 1].idx} (${list[i - 1].wMm}) auf idx ${list[i].idx} (${list[i].wMm})`)
      warnings++
    }
    const hJump = Math.abs(list[i].hMm - list[i - 1].hMm) / Math.max(list[i].hMm, list[i - 1].hMm)
    if (hJump > 0.2) {
      console.warn(`WARN ${kv}: Höhe springt um ${(hJump * 100).toFixed(0)} % zwischen Gr.idx ${list[i - 1].idx} (${list[i - 1].hMm}) und idx ${list[i].idx} (${list[i].hMm})`)
      warnings++
    }
  }
}
console.log(warnings ? `!! ${warnings} Validierungs-Warnungen — Debug-Overlays prüfen (extract-knee-contour.mjs)` : 'Validierung: Katalog-Abgleich + Monotonie OK')

// kneeContours.ts generieren
const header = `// Pro-Größe-Konturen für Knie-Schablonen — GENERIERT von
// scripts/build-knee-contours.mjs aus Referenz-Screenshots mit 25-mm-Kugel.
// NICHT manuell bearbeiten. Neu generieren bei Bild-Änderungen.
import type { KneeImplantKind } from './smithNephewCatalog'
import type { KneeView } from '../../state/kneeTemplateStore'

export interface KneeContourPoint { x: number; y: number }
export interface KneeContour { wMm: number; hMm: number; points: KneeContourPoint[]; approx?: boolean; inlaySplitY?: number }

function contourKey(kind: KneeImplantKind, view: KneeView, sizeIndex: number): string {
  return \`\${kind}|\${view}|\${sizeIndex}\`
}

export const KNEE_CONTOURS: Record<string, KneeContour> = `

// KOMPAKT: eine Kontur pro Zeile (statt hübsch mit einer Koordinate pro Zeile).
// Das ist ~3× kleiner → Vite/esbuild transformiert und der Browser parst das
// generierte Modul deutlich schneller bei jedem Laden. Lesbar bleibt es genug
// (je Zeile ein Implantat-Schlüssel), bearbeitet wird es ohnehin nie von Hand.
const body =
  '{\n' +
  Object.entries(entries)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n') +
  '\n}'
const footer = `

export function getKneeContour(
  kind: KneeImplantKind,
  view: KneeView,
  sizeIndex: number,
): KneeContour | null {
  return KNEE_CONTOURS[contourKey(kind, view, sizeIndex)] ?? null
}
`
writeFileSync('src/lib/knee/kneeContours.ts', header + body + footer)
console.log(`\n${Object.keys(entries).length} Konturen (${ok} extrahiert + ${derived} abgeleitet), ${skip} übersprungen → src/lib/knee/kneeContours.ts`)
