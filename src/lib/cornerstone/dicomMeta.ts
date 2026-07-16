import dicomParser from 'dicom-parser'
import type { PatientInfo } from '../../state/viewerStore'

/**
 * DICOM-Metadaten-Extraktion (Patienten-Identifikation aus den Tags).
 *
 * Bewusst in einem EIGENEN Modul — getrennt von viewer.ts und viewer2.ts —,
 * damit BEIDE Viewer es importieren können, OHNE einen Zirkelimport zu
 * erzeugen (viewer.ts ↔ viewer2.ts). Dieses Modul hängt nur von
 * dicom-parser + dem PatientInfo-Typ ab, von keinem Viewer.
 *
 * Datenschutz: liest nur lokale Bytes, gibt ein reines Datenobjekt zurück.
 */

/** Parst ein DICOM-Datum im Format JJJJMMTT zu einem Date (oder null). */
function parseDicomDate(raw: string | undefined): Date | null {
  if (!raw || raw.length < 8) return null
  const y = parseInt(raw.slice(0, 4), 10)
  const m = parseInt(raw.slice(4, 6), 10)
  const d = parseInt(raw.slice(6, 8), 10)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Vollendete Lebensjahre zwischen Geburt und Referenzdatum. */
function ageInYears(birth: Date, ref: Date): number {
  let age = ref.getFullYear() - birth.getFullYear()
  const beforeBirthday =
    ref.getMonth() < birth.getMonth() ||
    (ref.getMonth() === birth.getMonth() && ref.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return age
}

/**
 * Liest Patienten-Identifikation aus den rohen DICOM-Bytes.
 * PatientName (0010,0010) hat das Format „Nachname^Vorname^…".
 * BirthDate (0010,0030) und StudyDate (0008,0020) sind JJJJMMTT.
 * Das Alter wird zum Aufnahmezeitpunkt (StudyDate) berechnet, ersatzweise
 * zum heutigen Datum. Gibt null bei Parse-Fehler oder leeren Tags.
 */
export function extractPatientInfo(bytes: ArrayBuffer): PatientInfo | null {
  try {
    const dataSet = dicomParser.parseDicom(new Uint8Array(bytes))
    const rawName = (dataSet.string('x00100010') ?? '').trim()
    const parts = rawName.split('^')
    const lastName = (parts[0] ?? '').trim()
    const firstName = (parts[1] ?? '').trim()
    const birth = parseDicomDate(dataSet.string('x00100030'))
    const study = parseDicomDate(dataSet.string('x00080020'))
    const birthDate = birth
      ? `${String(birth.getDate()).padStart(2, '0')}.${String(
          birth.getMonth() + 1,
        ).padStart(2, '0')}.${birth.getFullYear()}`
      : null
    const ageYears = birth ? ageInYears(birth, study ?? new Date()) : null
    // PatientSize (0010,1020) ist in METERN → cm. PatientWeight (0010,1030)
    // ist bereits in kg.
    const sizeM = parseFloat(dataSet.string('x00101020') ?? '')
    const weightKgRaw = parseFloat(dataSet.string('x00101030') ?? '')
    const heightCm =
      Number.isFinite(sizeM) && sizeM > 0 ? Math.round(sizeM * 100) : null
    const weightKg =
      Number.isFinite(weightKgRaw) && weightKgRaw > 0
        ? Math.round(weightKgRaw)
        : null
    // Wenn gar nichts Verwertbares drin ist, kein Info-Objekt.
    if (!lastName && !firstName && !birthDate) return null
    return { lastName, firstName, birthDate, ageYears, heightCm, weightKg }
  } catch {
    return null
  }
}

// ----------------------------------------------------------------------
// Render-Diagnose: Header-Felder, die erklären, WARUM Cornerstone ein Bild
// evtl. nicht anzeigen kann (Transfersyntax/Codec, Maße, Photometrie).
// Genutzt, wenn der Viewport schwarz bleibt bzw. Cornerstone 0×0 meldet.
// ----------------------------------------------------------------------

/** Render-relevante DICOM-Headerfelder (rein lokal aus den Bytes gelesen). */
export interface DicomImageHeader {
  rows: number
  columns: number
  /** TransferSyntaxUID (0002,0010), z. B. „1.2.840.10008.1.2.4.90". */
  transferSyntaxUid: string | null
  /** Menschenlesbarer Name der Transfersyntax (oder „unbekannt/sonstige"). */
  transferSyntaxName: string
  /** PhotometricInterpretation (0028,0004), z. B. „MONOCHROME2". */
  photometric: string | null
  /** BitsAllocated (0028,0100). */
  bitsAllocated: number | null
}

/** UID → Klartext für die geläufigen DICOM-Transfersyntaxen. */
const TRANSFER_SYNTAX_NAMES: Record<string, string> = {
  '1.2.840.10008.1.2': 'Implicit VR Little Endian (unkomprimiert)',
  '1.2.840.10008.1.2.1': 'Explicit VR Little Endian (unkomprimiert)',
  '1.2.840.10008.1.2.1.99': 'Deflated Explicit VR Little Endian',
  '1.2.840.10008.1.2.2': 'Explicit VR Big Endian (unkomprimiert)',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline (8-bit)',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended (12-bit)',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless (Process 14)',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless (Process 14, SV1)',
  '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
  '1.2.840.10008.1.2.4.81': 'JPEG-LS Near-Lossless',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 (Lossless)',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000',
  '1.2.840.10008.1.2.5': 'RLE Lossless',
}

/**
 * Liest die render-relevanten Headerfelder aus den rohen DICOM-Bytes.
 * Bewusst unabhängig von Cornerstone — funktioniert auch dann, wenn der
 * Cornerstone-Decoder das Bild NICHT verarbeiten konnte (→ Diagnose).
 * Gibt null, wenn die Datei gar nicht als DICOM parsebar ist.
 */
export function extractImageHeader(bytes: ArrayBuffer): DicomImageHeader | null {
  try {
    const ds = dicomParser.parseDicom(new Uint8Array(bytes))
    const ts = (ds.string('x00020010') ?? '').trim() || null
    return {
      rows: ds.uint16('x00280010') ?? 0,
      columns: ds.uint16('x00280011') ?? 0,
      transferSyntaxUid: ts,
      transferSyntaxName: ts
        ? (TRANSFER_SYNTAX_NAMES[ts] ?? 'unbekannt/sonstige')
        : 'unbekannt',
      photometric: (ds.string('x00280004') ?? '').trim() || null,
      bitsAllocated: ds.uint16('x00280100') ?? null,
    }
  } catch {
    return null
  }
}
