/**
 * Auflösung (kind+view[+band]) → Hintergrund-Bild für den Tracer.
 *
 * Die DATEN liegen in templateBackgroundsData.ts (dort kann das
 * Schablonen-Paket sie ersetzen); hier lebt nur die Auflösungs-Logik.
 * Wenn für eine Kombination KEIN Eintrag vorliegt, gibt die Funktion
 * null zurück und der Tracer arbeitet ohne Hintergrundbild.
 */
import type { KneeImplantKind } from './smithNephewCatalog'
import type { KneeView } from '../../state/kneeTemplateStore'
import { BACKGROUNDS } from './templateBackgroundsData'
import { resolveTemplateImage } from '../templates/registry'

interface BackgroundEntry {
  src: string
  /** Kurzbeschreibung, wird im Tracer als Tooltip angezeigt. */
  description: string
}

export function backgroundFor(
  kind: KneeImplantKind,
  view: KneeView,
  band?: string,
): BackgroundEntry | null {
  const entry =
    (band ? BACKGROUNDS[`${kind}|${view}|${band}`] : undefined) ??
    BACKGROUNDS[`${kind}|${view}`]
  if (!entry) return null
  // Paket-Pfade (`images/...`) löst die Registry als Blob-URL auf;
  // gebündelte Dateinamen (mit Leerzeichen) müssen URL-encoded werden.
  const src = entry.file.startsWith('images/')
    ? resolveTemplateImage(entry.file)
    : `/templates/${encodeURIComponent(entry.file)}`
  return { src, description: entry.description }
}
