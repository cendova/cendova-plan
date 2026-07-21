import {
  RenderingEngine,
  Enums,
  metaData,
  eventTarget,
  type Types,
} from '@cornerstonejs/core'
import {
  ToolGroupManager,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollTool,
  LengthTool,
  AngleTool,
  annotation,
  addTool,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools'
import dicomImageLoader from '@cornerstonejs/dicom-image-loader'
import { initCornerstone } from './init'
import { extractPatientInfo } from './dicomMeta'
import { assertImageUsable } from './textureLimit'
import {
  useViewerStore,
  DEFAULT_CLINICAL_BLD,
  type LeftTool,
  type Measurement,
} from '../../state/viewerStore'
import { useHipStore } from '../../state/hipStore'
import { useKneeStore } from '../../state/kneeStore'
import { useNoteStore } from '../../state/noteStore'
import { useTemplateStore } from '../../state/templateStore'
import { usePlanningStore } from '../../state/planningStore'
import { useOsteophyteStore } from '../../state/osteophyteStore'
import {
  useKneeTemplateStore,
  type KneeSide,
  type KneeView,
} from '../../state/kneeTemplateStore'
import { useTemplateTracerStore } from '../../state/templateTracerStore'
import { useKneePanesStore } from '../../state/kneePanesStore'
import {
  getViewport2,
  startCalibrationToolPane2,
  applyNavToolsPane2,
} from './viewer2'
import {
  bandForSizeIndex,
  femoralDistalThicknessMm,
  type KneeImplantKind,
} from '../knee/smithNephewCatalog'
import { contourGeomImage, getKneeContour } from '../knee/kneeContours'
import { getKneeImage, type KneeImage } from '../knee/kneeImages'
import { angleAtVertex, dist as distance3 } from '../hip/geometry'
import { applyToolBindings } from './toolBindings'
import {
  extractWorkflowAxes,
  boneOf,
  jointCenterFor,
  mechanicalAlignRotationDeg,
} from '../knee/resection'
import { autoPlaceImplant } from '../knee/resectionLine'
import { useHistoryStore } from '../../state/historyStore'
import {
  computeAutoCupPosition,
  cupCatalogEntries,
  DEFAULT_STEM_ROTATION_DEG,
} from '../hip/templates'

const RENDERING_ENGINE_ID = 'cendova-engine'
export const VIEWPORT_ID = 'cendova-viewport'
const TOOL_GROUP_ID = 'cendova-toolgroup'

let renderingEngine: RenderingEngine | null = null
let toolsRegistered = false
let listenersAttached = false
/** Aktiv, solange eine Kalibrierstrecke gezeichnet wird. */
let calibrationMode = false

/** Welches Pane gerade kalibriert wird — gelesen aus dem (reaktiven)
 *  kneePanesStore, damit die Kalibrier-Dialoge dasselbe Target sehen wie
 *  diese Logik. 'left' = Haupt-Pane (viewerStore), 'right' = zweites Pane. */
function calTarget(): 'left' | 'right' {
  return useKneePanesStore.getState().calibrationTarget
}

/**
 * Öffnet den Kalibrier-Methoden-Wahl-Dialog für ein bestimmtes Pane.
 * Setzt zuerst das (reaktive) Ziel, damit Dialoge UND Logik konsistent
 * dasselbe Bild kalibrieren. Hüft-Modul ruft mit 'left'.
 */
export function openCalibrationChoice(pane: 'left' | 'right'): void {
  useKneePanesStore.getState().setCalibrationTarget(pane)
  useViewerStore.getState().setCalibrationChoiceOpen(true)
}

// ----------------------------------------------------------------------
// Recovery-State: Wir merken uns das zuletzt geladene Bild + das DOM-
// Element, sodass wir nach einem WebGL-Context-Loss (Tab-Switch, GPU-
// Stress, RAM-Druck, Hibernation) den Viewport automatisch neu aufbauen
// und das Bild ohne User-Aktion wieder anzeigen können.
// ----------------------------------------------------------------------
let cachedElement: HTMLDivElement | null = null
/** Zuletzt geladene DICOM-Image-IDs (für Re-Load nach Recovery). */
let lastImageIds: string[] | null = null
/** Status-Text, der nach dem Re-Load wiederhergestellt wird. */
let lastStatusText: string = ''
/** Verhindert mehrfache Recovery-Versuche im selben Tick. */
let recoveryInFlight = false
/** Rohbytes der zuletzt geladenen DICOM-Datei — für Bundle-Save im
 *  Plan-JSON. null = noch kein Bild geladen. */
let currentDicomBytes: ArrayBuffer | null = null
let currentDicomFileName: string | null = null

// Kandidaten einer Mehr-Bild-Ladung (ZIP/Ordner mit mehreren DICOMs).
// Der Stack enthält bewusst immer nur EIN Bild (setStack([id])) — der
// Wechsel läuft ausschließlich über showImageCandidate, das ALLES
// Bookkeeping (Bytes, PatientInfo, Recovery, Resets) mitführt. So kann
// das Mausrad (StackScroll) nicht mehr lautlos am State vorbei blättern.
let candidateFiles: File[] = []
let candidateImageIds: string[] = []

/** Liefert den aktiven Stack-Viewport oder null. */
export function getViewport(): Types.IStackViewport | null {
  if (!renderingEngine) return null
  return renderingEngine.getViewport(VIEWPORT_ID) as Types.IStackViewport
}

/**
 * Liefert den aktiven Viewport oder versucht ihn neu aufzubauen, wenn
 * die Modul-Variable durch HMR-Re-Evaluierung verloren gegangen ist
 * (typisch nach einem Code-Change in einer Dep-Datei). Wir behalten das
 * letzte DOM-Element in `cachedElement` — wenn das noch existiert und
 * im Dokument hängt, rufen wir setupViewport erneut auf.
 *
 * Bei totalem Fehlen (z.B. die App ist gerade erst gebootet und die
 * Viewport.tsx-useEffect läuft noch nicht): kurze Wartezeit mit Polling.
 */
async function ensureViewport(): Promise<Types.IStackViewport> {
  let vp = getViewport()
  if (vp) return vp

  // HMR-Recovery: das DOM-Element ist noch da, aber renderingEngine ist
  // null geworden. setupViewport rebauen.
  if (cachedElement && cachedElement.isConnected) {
    await setupViewport(cachedElement)
    vp = getViewport()
    if (vp) return vp
  }

  // Boot-Race: Viewport.tsx-useEffect läuft noch — kurz warten.
  const start = Date.now()
  while (Date.now() - start < 2000) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    vp = getViewport()
    if (vp) return vp
  }
  throw new Error('Viewport nicht bereit')
}

