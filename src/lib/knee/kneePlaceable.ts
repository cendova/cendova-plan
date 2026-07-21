/**
 * Reine Platzierbarkeits-Prädikate für Knie-Schablonen — cornerstone-FREI und
 * bewusst AUSSERHALB der (lazy geladenen) Render-Schicht.
 *
 * Sie hängen nur von der Berechnungs-/Katalog-Schicht (`../knee/*`) und einem
 * Zustand-Store ab, nicht vom Render-Engine. Lägen sie in `viewerImpl.ts`,
 * würde die Lazy-Fassade sie bis zum Laden des ~984-kB-Cornerstone-Chunks als
 * `false` zurückgeben — dann filterte die Toolbar-Dropdown-Anzeige (Abschnitt
 * „4 · Schablonen") für wiederkehrende Knie-Modus-Nutzer kurzzeitig falsch.
 * Hier liegen sie eager und liefern ab dem ersten Paint korrekte Werte.
 */
import { bandForSizeIndex, type KneeImplantKind } from './smithNephewCatalog'
import { getKneeContour } from './kneeContours'
import { useTemplateTracerStore } from '../../state/templateTracerStore'
import type { KneeView } from '../../state/kneeTemplateStore'

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
