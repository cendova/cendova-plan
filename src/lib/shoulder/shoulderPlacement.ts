/**
 * Platzierungs-Geometrie der Schulter-Schablonen: Halbmaße in Canvas-Pixeln
 * und die SVG-Transform der Schablonen-Gruppe.
 *
 * Bewusst als REINE Funktionen aus `ShoulderTemplateOverlay.tsx` gezogen:
 * Die Seiten-Konvention (welche Seite spiegelt) ist erfahrungsgemäß die
 * fehleranfälligste Stelle im Templating — die Hüfte trägt dafür einen
 * Test mit ausdrücklicher Bug-Historie (`src/lib/hip/templates.test.ts`).
 * Ohne Test war das hier die einzige ungetestete Rechenstelle des
 * Schultermoduls.
 */

/** Quelle der Größenangabe: Bild-Overlay hat Vorrang vor der Vektor-Kontur. */
export interface ShoulderMasse {
  /** Bild-Overlay, falls vorhanden (Maße inkl. Rand). */
  img?: { widthPx: number; heightPx: number; mmPerPx: number }
  /** Vektor-Kontur als Fallback. */
  contour?: { wMm: number; hMm: number }
}

/**
 * Halbe Breite/Höhe in Canvas-Pixeln.
 *
 * `pxPerMmX/Y` werden im Overlay aus Probepunkten bestimmt (getrennt je
 * Achse, wie im Knie-Bildpfad) — hier kommen sie fertig herein, damit die
 * Funktion frei von Viewport-Abhängigkeiten bleibt.
 */
export function shoulderHalbmasse(
  masse: ShoulderMasse,
  pxPerMmX: number,
  pxPerMmY: number,
): { halfWpx: number; halfHpx: number } {
  const { img, contour } = masse
  if (img) {
    return {
      halfWpx: (img.widthPx * img.mmPerPx * pxPerMmX) / 2,
      halfHpx: (img.heightPx * img.mmPerPx * pxPerMmY) / 2,
    }
  }
  if (!contour) throw new Error('weder Bild noch Kontur')
  return {
    halfWpx: (contour.wMm / 2) * pxPerMmX,
    halfHpx: (contour.hMm / 2) * pxPerMmY,
  }
}

/**
 * KANONISCHE SEITE der Schablonen-Quellen.
 *
 * Die Screenshots der Planungssoftware zeigen alle Serien in derselben
 * Orientierung; diese Seite wird unverändert gezeichnet, die Gegenseite
 * horizontal gespiegelt.
 *
 * RECHTS ist am echten Bild bestätigt (Sichtprüfung des Autors, 04.08.2026:
 * Schaft-Schablone auf eine rechte Schulter gelegt, Hals-Richtung passt
 * ohne Spiegelung). Kämen später Quellen in anderer Orientierung dazu, ist
 * DIESE Konstante die einzige Stelle, die angefasst werden muss — die Tests
 * in shoulderPlacement.test.ts prüfen relativ zu ihr.
 */
export const SHOULDER_KANONISCHE_SEITE: 'R' | 'L' = 'R'

/** Ob für diese Seite gespiegelt werden muss. */
export function shoulderSpiegelt(side: 'R' | 'L'): boolean {
  return side !== SHOULDER_KANONISCHE_SEITE
}

/**
 * SVG-`transform` der Schablonen-Gruppe.
 *
 * Reihenfolge beachten: SVG wendet die Liste von RECHTS nach LINKS an —
 * erst die Spiegelung an der Senkrechten durch `cx`, dann die Rotation um
 * `(cx, cy)`. Andersherum würde die Spiegelung den Drehwinkel umkehren.
 */
export function shoulderGruppenTransform(
  side: 'R' | 'L',
  rotationDeg: number,
  cx: number,
  cy: number,
): string {
  const rot = `rotate(${rotationDeg} ${cx} ${cy})`
  return shoulderSpiegelt(side)
    ? `${rot} translate(${cx} 0) scale(-1 1) translate(${-cx} 0)`
    : rot
}
