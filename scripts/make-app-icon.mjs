/**
 * Erzeugt das macOS-App-Icon `installer/CendovaPlan.icns` aus dem Cendova-
 * Markenzeichen (identisch zum Favicon: amberfarbenes, abgerundetes Quadrat
 * mit dunklem „C"). Der Mac-Installer kopiert dieses .icns in das
 * CendovaPlan.app-Bundle, damit die App in Launchpad/Dock/Finder ein
 * richtiges Icon zeigt — statt des generischen Unix-Skript-Icons einer
 * .command-Datei.
 *
 * Reproduzierbar (kein Date/Random): Aufruf `node scripts/make-app-icon.mjs`.
 * Braucht nur @napi-rs/canvas (bereits devDependency). Das ICNS-Format wird
 * hier direkt geschrieben (kein macOS-`iconutil` nötig, läuft also auch im
 * Cloud-Container): Header 'icns' + Gesamtlänge, danach je Icon ein Chunk
 * aus 4-Byte-OSType + 4-Byte-Länge (inkl. 8-Byte-Kopf) + PNG-Daten.
 */
import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const ZIEL = join(HIER, '..', 'installer', 'CendovaPlan.icns')

const AMBER = '#ffc400'
const DUNKEL = '#141e2d'

/** Markenzeichen bei Kantenlänge `s` px auf ein Canvas zeichnen → PNG-Buffer. */
function zeichne(s) {
  const c = createCanvas(s, s)
  const ctx = c.getContext('2d')
  const k = s / 120 // Favicon-Koordinatensystem ist viewBox 0 0 120 120

  // Abgerundetes amberfarbenes Quadrat (rect 4,4 112×112, r=30).
  const x = 4 * k
  const w = 112 * k
  const r = 30 * k
  ctx.fillStyle = AMBER
  ctx.beginPath()
  ctx.moveTo(x + r, x)
  ctx.arcTo(x + w, x, x + w, x + w, r)
  ctx.arcTo(x + w, x + w, x, x + w, r)
  ctx.arcTo(x, x + w, x, x, r)
  ctx.arcTo(x, x, x + w, x, r)
  ctx.closePath()
  ctx.fill()

  // Dunkles „C": Bogen um (60,60), Radius 36, rechts offen (wie Favicon-Path
  // „M 88 38 A 36 36 0 1 0 88 82"). Halbwinkel der Lücke = atan2(22,28).
  const cx = 60 * k
  const halb = Math.atan2(22, 28)
  ctx.strokeStyle = DUNKEL
  ctx.lineWidth = 17 * k
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cx, 36 * k, halb, 2 * Math.PI - halb, false)
  ctx.stroke()

  return c.toBuffer('image/png')
}

// OSType je Zielgröße (Apple-Retina-Set, PNG-basiert ab macOS 10.7).
const CHUNKS = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32], // 16@2x
  ['ic12', 64], // 32@2x
  ['ic07', 128],
  ['ic13', 256], // 128@2x
  ['ic08', 256],
  ['ic14', 512], // 256@2x
  ['ic09', 512],
  ['ic10', 1024], // 512@2x
]

const teile = []
for (const [typ, groesse] of CHUNKS) {
  const png = zeichne(groesse)
  const kopf = Buffer.alloc(8)
  kopf.write(typ, 0, 'ascii')
  kopf.writeUInt32BE(png.length + 8, 4)
  teile.push(kopf, png)
}
const rumpf = Buffer.concat(teile)
const datei = Buffer.alloc(8)
datei.write('icns', 0, 'ascii')
datei.writeUInt32BE(rumpf.length + 8, 4)

mkdirSync(dirname(ZIEL), { recursive: true })
writeFileSync(ZIEL, Buffer.concat([datei, rumpf]))
console.log(`Icon geschrieben: ${ZIEL} (${(rumpf.length + 8)} Bytes, ${CHUNKS.length} Größen)`)
