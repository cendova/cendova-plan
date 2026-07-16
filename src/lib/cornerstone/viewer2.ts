/**
 * Zweiter, ISOLIERTER Cornerstone-Viewport für die Knie-Zwei-Bild-Ansicht
 * (rechtes Pane = typischerweise die seitliche Aufnahme).
 *
 * Warum eine eigene Datei + eigene RenderingEngine/ToolGroup statt
 * `viewer.ts` zu erweitern:
 *   - `teardownViewport()` in viewer.ts zerstört die GESAMTE RenderingEngine.
 *     Bei geteilter Engine würde ein WebGL-Recovery des Haupt-Panes das
 *     zweite Pane mitreißen. Mit getrennter Engine sind beide unabhängig.
 *   - Der erprobte Single-View-Pfad (Messungen, Schablonen, Auto-Recovery)
 *     bleibt damit komplett unberührt.
 *
 * Umfang v1: Anzeige + Navigation (Pan/Zoom/Fenstern) + Auto-Kalibrierung
 * aus DICOM-PixelSpacing + Patienteninfo. KEIN Mess-/Annotation-Tooling.
 * Schreibt seinen Zustand in `kneePanesStore` (rechtes Pane), nicht in den
 * globalen viewerStore.
 */
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
  Enums as csToolsEnums,
} from '@cornerstonejs/tools'
import dicomImageLoader from '@cornerstonejs/dicom-image-loader'
import { initCornerstone } from './init'
import { extractPatientInfo } from './dicomMeta'
import { assertImageUsable } from './textureLimit'
import { useKneePanesStore } from '../../state/kneePanesStore'
import { useKneeTemplateStore } from '../../state/kneeTemplateStore'
import {
  useViewerStore,
  type LeftTool,
  type Measurement,
} from '../../state/viewerStore'
import { angleAtVertex, dist } from '../hip/geometry'
import { applyToolBindings } from './toolBindings'

const RENDERING_ENGINE_ID_2 = 'cendova-engine-2'
export const VIEWPORT_ID_2 = 'cendova-viewport-2'
const TOOL_GROUP_ID_2 = 'cendova-toolgroup-2'

let engine2: RenderingEngine | null = null
// Für die Context-Loss-Recovery (Debug-Befund K1 — das rechte Pane hatte
// als einziges KEINE Wiederherstellung und blieb nach GPU-Eviction schwarz).
let cachedElement2: HTMLDivElement | null = null
let lastImageIds2: string[] | null = null
let recovery2InFlight = false

// Kandidaten einer Mehr-Bild-Ladung (Pendant zu viewer.ts): der Stack
// enthält immer nur EIN Bild, gewechselt wird über showImageCandidate2.
let candidateFiles2: File[] = []
let candidateImageIds2: string[] = []

// Rohbytes des SICHTBAREN rechten Bildes — fürs Plan-Bundle (nur das
// fixierte/gezeigte Bild wird eingebettet, nie die ganze Kandidatenliste).
let currentDicomBytes2: ArrayBuffer | null = null
let currentDicomFileName2: string | null = null

/** Rohbytes/Dateiname des aktuell im rechten Pane geladenen DICOMs
 *  (null, wenn kein Bild geladen). */
export function getCurrentDicomBytes2(): ArrayBuffer | null {
  return currentDicomBytes2
}
export function getCurrentDicomFileName2(): string | null {
  return currentDicomFileName2
}

// Annotations-Events, bei denen die rechten Mess-Ergebnisse neu berechnet werden.
const RIGHT_MEASUREMENT_EVENTS = [
  csToolsEnums.Events.ANNOTATION_COMPLETED,
  csToolsEnums.Events.ANNOTATION_ADDED,
  csToolsEnums.Events.ANNOTATION_MODIFIED,
  csToolsEnums.Events.ANNOTATION_REMOVED,
]

/** Liefert den zweiten Stack-Viewport oder null. */
export function getViewport2(): Types.IStackViewport | null {
  if (!engine2) return null
  return engine2.getViewport(VIEWPORT_ID_2) as Types.IStackViewport
}

/**
 * Richtet die zweite Render-Engine + Viewport + (navigations-only)
 * ToolGroup für ein DOM-Element ein. Idempotent genug: bei erneutem Aufruf
 * wird die alte Engine vorher freigegeben.
 */
