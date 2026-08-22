/**
 * Cendova-Schablonenpaket — Format v1 (siehe docs/schablonen-pakete.md).
 *
 * Ein Paket ist eine ZIP-Datei:
 *   manifest.json     — dieses Manifest (Datentabellen + Bild-Index)
 *   images/**         — die Schablonen-PNGs (Pfade im Manifest referenziert,
 *                       IMMER mit Präfix `images/` — daran erkennt
 *                       `resolveTemplateImage`, dass ein Blob aus dem Paket
 *                       gemeint ist und keine gebündelte `/templates/`-URL)
 *
 * Die Feld-Strukturen sind bewusst 1:1 die eingebauten TypeScript-
 * Datenstrukturen (kneeImages / medactaImages / medactaCatalog /
 * smithNephewCatalog / templateBackgroundsData) — so kann die Registry die
 * eingebauten Tabellen ohne Mapping in-place ersetzen.
 */
import type { KneeImage } from '../knee/kneeImages'
import type { MedactaImageMeta } from '../hip/medactaImages'
import {
  RADAELLI_KLASSEN,
  type MedactaEntry,
  type StemPlanningProfile,
} from '../hip/medactaCatalog'
import type {
  GenesisIIInsertType,
  GenesisIITibiaSize,
  JourneyFemurSize,
  JourneyTibiaSize,
  KneeImplantFamily,
  KneeImplantKind,
  LegionPsFemurSize,
  MedactaPatellaSize,
  PatellaFamily,
  SizeBand,
  SphereFemurSize,
  SphereInsertSize,
  SphereTibiaSize,
} from '../knee/smithNephewCatalog'
import type { BackgroundData } from '../knee/templateBackgroundsData'
import { MAX_PAKET_BILDER, MAX_PAKET_KATALOG } from '../importGrenzen'
import type { KneeContour } from '../knee/kneeContours'
import type { ShoulderContour } from '../shoulder/shoulderContours'
import type { ShoulderImplantFamily } from '../shoulder/shoulderCatalog'
import type { ShoulderImage } from '../shoulder/shoulderImages'

/** Knie-Katalog (S&N + Medacta Sphere) — reine Maßtabellen. */
export interface KneeCatalogData {
  legionPsFemur?: LegionPsFemurSize[]
  genesisTibia?: GenesisIITibiaSize[]
  genesisInserts?: GenesisIIInsertType[]
  legionPatella?: PatellaFamily[]
  journeyUkFemur?: JourneyFemurSize[]
  journeyUkTibiaMedial?: JourneyTibiaSize[]
  journeyUkTibiaLateral?: JourneyTibiaSize[]
  journeyUkInsertThicknessesMm?: number[]
  sphereFemur?: SphereFemurSize[]
  sphereTibiaBaseplate?: SphereTibiaSize[]
  sphereInsertSizes?: SphereInsertSize[]
  sphereInsertThicknessesMm?: number[]
  sphereResurfacingPatella?: MedactaPatellaSize[]
  sphereInsetPatella?: MedactaPatellaSize[]
  traceSizeBands?: Record<string, SizeBand[]>
  tibiaInsert?: Partial<
    Record<KneeImplantKind, { baseMm: number; thicknessesMm: number[] }>
  >
  implantFamilies?: KneeImplantFamily[]
}

/** Schulter-Katalog — Familien + linearisierte Größen-Labels je kind. */
export interface ShoulderCatalogData {
  families?: ShoulderImplantFamily[]
  sizeLabels?: Record<string, string[]>
}

