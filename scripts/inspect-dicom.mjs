/**
 * Liest die technischen Kopfdaten einer DICOM-Datei aus (keine
 * Patientendaten). Aufruf:  node scripts/inspect-dicom.mjs <pfad>
 */
import { readFileSync } from 'node:fs'
import dicomParser from 'dicom-parser'

const path = process.argv[2] || 'public/sample/xray.dcm'
const data = new Uint8Array(readFileSync(path))
const ds = dicomParser.parseDicom(data)

const transferSyntax = {
  '1.2.840.10008.1.2': 'Implicit VR LE',
  '1.2.840.10008.1.2.1': 'Explicit VR LE',
  '1.2.840.10008.1.2.2': 'Explicit VR BE',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless SV1',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000',
  '1.2.840.10008.1.2.5': 'RLE',
}

const ts = ds.string('x00020010')
console.log('Modalitaet:           ', ds.string('x00080060'))
console.log('Rows x Columns:       ', ds.uint16('x00280010'), 'x', ds.uint16('x00280011'))
console.log('PixelSpacing:         ', ds.string('x00280030') || '(fehlt)')
console.log('ImagerPixelSpacing:   ', ds.string('x00181164') || '(fehlt)')
console.log('BitsAllocated/Stored: ', ds.uint16('x00280100'), '/', ds.uint16('x00280101'))
console.log('PhotometricInterpret: ', ds.string('x00280004'))
console.log('SamplesPerPixel:      ', ds.uint16('x00280002'))
console.log('WindowCenter/Width:   ', ds.string('x00281050') || '-', '/', ds.string('x00281051') || '-')
console.log('TransferSyntax:       ', ts, '->', transferSyntax[ts] || 'unbekannt')
console.log('Anzahl Frames:        ', ds.string('x00280008') || '1')
