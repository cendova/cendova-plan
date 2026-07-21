/**
 * Schablonen-Registry: verbindet das importierbare Schablonen-Paket
 * (ZIP → IndexedDB) mit den eingebauten Datentabellen.
 *
 * Funktionsweise (siehe docs/schablonen-pakete.md):
 *  - Die App liest Schablonen-Daten überall über Modul-KONSTANTEN
 *    (KNEE_IMAGES, MEDACTA_CATALOG, S&N-Tabellen, BACKGROUNDS, …).
 *    Statt ~15 Konsumenten auf Getter umzubauen, ersetzt die Registry beim
 *    Paket-Load die INHALTE dieser Konstanten in-place (Array/Record leeren
 *    + neu befüllen). Objekt-Identität bleibt erhalten → alle bestehenden
 *    Importe sehen automatisch die Paket-Daten.
 *  - Bild-Pfade aus dem Paket beginnen mit `images/` und werden über
 *    `resolveTemplateImage` in Blob-URLs (IndexedDB) übersetzt; gebündelte
 *    `/templates/`-URLs laufen unverändert durch.
 *  - Test-Flag für den C2-Zustand („keine gebündelten Daten mehr"):
 *    localStorage['cendova.disableBundledTemplates'] = '1' leert die
 *    eingebauten Tabellen beim Start, sofern kein Paket geladen ist.
 */
import { zipSync, strToU8 } from 'fflate'
import { unzipMitGrenzen } from '../importGrenzen'
import { KNEE_IMAGES } from '../knee/kneeImages'
import { KNEE_CONTOURS } from '../knee/kneeContours'
import { MEDACTA_IMAGES } from '../hip/medactaImages'
import {
  HEAD_OFFSETS_MM,
  MEDACTA_CATALOG,
  STEM_CCD_BY_FOLDER,
} from '../hip/medactaCatalog'
import * as sn from '../knee/smithNephewCatalog'
import { BACKGROUNDS } from '../knee/templateBackgroundsData'
import { idbClearPackage, idbLoadPackage, idbStorePackage } from './idb'
import {
  mergeManifests,
  referencedImagePaths,
  validateManifest,
  type TemplatePackageManifest,
} from './packageFormat'
import { useTemplatePackageStore } from '../../state/templatePackageStore'
import { logDiagnostic } from '../diagnostics'
import {
  persistentenSpeicherAnfordern,
  sicherungLaden,
  sicherungLoeschen,
  sicherungSchreiben,
} from '../lokaleSicherung'

const DISABLE_BUNDLE_KEY = 'cendova.disableBundledTemplates'

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------
let manifest: TemplatePackageManifest | null = null
let imageBlobs = new Map<string, Blob>()
const objectUrls = new Map<string, string>()

// ---------------------------------------------------------------------------
// Sicherungskopie der eingebauten Daten (für „Paket entfernen").
// Läuft beim Modul-Load — zu diesem Zeitpunkt sind die Datenmodule bereits
// initialisiert und noch unverändert. Kopien sind flach: die ELEMENTE werden
// nie mutiert, nur die Container ersetzt.
// ---------------------------------------------------------------------------
const bundled = {
  kneeImages: { ...KNEE_IMAGES },
  kneeContours: { ...KNEE_CONTOURS },
  medactaImages: { ...MEDACTA_IMAGES },
  medactaCatalog: [...MEDACTA_CATALOG],
  headOffsetsMm: [...HEAD_OFFSETS_MM] as number[],
  stemCcdByFolder: { ...STEM_CCD_BY_FOLDER },
  backgrounds: { ...BACKGROUNDS },
  legionPsFemur: [...sn.LEGION_PS_FEMUR],
  genesisTibia: [...sn.GENESIS_II_TIBIA_FEMALE_TAPERED],
  genesisInserts: [...sn.GENESIS_II_INSERTS],
  legionPatella: [...sn.LEGION_PATELLA],
  journeyUkFemur: [...sn.JOURNEY_UK_FEMUR],
  journeyUkTibiaMedial: [...sn.JOURNEY_UK_TIBIA_MEDIAL],
  journeyUkTibiaLateral: [...sn.JOURNEY_UK_TIBIA_LATERAL],
  journeyUkInsertThicknessesMm: [...sn.JOURNEY_UK_INSERT_THICKNESSES_MM] as number[],
  sphereFemur: [...sn.SPHERE_FEMUR],
  sphereTibiaBaseplate: [...sn.SPHERE_TIBIA_BASEPLATE],
  sphereInsertSizes: [...sn.SPHERE_INSERT_SIZES],
  sphereInsertThicknessesMm: [...sn.SPHERE_INSERT_THICKNESSES_MM] as number[],
  sphereResurfacingPatella: [...sn.SPHERE_RESURFACING_PATELLA],
  sphereInsetPatella: [...sn.SPHERE_INSET_PATELLA],
  traceSizeBands: { ...sn.TRACE_SIZE_BANDS },
  tibiaInsert: { ...sn.TIBIA_INSERT },
  implantFamilies: [...sn.KNEE_IMPLANT_FAMILIES],
}

