// Hüft-Schablonen-Katalog (Pfannen + Schäfte).
//
// Im ÖFFENTLICHEN Repo ist der Katalog bewusst LEER: Die Inhalte sind
// Hersteller-Material und kommen aus dem importierten Schablonen-Paket —
// lib/templates/registry.ts ersetzt MEDACTA_CATALOG beim Paket-Load
// in-place (siehe docs/schablonen-pakete.md). Eigene Daten erzeugt
// scripts/extract-medacta-catalog.mjs aus selbst beschafften Quellen.

/** Eine konkrete Schablonengröße inkl. Bezugspunkten in PDF-Koordinaten. */
export interface MedactaSize {
  /** Hersteller-Größenangabe (numerisch als String, z. B. "0", "1", "40"). */
  size: string
  /** Referenznummer(n) im Hersteller-Katalog. */
  refNo: string
  /** Bezugspunkt im Template-PDF (zur Platzierung). */
  apOrigin: { x: number; y: number }
  /** Mögliche Kopfzentren je Halslänge (5 Stufen). */
  headPoints: { x: number; y: number }[]
  /** Dateiname der PDF-Schablone im Quell-Template-Ordner. */
  pdfFile: string
}

/** Eine Schablonenreihe (Familie + Variante). */
export interface MedactaEntry {
  folder: string
  component: 'Cup' | 'Stem'
  family: string
  variant: string
  sizes: MedactaSize[]
}

/**
 * Halslängen-STUFENRASTER in Millimetern (5 Stufen, Index 0..4).
 * Bleibt als UI-Raster auch im leeren Katalog erhalten — die abhängige
 * Konstante HEAD_OFFSET_COUNT wird beim Modul-Load fixiert, daher muss
 * die Länge stabil 5 sein (das Paketformat validiert das ebenfalls).
 * Ein importiertes Paket kann die Werte ersetzen.
 */
export const HEAD_OFFSETS_MM = [-4, 0, 4, 8, 12] as const

export const MEDACTA_CATALOG: MedactaEntry[] = []

/**
 * CCD-Winkel (Schenkelhals-Schaft-Winkel, Grad) je Katalog-Ordnername.
 * Hersteller-Katalogdaten — im ÖFFENTLICHEN Repo bewusst LEER; kommt aus
 * dem importierten Schablonen-Paket (Manifest-Feld `stemCcdByFolder`,
 * registry.ts ersetzt in-place). Ohne Eintrag gilt der neutrale
 * Default 135° (stemCcdDeg in templates.ts).
 */
export const STEM_CCD_BY_FOLDER: Record<string, number> = {}
