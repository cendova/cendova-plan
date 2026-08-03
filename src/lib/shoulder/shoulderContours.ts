// Pro-Größe-Konturen für Schulter-Schablonen.
//
// Im ÖFFENTLICHEN Repo ist diese Tabelle bewusst LEER: Die Konturen sind
// aus Hersteller-Schablonen abgeleitet und kommen aus dem importierten
// Schablonen-Paket — lib/templates/registry.ts ersetzt SHOULDER_CONTOURS
// beim Paket-Load in-place (Doktrin wie KNEE_CONTOURS). Eigene Daten
// erzeugt scripts/build-shoulder-contours.mjs aus selbst beschafften
// Quellen (Verpacken: scripts/export-shoulder-package.mjs).
//
// Schlüssel `${kind}|AP|${sizeIndex}` — die Schulter kennt nur die
// a.p.-Sicht (Grashey), das view-Segment bleibt aus Konsistenz zum
// Knie-Format im Schlüssel.
import type { ShoulderImplantKind } from './shoulderCatalog'

export interface ShoulderContourPoint { x: number; y: number }
export interface ShoulderContour {
  /** Reale Maße der Kontur-BBox in mm (bei gekippt aufgenommenen Serien:
   *  Maße der gekippten Lage — siehe approx). */
  wMm: number
  hMm: number
  /** Umriss, x/y unabhängig auf [-1,1] normalisiert, y nach unten. */
  points: ShoulderContourPoint[]
  /** true = nur Kugel-kalibriert (±2 %), ohne Hersteller-Soll-Abgleich. */
  approx?: boolean
  /** Ausricht-Achse (zwei Endpunkte, normalisiert wie points). */
  axis?: [[number, number], [number, number]]
  /** Innere Feature-Linien als Segmente, normalisiert wie points. */
  features?: [[number, number], [number, number]][]
}

function contourKey(kind: ShoulderImplantKind, sizeIndex: number): string {
  return `${kind}|AP|${sizeIndex}`
}

export const SHOULDER_CONTOURS: Record<string, ShoulderContour> = {}

export function getShoulderContour(
  kind: ShoulderImplantKind,
  sizeIndex: number,
): ShoulderContour | null {
  return SHOULDER_CONTOURS[contourKey(kind, sizeIndex)] ?? null
}