export interface TemplatePackageManifest {
  /** Additives Paket: beim Import mit dem BESTEHENDEN Paket verschmelzen
   *  statt es zu ersetzen (z. B. Kontur-Addons zu einem Bild-Paket). */
  merge?: boolean
  /** Pro-Größe-Konturen (Schlüssel `kind|view|sizeIndex`) — werden über
   *  die eingebauten KNEE_CONTOURS gelegt (Merge, kein Ersatz). */
  kneeContours?: Record<string, KneeContour>
  format: 'cendova-templates'
  formatVersion: 1
  /** Anzeigename des Pakets (Statuszeile, Diagnose). */
  name: string
  createdAt?: string
  generator?: string
  /** Knie-Bild-Index, Schlüssel `kind|view|sizeIndex`. */
  kneeImages?: Record<string, KneeImage>
  /** Hüft-Schaft-Bilder, `[folder][refNo]`. */
  medactaImages?: Record<string, Record<string, MedactaImageMeta>>
  medactaCatalog?: MedactaEntry[]
  headOffsetsMm?: number[]
  /** CCD-Winkel (Grad) je Schaft-Katalog-Ordnername — wird wie
   *  kneeContours schlüsselweise über die eingebauten Werte gelegt. */
  stemCcdByFolder?: Record<string, number>
  /** Strukturiertes Planungsprofil je Schaft-Katalog-Ordnername
   *  (Fixation, Radaelli-Klasse, Collar, primäre Verankerung) — Grundlage
   *  der Schaft-Planungshinweise; schlüsselweise Vereinigung wie
   *  stemCcdByFolder. */
  stemProfileByFolder?: Record<string, StemPlanningProfile>
  kneeCatalog?: KneeCatalogData
  /** Schulter-Katalog (Familien + Größen-Labels). */
  shoulderCatalog?: ShoulderCatalogData
  /** Pro-Größe-Schulter-Konturen (Schlüssel `kind|AP|sizeIndex`) — werden
   *  wie kneeContours über die eingebauten Tabellen gelegt (Merge). */
  shoulderContours?: Record<string, ShoulderContour>
  /** Schulter-Bild-Index (Schlüssel `kind|AP|sizeIndex`) — Bild-Overlays
   *  haben im Renderer Vorrang vor den Vektor-Konturen (Knie-Muster). */
  shoulderImages?: Record<string, ShoulderImage>
  /** Tracer-Hintergründe, Schlüssel `kind|view` bzw. `kind|view|band`. */
  backgrounds?: Record<string, BackgroundData>
}

/** Alle im Manifest referenzierten Bild-Pfade (zur ZIP-Konsistenzprüfung). */
export function referencedImagePaths(m: TemplatePackageManifest): string[] {
  const paths: string[] = []
  for (const img of Object.values(m.kneeImages ?? {})) paths.push(img.path)
  for (const img of Object.values(m.shoulderImages ?? {})) paths.push(img.path)
  for (const folder of Object.values(m.medactaImages ?? {}))
    for (const img of Object.values(folder)) paths.push(img.path)
  for (const bg of Object.values(m.backgrounds ?? {})) paths.push(bg.file)
  return paths
}

/**
 * Ein Bildpfad muss LOKAL sein: entweder ZIP-intern (`images/…`) oder ein
 * gebündelter App-Pfad (z. B. `/templates/…` — resolveTemplateImage lässt
 * solche Pfade unverändert durch, reale Pakete referenzieren sie).
 * Verboten sind externe URLs (`http:`, `https:`, `data:`, `javascript:`,
 * protokoll-relativ `//…`) und Pfad-Ausbrüche (`..`, Backslash): Sonst
 * könnte ein manipuliertes Paket beim Rendern einen Netzwerk-Request
 * auslösen (Beacon) und das „100 % lokal"-Versprechen unterlaufen
 * (Security-Report §9). NICHT strenger prüfen — ein `images/`-Zwang lehnte
 * echte Pakete ab (Regression: „Paket verschwunden" nach App-Update).
 */
export function istSichererBildpfad(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0) return false
  if (p.includes('..') || p.includes('\\')) return false
  // Protokoll-relative URL (`//host/…`) wäre ein Netz-Fetch.
  if (p.startsWith('//')) return false
  // Kein URL-Schema am Anfang (http:, https:, data:, javascript:, …).
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false
  return true
}

// Wertelisten des Schaft-Planungsprofils — Regeln (stemPlanningRules)
// verlassen sich darauf, dass NUR diese Werte durch die Validierung kommen.
const STEM_FIXATION = ['cementless', 'cemented'] as const
const STEM_COLLAR = ['none', 'collared'] as const
const STEM_PRIMARY_FIXATION = ['metaphyseal', 'metadiaphyseal', 'diaphyseal', 'cement'] as const
const STEM_NECK_VARIANTS = ['regular', 'short'] as const
const STEM_OFFSET_VARIANTS = ['standard', 'lateralized'] as const
const STEM_INTENDED_USE = ['primary', 'revision'] as const

const enthaelt = (liste: readonly string[], wert: unknown): boolean =>
  typeof wert === 'string' && liste.includes(wert)