function registerToolsOnce() {
  if (toolsRegistered) return
  addTool(PanTool)
  addTool(ZoomTool)
  addTool(WindowLevelTool)
  addTool(StackScrollTool)
  addTool(LengthTool)
  addTool(AngleTool)
  toolsRegistered = true
}

/**
 * Bindet die Werkzeuge des Haupt-Panes an die Maustasten — geteilte
 * Binding-Logik in toolBindings.ts (Befund T1: identisch fürs rechte Pane).
 */
export function applyLeftTool(left: LeftTool) {
  applyToolBindings(TOOL_GROUP_ID, left)
}

/** Richtet Render-Engine, Viewport und Werkzeuggruppe für ein Element ein. */
export async function setupViewport(element: HTMLDivElement) {
  cachedElement = element
  await initCornerstone()
  registerToolsOnce()

  renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID)
  renderingEngine.enableElement({
    viewportId: VIEWPORT_ID,
    type: Enums.ViewportType.STACK,
    element,
    defaultOptions: {
      background: [0, 0, 0],
    },
  })

  let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)
  if (!toolGroup) {
    toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID)!
    toolGroup.addTool(PanTool.toolName)
    toolGroup.addTool(ZoomTool.toolName)
    toolGroup.addTool(WindowLevelTool.toolName)
    toolGroup.addTool(StackScrollTool.toolName)
    // Strecken-Beschriftung im Bild zeigt die kalibrierte Länge.
    toolGroup.addTool(LengthTool.toolName, { getTextLines: lengthTextLines })
    toolGroup.addTool(AngleTool.toolName)
  }
  toolGroup.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID)

  if (!listenersAttached) {
    const { Events } = csToolsEnums
    eventTarget.addEventListener(
      Events.ANNOTATION_COMPLETED,
      onAnnotationCompleted,
    )
    eventTarget.addEventListener(Events.ANNOTATION_ADDED, recomputeMeasurements)
    eventTarget.addEventListener(
      Events.ANNOTATION_MODIFIED,
      recomputeMeasurements,
    )
    eventTarget.addEventListener(
      Events.ANNOTATION_REMOVED,
      recomputeMeasurements,
    )
    listenersAttached = true
  }

  applyLeftTool(useViewerStore.getState().leftTool)

  // WebGL-Context-Loss-Recovery: Browser kappen den GPU-Kontext bei
  // Tab-Switch, GPU-Stress, RAM-Druck oder Hibernation. Ohne Listener
  // wird der Canvas schwarz und die ganze App scheint zu „abstürzen".
  // Wir hören auf das Event und stoßen automatisch eine Wiederherstellung
  // an. Cornerstone braucht einen Tick, bis sein Canvas im DOM ist —
  // daher der kleine setTimeout.
  setTimeout(() => attachContextLossListener(element), 50)
}

/**
 * Hängt webglcontextlost-/-restored-Listener an die Cornerstone-Canvas,
 * sodass wir auf GPU-Context-Verlust automatisch reagieren können.
 * Idempotent: wir markieren den Canvas, damit derselbe Listener bei
 * einem Re-Init nicht doppelt registriert wird.
 */
function attachContextLossListener(element: HTMLDivElement) {
  const canvas = element.querySelector('canvas')
  if (!canvas) return
  if ((canvas as HTMLCanvasElement & { _csLossWired?: boolean })._csLossWired) {
    return
  }
  ;(canvas as HTMLCanvasElement & { _csLossWired?: boolean })._csLossWired = true
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault() // signalisiert dem Browser: wir wollen restoring
    console.warn('[viewer] WebGL-Kontext verloren — starte Recovery')
    useViewerStore
      .getState()
      .setStatus('Render-Kontext verloren — Wiederherstellung läuft …')
    void recoverViewport()
  })
  canvas.addEventListener('webglcontextrestored', () => {
    console.info('[viewer] WebGL-Kontext wiederhergestellt')
    void recoverViewport()
  })
}

/**
 * Vollständige Wiederherstellung des Viewports inklusive Re-Load des
 * zuletzt geladenen Bilds. Kann auch manuell vom UI aufgerufen werden,
 * falls der automatische Listener das Event nicht mitkriegt.
 *
 * Idempotent: ein laufender Recovery-Versuch wird nicht parallel ausgelöst.
 */
export async function recoverViewport(): Promise<boolean> {
  if (recoveryInFlight) return false
  if (!cachedElement) {
    console.warn('[viewer] kein gecachtes Element — Recovery nicht möglich')
    return false
  }
  recoveryInFlight = true
  try {
    teardownViewport()
    await setupViewport(cachedElement)
    // Bild neu laden, falls eines aktiv war.
    if (lastImageIds && lastImageIds.length > 0) {
      const vp = getViewport()
      if (vp) {
        await vp.setStack(lastImageIds)
        vp.render()
        useViewerStore
          .getState()
          .setStatus(lastStatusText || 'Wiederhergestellt')
      }
    }
    return true
  } catch (err) {
    console.error('[viewer] Recovery fehlgeschlagen', err)
    useViewerStore
      .getState()
      .setStatus(
        'Wiederherstellung fehlgeschlagen — bitte die Seite mit Strg+R neu laden',
      )
    return false
  } finally {
    recoveryInFlight = false
  }
}

/** Liefert true, wenn ein Bild geladen WAR, der Viewport aber gerade
 *  fehlt — d. h. der UI sollte einen Wiederherstellen-Knopf anzeigen. */
export function isViewportLost(): boolean {
  return (
    lastImageIds !== null &&
    lastImageIds.length > 0 &&
    getViewport() === null
  )
}

/** Gibt Render-Engine und Werkzeuggruppe wieder frei. */
export function teardownViewport() {
  ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID)
  renderingEngine?.destroy()
  renderingEngine = null
}

/** Passt den Viewport an eine veränderte Elementgröße an. `keepCamera=true`
 *  (2. Arg) erhält Zoom/Pan — sonst springt das Bild bei jedem Layout-Reflow
 *  (z. B. wenn rechts das CPAK-Schaubild erscheint) auf „einpassen" zurück. */
export function resizeViewport() {
  renderingEngine?.resize(true, true)
}