// ---------------------------------------------------------------------------
// In-Place-Ersetzung
// ---------------------------------------------------------------------------
function replaceArray<T>(target: readonly T[], next: T[] | undefined): void {
  if (!next) return
  const t = target as T[]
  t.length = 0
  t.push(...next)
}

function replaceRecord<T>(
  target: Record<string, T>,
  next: Record<string, T> | undefined,
): void {
  if (!next) return
  for (const k of Object.keys(target)) delete target[k]
  Object.assign(target, next)
}

/** Manifest-Daten über die eingebauten Tabellen legen (nur belegte Felder). */
function applyOverrides(m: TemplatePackageManifest): void {
  replaceRecord(KNEE_IMAGES, m.kneeImages)
  // Konturen werden GEMERGT statt ersetzt: ein Paket darf gezielt einzelne
  // (kind|view|sizeIndex)-Einträge überschreiben/ergänzen (DXF-Addons),
  // ohne die eingebauten Screenshot-Konturen zu verlieren.
  if (m.kneeContours) {
    replaceRecord(KNEE_CONTOURS, { ...bundled.kneeContours, ...m.kneeContours })
  }
  replaceRecord(MEDACTA_IMAGES, m.medactaImages)
  replaceArray(MEDACTA_CATALOG, m.medactaCatalog)
  replaceArray(HEAD_OFFSETS_MM, m.headOffsetsMm)
  // CCD-Winkel: wie Konturen schlüsselweise über die eingebauten Werte legen.
  if (m.stemCcdByFolder) {
    replaceRecord(STEM_CCD_BY_FOLDER, { ...bundled.stemCcdByFolder, ...m.stemCcdByFolder })
  }
  replaceRecord(BACKGROUNDS, m.backgrounds)
  const kc = m.kneeCatalog
  if (kc) {
    replaceArray(sn.LEGION_PS_FEMUR, kc.legionPsFemur)
    // Female/Male teilen sich dasselbe Array-Objekt — einmal ersetzen genügt,
    // beide Exporte zeigen darauf.
    replaceArray(sn.GENESIS_II_TIBIA_FEMALE_TAPERED, kc.genesisTibia)
    replaceArray(sn.GENESIS_II_INSERTS, kc.genesisInserts)
    replaceArray(sn.LEGION_PATELLA, kc.legionPatella)
    replaceArray(sn.JOURNEY_UK_FEMUR, kc.journeyUkFemur)
    replaceArray(sn.JOURNEY_UK_TIBIA_MEDIAL, kc.journeyUkTibiaMedial)
    replaceArray(sn.JOURNEY_UK_TIBIA_LATERAL, kc.journeyUkTibiaLateral)
    replaceArray(sn.JOURNEY_UK_INSERT_THICKNESSES_MM, kc.journeyUkInsertThicknessesMm)
    replaceArray(sn.SPHERE_FEMUR, kc.sphereFemur)
    replaceArray(sn.SPHERE_TIBIA_BASEPLATE, kc.sphereTibiaBaseplate)
    replaceArray(sn.SPHERE_INSERT_SIZES, kc.sphereInsertSizes)
    replaceArray(sn.SPHERE_INSERT_THICKNESSES_MM, kc.sphereInsertThicknessesMm)
    replaceArray(sn.SPHERE_RESURFACING_PATELLA, kc.sphereResurfacingPatella)
    replaceArray(sn.SPHERE_INSET_PATELLA, kc.sphereInsetPatella)
    replaceRecord(sn.TRACE_SIZE_BANDS, kc.traceSizeBands)
    replaceRecord(
      sn.TIBIA_INSERT as Record<string, { baseMm: number; thicknessesMm: number[] }>,
      kc.tibiaInsert as Record<string, { baseMm: number; thicknessesMm: number[] }>,
    )
    replaceArray(sn.KNEE_IMPLANT_FAMILIES, kc.implantFamilies)
  }
}

