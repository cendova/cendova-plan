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

export type SicherungsName = 'paket' | 'profil'

/** Sicherung lesen — null bei „keine vorhanden" ODER „Endpunkt fehlt". */
export async function sicherungLaden(name: SicherungsName): Promise<Uint8Array | null> {
  try {
    const res = await fetch(BASIS + name, { cache: 'no-store' })
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

/** Sicherung schreiben — fire-and-forget (Fehler nur ins Diagnose-Log). */
export function sicherungSchreiben(name: SicherungsName, daten: Uint8Array | string): void {
  const body = typeof daten === 'string' ? daten : new Blob([new Uint8Array(daten)])
  void fetch(BASIS + name, { method: 'PUT', body })
    .then((res) => {
      if (!res.ok && res.status !== 404) {
        logDiagnostic(`Lokale Sicherung (${name}): Schreiben fehlgeschlagen (${res.status})`)
      }
    })
    .catch(() => {
      /* Endpunkt fehlt (statisches Hosting) — bewusst still. */
    })
}

/** Sicherung löschen (z. B. „Paket entfernen", „Profil zurücksetzen"). */
export function sicherungLoeschen(name: SicherungsName): void {
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
