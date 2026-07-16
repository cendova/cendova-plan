/**
 * Ordner-Import: erlaubt, einen GANZEN DICOM-Ordner zu laden (z. B. eine
 * CD-/Export-Struktur PATIENT/STUDY/SERIES + DICOMDIR) — per Drag-&-Drop des
 * Ordners ODER über „Ordner wählen", statt manuell zur einzelnen Bilddatei zu
 * navigieren. Es wird rekursiv gesammelt und auf die wahrscheinliche(n)
 * DICOM-BILDdatei(en) gefiltert: der DICOMDIR-Index (enthält keine Pixel) und
 * offensichtliche Beilagen (Viewer, Doku, Bilder) werden übersprungen.
 *
 * Datenschutz: rein lokal — es werden nur File-Objekte im Browser gelesen,
 * nichts hochgeladen.
 */
import { unzip } from 'fflate'

/** Liest ALLE Einträge eines Verzeichnisses (readEntries liefert in Chunks
 *  von ~100 → bis leer weiterlesen). */
function readAllEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const out: FileSystemEntry[] = []
    const read = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(out)
        else {
          out.push(...batch)
          read()
        }
      }, reject)
    read()
  })
}

function entryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

/** Rekursiv: ein Entry → alle enthaltenen Dateien. */
async function walkEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    try {
      return [await entryToFile(entry as FileSystemFileEntry)]
    } catch {
      return []
    }
  }
  if (entry.isDirectory) {
    const children = await readAllEntries(
      (entry as FileSystemDirectoryEntry).createReader(),
    )
    return (await Promise.all(children.map(walkEntry))).flat()
  }
  return []
}

/**
 * Sammelt alle Dateien aus einem Drop — inkl. rekursiver Ordner, sofern der
 * Browser die webkit-Directory-Entry-API bietet. Fallback: flache Dateiliste.
 *
 * WICHTIG: Die Entries werden SYNCHRON gegriffen, denn `DataTransfer` ist nach
 * Rückkehr aus dem Drop-Handler nicht mehr gültig.
 */
export async function collectFilesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = dt.items
  const entries: FileSystemEntry[] = []
  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.()
      if (entry) entries.push(entry)
    }
  }
  if (entries.length === 0) return expandZips(Array.from(dt.files))
  const collected = (await Promise.all(entries.map(walkEntry))).flat()
  return expandZips(collected)
}

/** fflate-unzip als Promise. */
function unzipBytes(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (err, data) => (err ? reject(err) : resolve(data)))
  })
}

/**
 * Packt .zip-Dateien in der Liste aus und ersetzt sie durch die enthaltenen
 * Dateien (über die gesamte ZIP-Struktur). Nicht-ZIPs bleiben unverändert;
 * defekte/leere Archive werden übersprungen. So funktioniert „reinziehen"
 * auch mit einem ZIP — die relevante DICOM-Datei wird danach automatisch
 * gewählt (pickDicomImageFiles).
 */
export async function expandZips(files: File[]): Promise<File[]> {
  const out: File[] = []
  for (const f of files) {
    if (!/\.zip$/i.test(f.name)) {
      out.push(f)
      continue
    }
    try {
      const entries = await unzipBytes(new Uint8Array(await f.arrayBuffer()))
      for (const [path, data] of Object.entries(entries)) {
        if (path.endsWith('/') || data.length === 0) continue // Verzeichnis
        const name = path.split('/').pop() || path
        // In ein frisches, ArrayBuffer-gestütztes Uint8Array kopieren (fflate
        // liefert Uint8Array<ArrayBufferLike>, das File() nicht direkt nimmt).
        out.push(
          new File([new Uint8Array(data)], name, {
            type: 'application/octet-stream',
          }),
        )
      }
    } catch (e) {
      console.warn('[load] ZIP konnte nicht entpackt werden:', f.name, e)
    }
  }
  return out
}

// Endungen, die sicher KEINE DICOM-Bilder sind (CD-Beilagen, Viewer, Doku).
const NON_DICOM_EXT =
  /\.(exe|inf|ini|txt|htm|html|xml|js|css|jpe?g|png|gif|bmp|tiff?|pdf|zip|rar|7z|dll|json|csv|log|md|rtf|docx?|xlsx?)$/i

/**
 * Wählt aus einer (Ordner-)Dateiliste die wahrscheinlichen DICOM-Bilddateien:
 *  - DICOMDIR-Index raus (reiner Verzeichnis-Index, keine Pixeldaten),
 *  - versteckte Dateien + offensichtliche Nicht-DICOM-Beilagen raus,
 *  - GRÖSSTE zuerst — Röntgen/DX sind die größten Dateien, Scout/Secondary-
 *    Capture klein; so erscheint die relevante Aufnahme zuerst.
 * DICOM-Dateien haben oft KEINE Endung → wir filtern per Ausschluss, nicht per
 * Whitelist. Die endgültige Validierung (dekodierbar?) macht der Loader.
 */
export function pickDicomImageFiles(files: File[]): File[] {
  const candidates = files.filter((f) => {
    const name = f.name
    if (/^DICOMDIR$/i.test(name)) return false
    if (name.startsWith('.')) return false
    if (NON_DICOM_EXT.test(name)) return false
    return f.size > 0
  })
  return candidates.sort((a, b) => b.size - a.size)
}
