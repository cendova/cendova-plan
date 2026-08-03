/**
 * Einordnung des Deltoid Tuberosity Index (DTI) nach Spross et al.,
 * Clin Orthop Relat Res 2015;473(9):3038–3045
 * (doi:10.1007/s11999-015-4322-x).
 *
 * Messvorschrift dort: auf der a.p.-Aufnahme auf HÖHE DES PROXIMALEN
 * ENDES DER TUBEROSITAS DELTOIDEA — dort, wo die laterale Kortikalis
 * erstmals parallel verläuft — den äußeren Kortikalisdurchmesser durch
 * den inneren Markraumdurchmesser teilen. Der DTI ist damit ein
 * VERHÄLTNIS und braucht keine Kalibrierung; er schätzt die lokale
 * Knochenqualität des proximalen Humerus ab.
 *
 * Schwelle: Ein DTI unter 1,4 zeigt eine niedrige lokale Knochendichte
 * an. Anders als beim Akromion-Index ist das in der Quelle ein benannter
 * Grenzwert und keine bloße Gruppenmittel-Angabe — er wird hier deshalb
 * als Schwelle geführt.
 *
 * EINSCHRÄNKUNGEN, die die Aussage begrenzen:
 *  1. Die Höhe der Messebene muss stimmen: Weiter distal wird die
 *     Kortikalis dicker, der Index steigt. Die Regel „erste Stelle mit
 *     parallel verlaufender lateraler Kortikalis" ist deshalb Teil der
 *     Messung, nicht bloß eine Empfehlung — die Schritt-Texte des
 *     Rezepts benennen sie ausdrücklich.
 *  2. Der Index beschreibt die LOKALE Knochenqualität am proximalen
 *     Humerus; er ersetzt keine Osteoporose-Diagnostik (DXA).
 *
 * CendovaPlan ist kein Medizinprodukt.
 */

/** Unterhalb dieses Werts gilt die lokale Knochendichte als niedrig. */
export const DTI_SCHWELLE = 1.4

export type DtiBereich = 'niedrig' | 'ueblich'

export interface DtiBefund {
  bereich: DtiBereich
  hinweis: string
}

/** Ordnet einen DTI-Wert ein. */
export function beurteileDti(wert: number): DtiBefund {
  if (wert < DTI_SCHWELLE) {
    return {
      bereich: 'niedrig',
      hinweis: 'unter 1,4 — Hinweis auf niedrige lokale Knochendichte',
    }
  }
  return {
    bereich: 'ueblich',
    hinweis: 'ab 1,4 — kein Hinweis auf niedrige lokale Knochendichte',
  }
}
