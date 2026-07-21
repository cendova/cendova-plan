/**
 * Fassade der Render-Schicht — LAZY-Boundary vor Cornerstone3D.
 *
 * Die schwere Implementierung (`viewerImpl.ts` samt @cornerstonejs, ~984 kB
 * gzip) wird erst per dynamischem `import()` geladen, wenn der Viewport
 * gebraucht wird (Mount → `setupViewport`, oder ein Bild-Ladevorgang), statt
 * ins Initial-Bundle geankert zu werden. So rendert die App-Shell sofort
 * (~140 kB); Cornerstone kommt danach.
 *
 * Alle bisherigen Importeure nutzen UNVERÄNDERT `./viewer` — durch diese
 * Fassade werden sie automatisch cornerstone-frei. `viewerImpl` behält die
 * komplette, unveränderte Logik.
 *
 * Sync-Funktionen liefern vor dem Laden einen sicheren Fallback
 * (null/false/[]/no-op). Das ist unkritisch: `setupViewport` war schon immer
 * async, d. h. der Viewport existiert ohnehin erst nach dem Mount — die App
 * toleriert „noch kein Viewport" bereits (getViewport()===null). Die
 * eigentlichen sync-Aktionen (Kalibrieren, Schablonen, Messungen) sind
 * nutzergetriggert und laufen erst, wenn ein Bild/Viewport da ist (= geladen).
 */
export type { GenericMeasurementData } from './viewerImpl'

type VI = typeof import('./viewerImpl')

let impl: VI | null = null
let loading: Promise<VI> | null = null

/** Lädt die Cornerstone-Implementierung einmalig (idempotent). */
export function ensureViewer(): Promise<VI> {
  if (impl) return Promise.resolve(impl)
  if (!loading) loading = import('./viewerImpl').then((m) => ((impl = m), m))
  return loading
}

// --- Async-Einstiegspunkte: lösen das Laden aus ---
export const setupViewport: VI['setupViewport'] = async (...a) =>
  (await ensureViewer()).setupViewport(...a)
export const recoverViewport: VI['recoverViewport'] = async (...a) =>
  (await ensureViewer()).recoverViewport(...a)
export const loadFiles: VI['loadFiles'] = async (...a) =>
  (await ensureViewer()).loadFiles(...a)
export const showImageCandidate: VI['showImageCandidate'] = async (...a) =>
  (await ensureViewer()).showImageCandidate(...a)
export const loadDicomFromBytes: VI['loadDicomFromBytes'] = async (...a) =>
  (await ensureViewer()).loadDicomFromBytes(...a)

// --- Sync-Weiterleitungen (Fallback vor dem Laden) ---
export const getViewport: VI['getViewport'] = (...a) =>
  impl?.getViewport(...a) ?? null
export const openCalibrationChoice: VI['openCalibrationChoice'] = (...a) =>
  impl?.openCalibrationChoice(...a)
export const applyLeftTool: VI['applyLeftTool'] = (...a) =>
  impl?.applyLeftTool(...a)
export const isViewportLost: VI['isViewportLost'] = (...a) =>
  impl?.isViewportLost(...a) ?? false
export const teardownViewport: VI['teardownViewport'] = (...a) =>
  impl?.teardownViewport(...a)
export const resizeViewport: VI['resizeViewport'] = (...a) =>
  impl?.resizeViewport(...a)
export const resetPlanning: VI['resetPlanning'] = (...a) =>
  impl?.resetPlanning(...a)
export const fixImageCandidate: VI['fixImageCandidate'] = (...a) =>
  impl?.fixImageCandidate(...a)
export const reopenImageSelection: VI['reopenImageSelection'] = (...a) =>
  impl?.reopenImageSelection(...a)
export const getCurrentDicomBytes: VI['getCurrentDicomBytes'] = (...a) =>
  impl?.getCurrentDicomBytes(...a) ?? null
export const getCurrentDicomFileName: VI['getCurrentDicomFileName'] = (...a) =>
  impl?.getCurrentDicomFileName(...a) ?? null
export const getGenericMeasurements: VI['getGenericMeasurements'] = (...a) =>
  impl?.getGenericMeasurements(...a) ?? []
export const restoreGenericMeasurements: VI['restoreGenericMeasurements'] = (
  ...a
) => impl?.restoreGenericMeasurements(...a)
export const removeMeasurement: VI['removeMeasurement'] = (...a) =>
  impl?.removeMeasurement(...a)
export const removeAllMeasurements: VI['removeAllMeasurements'] = (...a) =>
  impl?.removeAllMeasurements(...a)
export const setMeasurementVisible: VI['setMeasurementVisible'] = (...a) =>
  impl?.setMeasurementVisible(...a)
export const addCupTemplate: VI['addCupTemplate'] = (...a) =>
  impl?.addCupTemplate(...a)
export const autoPlaceKneeImplant: VI['autoPlaceKneeImplant'] = (...a) =>
  impl?.autoPlaceKneeImplant(...a)
export const addKneeTemplate: VI['addKneeTemplate'] = (...a) =>
  impl?.addKneeTemplate(...a) ?? null
export const addStemTemplate: VI['addStemTemplate'] = (...a) =>
  impl?.addStemTemplate(...a)
export const placeStemForSide: VI['placeStemForSide'] = (...a) =>
  impl?.placeStemForSide(...a)
export const finishCupPlacement: VI['finishCupPlacement'] = (...a) =>
  impl?.finishCupPlacement(...a)
export const startCalibration: VI['startCalibration'] = (...a) =>
  impl?.startCalibration(...a)
export const applyMagnificationOnlyCalibration: VI['applyMagnificationOnlyCalibration'] =
  (...a) => impl?.applyMagnificationOnlyCalibration(...a) ?? false
export const applyCalibration: VI['applyCalibration'] = (...a) =>
  impl?.applyCalibration(...a)
export const isCalibrationActive: VI['isCalibrationActive'] = (...a) =>
  impl?.isCalibrationActive(...a) ?? false
export const cancelCalibration: VI['cancelCalibration'] = (...a) =>
  impl?.cancelCalibration(...a)
