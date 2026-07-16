/**
 * Implantat-Katalog für das Knie-Modul (Typen + Logik).
 *
 * Im ÖFFENTLICHEN Repo sind alle MASSTABELLEN bewusst LEER: Die Zahlen
 * stammen aus Hersteller-Spezifikations-Guides und kommen aus dem
 * importierten Schablonen-Paket — lib/templates/registry.ts ersetzt die
 * Tabellen beim Paket-Load in-place (siehe docs/schablonen-pakete.md).
 * Ohne Paket sind keine Knie-Schablonen verfügbar; die Vermessung
 * (Vollvermessung, CPAK, PDF) funktioniert uneingeschränkt.
 *
 * Konvention: Alle Maße in MILLIMETER. Sortierung pro Familie nach
 * Größenfeld (numerisch, mit Zwischengrößen zwischen N und N+1).
 */
// Laufzeit-sicher trotz Gegenrichtung: kneeContours importiert von hier
// ausschließlich TYPEN (import type), es entsteht kein Zyklus.
import { KNEE_CONTOURS } from './kneeContours'

// ----------------------------------------------------------------------
// Femoral Component (z. B. Legion PS): M/L-Breite, A/P-Tiefe, PS-Box.
// „N"-Varianten = narrow (schmalere M/L bei gleichem A/P).
// ----------------------------------------------------------------------
export interface LegionPsFemurSize {
  size: string
  mlMm: number
  apMm: number
  apBoxMm: number
}

/**
 * Narrow-Größen („3N"–„6N") des LEGION-Femurs sind in der AUSWAHL
 * ausgeblendet, SOLANGE keine echte Hersteller-Kontur vorliegt (die
 * früheren Narrow-Konturen waren aus den Standard-Screenshots abgeleitet
 * und passten nicht — Klinik-Report). Sobald das DXF-Kontur-Addon
 * importiert ist (KNEE_CONTOURS-Eintrag mit quelle 'dxf'), erscheinen
 * die Größen automatisch wieder. Katalog-Indizes bleiben stets stabil.
 */
export function isHiddenKneeSize(
  kind: KneeImplantKind,
  sizeIndex: number,
): boolean {
  if (kind !== 'legion-ps-femur') return false
  if (!(LEGION_PS_FEMUR[sizeIndex]?.size.endsWith('N') ?? false)) return false
  return KNEE_CONTOURS[`legion-ps-femur|AP|${sizeIndex}`]?.quelle !== 'dxf'
}

export const LEGION_PS_FEMUR: LegionPsFemurSize[] = []

// ----------------------------------------------------------------------
// Tibial Baseplate (z. B. Genesis II). Female-/Male-tapered teilen sich
// die Aufsichts-Maße — daher BEWUSST DIESELBE Array-Instanz: die Registry
// ersetzt den Inhalt einmal in-place, beide Exporte zeigen darauf.
// ----------------------------------------------------------------------
export interface GenesisIITibiaSize {
  size: string
  apMm: number
  mlMm: number
}

const GENESIS_II_TIBIA_SHARED: GenesisIITibiaSize[] = []

export const GENESIS_II_TIBIA_FEMALE_TAPERED = GENESIS_II_TIBIA_SHARED
export const GENESIS_II_TIBIA_MALE_TAPERED = GENESIS_II_TIBIA_SHARED

// ----------------------------------------------------------------------
// Inlay-Typen (Insert) mit verfügbaren Dicken.
// ----------------------------------------------------------------------
export interface GenesisIIInsertType {
  type: 'CR' | 'CRHF' | 'CRDD' | 'PS' | 'PSHF' | 'PSCon'
  label: string
  /** Mittlerer posteriorer Slope des Inlay in Grad (zur Doku). */
  slopeDeg: number
  thicknessesMm: number[]
}

export const GENESIS_II_INSERTS: GenesisIIInsertType[] = []

// ----------------------------------------------------------------------
// Patella-Komponenten.
// ----------------------------------------------------------------------
export interface PatellaSize {
  /** Diameter (mm) oder „<diameter> x <dicke>" für ovale Patella. */
  size: string
  diameterMm: number
  thicknessMm: number
}