/**
 * Prüft EIN Schaft-Planungsprofil; gibt die Fehlbeschreibung zurück oder
 * null, wenn es gültig ist. Neben den Wertelisten werden zwei fachliche
 * Konsistenzen erzwungen: die Radaelli-Klassifikation gilt NUR zementfrei,
 * und die primäre Verankerung 'cement' gehört genau zu fixation 'cemented'
 * — ein Widerspruch hier würde später falsche Planungshinweise erzeugen.
 */
function stemProfilFehler(p: unknown): string | null {
  if (typeof p !== 'object' || p === null) return 'ist kein Objekt'
  const s = p as Partial<StemPlanningProfile>
  if (!enthaelt(STEM_FIXATION, s.fixation)) return `fixation unbekannt (${String(s.fixation)})`
  if (!enthaelt(STEM_COLLAR, s.collar)) return `collar unbekannt (${String(s.collar)})`
  if (!enthaelt(STEM_PRIMARY_FIXATION, s.primaryFixation))
    return `primaryFixation unbekannt (${String(s.primaryFixation)})`
  if (!enthaelt(STEM_INTENDED_USE, s.intendedUse))
    return `intendedUse unbekannt (${String(s.intendedUse)})`
  if (s.radaelliClass !== undefined && !enthaelt(RADAELLI_KLASSEN, s.radaelliClass))
    return `radaelliClass unbekannt (${String(s.radaelliClass)})`
  if (s.neckVariant !== undefined && !enthaelt(STEM_NECK_VARIANTS, s.neckVariant))
    return `neckVariant unbekannt (${String(s.neckVariant)})`
  if (s.offsetVariant !== undefined && !enthaelt(STEM_OFFSET_VARIANTS, s.offsetVariant))
    return `offsetVariant unbekannt (${String(s.offsetVariant)})`
  if (s.fixation === 'cemented') {
    if (s.radaelliClass !== undefined)
      return 'hat eine radaelliClass — die Klassifikation gilt nur für zementfreie Schäfte'
    if (s.primaryFixation !== 'cement')
      return `ist zementiert, primaryFixation muss 'cement' sein (ist: ${String(s.primaryFixation)})`
  } else if (s.primaryFixation === 'cement') {
    return "ist zementfrei, primaryFixation darf nicht 'cement' sein"
  }
  return null
}

