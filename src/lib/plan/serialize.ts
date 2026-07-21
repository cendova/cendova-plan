/**
 * Speichern und Laden eines kompletten Planungs-States.
 *
 * Was IST drin:
 *  - Kalibrierung (mmPerWorldUnit, Referenzlänge, Vergrößerungsfaktor)
 *  - Hüft-Messungen (LLD, CE, CCD, mLDFA, ...)
 *  - Knie-Messungen
 *  - Pfannen-Schablonen (Versafit) inkl. Position, Größe, Rotation
 *  - Schaft-Schablonen (Medacta) inkl. Halslänge, Rotation
 *  - Becken-Referenzlinie
 *  - Freie Textnotizen
 *
 * Was NICHT drin:
 *  - Das DICOM-Bild selbst (bleibt eine separate Datei beim Nutzer)
 *  - Undo-/Redo-History (transient, nicht persistierungswürdig)
 *  - Aktuelle Werkzeug-Auswahl, UI-State (Sidebar, etc.)
 *
 * Format: JSON mit `version`-Feld als Sentinel — bei Schema-Änderungen
 * können wir hier eine Migration schreiben statt zu brechen.
 */
import type { Types } from '@cornerstonejs/core'
import {
  useViewerStore,
  type Calibration,
  DEFAULT_CLINICAL_BLD,
} from '../../state/viewerStore'
import {
  useHipStore,
  type HipMeasurement,
} from '../../state/hipStore'
import {
  useKneeStore,
  type KneeMeasurement,
} from '../../state/kneeStore'
import {
  useTemplateStore,
  type CupTemplate,
  type StemTemplate,
} from '../../state/templateStore'
import { useNoteStore, type TextNote } from '../../state/noteStore'
import {
  useOsteophyteStore,
  type OsteophyteRegion,
} from '../../state/osteophyteStore'
import { usePlanningStore, type PlanningData } from '../../state/planningStore'
import {
  useKneeTemplateStore,
  type KneeTemplate,
} from '../../state/kneeTemplateStore'
import { ensureIdsAbove } from '../ids'
import {
  getCurrentDicomBytes,
  getCurrentDicomFileName,
  getGenericMeasurements,
  loadDicomFromBytes,
  restoreGenericMeasurements,
  type GenericMeasurementData,
} from '../cornerstone/viewer'
import {
  getCurrentDicomBytes2,
  getCurrentDicomFileName2,
  getViewport2,
  loadDicomBytesToPane2,
} from '../cornerstone/viewer2'
import { useKneePanesStore } from '../../state/kneePanesStore'

/**
 * Embedded-Modus-Haken: Wenn gesetzt (durch lib/embedded.ts, CendovaView-
 * iframe), übernimmt er das Speichern statt des Browser-Downloads.
 * Als Registrierung statt Import gelöst, damit KEIN Zirkelimport entsteht
 * (embedded.ts importiert buildPlan/applyPlan von hier).
 */
let embeddedSaveHook: (() => void) | null = null
export function setEmbeddedSaveHook(hook: (() => void) | null): void {
  embeddedSaveHook = hook
}

// Version 1: nur Plan (Templates, Messungen)
// Version 2: Plan + eingebettetes DICOM-Bild als base64
// Version 3: + Planungsdaten (OP-Termin, Klinik, Versicherung, Reha …)
// Version 4: + Knie-Schablonen (gingen vorher beim Speichern verloren)
// Version 5: + seitliches Bild (Knie-Zwei-Bild) + rechte Kalibrierung
// Version 6: + freie Längen-/Winkelmessungen (gingen vorher verloren)
const PLAN_FORMAT_VERSION = 6

