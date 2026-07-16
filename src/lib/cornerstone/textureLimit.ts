/**
 * Lade-Validierung für Cornerstone-Bilder: macht aus einem LAUTLOS schwarzen
 * Viewport eine aussagekräftige Fehlermeldung. Zwei Versagensarten werden
 * abgedeckt, die `setStack`/`render` NICHT von selbst melden:
 *
 *  1. Dekodier-Fehler: Cornerstone meldet 0×0 (kein gültiges Bild) — z. B.
 *     nicht unterstützte Transfersyntax/Codec oder keine echte DICOM-Datei.
 *     Der eigentliche Fehler verpufft sonst als „Uncaught (in promise)".
 *  2. GPU-Texturgrenze: Cornerstone lädt jedes Bild als EINE WebGL-Textur;
 *     Bilder über `MAX_TEXTURE_SIZE` lassen sich nicht hochladen → schwarz.
 *
 * Geteilt von viewer.ts (Haupt-Pane) und viewer2.ts (seitliches Pane);
 * bewusst ein eigenes, viewer-unabhängiges Modul (kein Zirkelimport).
 *
 * Datenschutz: loggt/meldet ausschließlich Maße + Format — KEINE Patientendaten.
 */
import { metaData } from '@cornerstonejs/core'
import { extractImageHeader } from './dicomMeta'

/** Konservativer Fallback, falls die WebGL-Abfrage scheitert — viele
 *  ältere GPUs/Treiber deckeln die Texturkante hier. */
const FALLBACK_MAX_TEXTURE = 2048

let cached: number | null = null

/**
 * Größte von dieser GPU unterstützte Textur-Kantenlänge (px). Das Ergebnis
 * wird gecacht (Hardware-Konstante — ändert sich zur Laufzeit nicht). Es
 * wird ein wegwerfbarer WebGL-Kontext erzeugt; sein `MAX_TEXTURE_SIZE`
 * entspricht dem Limit, das auch Cornerstones Render-Kontext trifft.
 */
export function getMaxTextureSize(): number {
  if (cached != null) return cached
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null
    const size = gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 0
    // Probe-Kontext sofort freigeben — sonst zählt er dauerhaft gegen
    // Chromes 16-Kontexte-Limit (Debug-Befund K1).
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    cached = typeof size === 'number' && size > 0 ? size : FALLBACK_MAX_TEXTURE
  } catch {
    cached = FALLBACK_MAX_TEXTURE
  }
  return cached
}

/**
 * Prüft NACH dem Laden, ob das Bild tatsächlich anzeigbar ist, und wirft
 * sonst eine aussagekräftige Meldung (statt lautlos schwarz zu rendern).
 * Loggt zudem EINE knappe, datenschutzkonforme Diagnosezeile pro Ladevorgang.
 *
 * MUSS aufgerufen werden, NACHDEM `setStack` das Bild geladen hat. `diagBytes`
 * (die rohen DICOM-Bytes der Datei) sind optional, ermöglichen bei einem
 * Dekodier-Fehler aber die genaue Diagnose (Transfersyntax, Header-Maße).
 *
 * @param imageId   aktuelle Cornerstone-Image-ID (`viewport.getCurrentImageId()`)
 * @param diagBytes rohe Bytes derselben Datei — nur für die Fehlerdiagnose
 */
export function assertImageUsable(
  imageId: string | null | undefined,
  diagBytes?: ArrayBuffer | null,
): void {
  const plane = imageId
    ? (metaData.get('imagePlaneModule', imageId) as
        | { rows?: number; columns?: number }
        | undefined)
    : undefined
  const rows = plane?.rows ?? 0
  const columns = plane?.columns ?? 0
  const longest = Math.max(rows, columns)
  const max = getMaxTextureSize()

  // --- Fall 1: keine gültigen Maße → Bild wurde NICHT dekodiert. ---
  if (longest <= 0) {
    const hdr = diagBytes ? extractImageHeader(diagBytes) : null
    console.info(
      `[viewer] Bild NICHT dekodiert (0×0)` +
        (hdr
          ? ` · Header ${hdr.columns}×${hdr.rows} px · Transfersyntax ` +
            `${hdr.transferSyntaxUid ?? '?'} (${hdr.transferSyntaxName})` +
            (hdr.photometric ? ` · ${hdr.photometric}` : '') +
            (hdr.bitsAllocated ? ` · ${hdr.bitsAllocated} bit` : '')
          : ' · Header nicht lesbar (evtl. keine DICOM-Datei)'),
    )
    if (hdr && (hdr.rows > 0 || hdr.columns > 0)) {
      throw new Error(
        `Bild konnte nicht dekodiert werden. Der DICOM-Header meldet ` +
          `${hdr.columns}×${hdr.rows} px in der Transfersyntax ` +
          `${hdr.transferSyntaxUid ?? '?'} (${hdr.transferSyntaxName})` +
          `${hdr.photometric ? `, ${hdr.photometric}` : ''}` +
          `${hdr.bitsAllocated ? `, ${hdr.bitsAllocated} bit` : ''}. ` +
          `Dieses Format/dieser Codec wird vom Viewer derzeit nicht ` +
          `unterstützt — bitte das Bild als unkomprimiertes DICOM exportieren.`,
      )
    }
    throw new Error(
      `Bild konnte nicht geladen werden (keine gültigen Pixel-/Maß-Daten) — ` +
        `möglicherweise keine gültige DICOM-Bilddatei.`,
    )
  }

  // --- Fall 2: passt nicht in die GPU-Textur. ---
  const tooBig = longest > max
  console.info(
    `[viewer] Bild geladen: ${columns}×${rows} px · GPU-Texturgrenze ${max} px` +
      (tooBig ? ' · ZU GROSS → würde schwarz rendern' : ''),
  )
  if (tooBig) {
    throw new Error(
      `Bild ${columns}×${rows} px überschreitet die GPU-Texturgrenze dieses ` +
        `Geräts (${max} px) — Cornerstone kann es nicht anzeigen (der Viewport ` +
        `bliebe schwarz). Bitte das DICOM herunterskaliert laden ` +
        `(siehe scripts/downscale-dicom.mjs).`,
    )
  }
}