const DICOM_EXTENSIONS = ['.dcm', '.dicom', '.ima']

function looksLikeDicom(file: File): boolean {
  const name = file.name.toLowerCase()
  if (DICOM_EXTENSIONS.some((ext) => name.endsWith(ext))) return true
  // Dateien ohne Endung behandeln wir testweise als DICOM.
  return !name.includes('.')
}

/**
 * Setzt die GESAMTE Planung zurück — Messungen (beide Panes), Schablonen,
 * Notizen, Osteophyten, Planungsdaten, BLD/Cave und die Undo-History.
 * Bild, Kamera und Kalibrierung bleiben erhalten. Wird vom
 * „Planung zurücksetzen"-Button (Kopfzeile, mit Warn-Dialog) aufgerufen.
 */
export function resetPlanning(): void {
  annotation.state.removeAllAnnotations()
  useHipStore.getState().reset()
  useKneeStore.getState().reset()
  useKneeTemplateStore.getState().reset()
  useNoteStore.getState().reset()
  useTemplateStore.getState().reset()
  useOsteophyteStore.getState().reset()
  usePlanningStore.getState().reset()
  const viewer = useViewerStore.getState()
  viewer.setMeasurements([])
  viewer.setClinicalBld(DEFAULT_CLINICAL_BLD)
  useKneePanesStore.getState().setRightMeasurements([])
  useHistoryStore.getState().reset()
  getViewport()?.render()
  getViewport2()?.render()
}

/** Schreibt nach dem Laden Status und Bildmetadaten in den Zustand.
 *  (extractPatientInfo + DICOM-Datums-Helfer leben jetzt in dicomMeta.ts,
 *  damit viewer.ts und viewer2.ts sie ohne Zirkelimport teilen können.) */
function updateStoreForLoadedImage(
  viewport: Types.IStackViewport,
  statusText: string,
) {
  // Neues Bild = sauberer Start: alte Annotationen/Messungen entfernen.
  annotation.state.removeAllAnnotations()
  useHipStore.getState().reset()
  useKneeStore.getState().reset()
  useKneeTemplateStore.getState().reset()
  useNoteStore.getState().reset()
  useTemplateStore.getState().reset()
  useOsteophyteStore.getState().reset()
  // Organisatorische Planungsdaten (OP-Termin, Klinik, Versicherung, Reha,
  // Allergien …) beim Laden eines NEUEN Bildes löschen — sonst bestünde
  // Verwechslungsgefahr mit dem vorherigen Patienten. Hinweis: Der Plan-
  // Lade-Pfad (applyPlan) läuft ebenfalls hier durch, setzt seine eigenen
  // Planungsdaten aber DANACH wieder (hydrate/reset) — gleiches Muster wie
  // bei Kalibrierung/Messungen, die hier auf null/[] gehen und in applyPlan
  // neu gesetzt werden.
  usePlanningStore.getState().reset()
  // History ebenfalls auf den frischen Zustand zurücksetzen, damit Undo
  // den Nutzer nicht in den Zustand des vorherigen Bildes zurückzieht.
  // Der nachgelagerte Debounce-Capture aus den .reset()-Mutationen oben
  // wird per Snapshot-Vergleich abgewiesen (gleicher leerer Zustand).
  useHistoryStore.getState().reset()

  const store = useViewerStore.getState()
  store.setHasImage(true)
  store.setStatus(statusText)
  store.setCalibration(null)
  store.setPendingCalibration(null)
  store.setMeasurements([])
  // Patienten-Identifikation aus den zuletzt geladenen DICOM-Bytes
  // (gesetzt in loadFiles, bevor diese Funktion läuft).
  store.setPatientInfo(
    currentDicomBytes ? extractPatientInfo(currentDicomBytes) : null,
  )

  const currentImageId = viewport.getCurrentImageId() ?? null
  store.setCurrentImageId(currentImageId)

  if (currentImageId) {
    const plane = metaData.get('imagePlaneModule', currentImageId) as
      | { rows?: number; columns?: number; rowPixelSpacing?: number }
      | undefined
    const pixelSpacing = plane?.rowPixelSpacing ?? null
    store.setImageMeta({
      rows: plane?.rows ?? 0,
      columns: plane?.columns ?? 0,
      pixelSpacing,
    })

    // BEWUSST KEINE Auto-Kalibrierung mehr beim Laden: ein frisch geladenes
    // Bild gilt als NICHT kalibriert. Das DICOM-PixelSpacing bildet die
    // Röntgen-Vergrößerung NICHT ab — „kalibriert" würde sonst fälschlich
    // direkt nach dem Laden erscheinen. Erst eine EXPLIZITE Kalibrierung
    // (Kugel/Strecke/Maßstab oder bewusst „aus PixelSpacing") setzt die
    // Kalibrierung und schaltet den Status auf grün. Das PixelSpacing bleibt
    // in imageMeta für die spätere Methodenwahl erhalten.
  }
}

// (Die früheren Beispielbild-Loader — loadBundledImage/loadSampleImage/
// loadXrayImage/loadKneeExampleImage — entfielen mit den Test-Buttons im
// „Bild laden"-Menü: die Sample-DICOMs waren nie eingecheckt, auf frischen
// Installationen liefen die Buttons ins Leere. Bilder kommen jetzt
// ausschließlich über Datei/Ordner/ZIP-Auswahl oder Drag&Drop.)

/**
 * Lädt eine oder mehrere DICOM-Dateien in den Viewport und zeigt die
 * erste an. Aktualisiert anschließend den globalen Zustand.
 */