export interface PlanFile {
  /** Schema-Version. Beim Laden prüfen und ggf. migrieren. */
  version: number
  /** ISO-Timestamp des Speicherzeitpunkts. */
  savedAt: string
  /** App-Name als Sentinel — verhindert Verwechslung mit anderen JSONs.
   *  Aktuell „CendovaPlan". Beim Laden wird nur geprüft, dass überhaupt ein
   *  appName-String + Versions-Feld vorhanden ist (markenneutral, damit
   *  frühere Pläne weiter laden). */
  appName: string
  /** Optionaler Hinweis auf das verwendete Bild (Anzeige beim Laden). */
  imageHint?: { fileName?: string }
  /** Eingebettetes DICOM-Bild als base64. Wenn vorhanden, lädt
   *  `applyPlan` das Bild gleich mit — Plan und Bild gehen nie
   *  auseinander. Bei Plänen ohne Bytes (z.B. Beispielbild-Lade-Pfad,
   *  wo wir die URL haben aber keine Bytes) bleibt das Feld undefined
   *  und es wird ein aktuell geladenes Bild verwendet. */
  embeddedImage?: {
    fileName: string
    /** Roh-Bytes der DICOM-Datei als base64-kodierter String. */
    base64: string
  }
  /** Seitliches Bild der Knie-Zwei-Bild-Ansicht (v5+). Es wird NUR das
   *  fixierte/sichtbare rechte Bild eingebettet — nie die ganze
   *  Kandidatenliste einer ZIP-Ladung (hält die JSON klein). */
  embeddedImageRight?: {
    fileName: string
    base64: string
  }
  calibration: Calibration | null
  /** Kalibrierung des seitlichen Bildes (v5+). */
  rightCalibration?: Calibration | null
  hipMeasurements: HipMeasurement[]
  kneeMeasurements: KneeMeasurement[]
  /** Freie Längen-/Winkelmessungen (Cornerstone-Annotationen des
   *  Haupt-Panes, Welt-Koordinaten). Optional (Pläne < v6 ohne Feld). */
  genericMeasurements?: GenericMeasurementData[]
  templates: {
    cups: CupTemplate[]
    stems: StemTemplate[]
    referenceLine: [Types.Point3, Types.Point3] | null
  }
  /** Platzierte Knie-Schablonen. Optional (Pläne < v4 ohne Feld). */
  kneeTemplates?: KneeTemplate[]
  notes: TextNote[]
  /** Editierbare klinische BLD-Notiz aus dem Arztbrief. Optional (alte
   *  Pläne kennen das Feld nicht → Default beim Laden). */
  clinicalBld?: string
  /** Markierte Osteophyten-Flächen. Optional (alte Pläne ohne Feld). */
  osteophytes?: OsteophyteRegion[]
  /** Organisatorische/klinische Planungsdaten (OP-Termin, Klinik,
   *  Versicherung, Reha …). Optional (alte Pläne ohne Feld). */
  planning?: PlanningData
}

/** ArrayBuffer → base64-String (chunked, vermeidet Stack-Overflow bei
 *  großen Buffern; reines `String.fromCharCode(...bytes)` knallt bei
 *  ~80 k Args). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    )
  }
  return btoa(binary)
}

/** base64-String → ArrayBuffer (Inverse zur obigen Funktion). */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** Baut aus dem aktuellen App-State ein Plan-Objekt. Wenn das aktuell
 *  geladene Bild als Roh-Bytes vorliegt (also über „Datei wählen", nicht
 *  über die Beispiel-URLs), wird es als base64 mit eingebettet — so ist
 *  der Plan self-contained.
 */
export function buildPlan(): PlanFile {
  const bytes = getCurrentDicomBytes()
  const fileName = getCurrentDicomFileName()
  const embeddedImage =
    bytes && fileName
      ? { fileName, base64: arrayBufferToBase64(bytes) }
      : undefined
  // Seitliches Bild (Knie-Zwei-Bild): nur das SICHTBARE rechte Bild —
  // bei ZIP-Ladungen also genau der fixierte Kandidat, nie alle.
  const panes = useKneePanesStore.getState()
  const bytes2 = getCurrentDicomBytes2()
  const fileName2 = getCurrentDicomFileName2()
  const embeddedImageRight =
    panes.rightHasImage && bytes2 && fileName2
      ? { fileName: fileName2, base64: arrayBufferToBase64(bytes2) }
      : undefined
  // Nur die reinen Datenfelder des Planning-Stores übernehmen (nicht die
  // UI-Flags dialogOpen/warnOpen oder die Setter-Funktionen).
  const ps = usePlanningStore.getState()
  const planning: PlanningData = {
    surgeryDate: ps.surgeryDate,
    surgeryDateUnknown: ps.surgeryDateUnknown,
    hospital: ps.hospital,
    insurance: ps.insurance,
    heightCm: ps.heightCm,
    weightKg: ps.weightKg,
    reha: ps.reha,
    rehaDate: ps.rehaDate,
    allergies: ps.allergies,
    anticoagulation: ps.anticoagulation,
    other: ps.other,
    planner: ps.planner,
  }
  return {
    version: PLAN_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    appName: 'CendovaPlan',
    imageHint: fileName ? { fileName } : undefined,
    embeddedImage,
    embeddedImageRight,
    calibration: useViewerStore.getState().calibration,
    rightCalibration: embeddedImageRight ? panes.rightCalibration : undefined,
    hipMeasurements: useHipStore.getState().measurements,
    kneeMeasurements: useKneeStore.getState().measurements,
    genericMeasurements: getGenericMeasurements(),
    templates: {
      cups: useTemplateStore.getState().templates,
      stems: useTemplateStore.getState().stems,
      referenceLine: useTemplateStore.getState().referenceLine,
    },
    kneeTemplates: useKneeTemplateStore.getState().templates,
    notes: useNoteStore.getState().notes,
    clinicalBld: useViewerStore.getState().clinicalBld,
    osteophytes: useOsteophyteStore.getState().regions,
    planning,
  }
}