export async function setupViewport2(element: HTMLDivElement): Promise<void> {
  await initCornerstone()
  cachedElement2 = element

  // Falls schon eine Engine existiert (z. B. Re-Mount), sauber abräumen.
  teardownViewport2()

  engine2 = new RenderingEngine(RENDERING_ENGINE_ID_2)
  engine2.enableElement({
    viewportId: VIEWPORT_ID_2,
    type: Enums.ViewportType.STACK,
    element,
    defaultOptions: { background: [0, 0, 0] },
  })

  let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID_2)
  if (!toolGroup) {
    toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID_2)!
    toolGroup.addTool(PanTool.toolName)
    toolGroup.addTool(ZoomTool.toolName)
    toolGroup.addTool(WindowLevelTool.toolName)
    toolGroup.addTool(StackScrollTool.toolName)
    // LengthTool NUR für die Kalibrier-Strecke des rechten Panes (sonst
    // hat das rechte Pane keine Mess-Tools). Global registriert wird es
    // von viewer.ts:registerToolsOnce — das Haupt-Pane mountet immer vor
    // dem rechten, daher ist der Tool-Typ hier schon verfügbar.
    toolGroup.addTool(LengthTool.toolName)
    // AngleTool für den tibialen Slope (3-Punkt-Winkel, wie im Haupt-Pane).
    // Auf der lateralen Aufnahme ist das die einzige nötige Messung.
    toolGroup.addTool(AngleTool.toolName)
  }
  toolGroup.addViewport(VIEWPORT_ID_2, RENDERING_ENGINE_ID_2)

  applyNavToolsPane2()

  // Mess-Ergebnisse des rechten Panes bei jeder Annotations-Änderung neu
  // berechnen → erscheinen im Mess-Panel (gefiltert über referencedImageId).
  for (const ev of RIGHT_MEASUREMENT_EVENTS) {
    eventTarget.addEventListener(ev, recomputeRightMeasurements)
  }
  // Slope-Einmal-Messung: nach dem 3. Punkt zurück zur Navigation.
  eventTarget.addEventListener(
    csToolsEnums.Events.ANNOTATION_COMPLETED,
    onSlopeCompleted,
  )

  // Context-Loss-Recovery wie im Haupt-Pane (viewer.ts): Cornerstone
  // braucht einen Tick, bis der Canvas im DOM ist.
  setTimeout(() => attachContextLossListener2(element), 50)
}

/** webglcontextlost/-restored-Listener des rechten Panes (idempotent). */
function attachContextLossListener2(element: HTMLDivElement) {
  const canvas = element.querySelector('canvas')
  if (!canvas) return
  if ((canvas as HTMLCanvasElement & { _csLossWired?: boolean })._csLossWired) {
    return
  }
  ;(canvas as HTMLCanvasElement & { _csLossWired?: boolean })._csLossWired = true
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    console.warn('[viewer2] WebGL-Kontext verloren — starte Recovery')
    useKneePanesStore
      .getState()
      .setRightStatus('Render-Kontext verloren — Wiederherstellung läuft …')
    void recoverViewport2()
  })
  canvas.addEventListener('webglcontextrestored', () => {
    console.info('[viewer2] WebGL-Kontext wiederhergestellt')
    void recoverViewport2()
  })
}

/**
 * Wiederherstellung des rechten Panes inkl. Re-Load des zuletzt geladenen
 * Bildes (Pendant zu recoverViewport im Haupt-Pane).
 */
export async function recoverViewport2(): Promise<boolean> {
  if (recovery2InFlight) return false
  if (!cachedElement2) return false
  recovery2InFlight = true
  try {
    await setupViewport2(cachedElement2)
    if (lastImageIds2 && lastImageIds2.length > 0) {
      const vp = getViewport2()
      if (vp) {
        await vp.setStack(lastImageIds2)
        vp.render()
        useKneePanesStore.getState().setRightStatus('Wiederhergestellt')
      }
    }
    return true
  } catch (err) {
    console.error('[viewer2] Recovery fehlgeschlagen', err)
    useKneePanesStore
      .getState()
      .setRightStatus('Fehler: Wiederherstellung fehlgeschlagen — Seite neu laden (Strg+R)')
    return false
  } finally {
    recovery2InFlight = false
  }
}

const { MouseBindings } = csToolsEnums

