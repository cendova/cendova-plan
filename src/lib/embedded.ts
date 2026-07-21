/**
 * Embedded-Modus: CendovaPlan läuft als iframe INNERHALB von CendovaView
 * (Weg B aus docs/cendova-integration-context.md — iframe + postMessage).
 *
 * Contract v1 (gemeinsam mit cendova-view/docs/umsetzungsplan.md §3):
 *   Host → Plan:  { type:'cendova:loadImage', requestId, fileName, bytes }
 *                 { type:'cendova:loadPlan',  requestId, plan }
 *   Plan → Host:  { type:'cendova:ready' }
 *                 { type:'cendova:planExported', plan, previewPng }
 *
 * Datenschutz: Es wird ausschließlich mit dem EIGENEN Origin kommuniziert
 * (CendovaView liefert das Plan-Build unter /plan mit aus) — Nachrichten
 * fremder Origins werden ignoriert, es verlässt nichts den lokalen Server.
 */
import { getViewport, loadDicomFromBytes } from './cornerstone/viewer'
import { applyPlan, buildPlan, setEmbeddedSaveHook, type PlanFile } from './plan/serialize'

interface LoadImageMsg {
  type: 'cendova:loadImage'
  requestId?: string
  fileName: string
  bytes: ArrayBuffer
}

interface LoadPlanMsg {
  type: 'cendova:loadPlan'
  requestId?: string
  plan: PlanFile
}

/** Aktiv, wenn die App mit ?embedded=1 in einem iframe läuft. */
export function isEmbedded(): boolean {
  return (
    window.parent !== window &&
    new URLSearchParams(window.location.search).get('embedded') === '1'
  )
}

/**
 * Exportiert den aktuellen Plan an den Host: PlanFile-JSON (verlustfrei,
 * wieder editierbar — inkl. eingebettetem Bild) plus ein PNG des Viewports
 * als sichtbares Vorschaubild („Planungs-Serie" im Archiv).
 */
export async function exportPlanToHost(): Promise<void> {
  const plan = buildPlan()
  let previewPng: ArrayBuffer | null = null
  try {
    const canvas = getViewport()?.getCanvas()
    if (canvas && canvas.width > 0) {
      previewPng = await new Promise<ArrayBuffer | null>((resolve) => {
        canvas.toBlob(
          (blob) => (blob ? void blob.arrayBuffer().then(resolve) : resolve(null)),
          'image/png',
        )
      })
    }
  } catch {
    // Vorschau ist Komfort — der Plan selbst geht in jedem Fall raus.
  }
  const msg = { type: 'cendova:planExported', plan, previewPng }
  window.parent.postMessage(msg, window.location.origin, previewPng ? [previewPng] : [])
}

/**
 * Installiert den Nachrichten-Handler und meldet Bereitschaft, SOBALD der
 * Viewport steht (loadDicomFromBytes braucht die gemountete Engine —
 * deshalb wird auf getViewport() gepollt statt sofort zu senden).
 */
export function initEmbeddedBridge(): void {
  if (!isEmbedded()) return

  // „Plan speichern" geht im Embedded-Modus an den Host statt als Download.
  setEmbeddedSaveHook(() => void exportPlanToHost())

  window.addEventListener('message', (event: MessageEvent) => {
    // Origin UND Quelle prüfen: Nachrichten dürfen nur vom einbettenden
    // Host-Fenster kommen. Ohne die source-Prüfung könnte ein anderes Frame
    // gleicher Origin (z. B. ein weiteres iframe) Bilder/Pläne einschleusen
    // (Security-Report §12).
    if (event.origin !== window.location.origin) return
    if (event.source !== window.parent) return
    const data = event.data as Partial<LoadImageMsg | LoadPlanMsg> | null
    if (!data || typeof data !== 'object') return
    if (data.type === 'cendova:loadImage') {
      const m = data as LoadImageMsg
      if (m.bytes instanceof ArrayBuffer && typeof m.fileName === 'string') {
        void loadDicomFromBytes(m.bytes, m.fileName)
      }
    } else if (data.type === 'cendova:loadPlan') {
      const m = data as LoadPlanMsg
      if (m.plan && typeof m.plan === 'object') {
        void applyPlan(m.plan)
      }
    }
  })

  const started = Date.now()
  const announceWhenReady = (): void => {
    if (getViewport()) {
      window.parent.postMessage({ type: 'cendova:ready' }, window.location.origin)
      return
    }
    if (Date.now() - started < 30_000) {
      window.setTimeout(announceWhenReady, 100)
    }
  }
  announceWhenReady()
}
