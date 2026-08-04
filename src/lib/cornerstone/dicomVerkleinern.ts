/**
 * Automatische Verkleinerung zu großer DICOM-Bilder BEIM LADEN.
 *
 * Hintergrund: Cornerstone lädt jedes Bild als EINE GPU-Textur. Deren
 * Kantenlimit ist gerätespezifisch (häufig 8192 px, auf stärkeren Karten
 * 16384). Eine Ganzbeinaufnahme mit z. B. 8818 px Höhe lief damit auf dem
 * einen Rechner anstandslos und scheiterte auf dem nächsten — für die
 * Anwender nicht durchschaubar, und der frühere Rat („mit einem Skript
 * verkleinern") ist im Klinikalltag keine Antwort. Ein Ganzbein ist der
 * Normalfall dieses Programms; die App muss das selbst lösen.
 *
 * Vorgehen: Übersteigt die längste Kante das Limit, werden die Pixel per
 * FLÄCHENMITTELUNG um einen ganzzahligen Faktor verkleinert (gleiche
 * Rechnung wie scripts/downscale-dicom.mjs) und der Pixelabstand um
 * denselben Faktor VERGRÖSSERT — Messungen bleiben dadurch exakt gültig.
 *
 * Die Datei wird dabei CHIRURGISCH gepatcht statt neu geschrieben: Nur
 * Rows, Columns, PixelSpacing/ImagerPixelSpacing (längenneutral, mit
 * Leerzeichen aufgefüllt) und die Pixeldaten selbst ändern sich — alle
 * übrigen Tags (Patientenname, Studiendaten, Fensterung …) bleiben
 * byte-identisch erhalten. So überlebt auch die Plan-Einbettung: Der Plan
 * speichert die verkleinerte Datei und lädt überall wieder.
 *
 * Bewusst NICHT behandelt (Rückgabe unverändert, die bestehende
 * Fehlerdiagnose greift):
 *  - komprimierte Transfersyntaxen (Pixeldaten erst nach Decode greifbar),
 *  - Big Endian (Bytefolge der Pixel wäre zu drehen; in der Praxis
 *    ausgestorben),
 *  - Farbbilder (samplesPerPixel ≠ 1) und Mehrbild-Dateien.
 */
import dicomParser from 'dicom-parser'

/** Unkomprimierte Little-Endian-Transfersyntaxen. */
const UNKOMPRIMIERT_LE = new Set([
  '1.2.840.10008.1.2', // Implicit VR LE
  '1.2.840.10008.1.2.1', // Explicit VR LE
])

export interface VerkleinerungsErgebnis {
  bytes: ArrayBuffer
  /** true, wenn tatsächlich verkleinert wurde. */
  skaliert: boolean
  faktor: number
  vorher: { cols: number; rows: number }
  nachher: { cols: number; rows: number }
}

/**
 * Verkleinert die DICOM-Bytes, falls die längste Kante `maxKante`
 * übersteigt und das Format es erlaubt. Sonst kommen die Bytes unverändert
 * zurück (`skaliert: false`) — nie eine Exception für „passt schon".
 */