export async function loadFiles(files: File[]) {
  const viewport = await ensureViewport()

  const dicomFiles = files.filter(looksLikeDicom)
  if (dicomFiles.length === 0) {
    throw new Error(
      'Keine DICOM-Datei erkannt. Unterstützt werden derzeit .dcm-Dateien.',
    )
  }

  // Erste DICOM-Datei als Rohbytes merken — wird beim Plan-Export ins
  // JSON eingebettet, damit Plan + Bild als EINE self-contained Datei
  // gespeichert werden können (bei Kandidaten-Wechsel aktualisiert
  // showImageCandidate die Bytes auf das dann sichtbare Bild).
  currentDicomBytes = await dicomFiles[0].arrayBuffer()
  currentDicomFileName = dicomFiles[0].name

  candidateFiles = dicomFiles
  candidateImageIds = dicomFiles.map((file) =>
    dicomImageLoader.wadouri.fileManager.add(file),
  )

  // Immer EIN-Bild-Stack: Kandidaten-Wechsel läuft über showImageCandidate
  // (Pfeile im Bild), nicht übers Mausrad — sonst blättert StackScroll
  // lautlos am Kalibrier-/Mess-/Plan-State vorbei.
  await viewport.setStack([candidateImageIds[0]])
  // Lade-Validierung: zu große ODER nicht dekodierbare Bilder rendert
  // Cornerstone lautlos schwarz (setStack/render werfen nicht). Lieber JETZT
  // mit klarer Meldung abbrechen. currentDicomBytes (= erste Datei) erlaubt
  // bei einem Dekodier-Fehler die Header-Diagnose (Transfersyntax/Maße).
  assertImageUsable(viewport.getCurrentImageId(), currentDicomBytes)
  viewport.render()

  const label =
    dicomFiles.length > 1
      ? `Bild 1/${dicomFiles.length}: ${dicomFiles[0].name} — mit den Pfeilen wählen, dann fixieren`
      : `Bild geladen: ${dicomFiles[0].name}`
  lastImageIds = [candidateImageIds[0]]
  lastStatusText = label

  updateStoreForLoadedImage(viewport, label)
  // Kandidaten-Picker nur bei ECHTER Auswahl (>1 Bild). Einzelbild (auch
  // Plan-Restore über loadDicomFromBytes) → kein Picker.
  useViewerStore.getState().setImageSelection(
    dicomFiles.length > 1
      ? {
          fileNames: dicomFiles.map((f) => f.name),
          count: dicomFiles.length,
          index: 0,
          fixed: false,
        }
      : null,
  )
}

/**
 * Zeigt Kandidat `index` einer Mehr-Bild-Ladung im Haupt-Pane an
 * (Pfeil-Navigation des StackImagePickers). Führt ALLES Bookkeeping mit:
 * Plan-Bundle-Bytes, PatientInfo, Recovery-IDs — und setzt die bild-
 * gebundene Planung zurück (Messungen/Schablonen/Kalibrierung gehören
 * zum alten Bild). Die organisatorischen Planungsdaten (OP-Termin,
 * Klinik …) bleiben erhalten: gleiche Lieferung, gleicher Patient.
 */
export async function showImageCandidate(index: number): Promise<void> {
  const viewer = useViewerStore.getState()
  const sel = viewer.imageSelection
  if (!sel || candidateImageIds.length < 2) return
  const i = Math.max(0, Math.min(candidateImageIds.length - 1, index))
  if (i === sel.index) return
  const viewport = await ensureViewport()

  const planningSnapshot = { ...usePlanningStore.getState() }
  try {
    const file = candidateFiles[i]
    const bytes = await file.arrayBuffer()
    await viewport.setStack([candidateImageIds[i]])
    assertImageUsable(viewport.getCurrentImageId(), bytes)
    viewport.render()

    currentDicomBytes = bytes
    currentDicomFileName = file.name
    lastImageIds = [candidateImageIds[i]]
    const label = `Bild ${i + 1}/${sel.count}: ${file.name}`
    lastStatusText = label
    updateStoreForLoadedImage(viewport, label)
    // updateStoreForLoadedImage setzt auch die Planungsdaten zurück —
    // beim Kandidaten-Wechsel innerhalb DERSELBEN Lieferung wieder
    // herstellen (kein Patientenwechsel).
    usePlanningStore.getState().hydrate(planningSnapshot)
    useViewerStore.getState().setImageSelection({ ...sel, index: i })
  } catch (err) {
    // Unbrauchbarer Kandidat (zu groß / nicht dekodierbar): Meldung zeigen
    // und zum vorherigen Kandidaten zurückrollen.
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    useViewerStore.getState().setStatus(`Fehler: ${msg}`)
    await viewport.setStack([candidateImageIds[sel.index]])
    viewport.render()
  }
}

/** Fixiert den aktuellen Kandidaten als Planungs-Bild — die Pfeile
 *  verschwinden, der normale Workflow (Kalibrieren → Messen) beginnt. */
export function fixImageCandidate(): void {
  const viewer = useViewerStore.getState()
  const sel = viewer.imageSelection
  if (!sel || sel.fixed) return
  viewer.setImageSelection({ ...sel, fixed: true })
  viewer.setStatus(
    `Bild ${sel.index + 1}/${sel.count} fixiert — jetzt kalibrieren.`,
  )
}

/** Öffnet die Kandidaten-Auswahl erneut (aus dem Kalibrier-Dialog, mit
 *  Warnhinweis dort). Der eigentliche Reset passiert erst beim WECHSEL
 *  auf ein anderes Bild (showImageCandidate) — wer beim aktuellen Bild
 *  bleibt und erneut fixiert, verliert nichts. */
export function reopenImageSelection(): void {
  const viewer = useViewerStore.getState()
  const sel = viewer.imageSelection
  if (!sel) return
  viewer.setImageSelection({ ...sel, fixed: false })
  viewer.setStatus('Bild-Auswahl geöffnet — mit den Pfeilen wählen, dann fixieren.')
}

/** Lädt eine DICOM-Datei aus rohen Bytes (z.B. aus einem Plan-JSON
 *  zurückdekodiert). Konstruiert ein File-Objekt und ruft loadFiles. */
export async function loadDicomFromBytes(
  bytes: ArrayBuffer,
  fileName: string,
): Promise<void> {
  const file = new File([bytes], fileName, { type: 'application/dicom' })
  await loadFiles([file])
}

/** Rohbytes der aktuell geladenen DICOM-Datei (null, solange noch kein
 *  Bild geladen wurde). */
export function getCurrentDicomBytes(): ArrayBuffer | null {
  return currentDicomBytes
}
export function getCurrentDicomFileName(): string | null {
  return currentDicomFileName
}

// ----------------------------------------------------------------------
// Messungen (Geometrie: dist/angleAtVertex aus ../hip/geometry — eine
// Quelle statt Kopien in viewer/viewer2, Audit-Befund A8)
// ----------------------------------------------------------------------

/** Beschriftung der Strecke im Bild — zeigt die kalibrierte Länge. */
function lengthTextLines(data: {
  handles?: { points?: Types.Point3[] }
}): string[] {
  const points = data?.handles?.points
  if (!points || points.length < 2) return ['']
  const factor = useViewerStore.getState().calibration?.mmPerWorldUnit ?? 1
  const mm = distance3(points[0], points[1]) * factor
  return [`${mm.toFixed(1)} mm`]
}

