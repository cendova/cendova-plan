/**
 * Plausibilitätsprüfung des Bild-Snapshots für den PDF-Export.
 *
 * Realtest 01.10.2026: Beim ersten Export war die AP-Aufnahme im PDF
 * komplett schwarz, nur ein ungestylter Rest des Ausrichtungs-Kastens war
 * zu sehen; der zweite Export klappte. Der Snapshot hatte einen
 * Zwischenzustand erwischt (Cornerstone-Canvas gerade neu aufgebaut bzw.
 * Layout noch nicht fertig) — auf dem Nutzer-PC, headless nicht
 * nachstellbar. Statt still ein schwarzes PDF zu speichern, vergleicht der
 * Export die Helligkeit des Snapshots mit dem live angezeigten Bild und
 * erfasst bei Bedarf neu.
 */

/** Ab dieser mittleren Helligkeit (0–255) zeigt das Live-Bild sicher Inhalt. */
const LIVE_MIN = 12
/** Snapshot gilt als unvollständig, wenn er unter diesem Anteil des Live-Bildes bleibt. */
const ANTEIL_MIN = 0.3

/**
 * true, wenn der Snapshot deutlich dunkler ist als das live angezeigte
 * Bild — dann fehlt das Röntgenbild in der Erfassung. Ohne verlässliche
 * Live-Messung (null, selbst dunkles Bild) wird nie Alarm geschlagen:
 * Lieber ein echtes, dunkles Bild exportieren als grundlos abbrechen.
 */
export function erfassungUnvollstaendig(live: number | null, snapshot: number | null): boolean {
  if (live == null || snapshot == null) return false
  return live >= LIVE_MIN && snapshot < live * ANTEIL_MIN
}

/** Mittlere Helligkeit (0–255) eines Canvas über ein grobes 32×32-Raster;
 *  null, wenn er leer oder nicht lesbar ist. */
export function mittlereHelligkeit(quelle: HTMLCanvasElement): number | null {
  if (!quelle.width || !quelle.height) return null
  const n = 32
  const c = document.createElement('canvas')
  c.width = n
  c.height = n
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  try {
    ctx.drawImage(quelle, 0, 0, n, n)
    const d = ctx.getImageData(0, 0, n, n).data
    let summe = 0
    for (let i = 0; i < d.length; i += 4) summe += (d[i] + d[i + 1] + d[i + 2]) / 3
    return summe / (n * n)
  } catch {
    return null
  }
}

/** Wartet n Animation-Frames — Cornerstone (Resize/Render) und die
 *  Overlays (useViewportSync) ziehen im rAF nach. */
export function naechsteFrames(n = 2): Promise<void> {
  return new Promise((fertig) => {
    let i = 0
    const schritt = () => (++i >= n ? fertig() : requestAnimationFrame(schritt))
    requestAnimationFrame(schritt)
  })
}
