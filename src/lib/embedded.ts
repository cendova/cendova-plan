/**
 * Embedded-Modus: CendovaPlan läuft als iframe INNERHALB von CendovaView
 * (Weg B aus docs/cendova-integration-context.md — iframe + postMessage).
 *
 * Contract v2 (gemeinsam mit cendova-view/docs/umsetzungsplan.md §3):
 *   Host → Plan:  { type:'cendova:loadImage', requestId, fileName, bytes, pane? }
 *                 { type:'cendova:loadPlan',  requestId, plan }
 *   Plan → Host:  { type:'cendova:ready', contract }
 *                 { type:'cendova:planExported', plan, previewPng }
 *
 * `pane` (v2, optional): 1 = Haupt-Pane (Standard, Verhalten wie v1),
 * 2 = seitliches Pane der Knie-Zwei-Bild-Ansicht. Ein Host, der nur v1
 * kennt, sendet kein `pane` und bekommt unverändert das alte Verhalten.
 *
 * `contract` in 'cendova:ready' (v2) nennt die unterstützte Vertragsversion.
 * Sie ist nötig, weil ein v1-Build ein `pane:2` schlicht IGNORIEREN und das
 * seitliche Bild ins Haupt-Pane laden würde — der Host darf das zweite Bild
 * also erst senden, wenn er hier eine 2 gesehen hat.
 *
 * Datenschutz: Es wird ausschließlich mit dem EIGENEN Origin kommuniziert
 * (CendovaView liefert das Plan-Build unter /plan mit aus) — Nachrichten
 * fremder Origins werden ignoriert, es verlässt nichts den lokalen Server.
 */
import { getViewport, loadDicomFromBytes } from './cornerstone/viewer'
import { getViewport2, loadDicomBytesToPane2 } from './cornerstone/viewer2'
import { applyPlan, buildPlan, setEmbeddedSaveHook, type PlanFile } from './plan/serialize'
import { useKneePanesStore } from '../state/kneePanesStore'
import { useViewerStore } from '../state/viewerStore'

/** Unterstützte Vertragsversion — wird im 'ready' an den Host gemeldet. */
const CONTRACT_VERSION = 2

interface LoadImageMsg {
  type: 'cendova:loadImage'
  requestId?: string
  fileName: string
  bytes: ArrayBuffer
  /** Zielfenster: 1 = Haupt-Pane (Standard), 2 = seitliches Pane (Knie). */
  pane?: 1 | 2
}

/**
 * Lädt ein Bild ins ZWEITE Pane (Knie-Zwei-Bild-Ansicht).
 *
 * Reihenfolge ist zwingend: Das Pane existiert erst, wenn der Knie-Modus
 * aktiv UND die geteilte Ansicht eingeschaltet ist — vorher liefert
 * `getViewport2()` null und das Laden würde scheitern. Deshalb erst
 * umschalten, dann auf das Mounten warten. Gleiches Muster wie beim
 * Wiederherstellen eines Knie-Plans in `applyPlan`.
 */
async function ladeInsSeitlichePane(bytes: ArrayBuffer, fileName: string): Promise<void> {
  useViewerStore.getState().setPlanningMode('knee')
  useKneePanesStore.getState().setSplitView(true)
  for (let i = 0; i < 50 && !getViewport2(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!getViewport2()) {
    useKneePanesStore
      .getState()
      .setRightStatus('Seitliches Bild: Pane wurde nicht bereit — bitte erneut senden.')
    return
  }
  try {
    await loadDicomBytesToPane2(bytes, fileName)
  } catch (err) {
    useKneePanesStore
      .getState()
      .setRightStatus(
        `Fehler: Seitliches Bild nicht ladbar (${err instanceof Error ? err.message : 'Unbekannt'})`,
      )
  }
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
        // Ohne `pane` (Contract v1) unverändert ins Haupt-Pane.
        if (m.pane === 2) void ladeInsSeitlichePane(m.bytes, m.fileName)
        else void loadDicomFromBytes(m.bytes, m.fileName)
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
      window.parent.postMessage(
        { type: 'cendova:ready', contract: CONTRACT_VERSION },
        window.location.origin,
      )
      return
    }
    if (Date.now() - started < 30_000) {
      window.setTimeout(announceWhenReady, 100)
    }
  }
  announceWhenReady()
}