/** Liest alle Annotationen aus und aktualisiert die Messliste im Zustand. */
function recomputeMeasurements() {
  const store = useViewerStore.getState()
  const factor = store.calibration?.mmPerWorldUnit ?? 1
  const calibrated = store.calibration != null
  const pendingUID = store.pendingCalibration?.annotationUID

  const all = annotation.state.getAllAnnotations() as AnnotationLike[]
  const measurements: Measurement[] = []
  let lengthCount = 0
  let angleCount = 0

  // Nur Annotationen des HAUPT-Panes zählen. Das zweite Knie-Pane
  // (seitliche Aufnahme) hat ein anderes Bild → seine Annotationen (z. B.
  // die tibiale Slope-Messung) tragen eine andere referencedImageId und
  // dürfen die Haupt-Messliste/das PDF nicht verunreinigen. Im Einzelbild-
  // Modus stimmt jede ImageId mit der Haupt-ImageId überein → kein Effekt.
  const mainImageId = getViewport()?.getCurrentImageId() ?? null

  for (const ann of all) {
    const uid = ann.annotationUID
    const points = ann.data?.handles?.points
    if (!uid || uid === pendingUID || !points) continue
    // Fremd-Pane-Annotation überspringen (nur wenn beide IDs bekannt sind).
    const refId = ann.metadata?.referencedImageId
    if (mainImageId && refId && refId !== mainImageId) continue

    const visible = annotation.visibility.isAnnotationVisible(uid) !== false

    if (ann.metadata?.toolName === LengthTool.toolName && points.length >= 2) {
      lengthCount += 1
      measurements.push({
        id: uid,
        kind: 'length',
        label: `L${lengthCount}`,
        value: distance3(points[0], points[1]) * factor,
        unit: 'mm',
        calibrated,
        visible,
      })
    } else if (
      ann.metadata?.toolName === AngleTool.toolName &&
      points.length >= 3
    ) {
      angleCount += 1
      measurements.push({
        id: uid,
        kind: 'angle',
        label: `W${angleCount}`,
        value: angleAtVertex(points[0], points[1], points[2]),
        unit: '°',
        calibrated: true,
        visible,
      })
    }
  }

  store.setMeasurements(measurements)
}

/** Entfernt eine einzelne Messung. */
export function removeMeasurement(id: string) {
  annotation.state.removeAnnotation(id)
  getViewport()?.render()
  recomputeMeasurements()
}

/** Entfernt alle Messungen. */
export function removeAllMeasurements() {
  for (const m of useViewerStore.getState().measurements) {
    annotation.state.removeAnnotation(m.id)
  }
  getViewport()?.render()
  recomputeMeasurements()
}

/** Blendet eine Messung im Bild ein oder aus. */
export function setMeasurementVisible(id: string, visible: boolean) {
  annotation.visibility.setAnnotationVisibility(id, visible)
  getViewport()?.render()
  recomputeMeasurements()
}

/** Bricht alle laufenden Mess-/Markier-Werkzeuge ab — damit ihre
 *  Klick-Listener nicht mit der Pfannen-/Schaft-Platzierung kollidieren. */
function cancelMeasurementTools() {
  useHipStore.getState().cancelTool()
  useKneeStore.getState().cancelTool()
  useNoteStore.getState().setPlacing(false)
  useOsteophyteStore.getState().setPlacing(false)
}

/** Startet den mehrstufigen Pfannen-Anlage-Ablauf (Seite → Tränenfigur). */
export function addCupTemplate() {
  cancelMeasurementTools()
  useTemplateStore.getState().startCupPlacement()
}

/**
 * Platziert eine Knie-Schablone in der aktuellen Bildmitte. Anders als
 * beim Hüft-Cup gibt es (vorerst) keinen Platzierungs-Wizard — die
 * Schablone landet direkt im Bild und kann dann gezogen werden.
 *
 * View IST AN DIE PANE-ROLLE GEKOPPELT, nicht frei wählbar:
 *   - linkes Pane  = AP-Ganzbein  → immer die AP-Kontur
 *   - rechtes Pane = seitlich     → immer die laterale Kontur
 * Dadurch kann eine laterale Schablone nie im AP-Bild landen (und umgekehrt).
 *
 * In der Zwei-Bild-Ansicht legt EIN Klick BEIDE Schablonen an: AP links +
 * lateral rechts (sofern für die jeweilige Ebene eine Kontur getraced ist
 * und das Pane ein Bild hat). Im Einzelbild-Modus nur AP links.
 *
 * Gibt die ID der zuletzt angelegten Schablone zurück (oder null).
 */
/**
 * Erst-Platzierung einer AP-Femur-/Tibiakomponente: liegt eine Knie-Voll-
 * vermessung vor, wird die Komponente automatisch mechanisch ausgerichtet
 * (Schnitt ⊥ mech. Achse) und so auf die Gelenklinie gesetzt, dass die
 * TIEFERE der beiden Resektionen 9 mm misst (gemessene Resektion mit Referenz
 * an der distalsten Kondyle). Ohne Vollvermessung/Bild/Landmarken bleibt die
 * Default-Lage (Bildmitte, 0°).
 */
export function autoPlaceKneeImplant(
  id: string,
  kind: KneeImplantKind,
  side: KneeSide,
): void {
  const bone = boneOf(kind)
  if (!bone) return
  const vp = getViewport()
  if (!vp) return
  const wf = useKneeStore
    .getState()
    .measurements.find((m) => m.kind === 'workflow' && m.points.length >= 17)
  if (!wf) return
  const axes = extractWorkflowAxes(wf.points)
  if (!axes) return
  const tmplStore = useKneeTemplateStore.getState()
  const t = tmplStore.templates.find((x) => x.id === id)
  if (!t) return
  // Screenshot-Bild ODER DXF-Kontur — beide liefern dieselbe Geometrie
  // (Adapter contourGeomImage) für den 9-mm-Löser.
  const contour = getKneeContour(kind, 'AP', t.sizeIndex)
  const img =
    getKneeImage(kind, 'AP', t.sizeIndex) ??
    (contour?.resect ? (contourGeomImage(contour) as KneeImage) : null)
  const factor = useViewerStore.getState().calibration?.mmPerWorldUnit ?? 1
  // Voller 9-mm-Löser, wenn Resektions-Landmarken vorliegen; sonst nur die
  // mechanische Basislage (Rotation ⊥ Achse + Gelenklinien-Mitte).
  const placed =
    img && img.resect
      ? autoPlaceImplant({
          vp,
          axes,
          bone,
          side,
          img,
          distalThicknessMm: femoralDistalThicknessMm(kind, t.sizeIndex),
          factor,
          targetMm: 9,
          currentRotationDeg: t.rotationDeg,
        })
      : null
  const rotationDeg = placed
    ? placed.rotationDeg
    : mechanicalAlignRotationDeg(bone, axes, t.rotationDeg, img, side)
  const c = placed ? placed.center : jointCenterFor(bone, axes)
  tmplStore.setRotationDeg(id, rotationDeg)
  tmplStore.setCenter(id, [c[0], c[1], t.center[2]])
}