export interface PatellaFamily {
  family: 'Biconvex' | 'Resurfacing 9mm' | 'Resurfacing 7.5mm' | 'Oval'
  sizes: PatellaSize[]
}

export const LEGION_PATELLA: PatellaFamily[] = []

// ----------------------------------------------------------------------
// Unicompartmental (Schlittenprothese), z. B. Journey II UK.
// ----------------------------------------------------------------------
export interface JourneyFemurSize {
  size: string
  /** AP-Tiefe der Kondyle (mm). */
  apMm: number
  /** Superior-Inferior-Höhe der Komponente (mm). */
  siMm: number
}

export const JOURNEY_UK_FEMUR: JourneyFemurSize[] = []

// ----------------------------------------------------------------------
// Größen-Bänder für die Schablonen-Trace.
//
// Hintergrund: Die meisten Knie-Komponenten skalieren selbstähnlich — eine
// Kontur reicht für alle Größen. Manche Kombinationen (z. B. Zapfen-/
// Bohrloch-Positionen, die an Plattform-Schwellen springen) brauchen
// MEHRERE Konturen, je eine pro Band; der Renderer wählt anhand des
// sizeIndex das passende Band. Die Band-DEFINITIONEN kommen aus dem
// Schablonen-Paket; die Auflösungs-Logik lebt hier.
// ----------------------------------------------------------------------
export interface SizeBand {
  /** Stabiler Bezeichner — landet als Suffix im Trace-Schlüssel. */
  id: string
  /** Kleinster (inkl.) Größen-Index dieses Bandes. */
  fromIndex: number
  /** Größter (inkl.) Größen-Index dieses Bandes. */
  toIndex: number
  /** Anzeige-Label, z. B. „Gr. 1–3". */
  label: string
}

/** Schlüssel = `${kind}|${view}`. Nur hier gelistete Kombinationen
 *  verwenden Bänder. */
export const TRACE_SIZE_BANDS: Record<string, SizeBand[]> = {}

/** Liefert die Bänder für (kind, view) oder null, wenn die Kombination
 *  ohne Bänder arbeitet (= eine Trace für alle Größen). */
export function sizeBandsFor(kind: KneeImplantKind, view: string): SizeBand[] | null {
  return TRACE_SIZE_BANDS[`${kind}|${view}`] ?? null
}

/** Findet das Band, das einen gegebenen Größen-Index abdeckt (oder null,
 *  wenn keine Bänder gelten / der Index außerhalb liegt → erstes Band als
 *  Fallback). */
export function bandForSizeIndex(
  kind: KneeImplantKind,
  view: string,
  sizeIndex: number,
): SizeBand | null {
  const bands = sizeBandsFor(kind, view)
  if (!bands) return null
  return (
    bands.find((b) => sizeIndex >= b.fromIndex && sizeIndex <= b.toIndex) ??
    bands[0] ??
    null
  )
}

/** Tibia-Baseplate mit asymmetrischen ML-Werten (medial/lateral). */
export interface JourneyTibiaSize {
  size: string
  apMm: number
  mlMedialMm: number | null
  mlLateralMm: number | null
}

export const JOURNEY_UK_TIBIA_MEDIAL: JourneyTibiaSize[] = []

export const JOURNEY_UK_TIBIA_LATERAL: JourneyTibiaSize[] = []

/** Verfügbare Insert-Dicken (Schlittenprothese). */
export const JOURNEY_UK_INSERT_THICKNESSES_MM: number[] = []

// ======================================================================
// TKA-Familie 2 (z. B. GMK Sphere): Femur mit „+"-Zwischengrößen,
// asymmetrische Tibia-Baseplate, Insert-Reihe, Patella.
// ======================================================================

export interface SphereFemurSize {
  size: string
  overallApMm: number
  functionalApMm: number
  overallMlMm: number
  distalThicknessMm: number
  posteriorCondyleThicknessMm: number
}

export const SPHERE_FEMUR: SphereFemurSize[] = []

