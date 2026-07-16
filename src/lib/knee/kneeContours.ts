// Pro-Größe-Konturen für Knie-Schablonen.
//
// Im ÖFFENTLICHEN Repo ist diese Tabelle bewusst LEER: Die Konturen sind
// aus Hersteller-Schablonen abgeleitet und kommen aus dem importierten
// Schablonen-Paket — lib/templates/registry.ts ersetzt KNEE_CONTOURS beim
// Paket-Load in-place (siehe docs/schablonen-pakete.md). Eigene Daten
// erzeugt scripts/build-knee-contours.mjs aus selbst beschafften Quellen
// (Verpacken: export-template-package.mjs oder export-knee-contours-addon.mjs).
import type { KneeImplantKind } from './smithNephewCatalog'
import type { KneeView } from '../../state/kneeTemplateStore'

export interface KneeContourPoint { x: number; y: number }
export interface KneeContour {
  wMm: number
  hMm: number
  points: KneeContourPoint[]
  approx?: boolean
  inlaySplitY?: number
  /** 'dxf' = aus Original-Hersteller-DXF konvertiert (maßverifiziert) —
   *  schaltet u. a. die Narrow-Größen in der Auswahl frei. */
  quelle?: 'dxf'
  /** Resektions-Referenzpunkte (normalisiert wie die Punkte, y nach
   *  unten): Femur = distalste Kondylenpunkte links/rechts, Tibia =
   *  Baseplate-Oberkante. Ermöglicht Resektionslinie + M/L-Tiefen auch
   *  ohne Screenshot-Bild. */
  resect?: { left: [number, number]; right: [number, number] }
  /** Ausricht-Achse (Mittellinie), aus dem DXF gefittet: zwei Endpunkte,
   *  normalisiert wie die Punkte (y nach unten). Ersetzt die synthetische
   *  6°-Valgus-Achse, wenn vorhanden. */
  axis?: [[number, number], [number, number]]
  /** Innere Feature-Linien (z. B. Femur-Schild medial/lateral) als Liste
   *  von Segmenten [[x,y],[x,y]], normalisiert wie die Punkte. */
  features?: [[number, number], [number, number]][]
}

/**
 * Adapter: Kontur → KneeImage-kompatible Geometrie für die geteilte
 * Resektions-Mathematik (computeResectionLine/implantBoxes/autoPlace).
 * Trick: widthPx=wMm, heightPx=hMm, mmPerPx=1 → identische Physik,
 * ohne dass ein Bitmap existieren muss. `path` bleibt leer (nie gerendert).
 */
export function contourGeomImage(c: KneeContour): {
  path: string
  widthPx: number
  heightPx: number
  mmPerPx: number
  resect?: { left: [number, number]; right: [number, number] }
} {
  return { path: '', widthPx: c.wMm, heightPx: c.hMm, mmPerPx: 1, resect: c.resect }
}

function contourKey(kind: KneeImplantKind, view: KneeView, sizeIndex: number): string {
  return `${kind}|${view}|${sizeIndex}`
}

export const KNEE_CONTOURS: Record<string, KneeContour> = {}

export function getKneeContour(
  kind: KneeImplantKind,
  view: KneeView,
  sizeIndex: number,
): KneeContour | null {
  return KNEE_CONTOURS[contourKey(kind, view, sizeIndex)] ?? null
}