/**
 * Existiert für (kind, view) eine zeichenbare Kontur bei der Default-Größe
 * (sizeIndex 0)? DIESELBE Quelle wie der Renderer:
 *   1) maßstabsgetreue Pro-Größe-Kontur (Paket/Screenshots) — der Normalfall,
 *   2) sonst die alte Browser-Trace (abwärtskompatibel, ggf. mit Band).
 */
export function kneeContourAvailable(
  kind: KneeImplantKind,
  view: KneeView,
): boolean {
  if (getKneeContour(kind, view, 0)) return true
  const band = bandForSizeIndex(kind, view, 0)?.id
  const tracer = useTemplateTracerStore.getState()
  return (tracer.getTrace(kind, view, band)?.length ?? 0) > 0
}

/**
 * Lässt sich die Familie überhaupt platzieren (Kontur in mindestens einer
 * Ansicht)? Grundlage der Dropdown-Filterung in der Toolbar: Ein Paket kann
 * Familien im Katalog deklarieren, ohne Konturen dafür mitzubringen (z. B.
 * Genesis II male tapered) — solche Einträge liefen sonst in den stillen
 * Guard von addKneeTemplate.
 */
export function kneeKindPlaceable(kind: KneeImplantKind): boolean {
  return kneeContourAvailable(kind, 'AP') || kneeContourAvailable(kind, 'lateral')
}

export function addKneeTemplate(
  kind: KneeImplantKind,
  side: KneeSide,
  _view?: KneeView, // ignoriert: View ergibt sich aus der Pane-Rolle
): string | null {
  const panes = useKneePanesStore.getState()
  const tmplStore = useKneeTemplateStore.getState()
  // Ohne zeichenbare Kontur keine Platzierung — sonst entstünde ein Eintrag
  // im Store, den der Renderer nicht zeichnen kann.
  const hasContour = (v: KneeView): boolean => kneeContourAvailable(kind, v)

  // Gemeinsame Gruppen-ID für das AP+lateral-Paar aus DIESEM Klick — so
  // synchronisiert setSizeIndex/setSide später beide Schablonen.
  const groupId = `kneeG-${Date.now()}-${Math.round(Math.random() * 1e6)}`

  // Platziert die Schablone mittig in EINEM Pane — nur, wenn das Pane einen
  // Viewport hat UND die zur Pane-Rolle gehörende Kontur getraced ist.
  const placeIn = (
    pane: 'left' | 'right',
    view: KneeView,
  ): string | null => {
    if (!hasContour(view)) return null
    const vp = pane === 'right' ? getViewport2() : getViewport()
    if (!vp) return null
    const w = vp.canvas.clientWidth
    const h = vp.canvas.clientHeight
    const center = vp.canvasToWorld([w / 2, h / 2])
    return tmplStore.add(kind, side, view, center, undefined, pane, groupId)
  }

  let lastId: string | null = null
  // Linkes Pane: AP.
  const leftId = placeIn('left', 'AP')
  if (leftId) {
    lastId = leftId
    // Auto-Platzierung auf die Resektionslinie (mechanisch, 9-mm-Referenz).
    autoPlaceKneeImplant(leftId, kind, side)
  }
  // Rechtes Pane: lateral — nur in der Zwei-Bild-Ansicht.
  if (panes.splitView) {
    const rightId = placeIn('right', 'lateral')
    if (rightId) lastId = rightId
  }
  return lastId
}

/** Startet den Schaft-Anlege-Ablauf (Seite-Frage). Direkt nach Side-
 *  Auswahl wird der Schaft platziert — kein zusätzlicher Kopfzentrum-
 *  Klick mehr, weil das Drehzentrum bereits durch die Pfanne definiert
 *  ist (siehe `placeStemForSide`). */
export function addStemTemplate() {
  cancelMeasurementTools()
  useTemplateStore.getState().startStemPlacement()
}

/**
 * Platziert einen Schaft für die gegebene Seite und die gegebene
 * Femur-Schaft-Achse (zwei Welt-Punkte: proximal, distal). Die Achse
 * wird auf den Schaft als klinische Referenz für Varus/Valgus
 * gespeichert; zusätzlich wird die Schaft-Rotation so initialisiert,
 * dass der Schaft entlang der Achse liegt (= klinisch neutrale
 * Ausgangslage).
 *
 * Anker = Pfannenzentrum derselben Seite (klinische Konvention: der
 * Femurkopf sitzt nach der Implantation IN der Pfanne). Fallback ohne
 * Pfanne: Bildmitte.
 */
export function placeStemForSide(
  side: 'R' | 'L',
  femurAxis: [Types.Point3, Types.Point3] | null,
) {
  const viewport = getViewport()
  if (!viewport) return

  const tmplStore = useTemplateStore.getState()
  const cupOnSide = tmplStore.templates.find(
    (c) => c.side === side && c.visible !== false,
  )
  let center: Types.Point3
  if (cupOnSide) {
    center = cupOnSide.center
  } else {
    const w = viewport.canvas.clientWidth
    const h = viewport.canvas.clientHeight
    center = viewport.canvasToWorld([w / 2, h / 2])
  }

  // Aus der Femurachse den Anfangs-Rotationswinkel ableiten, sodass
  // der Schaft initial GENAU entlang der Achse liegt. Dazu projizieren
  // wir die zwei Achsenpunkte ins Canvas und nehmen den Winkel des
  // Vektors (proximal → distal). Falls die Achse nach OBEN zeigen
  // sollte (Benutzer hat distal → proximal geklickt), drehen wir sie
  // um, damit die Schaftachse weiterhin in der natürlichen „nach
  // unten" Konvention bleibt.
  let rotationDeg = DEFAULT_STEM_ROTATION_DEG
  if (femurAxis) {
    const c1 = viewport.worldToCanvas(femurAxis[0])
    const c2 = viewport.worldToCanvas(femurAxis[1])
    let angle =
      (Math.atan2(c2[1] - c1[1], c2[0] - c1[0]) * 180) / Math.PI
    // Achse soll nach UNTEN zeigen (Schaft proximal oben, distal unten).
    // Wenn die Y-Komponente negativ ist, war der Klick umgekehrt → 180° drehen.
    if (Math.sin((angle * Math.PI) / 180) < 0) {
      angle = (angle + 180 + 720) % 360
    }
    rotationDeg = angle
  }
  tmplStore.placeStem(side, center, rotationDeg, femurAxis)
}