/**
 * Stellt das aktuell gewählte Header-Werkzeug auf dem rechten Pane
 * wieder her (nach Kalibrier-/Slope-Modi, beim Setup, nach Split-Toggle).
 * Vorher band diese Funktion links IMMER Fenstern — der Kern von Befund
 * T1 („Kontrast ändert sich, obwohl Zoom gewählt"). Name historisch.
 */
export function applyNavToolsPane2(): void {
  applyToolPane2(useViewerStore.getState().leftTool)
}

/**
 * Aktiviert das LengthTool (linke Maustaste) auf dem rechten Pane für die
 * Kalibrier-Strecke. Window-Level wird dafür kurz deaktiviert.
 */
export function startCalibrationToolPane2(): void {
  const tg = ToolGroupManager.getToolGroup(TOOL_GROUP_ID_2)
  if (!tg) return
  tg.setToolPassive(WindowLevelTool.toolName)
  tg.setToolActive(LengthTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  })
}

/**
 * Aktiviert das AngleTool (linke Maustaste) auf dem rechten Pane für die
 * Slope-Messung (3-Punkt-Winkel: Scheitel + zwei Schenkel). Window-Level
 * wird dafür kurz deaktiviert; danach `applyNavToolsPane2()` aufrufen.
 */
export function startSlopeToolPane2(): void {
  const tg = ToolGroupManager.getToolGroup(TOOL_GROUP_ID_2)
  if (!tg) return
  tg.setToolPassive(WindowLevelTool.toolName)
  tg.setToolActive(AngleTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  })
}

/**
 * Entfernt alle AngleTool-Annotationen des rechten Panes (Slope-Messung
 * zurücksetzen) und kehrt zur Navigation zurück.
 */
export function clearSlopePane2(): void {
  const vp = getViewport2()
  const rightImageId = vp?.getCurrentImageId() ?? null
  // Nur die Angle-Annotationen der SEITLICHEN Aufnahme entfernen (über die
  // referencedImageId). Ein generischer Winkel auf dem Haupt-Pane bleibt so
  // unangetastet. Fehlt die Bild-ID (noch kein Bild), greift der Filter nicht.
  const anns = annotation.state.getAllAnnotations() as unknown as AnnLike[]
  for (const ann of anns) {
    if (
      ann.metadata?.toolName === AngleTool.toolName &&
      ann.annotationUID &&
      (!rightImageId || ann.metadata?.referencedImageId === rightImageId)
    ) {
      annotation.state.removeAnnotation(ann.annotationUID)
    }
  }
  vp?.render()
  applyNavToolsPane2()
}

/**
 * Beendet die Slope-Messung automatisch nach dem 3. Punkt: Sobald eine
 * AngleTool-Annotation auf der seitlichen Aufnahme fertig ist
 * (ANNOTATION_COMPLETED), kehrt das rechte Pane zur Navigation zurück und der
 * Slope-Modus wird ausgeschaltet (Einmal-Messung statt versehentlicher
 * Mehrfach-Winkel). Reagiert nur, wenn der Slope-Modus zuvor armiert war.
 */
function onSlopeCompleted(evt: Event): void {
  const store = useKneePanesStore.getState()
  if (!store.slopeActive) return
  const ann = (evt as CustomEvent<{ annotation?: AnnLike }>).detail?.annotation
  if (ann?.metadata?.toolName !== AngleTool.toolName) return
  const rightImageId = getViewport2()?.getCurrentImageId() ?? null
  if (rightImageId && ann.metadata?.referencedImageId !== rightImageId) return
  // Diese Annotation als SLOPE markieren — nur im Slope-Modus entstandene
  // Winkel werden als „Slope" (|90−roh|) gelistet; generische Header-
  // Winkel bleiben Rohwinkel (Befund T1/P1-3: vorher wurde JEDER rechte
  // 3-Punkt-Winkel stumm zum Slope verfälscht).
  if (ann.annotationUID) slopeUids.add(ann.annotationUID)
  store.setSlopeActive(false)
  applyNavToolsPane2()
}

/** UIDs der im Slope-Modus entstandenen Winkel-Annotationen. */
const slopeUids = new Set<string>()

/**
 * Wendet ein Header-Werkzeug auf das rechte Pane an — exakt dieselben
 * Bindings wie das Haupt-Pane (toolBindings.ts, Befund T1). Ein generischer
 * Header-„Winkel" ist dabei ein normaler Winkel (W-Label), KEIN Slope —
 * die Slope-Einmal-Messung wird nur über den Slope-Modus armiert.
 */
