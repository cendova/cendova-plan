// Per-Größe-Bild-Overlays für Schulter-Schablonen (Knie-Muster).
//
// Im ÖFFENTLICHEN Repo ist dieser Index bewusst LEER: Die Inhalte sind
// Hersteller-Material und kommen aus dem importierten Schablonen-Paket —
// lib/templates/registry.ts ersetzt SHOULDER_IMAGES beim Paket-Load
// in-place. Eigene Daten erzeugt scripts/build-shoulder-contours.mjs
// (Zuschnitt der Kontur-Region aus den Quell-Screenshots).
//
// Wie beim Knie hat das BILD im Overlay Vorrang (fotografische Detail-
// qualität: Hilfslinien, saubere Kanten); die Vektor-Kontur aus
// shoulderContours ist Fallback und liefert weiterhin wMm/hMm.
import type { ShoulderImplantKind } from './shoulderCatalog'

export interface ShoulderImage {
  /** URL/Paket-Pfad des zugeschnittenen PNG (Zeichnung auf SCHWARZ). */
  path: string
  /** Bildmaße in Pixeln (zugeschnitten inkl. Rand). */
  widthPx: number
  heightPx: number
  /** Echte Millimeter pro Bildpixel (für maßstabsgetreue Skalierung). */
  mmPerPx: number
}

export const SHOULDER_IMAGES: Record<string, ShoulderImage> = {}

export function getShoulderImage(
  kind: ShoulderImplantKind,
  sizeIndex: number,
): ShoulderImage | null {
  return SHOULDER_IMAGES[`${kind}|AP|${sizeIndex}`] ?? null
}
