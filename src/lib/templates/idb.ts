/**
 * IndexedDB-Persistenz für das Schablonen-Paket. Bewusst ohne Wrapper-Lib —
 * wir brauchen genau zwei Stores und drei Operationen.
 *
 * DB `cendova.templates.v1`:
 *   Store `meta`   — key 'manifest' → Manifest-Objekt (structured clone)
 *   Store `images` — key = Paket-Pfad (`images/...`) → Blob
 *
 * Blobs in IndexedDB sind dateibasiert (der Browser hält Handles, keine
 * Speicherkopien) — auch ein 13-MB-Paket belastet weder Start- noch
 * Ladezeit spürbar.
 */

const DB_NAME = 'cendova.templates.v1'
// Schlüssel der Abgleichs-Marke im META-Store (Beschreibung s. unten).
const SICHERUNGS_HASH = 'sicherungsHash'
const DB_VERSION = 1
const META = 'meta'
const IMAGES = 'images'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open fehlgeschlagen'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Transaktion fehlgeschlagen'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB-Transaktion abgebrochen'))
  })
}

/** Gespeichertes Paket laden — null, wenn keins (oder kein IndexedDB) da ist. */
export async function idbLoadPackage(): Promise<{
  manifest: unknown
  images: Map<string, Blob>
} | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await openDb()
  try {
    // WICHTIG: Alle Requests VOR dem ersten await starten. IndexedDB-
    // Transaktionen committen automatisch, sobald keine Requests mehr
    // anstehen — ein await zwischen zwei Requests beendet die Transaktion
    // je nach Engine (Safari!) vorzeitig → TransactionInactiveError.
    const tx = db.transaction([META, IMAGES], 'readonly')
    const manifestReq = tx.objectStore(META).get('manifest')
    const keysReq = tx.objectStore(IMAGES).getAllKeys()
    const blobsReq = tx.objectStore(IMAGES).getAll()
    await txDone(tx)
    const manifest: unknown = manifestReq.result
    if (!manifest) return null
    const images = new Map<string, Blob>()
    keysReq.result.forEach((k, i) => {
      const b = blobsReq.result[i]
      if (typeof k === 'string' && b instanceof Blob) images.set(k, b)
    })
    return { manifest, images }
  } finally {
    db.close()
  }
}

/** Paket atomar speichern (ersetzt ein evtl. vorhandenes komplett).
 *  `sicherungsHash` (Stand der Datei-Sicherung, aus der das Paket stammt)
 *  wird IN DERSELBEN Transaktion abgelegt: ein nachgelagertes Schreiben
 *  ließ bei einer Unterbrechung (Reload mitten in der Übernahme) ein Paket
 *  OHNE Marke zurück — der nächste Start hielt sich dann für eine
 *  Alt-Installation und schrieb die geteilte Datei unnötig um. */
export async function idbStorePackage(
  manifest: unknown,
  images: Map<string, Blob>,
  sicherungsHash?: string | null,
): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction([META, IMAGES], 'readwrite')
    tx.objectStore(META).clear()
    tx.objectStore(IMAGES).clear()
    tx.objectStore(META).put(manifest, 'manifest')
    if (sicherungsHash) tx.objectStore(META).put(sicherungsHash, SICHERUNGS_HASH)
    for (const [path, blob] of images) tx.objectStore(IMAGES).put(blob, path)
    await txDone(tx)
  } finally {
    db.close()
  }
}

/** Gespeichertes Paket löschen. */
export async function idbClearPackage(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  try {
    const tx = db.transaction([META, IMAGES], 'readwrite')
    tx.objectStore(META).clear()
    tx.objectStore(IMAGES).clear()
    await txDone(tx)
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Abgleichs-Marke der Datei-Sicherung (SHA-256 der zuletzt gesehenen
// .cendova-daten/schablonen-paket.zip). Über sie erkennen MEHRERE Browser-
// Herkünfte (CendovaPlan allein auf :5173, eingebettet unter der
// CendovaView-Origin), ob die geteilte Sicherungs-Datei einen anderen Stand
// trägt als die eigene IndexedDB — und gleichen sich beim Start an.
// Liegt bewusst im META-Store: idbStorePackage/idbClearPackage räumen sie
// damit automatisch mit ab (ein frisch importiertes Paket hat noch keinen
// bestätigten Datei-Stand).
// ---------------------------------------------------------------------------
/** Gemerkten Datei-Stand lesen — null, wenn (noch) keiner bestätigt ist. */
export async function idbLadeSicherungsHash(): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await openDb()
  try {
    const tx = db.transaction(META, 'readonly')
    const req = tx.objectStore(META).get(SICHERUNGS_HASH)
    await txDone(tx)
    return typeof req.result === 'string' ? req.result : null
  } finally {
    db.close()
  }
}

/** Datei-Stand merken (nach bestätigtem Schreiben bzw. Import der Datei). */
export async function idbMerkeSicherungsHash(hash: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  try {
    const tx = db.transaction(META, 'readwrite')
    tx.objectStore(META).put(hash, SICHERUNGS_HASH)
    await txDone(tx)
  } finally {
    db.close()
  }
}