/**
 * Startet einen Browser-Download mit dem aktuellen Plan als JSON-Datei.
 *
 * Embedded-Modus (CendovaView-iframe): Statt des Downloads geht der Plan
 * per postMessage an den Host zurück — derselbe „Plan speichern"-Knopf,
 * aber der automatisierte Rückimport ins Archiv (Contract v1).
 */
export function downloadPlan(filename?: string): void {
  if (embeddedSaveHook) {
    embeddedSaveHook()
    return
  }
  const plan = buildPlan()
  const json = JSON.stringify(plan, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  // Default-Dateiname: cendova-plan-2026-05-27-14h30.json
  const ts = new Date()
    .toISOString()
    .replace(/[T:]/g, '-')
    .replace(/\.\d{3}Z$/, '')
  a.download = filename ?? `cendova-plan-${ts}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Übernimmt einen geladenen Plan in die Stores. Vorher werden alle
 * bisherigen Mess-/Template-Daten gelöscht (sonst doppelte Einträge).
 *
 * Wenn der Plan ein eingebettetes DICOM-Bild enthält (Version 2+), wird
 * es ZUERST geladen — danach werden die Plan-Daten gesetzt. So landen
 * Bild und Schablonenpositionen immer paarig zusammen.
 *
 * Gibt einen kurzen Statusbericht zurück, den die UI anzeigen kann.
 */
export async function applyPlan(plan: PlanFile): Promise<
  | { ok: true; summary: string }
  | { ok: false; error: string }
> {
  // Versions-Check
  if (typeof plan?.version !== 'number') {
    return { ok: false, error: 'Datei enthält kein Versions-Feld' }
  }
  // Sentinel: markenneutral — ein appName-String muss vorhanden sein
  // (zusammen mit dem geprüften Versions-Feld). Verhindert das Laden
  // fremder JSONs, ohne an einen konkreten Produktnamen gebunden zu sein
  // (so laden auch unter früheren Namen gespeicherte Pläne weiter).
  if (typeof plan.appName !== 'string' || plan.appName.length === 0) {
    return { ok: false, error: 'Datei stammt nicht aus dieser App' }
  }
  if (plan.version > PLAN_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Plan-Version ${plan.version} ist neuer als unterstützt (max ${PLAN_FORMAT_VERSION}). Bitte App aktualisieren.`,
    }
  }
  // — hier könnten zukünftige Migrationen alte Versionen anheben —

  // Bild zuerst laden (wenn eingebettet), DANN die Plan-Daten setzen.
  // Reihenfolge ist wichtig, weil das Image-Laden den Viewer resettet
  // (Cornerstone neu mounted, Welt-Koordinaten neu kalibriert), was
  // bestehende Mess-Templates verschmeißen würde.
  let imageLoaded = false
  const hasEmbedded = !!(
    plan.embeddedImage?.base64 && plan.embeddedImage.fileName
  )
  const viewerHasImage = useViewerStore.getState().hasImage
  if (hasEmbedded) {
    try {
      const buffer = base64ToArrayBuffer(plan.embeddedImage!.base64)
      await loadDicomFromBytes(buffer, plan.embeddedImage!.fileName)
      imageLoaded = true
    } catch (err) {
      return {
        ok: false,
        error: `Eingebettetes Bild konnte nicht geladen werden: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }
    }
  } else if (!viewerHasImage) {
    // Weder Plan-Bild noch aktuell geladenes Bild → die Plan-Punkte
    // hätten kein Welt-Bezugssystem. Plan ablehnen mit klarer
    // Hilfestellung statt stillschweigend Daten zu setzen, die nirgends
    // sichtbar sind.
    return {
      ok: false,
      error:
        'Plan enthält kein Bild und im Viewer ist auch keins geladen. Bitte erst ein Bild laden ODER einen Plan wählen, der ein Bild enthält.',
    }
  }

  // Alte Daten zurücksetzen
  useHipStore.getState().removeAll()
  useKneeStore.getState().removeAll()
  useTemplateStore.getState().reset()
  useKneeTemplateStore.getState().reset()
  useNoteStore.getState().reset()
  useOsteophyteStore.getState().reset()

  // Neue Daten setzen. Bei Zustand reicht setState direkt — keine
  // Add-Funktion-Schleifen nötig, die Add-Side-Effects auslösen würden.
  useViewerStore.getState().setCalibration(plan.calibration)
  useHipStore.setState({ measurements: plan.hipMeasurements ?? [] })
  useKneeStore.setState({ measurements: plan.kneeMeasurements ?? [] })
  // Stems aus alten Plänen können das femurAxis-Feld noch nicht haben —
  // explizit auf null setzen, damit die TypeScript-Required-Felder
  // erfüllt sind und stemAxisAlignment auf die 90°-Vertikale fällt.
  const stemsWithFallback = (plan.templates?.stems ?? []).map((s) => ({
    ...s,
    femurAxis: s.femurAxis ?? null,
  }))
  useTemplateStore.setState({
    templates: plan.templates?.cups ?? [],
    stems: stemsWithFallback,
    referenceLine: plan.templates?.referenceLine ?? null,
  })
  // Knie-Schablonen (v4+): fehlende Felder alter Einträge defaulten.
  const kneeTemplates = (plan.kneeTemplates ?? []).map((t) => ({
    ...t,
    pane: t.pane ?? 'left',
    groupId: t.groupId ?? t.id,
    visible: t.visible ?? true,
  }))
  useKneeTemplateStore.setState({ templates: kneeTemplates, selectedId: null })
  useNoteStore.setState({ notes: plan.notes ?? [] })
  useOsteophyteStore.setState({
    regions: plan.osteophytes ?? [],
    draftPoints: [],
    placing: false,
  })
  // Freie Längen-/Winkelmessungen (v6+): ersetzt vorhandene Annotationen;
  // alte Pläne ohne Feld räumen sie nur ab (konsistent zum Reset oben).
  restoreGenericMeasurements(plan.genericMeasurements ?? [])
  // ID-Zähler über alle restaurierten IDs heben — sonst kollidieren neu
  // angelegte Objekte mit geladenen (gleiche ID → Lösch-/Render-Fehler).
  ensureIdsAbove(plan.hipMeasurements)
  ensureIdsAbove(plan.kneeMeasurements)
  ensureIdsAbove(plan.templates?.cups)
  ensureIdsAbove(plan.templates?.stems)
  ensureIdsAbove(kneeTemplates)
  ensureIdsAbove(plan.notes)
  ensureIdsAbove(plan.osteophytes)
  // Klinische BLD-Notiz + Cave übernehmen; alte Pläne ohne Feld → Default.
  // Der frühere Platzhaltertext („± 0,x cm …") war nie ein echter Wert —
  // beim Laden alter Pläne auf leer normalisieren, sonst stünde er als
  // vermeintlicher Messwert groß in der PDF-Kopfzeile.
  const legacyBldPlaceholder = 'Klinische BLD ± 0,x cm Rechts/Links'
  const loadedBld = plan.clinicalBld ?? DEFAULT_CLINICAL_BLD
  useViewerStore
    .getState()
    .setClinicalBld(loadedBld.trim() === legacyBldPlaceholder ? '' : loadedBld)
  // (clinicalCave alter Pläne wird ignoriert — der Cave-Inhalt lebt seit
  // Debug-Runde 2 in den Planungsdaten: Allergien/Antikoagulation.)
  // Planungsdaten übernehmen; alte Pläne ohne Feld → auf Leerwerte zurück.
  if (plan.planning) usePlanningStore.getState().hydrate(plan.planning)
  else usePlanningStore.getState().reset()

  // Seitliches Bild (v5+, Knie-Zwei-Bild-Plan): Split-Ansicht aktivieren,
  // auf den zweiten Viewport warten (das Pane mountet asynchron), dann
  // Bild + Kalibrierung wiederherstellen. Fehler hier brechen den Plan
  // nicht ab — die Hauptdaten sind bereits gesetzt.
  let rightImageLoaded = false
  if (plan.embeddedImageRight?.base64 && plan.embeddedImageRight.fileName) {
    try {
      useViewerStore.getState().setPlanningMode('knee')
      useKneePanesStore.getState().setSplitView(true)
      const buf = base64ToArrayBuffer(plan.embeddedImageRight.base64)
      for (let i = 0; i < 50 && !getViewport2(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      if (getViewport2()) {
        await loadDicomBytesToPane2(buf, plan.embeddedImageRight.fileName)
        // Manuelle rechte Kalibrierung des Plans überschreibt die beim
        // Laden automatisch gesetzte DICOM-Kalibrierung.
        if (plan.rightCalibration !== undefined) {
          useKneePanesStore
            .getState()
            .setRightCalibration(plan.rightCalibration)
        }
        rightImageLoaded = true
      } else {
        useKneePanesStore
          .getState()
          .setRightStatus('Seitliches Plan-Bild: Pane wurde nicht bereit — bitte erneut laden.')
      }
    } catch (err) {
      console.warn('Seitliches Plan-Bild konnte nicht geladen werden', err)
      useKneePanesStore
        .getState()
        .setRightStatus(
          `Fehler: Seitliches Plan-Bild nicht ladbar (${err instanceof Error ? err.message : 'Unbekannt'})`,
        )
    }
  }

  const counts = [
    plan.hipMeasurements?.length > 0 && `${plan.hipMeasurements.length} Hüft-Messung(en)`,
    plan.kneeMeasurements?.length > 0 && `${plan.kneeMeasurements.length} Knie-Messung(en)`,
    (plan.genericMeasurements?.length ?? 0) > 0 &&
      `${plan.genericMeasurements!.length} freie Messung(en)`,
    plan.templates?.cups?.length > 0 && `${plan.templates.cups.length} Pfanne(n)`,
    plan.templates?.stems?.length > 0 && `${plan.templates.stems.length} Schaft/Schäfte`,
    (plan.kneeTemplates?.length ?? 0) > 0 && `${plan.kneeTemplates!.length} Knie-Schablone(n)`,
    plan.notes?.length > 0 && `${plan.notes.length} Notiz(en)`,
    plan.osteophytes && plan.osteophytes.length > 0 &&
      `${plan.osteophytes.length} Osteophyten-Fläche(n)`,
  ].filter(Boolean) as string[]
  const prefix = imageLoaded
    ? rightImageLoaded
      ? 'Plan + beide Bilder geladen'
      : 'Plan + Bild geladen'
    : 'Plan geladen'
  const summary = counts.length > 0
    ? `${prefix}: ${counts.join(', ')}.`
    : `${prefix} (war leer).`
  return { ok: true, summary }
}

/** Liest eine vom Nutzer ausgewählte JSON-Datei und wendet sie an. */
export async function loadPlanFromFile(file: File): Promise<
  Awaited<ReturnType<typeof applyPlan>>
> {  try {
    const text = await file.text()
    const data = JSON.parse(text) as PlanFile
    return await applyPlan(data)
  } catch (err) {
    return {
      ok: false,
      error: `Datei konnte nicht gelesen werden: ${
        err instanceof Error ? err.message : String(err)
      }`,
    }
  }
}

/** Erste Plan-JSON in einer Dateiliste (Endung .json) oder null. Wird von den
 *  Bild-Lade-/Drop-Pfaden genutzt, um eine versehentlich dort abgelegte Plan-
 *  Datei zu erkennen und stattdessen als Plan zu laden (statt „kein DICOM"). */
export function findPlanFile(files: File[]): File | null {
  return files.find((f) => f.name.toLowerCase().endsWith('.json')) ?? null
}
