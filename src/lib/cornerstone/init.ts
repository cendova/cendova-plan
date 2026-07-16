import { init as coreInit } from '@cornerstonejs/core'
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader'
import { init as toolsInit, annotation } from '@cornerstonejs/tools'

let initPromise: Promise<void> | null = null

/**
 * Initialisiert Cornerstone3D einmalig: Render-Kern, DICOM-Loader und
 * Werkzeug-System. Mehrfachaufrufe liefern dasselbe Promise zurück.
 *
 * Hinweis: Es wird GPU-Rendering verwendet. Cornerstones 3D-Texturen sind
 * auf vielen GPUs auf 2048 px begrenzt — größere Bilder müssen vor der
 * Anzeige herunterskaliert werden (siehe scripts/downscale-dicom.mjs).
 */
export function initCornerstone(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      // WebGL-Kontexte pro RenderingEngine auf 1 begrenzen (Debug-Befund
      // K1): Der ContextPool-Default (7 Kontexte je Engine) sprengt mit
      // zwei Engines + Probe-Kontexten Chromes 16-Kontexte-Limit — der
      // Browser evictet dann den LRU-Kontext, typischerweise das rechte
      // Pane → dauerhaft schwarz. Beide Engines haben je genau EINEN
      // Stack-Viewport; ein Kontext genügt vollständig.
      // (Typ verlangt die volle Config; zur Laufzeit wird deep-gemergt.)
      await coreInit({
        rendering: { webGlContextCount: 1 },
      } as Parameters<typeof coreInit>[0])
      await dicomImageLoaderInit()
      await toolsInit()
      applyAppToolStyle()
    })()
  }
  return initPromise
}

/**
 * Setzt die Standard-Linienfarben für alle Annotations-Werkzeuge
 * (Length, Angle, …) auf CYAN — die Mess-Farbe und Komplementär zum Amber
 * der Implantat-Schablonen, damit Messung und Implantat klar getrennt sind.
 *
 * Cornerstones Voreinstellung ist Knallgelb — überschreiben wir hier
 * einmalig nach der Tools-Initialisierung. Die Werte sind als `rgb(...)`
 * formatiert, weil Cornerstone das so erwartet.
 */
function applyAppToolStyle() {
  // Mess-Overlays sind WEISS (dezent, kein Blau) — Implantate sind amber.
  // slate-200 = #e2e8f0 (Linie), slate-50 = #f8fafc (hell/Schrift).
  const current =
    (annotation.config.style.getDefaultToolStyles() as { global?: Record<string, unknown> })
      ?.global ?? {}
  annotation.config.style.setDefaultToolStyles({
    global: {
      ...current,
      color: 'rgb(226, 232, 240)',            // weiß/slate-200 — Mess-Linie (dezent)
      colorHighlighted: 'rgb(248, 250, 252)', // heller bei Hover
      colorSelected: 'rgb(248, 250, 252)',    // heller bei Auswahl
      colorLocked: 'rgb(148, 163, 184)',      // slate-400 — gesperrt
      textBoxColor: 'rgb(248, 250, 252)',     // weiß — Schrift bewusst weg vom Blau
      textBoxColorHighlighted: 'rgb(248, 250, 252)',
      textBoxColorSelected: 'rgb(226, 232, 240)',
      textBoxColorLocked: 'rgb(148, 163, 184)',
      textBoxLinkLineDash: '2 3',
    },
  })
}