export function applyToolPane2(tool: LeftTool): void {
  applyToolBindings(TOOL_GROUP_ID_2, tool)
}

// Minimal-Typ für den Annotations-Zugriff (Cornerstone liefert lockerere Typen).
type AnnLike = {
  annotationUID?: string
  data?: { handles?: { points?: number[][] } }
  metadata?: { toolName?: string; referencedImageId?: string }
}

// Geometrie aus ../hip/geometry (eine Quelle, Audit-Befund A8) — die
// Annotations-API liefert lose number[]-Punkte, daher schmale Adapter.
type P3 = [number, number, number]
const dist3 = (a: number[], b: number[]): number => dist(a as P3, b as P3)
const angleAt = (a: number[], b: number[], c: number[]): number =>
  angleAtVertex(a as P3, b as P3, c as P3)

/**
 * Aggregiert die Länge-/Winkel-Annotationen des rechten Panes (gefiltert über
 * `referencedImageId`) in `kneePanesStore.rightMeasurements`. Längen werden mit
 * der rechten Kalibrierung in mm umgerechnet; Winkel sind kalibrierungsfrei.
 */
export function recomputeRightMeasurements(): void {
  const store = useKneePanesStore.getState()
  const rightImageId = getViewport2()?.getCurrentImageId() ?? null
  if (!rightImageId) {
    store.setRightMeasurements([])
    return
  }
  const factor = store.rightCalibration?.mmPerWorldUnit ?? 1
  const calibrated = store.rightCalibration != null
  const all = annotation.state.getAllAnnotations() as unknown as AnnLike[]
  const out: Measurement[] = []
  let lc = 0
  let ac = 0
  let sc = 0
  for (const ann of all) {
    const uid = ann.annotationUID
    const points = ann.data?.handles?.points
    if (!uid || !points) continue
    if (ann.metadata?.referencedImageId !== rightImageId) continue
    const visible = annotation.visibility.isAnnotationVisible(uid) !== false
    if (ann.metadata?.toolName === LengthTool.toolName && points.length >= 2) {
      lc += 1
      out.push({
        id: uid, kind: 'length', label: `L${lc}`,
        value: dist3(points[0], points[1]) * factor, unit: 'mm', calibrated, visible,
      })
    } else if (ann.metadata?.toolName === AngleTool.toolName && points.length >= 3) {
      const raw = angleAt(points[0], points[1], points[2])
      if (slopeUids.has(uid)) {
        // Im SLOPE-Modus entstanden: Abweichung von 90° als positiver
        // Slope-Betrag (Schaftachse → Scheitel → Plateau), wie die
        // Haupt-Pane-Rezeptur — „Slope 7,3°" statt Winkel um 90°.
        sc += 1
        out.push({
          id: uid, kind: 'angle', label: sc > 1 ? `Slope ${sc}` : 'Slope',
          value: Math.abs(90 - raw), unit: '°', calibrated: true, visible,
        })
      } else {
        // Generischer Header-Winkel: Rohwert, W-Label (Befund T1/P1-3 —
        // vorher wurde jeder rechte Winkel stumm zum „Slope" verfälscht).
        ac += 1
        out.push({
          id: uid, kind: 'angle', label: `W${ac}`,
          value: raw, unit: '°', calibrated: true, visible,
        })
      }
    }
  }
  store.setRightMeasurements(out)
}

/** Entfernt eine rechte Messung (Annotation) und aktualisiert die Liste. */
export function removeRightMeasurement(uid: string): void {
  annotation.state.removeAnnotation(uid)
  getViewport2()?.render()
  recomputeRightMeasurements()
}

/** Blendet eine rechte Messung im Bild ein/aus. */
export function setRightMeasurementVisible(uid: string, visible: boolean): void {
  annotation.visibility.setAnnotationVisibility(uid, visible)
  getViewport2()?.render()
  recomputeRightMeasurements()
}

/** Gibt die zweite Engine + ToolGroup frei. */
export function teardownViewport2(): void {
  for (const ev of RIGHT_MEASUREMENT_EVENTS) {
    eventTarget.removeEventListener(ev, recomputeRightMeasurements)
  }
  eventTarget.removeEventListener(
    csToolsEnums.Events.ANNOTATION_COMPLETED,
    onSlopeCompleted,
  )
  // Slope-Flag nicht über das Pane hinaus „armiert" lassen.
  useKneePanesStore.getState().setSlopeActive(false)
  ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID_2)
  engine2?.destroy()
  engine2 = null
}

