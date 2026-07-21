/**
 * Vite-Plugin „lokale Sicherung": kleine Same-Origin-Endpunkte, über die
 * die App Schablonen-Paket und Einrichtungs-Profil zusätzlich als DATEIEN
 * im Projektordner ablegt (.cendova-daten/, gitignored) und nach einem
 * Browser-Speicher-Verlust selbst wiederherstellt.
 *
 * Hintergrund (klinischer Befund): Auf Klinik-PCs löschen Gruppenrichtlinien
 * („Websitedaten beim Schließen löschen") IndexedDB + localStorage — Paket
 * und Profil waren dann beim nächsten Start weg. Der lokale Dev-Server ist
 * unser „Backend": Dateien auf Platte überleben jeden Browser-Wipe.
 *
 * Endpunkte (nur Dev-/Preview-Server; im statischen Hosting existieren sie
 * nicht → die App behandelt 404 als „keine Sicherung", alles bleibt wie
 * bisher):
 *   GET    /__cendova/sicherung/paket   → ZIP-Bytes  (404 wenn keine)
 *   PUT    /__cendova/sicherung/paket   → ZIP-Bytes speichern
 *   DELETE /__cendova/sicherung/paket   → Sicherung löschen
 *   GET/PUT/DELETE /__cendova/sicherung/profil  → profil.json analog
 *
 * Datenschutz: bleibt vollständig auf dem Rechner (localhost + lokale
 * Datei); Pakete enthalten Hersteller-Material → .cendova-daten/ ist
 * gitignored und wird nie übertragen.
 */
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATEN_DIR = join(dirname(fileURLToPath(import.meta.url)), '.cendova-daten')
const DATEIEN: Record<string, { datei: string; typ: string }> = {
  paket: { datei: 'schablonen-paket.zip', typ: 'application/zip' },
  profil: { datei: 'profil.json', typ: 'application/json' },
}
// Obergrenze für einen PUT-Body: Schablonen-Pakete sind Bild-lastig, aber
// selten > ~100 MB; das Profil ist winzig. Ohne Limit puffert der Server den
// ganzen Body im RAM (Buffer.concat) — ein Runaway-/böswilliger PUT könnte
// den Node-Prozess aufblähen (Security-Report §10, DoS). Bei Überschreitung
// fail closed mit 413 statt weiter zu sammeln.
const MAX_PUT_BYTES = 128 * 1024 * 1024

function behandle(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const m = /^\/__cendova\/sicherung\/(paket|profil)$/.exec(req.url ?? '')
  if (!m) return next()
  const { datei, typ } = DATEIEN[m[1]]
  const pfad = join(DATEN_DIR, datei)
  try {
    if (req.method === 'GET') {
      if (!existsSync(pfad)) {
        res.statusCode = 404
        res.end()
        return
      }
      const bytes = readFileSync(pfad)
      res.statusCode = 200
      res.setHeader('content-type', typ)
      res.setHeader('cache-control', 'no-store')
      res.end(bytes)
      return
    }
    if (req.method === 'PUT') {
      const chunks: Buffer[] = []
      let gesamt = 0
      let abgebrochen = false
      req.on('data', (c: Buffer) => {
        if (abgebrochen) return
        gesamt += c.length
        if (gesamt > MAX_PUT_BYTES) {
          // Streaming abbrechen, sobald das Limit reißt — nicht erst am Ende.
          abgebrochen = true
          chunks.length = 0
          res.statusCode = 413
          res.end()
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => {
        if (abgebrochen) return
        try {
          mkdirSync(DATEN_DIR, { recursive: true })
          writeFileSync(pfad, Buffer.concat(chunks))
          res.statusCode = 204
        } catch {
          res.statusCode = 500
        }
        res.end()
      })
      return
    }
    if (req.method === 'DELETE') {
      rmSync(pfad, { force: true })
      res.statusCode = 204
      res.end()
      return
    }
    res.statusCode = 405
    res.end()
  } catch {
    res.statusCode = 500
    res.end()
  }
}

export function lokaleSicherung(): Plugin {
  return {
    name: 'cendova-lokale-sicherung',
    configureServer(server) {
      server.middlewares.use(behandle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(behandle)
    },
  }
}