/** Eingebaute Daten wiederherstellen (nach „Paket entfernen"). */
function restoreBundled(): void {
  replaceRecord(KNEE_IMAGES, bundled.kneeImages)
  replaceRecord(KNEE_CONTOURS, bundled.kneeContours)
  replaceRecord(MEDACTA_IMAGES, bundled.medactaImages)
  replaceArray(MEDACTA_CATALOG, bundled.medactaCatalog)
  replaceArray(HEAD_OFFSETS_MM, bundled.headOffsetsMm)
  replaceRecord(STEM_CCD_BY_FOLDER, bundled.stemCcdByFolder)
  replaceRecord(BACKGROUNDS, bundled.backgrounds)
  replaceArray(sn.LEGION_PS_FEMUR, bundled.legionPsFemur)
  replaceArray(sn.GENESIS_II_TIBIA_FEMALE_TAPERED, bundled.genesisTibia)
  replaceArray(sn.GENESIS_II_INSERTS, bundled.genesisInserts)
  replaceArray(sn.LEGION_PATELLA, bundled.legionPatella)
  replaceArray(sn.JOURNEY_UK_FEMUR, bundled.journeyUkFemur)
  replaceArray(sn.JOURNEY_UK_TIBIA_MEDIAL, bundled.journeyUkTibiaMedial)
  replaceArray(sn.JOURNEY_UK_TIBIA_LATERAL, bundled.journeyUkTibiaLateral)
  replaceArray(sn.JOURNEY_UK_INSERT_THICKNESSES_MM, bundled.journeyUkInsertThicknessesMm)
  replaceArray(sn.SPHERE_FEMUR, bundled.sphereFemur)
  replaceArray(sn.SPHERE_TIBIA_BASEPLATE, bundled.sphereTibiaBaseplate)
  replaceArray(sn.SPHERE_INSERT_SIZES, bundled.sphereInsertSizes)
  replaceArray(sn.SPHERE_INSERT_THICKNESSES_MM, bundled.sphereInsertThicknessesMm)
  replaceArray(sn.SPHERE_RESURFACING_PATELLA, bundled.sphereResurfacingPatella)
  replaceArray(sn.SPHERE_INSET_PATELLA, bundled.sphereInsetPatella)
  replaceRecord(sn.TRACE_SIZE_BANDS, bundled.traceSizeBands)
  replaceRecord(
    sn.TIBIA_INSERT as Record<string, { baseMm: number; thicknessesMm: number[] }>,
    bundled.tibiaInsert as Record<string, { baseMm: number; thicknessesMm: number[] }>,
  )
  replaceArray(sn.KNEE_IMPLANT_FAMILIES, bundled.implantFamilies)
}