/**
 * Schließt den Pfannen-Anlage-Ablauf ab. Mit Tränenfigur: Pfanne wird
 * automatisch positioniert (43° Inklination, kaudale Pfannenkante auf
 * Tränenfigur-Höhe, leicht lateral versetzt). Ohne Tränenfigur: Pfanne
 * landet horizontal in der Bildmitte.
 */
export function finishCupPlacement(teardrop: Types.Point3 | null) {
  const viewport = getViewport()
  if (!viewport) return

  const tmplStore = useTemplateStore.getState()
  const pending = tmplStore.pending
  const side: 'R' | 'L' =
    pending && pending.kind === 'cup' && pending.stage === 'teardrop'
      ? pending.side
      : 'R'

  // Default-Referenzlinie waagerecht in Bildmitte.
  const w = viewport.canvas.clientWidth
  const h = viewport.canvas.clientHeight
  const cx = w / 2
  const cy = h / 2
  const refA = viewport.canvasToWorld([cx - w * 0.3, cy])
  const refB = viewport.canvasToWorld([cx + w * 0.3, cy])
  const refLine: [Types.Point3, Types.Point3] = tmplStore.referenceLine ?? [
    refA,
    refB,
  ]

  let center: Types.Point3
  let rotationDeg: number

  if (teardrop) {
    const factor = useViewerStore.getState().calibration?.mmPerWorldUnit ?? 1
    // Vorschlags-Durchmesser = Mitte des Katalogs.
    const entries = cupCatalogEntries()
    const sizes = entries[0]?.sizes ?? []
    const defaultMm = parseFloat(
      sizes[Math.floor((sizes.length - 1) / 2)]?.size ?? '52',
    )
    const proposal = computeAutoCupPosition(
      teardrop,
      refLine,
      side,
      factor,
      defaultMm,
    )
    center = proposal.center
    rotationDeg = proposal.rotationDeg
  } else {
    center = viewport.canvasToWorld([cx, cy])
    rotationDeg = 0
  }

  tmplStore.placeCup(center, rotationDeg, [refA, refB], teardrop)
}

// ----------------------------------------------------------------------
// Kalibrierung
// ----------------------------------------------------------------------

/**
 * Startet den Kalibriermodus: Die nächste mit der linken Maustaste
 * gezeichnete Strecke wird als Kalibrierstrecke verwendet.
 */
export function startCalibration() {
  calibrationMode = true
  if (calTarget() === 'right') {
    // Strecke auf dem rechten Pane zeichnen (eigene ToolGroup).
    startCalibrationToolPane2()
  } else {
    const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)
    if (!toolGroup) return
    toolGroup.setToolPassive(WindowLevelTool.toolName)
    toolGroup.setToolPassive(AngleTool.toolName)
    toolGroup.setToolActive(LengthTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    })
  }
  useViewerStore
    .getState()
    .setStatus('Kalibrierung: Strecke über eine bekannte Distanz ziehen')
}

/**
 * Reaktion auf eine fertig gezeichnete Annotation (nur im Kalibriermodus).
 * Misst die Strecke in Cornerstones Weltkoordinaten — diese sind kamera-
 * unabhängig und unmittelbar nach dem Zeichnen verfügbar.
 */
function onAnnotationCompleted(evt: Event) {
  if (!calibrationMode) return
  const ann = (evt as CustomEvent<{ annotation: AnnotationLike }>).detail
    ?.annotation
  if (ann?.metadata?.toolName !== LengthTool.toolName || !ann.annotationUID) {
    return
  }

  calibrationMode = false
  // Tools des jeweiligen Panes zurücksetzen.
  if (calTarget() === 'right') applyNavToolsPane2()
  else applyLeftTool(useViewerStore.getState().leftTool)

  const renderActivePane = () =>
    calTarget() === 'right' ? getViewport2()?.render() : getViewport()?.render()

  const points = ann.data?.handles?.points
  if (!points || points.length < 2) {
    annotation.state.removeAnnotation(ann.annotationUID)
    renderActivePane()
    useViewerStore
      .getState()
      .setStatus('Kalibrierung fehlgeschlagen — bitte erneut versuchen')
    return
  }

  const worldDistance = distance3(points[0], points[1])
  useViewerStore.getState().setPendingCalibration({
    annotationUID: ann.annotationUID,
    worldDistance,
  })
  recomputeMeasurements()
}

/**
 * Setzt nur den Vergrößerungsfaktor — OHNE eine Strecke zu messen.
 * Funktioniert nur, wenn das Bild eine PixelSpacing-Skala hat (DICOM-
 * Tag), weil wir sonst keine Basis-Skalierung haben.
 *
 * Formel: PixelSpacing setzt `mmPerWorldUnit = 1` (Cornerstone-Welt =
 * Detektor-mm). Real-mm ergeben sich durch Division durch den Mag-
 * Faktor: effektives `mmPerWorldUnit = 1 / magnificationFactor`.
 *
 * Gibt true zurück, wenn die Kalibrierung gesetzt wurde, false wenn das
 * Bild kein PixelSpacing hat (UI sollte das vorher prüfen).
 */