export interface SphereTibiaSize {
  size: string
  medialApMm: number
  lateralApMm: number
  overallMlMm: number
  lengthMm: number
  alphaDeg: number
}

export const SPHERE_TIBIA_BASEPLATE: SphereTibiaSize[] = []

export interface SphereInsertSize {
  size: string
  apMm: number
  mlMm: number
}

export const SPHERE_INSERT_SIZES: SphereInsertSize[] = []

export const SPHERE_INSERT_THICKNESSES_MM: number[] = []

export interface MedactaPatellaSize {
  size: string
  diameterMm: number
  thicknessMm: number
  pegLengthMm: number
  pegDiameterMm: number
  /** A/P-Tiefe (nur bei Resurfacing relevant; Inset ist rotationssymmetrisch). */
  apMm?: number
}

export const SPHERE_RESURFACING_PATELLA: MedactaPatellaSize[] = []

export const SPHERE_INSET_PATELLA: MedactaPatellaSize[] = []

// ----------------------------------------------------------------------
// Hochrangige Komponenten-Übersicht — wird im UI-Dropdown verwendet,
// um die Familien zu listen. Kommt komplett aus dem Schablonen-Paket.
// ----------------------------------------------------------------------
export type KneeImplantKind =
  | 'legion-ps-femur'
  | 'genesis-tibia-female'
  | 'genesis-tibia-male'
  | 'journey-uk-femur'
  | 'journey-uk-tibia-medial'
  | 'journey-uk-tibia-lateral'
  | 'sphere-femur'
  | 'sphere-tibia-baseplate'
  | 'sphere-insert'

export interface KneeImplantFamily {
  kind: KneeImplantKind
  label: string
  manufacturer: 'Smith+Nephew' | 'Medacta'
  /** Welcher Eingriff: TKA (Total Knee) oder UKA (Schlittenprothese). */
  procedure: 'TKA' | 'UKA'
  /** Welche Bone-Seite — beeinflusst, an welche anatomischen Landmarken
   *  sich das Template ausrichten lässt. */
  bone: 'Femur' | 'Tibia'
  /** Anzahl verfügbarer Größen — für UI-Anzeige. */
  sizeCount: number
}

export const KNEE_IMPLANT_FAMILIES: KneeImplantFamily[] = []

// ----------------------------------------------------------------------
// Tibia-Inlay (Poly-Insert): wählbare Dicken je Verbund.
//   baseMm        = die in der Schablonen-Kontur abgebildete (dünnste) Höhe.
//   thicknessesMm = klinisch verfügbare Höhen.
// Der Renderer hebt die Artikulationsfläche um (gewählt − baseMm) an. Nur
// Kinds MIT Eintrag erhalten den Höhen-Regler.
// ----------------------------------------------------------------------
export const TIBIA_INSERT: Partial<
  Record<KneeImplantKind, { baseMm: number; thicknessesMm: number[] }>
> = {}

const clampIndex = <T>(arr: ReadonlyArray<T>, i: number): T =>
  arr[Math.max(0, Math.min(arr.length - 1, i))]

/**
 * Distale Implantatdicke (mm) der FEMURkomponente je Größe — der Abstand
 * zwischen der distalen Implantat-Gelenkfläche und der knöchernen
 * Resektionsebene (= wie weit proximal der Knochenschnitt liegt).
 *
 * Sphere führt den Wert pro Größe im Katalog (kommt aus dem Paket).
 * Legion PS: 9 mm Standard-Distalresektion über alle Größen (publizierter
 * Standardwert der OP-Technik). Tibia/Insert geben `null` zurück — dort
 * IST die Resektion die Baseplate-Unterseite, kein Dicken-Offset nötig.
 */
export function femoralDistalThicknessMm(
  kind: KneeImplantKind,
  sizeIndex: number,
): number | null {
  switch (kind) {
    case 'sphere-femur':
      return SPHERE_FEMUR.length > 0
        ? clampIndex(SPHERE_FEMUR, sizeIndex).distalThicknessMm
        : null
    case 'legion-ps-femur':
      return 9
    default:
      return null
  }
}
