/**
 * DATEN der Tracer-Hintergründe: (kind|view[|band]) → Dateiname + Beschreibung.
 *
 * Im ÖFFENTLICHEN Repo bewusst LEER: Die Hintergrund-Screenshots sind
 * Hersteller-Material und kommen aus dem importierten Schablonen-Paket —
 * lib/templates/registry.ts ersetzt BACKGROUNDS beim Paket-Load in-place.
 * Die Auflösungs-LOGIK (Band-Fallback, URL-Bildung) lebt in
 * templateBackgrounds.ts.
 *
 * `file`-Konventionen:
 *  - Aus dem Paket: Pfad mit Präfix `images/` (Blob via resolveTemplateImage).
 *  - Gebündelt (historisch): roher Dateiname unter `public/templates/`.
 */
export interface BackgroundData {
  file: string
  /** Kurzbeschreibung, wird im Tracer als Tooltip angezeigt. */
  description: string
}

export const BACKGROUNDS: Record<string, BackgroundData> = {}
