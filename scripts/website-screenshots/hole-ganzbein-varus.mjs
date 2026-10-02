// Holt die frei lizenzierte Ganzbeinaufnahme für die Osteotomie-Screenshots
// und verpackt sie als Demo-DICOM (keine Patientendaten aus der Klinik).
//
// Quelle (CC BY 4.0): Stotter C, Klestil T, Chen K, Hummer A, Salzlechner C,
// Angele P, Nehrer S. Artificial intelligence-based analyses of varus leg
// alignment and after high tibial osteotomy show high accuracy and
// reproducibility. Knee Surg Sports Traumatol Arthrosc 2023;31:5885–5895.
// DOI 10.1007/s00167-023-07644-0 — Abb. 1, Panel oben links: native
// beidseitige Ganzbeinaufnahme im Stand, leichter Varus, Gelenkspalt
// erhalten (der Patient erhielt später eine öffnende HTO links).
// Verwendung als Ausschnitt + Umwandlung → Nachweis siehe
// docs/screenshots/QUELLEN.md.
//
// Pixelabstand 0,94 mm/px ist eine PLAUSIBLE ANNAHME (Femurlänge ≈ 45 cm,
// Hüftkopf ≈ 48 mm; das mitabgebildete Lineal liefert ≈ 0,91 mm/px).
//
// Aufruf:  node scripts/website-screenshots/hole-ganzbein-varus.mjs [zielordner]
// Ausgabe: <zielordner>/ganzbein-varus.png + ganzbein-varus.dcm
//          (Standard: .test-artifacts/website/quelle). Download über curl,
//          damit ein konfigurierter HTTPS-Proxy wie bei allen anderen
//          Skripten greift.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const HIER = dirname(fileURLToPath(import.meta.url))
const ZIEL = process.argv[2] ?? join(HIER, '..', '..', '.test-artifacts', 'website', 'quelle')
mkdirSync(ZIEL, { recursive: true })

const URL =
  'https://media.springernature.com/full/springer-static/image/' +
  'art%3A10.1007%2Fs00167-023-07644-0/MediaObjects/167_2023_7644_Fig1_HTML.jpg'
// Prüfsumme der Abbildung (Stand 10/2026) — bei Abweichung wurde die Datei
// beim Verlag ersetzt: Ausschnitt und Landmarken dann neu prüfen.
const SHA256 = 'ced6534b056e4796cc77b0ed7a5d4104b84452ee5c391c50a733f24b52cb9588'
// Panel oben links der vierteiligen Abbildung, ohne die dunkle Naht.
const AUSSCHNITT = { x: 0, y: 0, w: 436, h: 1217 }
const MM_PER_PX = 0.94

const roh = join(ZIEL, 'stotter-2023-fig1.jpg')
if (!existsSync(roh)) {
  console.log('Lade', URL)
  execFileSync('curl', ['-fsSL', '--retry', '3', '-o', roh, URL], { stdio: 'inherit' })
}
const ist = createHash('sha256').update(readFileSync(roh)).digest('hex')
if (ist !== SHA256) console.warn(`WARNUNG: Prüfsumme weicht ab (${ist}) — Ausschnitt prüfen.`)

const img = await loadImage(roh)
const c = createCanvas(AUSSCHNITT.w, AUSSCHNITT.h)
c.getContext('2d').drawImage(img, AUSSCHNITT.x, AUSSCHNITT.y, AUSSCHNITT.w, AUSSCHNITT.h, 0, 0, AUSSCHNITT.w, AUSSCHNITT.h)
const png = join(ZIEL, 'ganzbein-varus.png')
writeFileSync(png, c.toBuffer('image/png'))

const dcm = join(ZIEL, 'ganzbein-varus.dcm')
execFileSync(
  process.execPath,
  [
    join(HIER, '..', 'bild-zu-dicom.mjs'),
    '--in', png, '--out', dcm, '--mm-per-px', String(MM_PER_PX),
    '--name', 'Demo^Ganzbein bds.', '--desc', 'Ganzbein beidseits a.p. (Demo, CC BY 4.0)',
  ],
  { stdio: 'inherit' },
)
console.log('Fertig:', png, dcm)
