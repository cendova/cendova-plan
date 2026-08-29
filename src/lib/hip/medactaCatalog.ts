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

/**
 * Radaelli-Geometrieklassen ZEMENTFREIER Primärschäfte
 * (Radaelli et al. 2022, DOI 10.1016/j.arth.2022.09.014):
 * A flacher Taper · B1 rechteckiger Taper (gestrahlt) · B2 quadrangulärer
 * Taper (HA) · B3 verkürzter quadrangulärer Taper · C1–C3 fit-and-fill
 * (traditionell/anatomisch/kurz) · D konisch · E zylindrisch ·
 * F kalkargeführter Kurzschaft. Zementierte Schäfte haben KEINE Klasse.
 */
export const RADAELLI_KLASSEN = [
  'A',
  'B1',
  'B2',
  'B3',
  'C1',
  'C2',
  'C3',
  'D',
  'E',
  'F',
] as const
export type RadaelliKlasse = (typeof RADAELLI_KLASSEN)[number]

/**
 * Strukturiertes Planungsprofil eines Schafts — die fachliche Grundlage
 * der Schaft-Planungshinweise (stemPlanningRules): Regeln lesen NUR diese
 * Felder, nie Ordner- oder Markennamen. Der CCD-Winkel steht bewusst
 * NICHT hier — er hat mit `stemCcdByFolder` bereits eine Quelle, eine
 * zweite würde still divergieren.
 */
export interface StemPlanningProfile {
  /** Fixationsprinzip laut Hersteller. */
  fixation: 'cementless' | 'cemented'
  /** Radaelli-Klasse — NUR für zementfreie Schäfte; fehlt, wenn unbekannt. */
  radaelliClass?: RadaelliKlasse
  collar: 'none' | 'collared'
  /** Zone der primären Verankerung; bei zementierten Schäften 'cement'. */
  primaryFixation: 'metaphyseal' | 'metadiaphyseal' | 'diaphyseal' | 'cement'
  neckVariant?: 'regular' | 'short'
  offsetVariant?: 'standard' | 'lateralized'
  intendedUse: 'primary' | 'revision'
}

/**
 * Planungsprofil je Katalog-Ordnername. Wie STEM_CCD_BY_FOLDER im
 * öffentlichen Repo bewusst LEER — kommt aus dem Schablonen-Paket
 * (Manifest-Feld `stemProfileByFolder`, schlüsselweise Vereinigung).
 */
export const STEM_PROFILE_BY_FOLDER: Record<string, StemPlanningProfile> = {}
