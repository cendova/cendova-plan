// Per-Größe-Bild-Overlays für Knie-Schablonen.
//
// Im ÖFFENTLICHEN Repo ist dieser Index bewusst LEER: Die Inhalte sind
// Hersteller-Material und kommen aus dem importierten Schablonen-Paket —
// lib/templates/registry.ts ersetzt KNEE_IMAGES beim Paket-Load in-place
// (siehe docs/schablonen-pakete.md). Eigene Daten lassen sich mit
// scripts/build-knee-images.mjs aus selbst beschafften Quellen erzeugen.
import type { KneeImplantKind } from './smithNephewCatalog'
import type { KneeView } from '../../state/kneeTemplateStore'

export interface KneeImage {
  /** URL/Paket-Pfad des zugeschnittenen PNG (Implantat-Zeichnung auf SCHWARZ). */
  path: string
  /** Bildmaße in Pixeln (zugeschnitten inkl. Rand). */
  widthPx: number
  heightPx: number
  /** Echte Millimeter pro Bildpixel (für maßstabsgetreue Skalierung). */
  mmPerPx: number
  /** Resektions-Referenzpunkte (normalisiert, Bildmitte = Ursprung, [-1..1]),
   *  links/rechts im Bild. Femur: distalste Kondylenpunkte. Tibia: Baseplate-
   *  Oberkante. Nur AP; fehlt, wenn nicht ableitbar. */
  resect?: { left: [number, number]; right: [number, number] }
}

export const KNEE_IMAGES: Record<string, KneeImage> = {}

export function getKneeImage(
  kind: KneeImplantKind,
  view: KneeView,
  sizeIndex: number,
): KneeImage | null {
  return KNEE_IMAGES[`${kind}|${view}|${sizeIndex}`] ?? null
}
