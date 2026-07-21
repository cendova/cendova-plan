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
import type { MedactaEntry } from '../hip/medactaCatalog'
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
  kneeCatalog?: KneeCatalogData
  /** Tracer-Hintergründe, Schlüssel `kind|view` bzw. `kind|view|band`. */
  backgrounds?: Record<string, BackgroundData>
}

/** Alle im Manifest referenzierten Bild-Pfade (zur ZIP-Konsistenzprüfung). */
export function referencedImagePaths(m: TemplatePackageManifest): string[] {
  const paths: string[] = []
  for (const img of Object.values(m.kneeImages ?? {})) paths.push(img.path)
  for (const folder of Object.values(m.medactaImages ?? {}))
    for (const img of Object.values(folder)) paths.push(img.path)
  for (const bg of Object.values(m.backgrounds ?? {})) paths.push(bg.file)
  return paths
}

/**
 * Ein Bildpfad darf NUR ein relativer Pfad in den ZIP-eigenen `images/`-
 * Ordner sein. Externe URLs (`http:`, `https:`, `data:`, `javascript:`,
 * protokoll-relativ `//`) oder Pfad-Ausbrüche (`..`) sind verboten: Sonst
 * könnte ein manipuliertes Paket beim Rendern einen Netzwerk-Request
 * auslösen (Beacon) und das „100 % lokal"-Versprechen unterlaufen
 * (Security-Report §9).
 */
export function istSichererBildpfad(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0) return false
  if (!p.startsWith('images/')) return false
  if (p.includes('..') || p.includes('\\') || p.includes('//')) return false
  // Kein URL-Schema (z. B. „images/x:evil") — Doppelpunkt vor dem ersten „/"
  // gäbe es bei einem sauberen images/-Pfad nie.
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false
  return true
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
  if (m.stemCcdByFolder !== undefined) {
    for (const [folder, deg] of Object.entries(m.stemCcdByFolder)) {
      // Plausibles CCD-Fenster — schützt vor vertauschten Feldern/Tippfehlern.
      if (typeof deg !== 'number' || !isFinite(deg) || deg < 100 || deg > 160) {
        return { ok: false, error: `stemCcdByFolder['${folder}'] unplausibel (${String(deg)})` }
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
    Object.keys(m.kneeContours ?? {}).length
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
      if (k === 'kneeContours' || k === 'stemCcdByFolder' || k === 'merge' || k === 'name')
        continue
      ;(out as unknown as Record<string, unknown>)[k] = val
    }
    out.name = `${base.name} + ${addon.name}`
  }
  if (addon.kneeContours) {
    out.kneeContours = { ...(base?.kneeContours ?? {}), ...addon.kneeContours }
  }
  if (addon.stemCcdByFolder) {
    out.stemCcdByFolder = { ...(base?.stemCcdByFolder ?? {}), ...addon.stemCcdByFolder }
  }
  // Der gespeicherte Kombi-Stand ist ein normales Voll-Paket.
  delete out.merge
  return out
}
