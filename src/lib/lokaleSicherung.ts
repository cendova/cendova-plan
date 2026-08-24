/**
 * App-Seite der lokalen Sicherung (Gegenstück zu vite-lokale-sicherung.ts):
 * legt Schablonen-Paket und Einrichtungs-Profil zusätzlich als Dateien im
 * Projektordner ab und holt sie nach einem Browser-Speicher-Verlust zurück
 * (Klinik-PCs löschen Websitedaten teils per Richtlinie beim Schließen).
 *
 * Alle Aufrufe sind defensiv: Existieren die Endpunkte nicht (statisches
 * Hosting ohne Dev-/Preview-Server) oder schlägt etwas fehl, verhält sich
 * die App exakt wie bisher — die Sicherung ist ein reines Zusatznetz.
 */
import { logDiagnostic } from './diagnostics'

const BASIS = '/__cendova/sicherung/'

/**
 * Sicherung nur im lokalen Betrieb (Dev-/Preview-Server auf localhost).
 * Auf öffentlichem Hosting (z. B. der GitHub-Pages-Demo) wird gar kein
 * Request versucht — die Endpunkte existieren dort ohnehin nicht, und so
 * verlässt auch kein Paket-/Profil-Byte den Browser.
 */
function lokalerBetrieb(): boolean {
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1'
}

export type SicherungsName = 'paket' | 'profil' | 'traces'

/** Sicherung lesen — null bei „keine vorhanden" ODER „Endpunkt fehlt". */
export async function sicherungLaden(name: SicherungsName): Promise<Uint8Array | null> {
  if (!lokalerBetrieb()) return null
  try {
    const res = await fetch(BASIS + name, { cache: 'no-store' })
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Sicherung schreiben. Meldet zurück, ob die Datei BESTÄTIGT geschrieben
 * wurde — der Paket-Abgleich (registry.ts) merkt sich den Datei-Stand nur
 * dann; ein unbestätigter Stand könnte sonst beim nächsten Start eine ALTE
 * Datei als „neuer" erscheinen lassen und den Import stillschweigend
 * zurückdrehen. Fehler landen weiterhin nur im Diagnose-Log.
 */
export function sicherungSchreiben(
  name: SicherungsName,
  daten: Uint8Array | string,
): Promise<boolean> {
  if (!lokalerBetrieb()) return Promise.resolve(false)
  const body = typeof daten === 'string' ? daten : new Blob([new Uint8Array(daten)])
  return fetch(BASIS + name, { method: 'PUT', body })
    .then((res) => {
      if (res.ok) return true
      if (res.status !== 404) {
        logDiagnostic(`Lokale Sicherung (${name}): Schreiben fehlgeschlagen (${res.status})`)
      }
      return false
    })
    .catch(() => {
      /* Endpunkt fehlt (statisches Hosting) — bewusst still. */
      return false
    })
}

/** Sicherung löschen (z. B. „Paket entfernen", „Profil zurücksetzen"). */
export function sicherungLoeschen(name: SicherungsName): void {
  if (!lokalerBetrieb()) return
  void fetch(BASIS + name, { method: 'DELETE' }).catch(() => {
    /* s. o. */
  })
}

/**
 * Browser bitten, den Speicher dieser Herkunft als PERSISTENT zu markieren
 * (schützt vor automatischer Räumung bei Speicherdruck — nicht vor
 * expliziten „Websitedaten löschen"-Richtlinien; dafür gibt es die
 * Datei-Sicherung). Ergebnis nur fürs Diagnose-Log.
 */
export async function persistentenSpeicherAnfordern(): Promise<void> {
  try {
    if (navigator.storage?.persist) {
      const persistent = await navigator.storage.persist()
      logDiagnostic(`Browser-Speicher persistent: ${persistent ? 'ja' : 'nein (best effort)'}`)
    }
  } catch {
    /* nicht unterstützt — egal */
  }
}