/** C2-Simulation: Templating-Tabellen leeren (Vermessung bleibt voll nutzbar). */
function clearBundledData(): void {
  replaceRecord(KNEE_IMAGES, {})
  replaceRecord(MEDACTA_IMAGES, {})
  replaceArray(MEDACTA_CATALOG, [])
  replaceRecord(BACKGROUNDS, {})
  replaceArray(sn.KNEE_IMPLANT_FAMILIES, [])
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

/** Ist ein importiertes Paket aktiv? */
export function hasTemplatePackage(): boolean {
  return manifest !== null
}

/** Test-Flag: eingebaute Daten deaktiviert (simuliert den C2-Zustand)? */
export function bundledTemplatesDisabled(): boolean {
  try {
    return localStorage.getItem(DISABLE_BUNDLE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Bild-Pfad → anzeigbare URL. Paket-Pfade (`images/...`) werden als
 * Blob-URL aus der IndexedDB aufgelöst (lazy, gecacht); alles andere
 * (gebündelte `/templates/`-URLs) läuft unverändert durch.
 */
export function resolveTemplateImage(path: string): string {
  // Defense-in-Depth (validateManifest lehnt solche Pfade schon beim Import
  // ab): NIE eine externe/absolute URL laden — nur relative Pfade ohne
  // Schema und ohne protokoll-relatives „//". Ein durchgerutschter
  // http(s)/data:-Pfad würde sonst hier einen Netzwerk-Request auslösen.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return ''
  if (!path.startsWith('images/')) return path
  const cached = objectUrls.get(path)
  if (cached) return cached
  const blob = imageBlobs.get(path)
  if (!blob) return path
  const url = URL.createObjectURL(blob)
  objectUrls.set(path, url)
  return url
}

function revokeObjectUrls(): void {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
}

function publishState(): void {
  useTemplatePackageStore
    .getState()
    .setInfo(
      manifest
        ? {
            name: manifest.name,
            imageCount: imageBlobs.size,
            loadedAt: manifest.createdAt ?? '',
          }
        : null,
    )
}

/**
 * Beim App-Start: gespeichertes Paket aus der IndexedDB laden und anwenden.
 * Fehler sind nie fatal — die App läuft dann mit den eingebauten Daten.
 */
export async function initTemplateRegistry(): Promise<void> {
  // Browser bitten, den Speicher nicht bei Speicherdruck zu räumen.
  void persistentenSpeicherAnfordern()
  try {
    const stored = await idbLoadPackage()
    if (stored) {
      const v = validateManifest(stored.manifest)
      if (v.ok) {
        manifest = v.manifest
        imageBlobs = stored.images
        applyOverrides(manifest)
        publishState()
        return
      }
      logDiagnostic(`Schablonen-Paket in IndexedDB ungültig: ${v.error}`)
    }
  } catch (err) {
    logDiagnostic(
      `Schablonen-Paket-Load fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  // Kein Paket im Browser-Speicher (z. B. von einer Klinik-Richtlinie beim
  // Schließen gelöscht) → aus der lokalen Datei-Sicherung wiederherstellen.
  try {
    const backup = await sicherungLaden('paket')
    if (backup) {
      const result = await importTemplatePackage(
        new File([new Uint8Array(backup)], 'lokale-sicherung.zip', { type: 'application/zip' }),
      )
      if (result.ok) {
        logDiagnostic(
          `Schablonen-Paket aus lokaler Sicherung wiederhergestellt: ${result.name} (${result.imageCount} Bilder)`,
        )
        return
      }
      logDiagnostic(`Lokale Paket-Sicherung ungültig: ${result.error}`)
    }
  } catch (err) {
    logDiagnostic(
      `Wiederherstellung aus lokaler Sicherung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (bundledTemplatesDisabled()) clearBundledData()
  publishState()
}

/** ZIP entpacken — mit Ressourcengrenzen (Eintragszahl, entpackte
 *  Gesamtgröße, Kompressionsverhältnis; Security-Report §10). */
function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return unzipMitGrenzen(data)
}

/**
 * Schablonen-Paket (ZIP) importieren: validieren, in IndexedDB persistieren,
 * Overrides anwenden. Ersetzt ein evtl. vorhandenes Paket komplett.
 */
export async function importTemplatePackage(
  file: File,
): Promise<{ ok: true; name: string; imageCount: number } | { ok: false; error: string }> {
  try {
    const entries = await unzipAsync(new Uint8Array(await file.arrayBuffer()))
    const manifestBytes = entries['manifest.json']
    if (!manifestBytes) {
      return { ok: false, error: 'ZIP enthält kein manifest.json — kein Schablonen-Paket' }
    }
    const v = validateManifest(JSON.parse(new TextDecoder().decode(manifestBytes)))
    if (!v.ok) return v

    const images = new Map<string, Blob>()
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.endsWith('/') || !name.startsWith('images/')) continue
      // Kopie in ein eigenständiges ArrayBuffer — fflate-Ausgaben können
      // Views auf einen geteilten Buffer sein.
      images.set(name, new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
    }
    const missing = referencedImagePaths(v.manifest).filter(
      (p) => p.startsWith('images/') && !images.has(p),
    )
    if (missing.length > 0) {
      return {
        ok: false,
        error: `${missing.length} im Manifest referenzierte Bilder fehlen im ZIP (z. B. ${missing[0]})`,
      }
    }

    // Additives Paket (merge:true): mit dem BESTEHENDEN Paket verschmelzen
    // statt es zu ersetzen — so ergänzen Kontur-Addons das Bild-Paket, ohne
    // dass beim Import etwas verloren geht. Ohne Bestandspaket wirkt das
    // Addon einfach über den eingebauten Daten.
    let toStore = v.manifest
    let storeImages = images
    if (v.manifest.merge) {
      toStore = mergeManifests(manifest, v.manifest)
      storeImages = new Map([...imageBlobs, ...images])
    }

    await idbStorePackage(toStore, storeImages)
    revokeObjectUrls()
    manifest = toStore
    imageBlobs = storeImages
    applyOverrides(manifest)
    publishState()
    // Zusätzlich als Datei sichern — übersteht Browser-Speicher-Löschungen.
    void paketSichern()
    logDiagnostic(
      `Schablonen-Paket importiert: ${manifest.name} (${storeImages.size} Bilder)`,
    )
    return { ok: true, name: manifest.name, imageCount: storeImages.size }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unbekannter Fehler beim Import',
    }
  }
}

/**
 * Aktuellen Paket-Stand als EIN Komplett-ZIP herunterladen.
 *
 * Exportiert wird der GEMERGTE Stand aus der IndexedDB (Basis-Paket +
 * alle importierten Addons) — damit lassen sich mehrere Einzel-ZIPs zu
 * einem einzigen Paket zusammenfassen, das auf weiteren Rechnern in
 * EINEM Schritt importiert wird (ohne merge-Flag → Import ERSETZT dort
 * sauber den kompletten Bestand). Dient zugleich als Backup/Umzug.
 */
/** Aktuellen (gemergten) Stand als ZIP-Bytes bauen — null ohne Paket. */
async function buildPackageZipBytes(): Promise<Uint8Array | null> {
  if (!manifest) return null
  // PNGs sind bereits komprimiert → level 0 (nur speichern, ~10× schneller).
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    'manifest.json': [strToU8(JSON.stringify(manifest, null, 1)), { level: 6 }],
  }
  for (const [path, blob] of imageBlobs) {
    files[path] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
  }
  return zipSync(files)
}

/** Paket zusätzlich als Datei im Projektordner sichern (fire-and-forget). */
async function paketSichern(): Promise<void> {
  try {
    const bytes = await buildPackageZipBytes()
    if (bytes) sicherungSchreiben('paket', bytes)
  } catch (err) {
    logDiagnostic(
      `Lokale Paket-Sicherung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export async function exportTemplatePackage(): Promise<
  { ok: true; fileName: string; imageCount: number } | { ok: false; error: string }
> {
  if (!manifest) {
    return { ok: false, error: 'Kein Schablonen-Paket geladen — nichts zu exportieren.' }
  }
  try {
    const zipped = (await buildPackageZipBytes())!
    const fileName = `cendova-schablonen-komplett-${new Date().toISOString().slice(0, 10)}.zip`
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(zipped)], { type: 'application/zip' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    logDiagnostic(`Schablonen-Paket exportiert: ${fileName} (${imageBlobs.size} Bilder)`)
    return { ok: true, fileName, imageCount: imageBlobs.size }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unbekannter Fehler beim Export',
    }
  }
}

/** Paket entfernen und eingebaute Daten wiederherstellen. */
export async function removeTemplatePackage(): Promise<void> {
  await idbClearPackage()
  revokeObjectUrls()
  manifest = null
  imageBlobs = new Map()
  restoreBundled()
  if (bundledTemplatesDisabled()) clearBundledData()
  publishState()
  // Bewusst entfernt = auch die Datei-Sicherung löschen (sonst käme das
  // Paket beim nächsten Start von selbst wieder).
  sicherungLoeschen('paket')
  logDiagnostic('Schablonen-Paket entfernt — eingebaute Daten aktiv')
}