export function applyMagnificationOnlyCalibration(
  magnificationFactor: number,
): boolean {
  const store = useViewerStore.getState()
  const panes = useKneePanesStore.getState()
  const target = calTarget()
  // PixelSpacing des Ziel-Panes lesen.
  const pixelSpacing =
    target === 'right'
      ? panes.rightImageMeta?.pixelSpacing
      : store.imageMeta?.pixelSpacing
  if (!pixelSpacing || pixelSpacing <= 0) return false
  const mag = magnificationFactor > 0 ? magnificationFactor : 1.0
  const calibration = {
    mmPerWorldUnit: 1 / mag,
    // referenceMm = 0 = Sentinel „aus DICOM/Mag-Only", keine Mess-Strecke
    referenceMm: 0,
    magnificationFactor: mag,
  }
  if (target === 'right') {
    panes.setRightCalibration(calibration)
    panes.setRightStatus(`Kalibriert (Mag ${mag.toFixed(2)}×)`)
  } else {
    store.setCalibration(calibration)
    store.setStatus(`Kalibriert (Mag ${mag.toFixed(2)}× aus PixelSpacing)`)
    recomputeMeasurements()
  }
  return true
}

/** Übernimmt die bekannte reale Länge und speichert die Kalibrierung.
 *  `magnificationFactor` kompensiert die Röntgen-Vergrößerung (Default
 *  1.0 = Kalibrierkugel auf Hüfthöhe; 1.15-1.25 für direkte
 *  PixelSpacing-Nutzung ohne Kalibrierkugel). Formel: die effektive
 *  Welt-Einheits-Skala wird durch den Faktor geteilt, sodass alle
 *  Messungen REAL-mm (vergrößerungskompensiert) ergeben. */
export function applyCalibration(knownMm: number, magnificationFactor = 1.0) {
  const store = useViewerStore.getState()
  const panes = useKneePanesStore.getState()
  const pending = store.pendingCalibration
  if (!pending) return
  if (!(knownMm > 0) || !(pending.worldDistance > 0)) return
  const mag = magnificationFactor > 0 ? magnificationFactor : 1.0

  const mmPerWorldUnit = knownMm / (pending.worldDistance * mag)

  const target = calTarget()
  // Pending-Mess-Annotation aus dem jeweiligen Pane entfernen.
  annotation.state.removeAnnotation(pending.annotationUID)
  if (target === 'right') getViewport2()?.render()
  else getViewport()?.render()

  const calibration = {
    mmPerWorldUnit,
    referenceMm: knownMm,
    magnificationFactor: mag,
  }
  const magNote = mag !== 1.0 ? ` (Mag ${mag.toFixed(2)}×)` : ''
  store.setPendingCalibration(null)
  if (target === 'right') {
    panes.setRightCalibration(calibration)
    panes.setRightStatus(`Kalibriert (Referenz ${knownMm} mm)${magNote}`)
  } else {
    store.setCalibration(calibration)
    store.setStatus(`Kalibriert (Referenzstrecke ${knownMm} mm)${magNote}`)
    recomputeMeasurements()
  }
}

/** Läuft gerade eine Kalibrier-Messung? (Für pickLeftTool: nur dann
 *  abbrechen — sonst würde jede Werkzeugwahl „abgebrochen" melden.) */
export function isCalibrationActive(): boolean {
  return calibrationMode
}

/** Bricht eine offene Kalibrierung ab und entfernt die Hilfsstrecke. */
export function cancelCalibration() {
  const store = useViewerStore.getState()
  const pending = store.pendingCalibration
  const target = calTarget()
  if (pending) {
    annotation.state.removeAnnotation(pending.annotationUID)
    if (target === 'right') getViewport2()?.render()
    else getViewport()?.render()
  }
  calibrationMode = false
  store.setPendingCalibration(null)
  store.setStatus('Kalibrierung abgebrochen')
  if (target === 'right') applyNavToolsPane2()
  else applyLeftTool(store.leftTool)
  recomputeMeasurements()
}

/** Minimaler Ausschnitt der Cornerstone-Annotation, den wir auswerten. */
interface AnnotationLike {
  annotationUID?: string
  /** `referencedImageId` = das DICOM-Bild, auf dem die Annotation liegt.
   *  Dient als Pane-Diskriminator: Annotationen des zweiten Knie-Panes
   *  (seitliche Aufnahme, z. B. die Slope-Messung) haben eine andere
   *  ImageId als das Haupt-Pane und dürfen NICHT in die Haupt-Messliste. */
  metadata?: { toolName?: string; referencedImageId?: string }
  data?: {
    handles?: { points?: Types.Point3[] }
  }
}

// ----------------------------------------------------------------------
// HMR — vollständiger Page-Reload statt Modul-Swap
// ----------------------------------------------------------------------
//
// Dieses Modul hält state, der NICHT sauber per HMR getauscht werden
// kann:
//   - `renderingEngine` ist eine Cornerstone-Instanz mit lebendem
//     WebGL-Kontext und DOM-Bindung (an <canvas> aus Viewport.tsx).
//   - Beim Modul-Swap würden Vite's neue Modul-Variablen `renderingEngine
//     = null` zeigen, während die alte Engine noch im DOM hängt.
//     `getViewport()` returnt dann null → Canvas wird schwarz, alle
//     Overlays (Pfanne/Schaft/Messungen) verschwinden visuell, weil
//     `TemplateOverlay` ohne Viewport ein leeres SVG rendert.
//     Der React-Tree ist NICHT remounted, also läuft `setupViewport()`
//     auch nicht erneut.
//
// Konsequenz: bei JEDER Änderung an viewer.ts triggern wir einen vollen
// Page-Reload. Das ist während der Entwicklung minimal störender als ein
// schwarzer Viewport, der aussieht wie ein Programmabsturz.
//
// (Die Listener-Cleanup-Logik unten brauchen wir trotzdem für den
//  Übergangsmoment ZWISCHEN Dispose und Reload.)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const { Events } = csToolsEnums
    eventTarget.removeEventListener(
      Events.ANNOTATION_COMPLETED,
      onAnnotationCompleted,
    )
    eventTarget.removeEventListener(
      Events.ANNOTATION_ADDED,
      recomputeMeasurements,
    )
    eventTarget.removeEventListener(
      Events.ANNOTATION_MODIFIED,
      recomputeMeasurements,
    )
    eventTarget.removeEventListener(
      Events.ANNOTATION_REMOVED,
      recomputeMeasurements,
    )
    listenersAttached = false
  })
  // HMR-Update für dieses Modul akzeptieren — aber sofort invalidieren,
  // um stattdessen einen vollen Page-Reload zu triggern. Das ist
  // wichtig, weil das Modul lebendigen WebGL-/Canvas-State hält, der
  // sich nicht sauber tauschen lässt. `invalidate()` darf NICHT im
  // Modul-Top-Level stehen (würde Endlos-Reload auslösen), nur im
  // accept-Callback nach einem echten Update.
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate()
  })
}