/** Minimal-robuste Validierung eines geparsten manifest.json. */
export function validateManifest(
  raw: unknown,
): { ok: true; manifest: TemplatePackageManifest } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'manifest.json ist kein Objekt' }
  }
  const m = raw as Partial<TemplatePackageManifest>
  if (m.format !== 'cendova-templates') {
    return { ok: false, error: 'Kein Cendova-Schablonenpaket (format-Feld fehlt/falsch)' }
  }
  if (m.formatVersion !== 1) {
    return {
      ok: false,
      error: `Paketformat-Version ${String(m.formatVersion)} wird nicht unterstützt (erwartet: 1)`,
    }
  }
  if (typeof m.name !== 'string' || m.name.length === 0) {
    return { ok: false, error: 'Paketname fehlt (name-Feld)' }
  }
  // Halslängen-Stufen sind im UI/Store als 5 Stufen verdrahtet
  // (HEAD_OFFSET_COUNT wird beim Modul-Load fixiert) — andere Längen würden
  // still inkonsistent. Deshalb hart ablehnen.
  if (m.headOffsetsMm !== undefined && m.headOffsetsMm.length !== 5) {
    return { ok: false, error: 'headOffsetsMm muss genau 5 Stufen haben' }
  }
  if (m.merge !== undefined && typeof m.merge !== 'boolean') {
    return { ok: false, error: 'merge-Feld muss boolean sein' }
  }
  if (m.kneeContours !== undefined) {
    for (const [key, c] of Object.entries(m.kneeContours)) {
      if (
        !c ||
        typeof c.wMm !== 'number' ||
        typeof c.hMm !== 'number' ||
        !Array.isArray(c.points) ||
        c.points.length < 3
      ) {
        return { ok: false, error: `kneeContours['${key}'] ist unvollständig` }
      }
    }
  }
  if (m.shoulderContours !== undefined) {
    for (const [key, c] of Object.entries(m.shoulderContours)) {
      if (
        !c ||
        typeof c.wMm !== 'number' ||
        typeof c.hMm !== 'number' ||
        !Array.isArray(c.points) ||
        c.points.length < 3
      ) {
        return { ok: false, error: `shoulderContours['${key}'] ist unvollständig` }
      }
    }
  }
  if (m.stemCcdByFolder !== undefined) {
    for (const [folder, deg] of Object.entries(m.stemCcdByFolder)) {
      // Plausibles CCD-Fenster — schützt vor vertauschten Feldern/Tippfehlern.
      if (typeof deg !== 'number' || !isFinite(deg) || deg < 100 || deg > 160) {
        return { ok: false, error: `stemCcdByFolder['${folder}'] unplausibel (${String(deg)})` }
      }
    }
  }
  if (m.stemProfileByFolder !== undefined) {
    for (const [folder, profil] of Object.entries(m.stemProfileByFolder)) {
      const fehler = stemProfilFehler(profil)
      if (fehler !== null) {
        return { ok: false, error: `stemProfileByFolder['${folder}'] ${fehler}` }
      }
    }
  }
  // Alle referenzierten Bildpfade müssen sichere, ZIP-interne images/-Pfade
  // sein — kein externer Beacon, kein Pfad-Ausbruch.
  const referenzen = referencedImagePaths(m as TemplatePackageManifest)
  const unsicher = referenzen.find((p) => !istSichererBildpfad(p))
  if (unsicher !== undefined) {
    return {
      ok: false,
      error: `Unsicherer Bildpfad im Manifest: „${unsicher}" (nur relative images/-Pfade erlaubt)`,
    }
  }
  // Größen-Deckel (Security-Report §10): absurde Katalog-/Bildmengen
  // ablehnen, bevor sie Stores/IndexedDB fluten. Reale Pakete: ≪ 1000.
  if (referenzen.length > MAX_PAKET_BILDER) {
    return { ok: false, error: `Manifest referenziert zu viele Bilder (> ${MAX_PAKET_BILDER})` }
  }
  const katalogGroesse =
    (m.medactaCatalog?.length ?? 0) +
    Object.values(m.kneeCatalog ?? {}).reduce(
      (n, v) => n + (Array.isArray(v) ? v.length : 0),
      0,
    ) +
    Object.keys(m.kneeContours ?? {}).length +
    (m.shoulderCatalog?.families?.length ?? 0) +
    Object.keys(m.shoulderContours ?? {}).length +
    Object.keys(m.stemProfileByFolder ?? {}).length
  if (katalogGroesse > MAX_PAKET_KATALOG) {
    return { ok: false, error: `Katalog im Manifest ist zu groß (> ${MAX_PAKET_KATALOG} Einträge)` }
  }
  return { ok: true, manifest: m as TemplatePackageManifest }
}

/**
 * Verschmilzt ein Addon-Manifest (merge:true) mit dem Basis-Manifest:
 * Alle im Addon DEFINIERTEN Felder überschreiben die Basis; kneeContours
 * werden schlüsselweise vereinigt. Ohne Basis gilt das Addon allein
 * (es wirkt dann über den eingebauten Daten). Pure Funktion — testbar.
 */
export function mergeManifests(
  base: TemplatePackageManifest | null,
  addon: TemplatePackageManifest,
): TemplatePackageManifest {
  const out: TemplatePackageManifest = { ...(base ?? addon) }
  if (base) {
    for (const [k, val] of Object.entries(addon)) {
      if (val === undefined) continue
      if (
        k === 'kneeContours' ||
        k === 'shoulderContours' ||
        k === 'stemCcdByFolder' ||
        k === 'stemProfileByFolder' ||
        k === 'merge' ||
        k === 'name'
      )
        continue
      ;(out as unknown as Record<string, unknown>)[k] = val
    }
    out.name = `${base.name} + ${addon.name}`
  }
  if (addon.kneeContours) {
    out.kneeContours = { ...(base?.kneeContours ?? {}), ...addon.kneeContours }
  }
  if (addon.shoulderContours) {
    out.shoulderContours = {
      ...(base?.shoulderContours ?? {}),
      ...addon.shoulderContours,
    }
  }
  if (addon.stemCcdByFolder) {
    out.stemCcdByFolder = { ...(base?.stemCcdByFolder ?? {}), ...addon.stemCcdByFolder }
  }
  if (addon.stemProfileByFolder) {
    out.stemProfileByFolder = {
      ...(base?.stemProfileByFolder ?? {}),
      ...addon.stemProfileByFolder,
    }
  }
  // Der gespeicherte Kombi-Stand ist ein normales Voll-Paket.
  delete out.merge
  return out
}
