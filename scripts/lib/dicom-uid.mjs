// Kollisionssichere DICOM-UID-Erzeugung fuer die Konverter-/Demo-Skripte.
//
// Nutzt node:crypto (randomInt) statt Math.random: CodeQL meldet
// js/insecure-randomness (High), wenn Math.random in eine ID-/UID-Erzeugung
// fliesst, und Math.random ist zudem kollisionsanfaellig. Fuer DICOM-UIDs
// (muessen weltweit eindeutig sein) ist crypto die richtige Quelle.
import { randomInt } from 'node:crypto'

/**
 * Erzeugt eine DICOM-UID unter dem gegebenen Organisations-Root, indem
 * numerische Komponenten (0..999999, ohne fuehrende Nullen) angehaengt
 * werden, bis die Ziel-Laenge erreicht ist (max. 64 Zeichen; hier 48).
 * @param {string} root Org-Root-OID (z. B. "1.2.826.0.1.3680043.8.498")
 * @returns {string}
 */
export function genDicomUid(root) {
  let s = root
  while (s.length < 48) s += '.' + randomInt(1_000_000)
  return s.slice(0, 48)
}