export function verkleinereDicomFallsNoetig(
  eingabe: ArrayBuffer,
  maxKante: number,
): VerkleinerungsErgebnis {
  const roh = new Uint8Array(eingabe)
  const unveraendert = (cols = 0, rows = 0): VerkleinerungsErgebnis => ({
    bytes: eingabe,
    skaliert: false,
    faktor: 1,
    vorher: { cols, rows },
    nachher: { cols, rows },
  })

  let ds: ReturnType<typeof dicomParser.parseDicom>
  try {
    ds = dicomParser.parseDicom(roh)
  } catch {
    return unveraendert() // keine lesbare DICOM-Datei → Diagnose übernimmt
  }

  const cols = ds.uint16('x00280011') ?? 0
  const rows = ds.uint16('x00280010') ?? 0
  const laengste = Math.max(cols, rows)
  if (laengste === 0 || laengste <= maxKante) return unveraendert(cols, rows)

  const ts = ds.string('x00020010') ?? '1.2.840.10008.1.2'
  const bitsAllocated = ds.uint16('x00280100') ?? 16
  const samplesPerPixel = ds.uint16('x00280002') ?? 1
  const anzahlFrames = parseInt(ds.string('x00280008') ?? '1', 10) || 1
  const pd = ds.elements.x7fe00010
  if (
    !UNKOMPRIMIERT_LE.has(ts) ||
    bitsAllocated !== 16 ||
    samplesPerPixel !== 1 ||
    anzahlFrames !== 1 ||
    !pd ||
    pd.length === 0xffffffff || // undefined length = encapsulated
    pd.length < cols * rows * 2
  ) {
    return unveraendert(cols, rows)
  }

  // --- Flächenmittelung um ganzzahligen Faktor -------------------------
  const faktor = Math.ceil(laengste / maxKante)
  const outCols = Math.floor(cols / faktor)
  const outRows = Math.floor(rows / faktor)
  // Vorzeichen beachten: PixelRepresentation 1 = signed.
  const signed = (ds.uint16('x00280103') ?? 0) === 1
  const quelle = signed
    ? new Int16Array(eingabe, pd.dataOffset, cols * rows)
    : new Uint16Array(eingabe, pd.dataOffset, cols * rows)
  const ziel = signed
    ? new Int16Array(outCols * outRows)
    : new Uint16Array(outCols * outRows)
  for (let oy = 0; oy < outRows; oy++) {
    for (let ox = 0; ox < outCols; ox++) {
      let summe = 0
      for (let dy = 0; dy < faktor; dy++) {
        const sy = oy * faktor + dy
        for (let dx = 0; dx < faktor; dx++) {
          summe += quelle[sy * cols + ox * faktor + dx]
        }
      }
      ziel[oy * outCols + ox] = Math.round(summe / (faktor * faktor))
    }
  }

  // --- Chirurgische Patches --------------------------------------------
  // Kopf (alles vor den Pixeldaten) kopieren, Werte darin patchen, dann
  // die neuen Pixeldaten anhängen. Elemente NACH den Pixeldaten (selten)
  // werden unverändert übernommen.
  const kopf = roh.slice(0, pd.dataOffset)
  const sicht = new DataView(kopf.buffer)

  const patchUS = (tag: string, wert: number) => {
    const el = ds.elements[tag]
    if (el && el.length === 2 && el.dataOffset < pd.dataOffset)
      sicht.setUint16(el.dataOffset, wert, true)
  }
  patchUS('x00280010', outRows)
  patchUS('x00280011', outCols)

  // Pixelabstand längenneutral ersetzen: neuer DS-String wird auf exakt
  // die alte Feldlänge mit Leerzeichen aufgefüllt (DS erlaubt das); passt
  // die nötige Präzision nicht hinein, wird gerundet.
  const patchSpacing = (tag: string) => {
    const el = ds.elements[tag]
    if (!el || el.dataOffset >= pd.dataOffset || el.length < 3) return
    const alt = ds.string(tag)
    if (!alt) return
    const teile = alt.split('\\').map((t) => parseFloat(t))
    if (teile.some((t) => !isFinite(t) || t <= 0)) return
    for (let dezimal = 6; dezimal >= 1; dezimal--) {
      const neu = teile.map((t) => (t * faktor).toFixed(dezimal)).join('\\')
      if (neu.length <= el.length) {
        const gefuellt = neu.padEnd(el.length, ' ')
        for (let i = 0; i < el.length; i++)
          kopf[el.dataOffset + i] = gefuellt.charCodeAt(i)
        return
      }
    }
  }
  patchSpacing('x00280030') // PixelSpacing
  patchSpacing('x00181164') // ImagerPixelSpacing

  // Längenfeld der Pixeldaten: die 4 Bytes unmittelbar vor den Daten —
  // gilt für Explicit VR (OW, 12-Byte-Kopf) UND Implicit VR (8-Byte-Kopf).
  const neuePixel = new Uint8Array(ziel.buffer)
  sicht.setUint32(pd.dataOffset - 4, neuePixel.length, true)

  const dahinter = roh.slice(pd.dataOffset + pd.length)
  const ausgabe = new Uint8Array(kopf.length + neuePixel.length + dahinter.length)
  ausgabe.set(kopf, 0)
  ausgabe.set(neuePixel, kopf.length)
  ausgabe.set(dahinter, kopf.length + neuePixel.length)

  return {
    bytes: ausgabe.buffer,
    skaliert: true,
    faktor,
    vorher: { cols, rows },
    nachher: { cols: outCols, rows: outRows },
  }
}
