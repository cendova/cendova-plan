/**
 * Farbkodierung der tibialen Resektionstiefe (Design-Runde 09.10.2026).
 *
 * Die Kästen „M x,x mm" / „L x,x mm" an der Tibia tragen einen Rahmen —
 * damit sie auf den ersten Blick zur Tibia gehören (Femur-Kästen haben
 * keinen) — und der Rahmen färbt sich nach der Tiefe:
 *   0 – 7,0 mm   weiß      (sparsam)
 *   7,1 – 10,5   grün      (üblicher Bereich)
 *   10,6 – 11,9  orange    (viel)
 *   ab 12,0      rot       (sehr viel)
 * Gerechnet wird auf dem ANGEZEIGTEN Wert (eine Nachkommastelle), damit
 * Farbe und Zahl nie auseinanderlaufen (7,04 → „7,0" → weiß).
 */
export const RESEKTION_WEISS = '#f8fafc'
export const RESEKTION_GRUEN = '#4ade80'
export const RESEKTION_ORANGE = '#fb923c'
export const RESEKTION_ROT = '#f87171'

export function resektionsFarbe(tiefeMm: number): string {
  if (!Number.isFinite(tiefeMm)) return RESEKTION_WEISS
  const d = Math.round(tiefeMm * 10) / 10
  if (d <= 7) return RESEKTION_WEISS
  if (d <= 10.5) return RESEKTION_GRUEN
  if (d <= 11.9) return RESEKTION_ORANGE
  return RESEKTION_ROT
}