/** Passt das zweite Viewport an eine veränderte Elementgröße an. `keepCamera=true`
 *  erhält Zoom/Pan über Layout-Reflows hinweg (siehe resizeViewport). */
export function resizeViewport2(): void {
  engine2?.resize(true, true)
}

const DICOM_EXTENSIONS = ['.dcm', '.dicom', '.ima']
function looksLikeDicom(file: File): boolean {
  const name = file.name.toLowerCase()
  if (DICOM_EXTENSIONS.some((ext) => name.endsWith(ext))) return true
  return !name.includes('.')
}

/**
 * Lädt eine DICOM-Datei ins rechte Pane und aktualisiert den
 * kneePanesStore (Bild-Flag, Metadaten, Patienteninfo, Auto-Kalibrierung).
 */
export async function loadFilesToPane2(files: File[]): Promise<void> {
  const store = useKneePanesStore.getState()
  const vp = getViewport2()
  if (!vp) throw new Error('Zweites Viewport nicht bereit')

  const dicomFiles = files.filter(looksLikeDicom)
  if (dicomFiles.length === 0) {
    throw new Error('Keine DICOM-Datei erkannt (.dcm).')
  }

  // Patienteninfo aus den Rohbytes der ersten Datei.
  const bytes = await dicomFiles[0].arrayBuffer()
  store.setRightPatientInfo(extractPatientInfo(bytes))
  currentDicomBytes2 = bytes
  currentDicomFileName2 = dicomFiles[0].name

  candidateFiles2 = dicomFiles
  candidateImageIds2 = dicomFiles.map((f) =>
    dicomImageLoader.wadouri.fileManager.add(f),
  )
  // Ein-Bild-Stack wie im Haupt-Pane: Kandidaten-Wechsel nur über
  // showImageCandidate2 (Pfeile), nicht übers Mausrad.
  await vp.setStack([candidateImageIds2[0]])
  // Siehe loadFiles (viewer.ts): zu große ODER nicht dekodierbare Bilder →
  // lautlos schwarz. Mit klarer Meldung abbrechen statt schwarzem seitlichen
  // Pane. `bytes` (oben gelesen) erlaubt die Header-Diagnose bei Decode-Fehler.
  try {
    assertImageUsable(vp.getCurrentImageId(), bytes)
  } catch (err) {
    // Der unbrauchbare Stack ist bereits gesetzt → Pane wäre schwarz.
    // Empty-State erzwingen, damit die Fehlermeldung SICHTBAR wird
    // (Debug-Befund K1: Fehler beim Zweit-Load waren unsichtbar).
    store.setRightHasImage(false)
    throw err
  }
  vp.render()
  lastImageIds2 = [candidateImageIds2[0]]

  applyImageMetaToStore(vp)
  store.setRightHasImage(true)
  store.setRightStatus(
    dicomFiles.length > 1
      ? `Bild 1/${dicomFiles.length}: ${dicomFiles[0].name} — mit den Pfeilen wählen, dann fixieren`
      : `Bild geladen: ${dicomFiles[0].name}`,
  )
  store.setRightImageSelection(
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
 * Entfernt alles Bild-Gebundene des rechten Panes nach einem Kandidaten-
 * Wechsel: Annotationen der ALTEN Aufnahme (Slope/Längen), rechts
 * platzierte Schablonen, den Slope-Modus.
 */
function clearRightPaneState(oldImageId: string | null): void {
  if (oldImageId) {
    const anns = annotation.state.getAllAnnotations() as unknown as AnnLike[]
    for (const ann of anns) {
      if (
        ann.annotationUID &&
        ann.metadata?.referencedImageId === oldImageId
      ) {
        annotation.state.removeAnnotation(ann.annotationUID)
        slopeUids.delete(ann.annotationUID)
      }
    }
  }
  const kt = useKneeTemplateStore.getState()
  for (const t of kt.templates.filter((t) => t.pane === 'right')) {
    kt.remove(t.id)
  }
  const store = useKneePanesStore.getState()
  store.setSlopeActive(false)
  store.setRightMeasurements([])
  applyNavToolsPane2()
}

/**
 * Zeigt Kandidat `index` im rechten Pane an (Pendant zu showImageCandidate,
 * viewer.ts). Setzt die bild-gebundenen Daten des Panes zurück und liest
 * PatientInfo/Metadaten/Auto-Kalibrierung des neuen Bildes.
 */
export async function showImageCandidate2(index: number): Promise<void> {
  const store = useKneePanesStore.getState()
  const sel = store.rightImageSelection
  if (!sel || candidateImageIds2.length < 2) return
  const i = Math.max(0, Math.min(candidateImageIds2.length - 1, index))
  if (i === sel.index) return
  const vp = getViewport2()
  if (!vp) return

  const oldImageId = vp.getCurrentImageId() ?? null
  try {
    const file = candidateFiles2[i]
    const bytes = await file.arrayBuffer()
    await vp.setStack([candidateImageIds2[i]])
    assertImageUsable(vp.getCurrentImageId(), bytes)
    vp.render()
    // Erst NACH erfolgreichem Wechsel aufräumen — schlägt der Kandidat
    // fehl, bleibt der alte Zustand (inkl. Slope) unangetastet.
    clearRightPaneState(oldImageId)
    lastImageIds2 = [candidateImageIds2[i]]
    currentDicomBytes2 = bytes
    currentDicomFileName2 = file.name
    store.setRightPatientInfo(extractPatientInfo(bytes))
    applyImageMetaToStore(vp)
    store.setRightStatus(`Bild ${i + 1}/${sel.count}: ${file.name}`)
    store.setRightImageSelection({ ...sel, index: i })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    store.setRightStatus(`Fehler: ${msg}`)
    await vp.setStack([candidateImageIds2[sel.index]])
    vp.render()
  }
}

/** Fixiert den aktuellen Kandidaten des rechten Panes. */
export function fixImageCandidate2(): void {
  const store = useKneePanesStore.getState()
  const sel = store.rightImageSelection
  if (!sel || sel.fixed) return
  store.setRightImageSelection({ ...sel, fixed: true })
  store.setRightStatus(
    `Bild ${sel.index + 1}/${sel.count} fixiert — jetzt kalibrieren.`,
  )
}

/** Öffnet die Kandidaten-Auswahl des rechten Panes erneut (Kalibrier-
 *  Dialog). Reset erst beim tatsächlichen Bild-Wechsel. */
export function reopenImageSelection2(): void {
  const store = useKneePanesStore.getState()
  const sel = store.rightImageSelection
  if (!sel) return
  store.setRightImageSelection({ ...sel, fixed: false })
  store.setRightStatus('Bild-Auswahl geöffnet — mit den Pfeilen wählen, dann fixieren.')
}

/** Wie loadFilesToPane2, aber aus rohen Bytes (z. B. Plan-Bundle). */
export async function loadDicomBytesToPane2(
  bytes: ArrayBuffer,
  fileName: string,
): Promise<void> {
  const file = new File([bytes], fileName, { type: 'application/dicom' })
  await loadFilesToPane2([file])
}

/**
 * Liest rows/columns/pixelSpacing des aktuellen Bildes und setzt
 * Metadaten + Auto-Kalibrierung im kneePanesStore. PixelSpacing>0 ⇒
 * Cornerstone-Weltkoordinaten sind bereits mm (mmPerWorldUnit = 1).
 */
function applyImageMetaToStore(vp: Types.IStackViewport): void {
  const store = useKneePanesStore.getState()
  const currentImageId = vp.getCurrentImageId() ?? null
  if (!currentImageId) {
    store.setRightImageMeta(null)
    store.setRightCalibration(null)
    return
  }
  const plane = metaData.get('imagePlaneModule', currentImageId) as
    | { rows?: number; columns?: number; rowPixelSpacing?: number }
    | undefined
  const pixelSpacing = plane?.rowPixelSpacing ?? null
  store.setRightImageMeta({
    rows: plane?.rows ?? 0,
    columns: plane?.columns ?? 0,
    pixelSpacing,
  })
  if (pixelSpacing && pixelSpacing > 0) {
    store.setRightCalibration({
      mmPerWorldUnit: 1,
      referenceMm: 0,
      magnificationFactor: 1.0,
    })
  } else {
    store.setRightCalibration(null)
  }
}
