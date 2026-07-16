// Schaft-Bild-Index (Hüfte).
//
// Im ÖFFENTLICHEN Repo ist dieser Index bewusst LEER: Die Inhalte sind
// Hersteller-Material und kommen aus dem importierten Schablonen-Paket —
// lib/templates/registry.ts ersetzt MEDACTA_IMAGES beim Paket-Load
// in-place (siehe docs/schablonen-pakete.md). Eigene Daten erzeugt
// scripts/rasterize-medacta-templates.mjs aus selbst beschafften Quellen.

/** Metadaten eines auf das Implantat zugeschnittenen PNGs. */
export interface MedactaImageMeta {
  /** URL/Paket-Pfad des PNG. */
  path: string
  /** PNG-Größe in Pixeln (NACH dem Crop). */
  widthPx: number
  heightPx: number
  /** Millimeter pro Pixel — Welt-Skala leitet sich daraus ab. */
  mmPerPx: number
  /** apOrigin (Anker aus Osirix-Katalog) in PNG-Pixel-Koordinaten. */
  apOriginPx: [number, number]
  /** Kopfzentren je Halslängen-Index in PNG-Pixel-Koordinaten. */
  headPointsPx: [number, number][]
  /** Proximale laterale Schulter in PNG-Pixel-Koordinaten — Pivot für
   *  die Drehung der Schablone (Top-Left-most Inkable-Pixel). */
  shoulderPx: [number, number]
  /** Längsachse des Schaftkörpers im PNG, als Winkel von der positiven
   *  X-Achse (Canvas-Konvention, im Uhrzeigersinn). Wird in
   *  useStemContourPlacement als baselineDeg verwendet. */
  bodyAxisAngleDeg: number
}

/** Index aller Schaft-Bilder, keyed by Katalog-Ordner und Referenznummer. */
export const MEDACTA_IMAGES: Record<string, Record<string, MedactaImageMeta>> = {}
