/**
 * Zentrale Import-Obergrenzen (Security-Report §8/§10, „Lohnt-sich"-Tier).
 *
 * Alle Import-Pfade (ZIP-Ordner, einzelne DICOM-Datei, Plan-JSON,
 * Schablonen-Paket) teilen sich diese Werte, damit Grenzen an EINER Stelle
 * gepflegt werden. Die Werte sind BEWUSST GROSSZÜGIG: legitime Ganzbein-
 * DICOMs und CD-/Studien-Exporte dürfen NIE blockiert werden — die Grenzen
 * fangen nur klar bösartige/kaputte Eingaben ab (ZIP-Bomben, absurd große
 * Arrays, kaputte Zahlen). Bei Überschreitung: fail closed mit klarer
 * deutscher Fehlermeldung statt Browser-Hänger.
 *
 * Datenschutz: reine Zahlen-/Struktur-Prüfung, kein Patientenbezug.
 */
import { unzip, type UnzipFileInfo } from 'fflate'

const MB = 1024 * 1024
const GB = 1024 * MB

/** Einzelne DICOM-Datei: selbst große gestitchte 16-bit-Ganzbeinaufnahmen
 *  bleiben klar < 512 MB. Deckelt den RAM-/Base64-Pfad. */
export const MAX_DICOM_BYTES = 512 * MB

/** Grenzen fürs ZIP-Entpacken (Ordner-/CD-Import als Archiv). */
export interface ZipGrenzen {
  /** Max. Anzahl Einträge im Archiv. */
  maxEintraege: number
  /** Max. entpackte Gesamtgröße (Summe originalSize). */
  maxEntpackt: number
  /** Max. Kompressionsverhältnis je Datei (originalSize/size). DICOM ist
   *  kaum komprimierbar (~1–3:1); alles ≫ das ist eine Bombe. */
  maxRatio: number
  /** Ratio-Prüfung erst ab dieser entpackten Dateigröße — winzige Text-
   *  dateien (DICOMDIR, Manifeste) komprimieren extrem und sind harmlos. */
  ratioAbGroesse: number
}

export const ZIP_GRENZEN: ZipGrenzen = {
  maxEintraege: 10_000,
  maxEntpackt: 2 * GB,
  maxRatio: 100,
  ratioAbGroesse: 1 * MB,
}

/** Plan-JSON: max. Einträge je Kategorie (realistische Pläne: ≪ 100). */
export const MAX_PLAN_ARRAY = 5_000
/** Plan-JSON: max. Zeichen je Freitext-/Notizfeld. */
export const MAX_PLAN_STRING = 200_000
/** Plan-JSON: max. Länge eines eingebetteten Bildes als Base64. */
export const MAX_EMBEDDED_BASE64 = Math.ceil((MAX_DICOM_BYTES * 4) / 3) + 1024

/** Kalibrierung: mm pro Welt-Einheit muss endlich & plausibel sein. */
export const MIN_MM_PER_UNIT = 1e-6
export const MAX_MM_PER_UNIT = 1e6

/** Schablonen-Paket: max. Katalog-Einträge und referenzierte Bilder. */
export const MAX_PAKET_KATALOG = 20_000
export const MAX_PAKET_BILDER = 50_000

/**
 * Entpackt ein ZIP mit Ressourcengrenzen. Nutzt fflates Filter-Callback,
 * der je Eintrag die deklarierten Größen (aus dem Central Directory) VOR dem
 * Dekomprimieren liefert — eine Bombe wird abgelehnt, bevor sie den Speicher
 * flutet. Wirft bei Grenzverletzung; sonst wie ein normales unzip.
 */
export function unzipMitGrenzen(
  bytes: Uint8Array,
  grenzen: ZipGrenzen = ZIP_GRENZEN,
): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    let eintraege = 0
    let entpackt = 0
    let verletzung: string | null = null
    const filter = (file: UnzipFileInfo): boolean => {
      if (verletzung) return false
      eintraege += 1
      if (eintraege > grenzen.maxEintraege) {
        verletzung = `Archiv hat zu viele Dateien (> ${grenzen.maxEintraege}).`
        return false
      }
      entpackt += file.originalSize
      if (entpackt > grenzen.maxEntpackt) {
        verletzung = `Archiv entpackt zu groß (> ${Math.round(grenzen.maxEntpackt / MB)} MB).`
        return false
      }
      if (
        file.originalSize >= grenzen.ratioAbGroesse &&
        file.size > 0 &&
        file.originalSize / file.size > grenzen.maxRatio
      ) {
        verletzung =
          `Verdächtiges Kompressionsverhältnis (mögliche ZIP-Bombe) bei „${file.name}".`
        return false
      }
      return true
    }
    unzip(bytes, { filter }, (err, data) => {
      if (verletzung) return reject(new Error(verletzung))
      if (err) return reject(err)
      resolve(data)
    })
  })
}

/** Wirft, wenn eine DICOM-Datei/-Bytefolge die Größengrenze reißt. */
export function pruefeDicomGroesse(groesseBytes: number, name?: string): void {
  if (groesseBytes > MAX_DICOM_BYTES) {
    throw new Error(
      `DICOM-Datei${name ? ` „${name}"` : ''} ist zu groß ` +
        `(${Math.round(groesseBytes / MB)} MB > ${Math.round(MAX_DICOM_BYTES / MB)} MB).`,
    )
  }
}

/** Endliche Zahl im (inklusiven) Bereich? */
export function endlichIn(x: unknown, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max
}
