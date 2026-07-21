/**
 * Fassade der zweiten Viewport-Ebene (Zwei-Bild-Modus) — LAZY-Boundary vor
 * `viewer2Impl.ts` (Cornerstone3D). Analog zu `./viewer`: die Implementierung
 * wird erst per dynamischem `import()` geladen, wenn Pane 2 tatsächlich
 * gebraucht wird. Alle bisherigen Importeure nutzen unverändert `./viewer2`.
 *
 * Sync-Funktionen liefern vor dem Laden einen sicheren Fallback; sie wirken
 * ohnehin nur auf einen existierenden Pane-2-Viewport (also nach dem Laden).
 */
type V2 = typeof import('./viewer2Impl')

let impl: V2 | null = null
let loading: Promise<V2> | null = null

/** Lädt die Pane-2-Implementierung einmalig (idempotent). */
export function ensureViewer2(): Promise<V2> {
  if (impl) return Promise.resolve(impl)
  if (!loading) loading = import('./viewer2Impl').then((m) => ((impl = m), m))
  return loading
}

// --- Async-Einstiegspunkte: lösen das Laden aus ---
export const setupViewport2: V2['setupViewport2'] = async (...a) =>
  (await ensureViewer2()).setupViewport2(...a)
export const recoverViewport2: V2['recoverViewport2'] = async (...a) =>
  (await ensureViewer2()).recoverViewport2(...a)
export const loadFilesToPane2: V2['loadFilesToPane2'] = async (...a) =>
  (await ensureViewer2()).loadFilesToPane2(...a)
export const showImageCandidate2: V2['showImageCandidate2'] = async (...a) =>
  (await ensureViewer2()).showImageCandidate2(...a)
export const loadDicomBytesToPane2: V2['loadDicomBytesToPane2'] = async (...a) =>
  (await ensureViewer2()).loadDicomBytesToPane2(...a)

// --- Sync-Weiterleitungen (Fallback vor dem Laden) ---
export const getViewport2: V2['getViewport2'] = (...a) =>
  impl?.getViewport2(...a) ?? null
export const getCurrentDicomBytes2: V2['getCurrentDicomBytes2'] = (...a) =>
  impl?.getCurrentDicomBytes2(...a) ?? null
export const getCurrentDicomFileName2: V2['getCurrentDicomFileName2'] = (...a) =>
  impl?.getCurrentDicomFileName2(...a) ?? null
export const applyNavToolsPane2: V2['applyNavToolsPane2'] = (...a) =>
  impl?.applyNavToolsPane2(...a)
export const startCalibrationToolPane2: V2['startCalibrationToolPane2'] = (
  ...a
) => impl?.startCalibrationToolPane2(...a)
export const startSlopeToolPane2: V2['startSlopeToolPane2'] = (...a) =>
  impl?.startSlopeToolPane2(...a)
export const clearSlopePane2: V2['clearSlopePane2'] = (...a) =>
  impl?.clearSlopePane2(...a)
export const applyToolPane2: V2['applyToolPane2'] = (...a) =>
  impl?.applyToolPane2(...a)
export const recomputeRightMeasurements: V2['recomputeRightMeasurements'] = (
  ...a
) => impl?.recomputeRightMeasurements(...a)
export const removeRightMeasurement: V2['removeRightMeasurement'] = (...a) =>
  impl?.removeRightMeasurement(...a)
export const setRightMeasurementVisible: V2['setRightMeasurementVisible'] = (
  ...a
) => impl?.setRightMeasurementVisible(...a)
export const teardownViewport2: V2['teardownViewport2'] = (...a) =>
  impl?.teardownViewport2(...a)
export const resizeViewport2: V2['resizeViewport2'] = (...a) =>
  impl?.resizeViewport2(...a)
export const fixImageCandidate2: V2['fixImageCandidate2'] = (...a) =>
  impl?.fixImageCandidate2(...a)
export const reopenImageSelection2: V2['reopenImageSelection2'] = (...a) =>
  impl?.reopenImageSelection2(...a)
