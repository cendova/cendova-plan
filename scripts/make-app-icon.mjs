/**
 * Erzeugt das macOS-App-Icon `installer/CendovaPlan.icns` aus DERSELBEN Quelle
 * wie der Windows-Shortcut: `public/favicon.ico` (Cendova-Voll-Icon, dunkles
 * Quadrat mit blauem „C" und amberfarbenem „V"). So ist das Mac-Icon garantiert
 * identisch zum Windows-Icon.
 *
 * Der Mac-Installer kopiert dieses .icns in das CendovaPlan.app-Bundle, damit
 * die App in Launchpad/Dock/Finder ein richtiges Icon zeigt — statt des
 * generischen Unix-Skript-Icons einer .command-Datei.
 *
 * Reproduzierbar (kein Date/Random): `node scripts/make-app-icon.mjs`. Braucht
 * nur @napi-rs/canvas (devDependency). Das ICNS-Format wird direkt geschrieben
 * (kein macOS-`iconutil` nötig, läuft also auch im Cloud-Container): Header
 * 'icns' + Gesamtlänge, danach je Icon ein Chunk aus 4-Byte-OSType +
 * 4-Byte-Länge (inkl. 8-Byte-Kopf) + PNG-Daten.
 *
 * Die .ico bringt native PNG-Kacheln (16/32/48/256) mit; für exakt passende
 * Zielgrößen nehmen wir diese direkt (schärfer als Umskalieren), sonst wird aus
 * der größten Kachel (256) skaliert.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const QUELLE = join(HIER, '..', 'public', 'favicon.ico')
const ZIEL = join(HIER, '..', 'installer', 'CendovaPlan.icns')

/** PNG-Kacheln aus einer .ico auslesen → Map { Kantenlänge: PNG-Buffer }. */
function icoKacheln(datei) {
  const b = readFileSync(datei)
  const anzahl = b.readUInt16LE(4)
  const kacheln = new Map()
  for (let i = 0; i < anzahl; i++) {
    const o = 6 + i * 16
    let w = b[o]
    if (w === 0) w = 256
    const groesse = b.readUInt32LE(o + 8)
    const off = b.readUInt32LE(o + 12)
    const daten = b.subarray(off, off + groesse)
    const istPng =
      daten[0] === 0x89 && daten[1] === 0x50 && daten[2] === 0x4e && daten[3] === 0x47
    if (istPng) kacheln.set(w, daten)
  }
  return kacheln
}

const kacheln = icoKacheln(QUELLE)
const master = [...kacheln.keys()].sort((a, b) => b - a)[0] // größte Kachel (256)
if (!master) throw new Error(`Keine PNG-Kacheln in ${QUELLE}`)
const masterBild = await loadImage(kacheln.get(master))

/** Ziel-PNG in Kantenlänge `s`: native .ico-Kachel wenn vorhanden, sonst skaliert. */
async function tile(s) {
  if (kacheln.has(s)) return kacheln.get(s) // native, unangetastet
  const c = createCanvas(s, s)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(masterBild, 0, 0, s, s)
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
  const png = await tile(groesse)
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
console.log(
  `Icon geschrieben: ${ZIEL} (${rumpf.length + 8} Bytes, Quelle ${master}px, ${CHUNKS.length} Größen)`,
)
