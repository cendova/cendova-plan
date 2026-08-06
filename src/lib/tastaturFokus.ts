/**
 * Wem gehört ein Tastendruck: dem fokussierten Bedienelement oder der
 * Schablonen-Steuerung?
 *
 * Anlass (Nutzer-Befund 08/2026): Nach dem Platzieren des Schafts ist der
 * nächste Griff meist die Rotationsausrichtung mit Alt + Pfeiltasten. Wer
 * vorher die Größe im Dropdown gewählt hatte, ließ damit aber den Fokus
 * dort — und Alt+Pfeil sprang durch die GRÖSSEN, statt zu drehen. Der
 * eingeübte Ausweg war, erst das Hand-Werkzeug und dann ins leere Bild zu
 * klicken, nur um den Fokus loszuwerden.
 *
 * Die Unterscheidung, die das löst:
 *  - `texteingabe` — Feld, in dem JEDE Taste Text bedeutet. Hier hat das
 *    Element immer Vorrang; Alt+Pfeil springt dort z. B. wortweise.
 *  - `dropdown` — ein `<select>`. Die blanken Pfeiltasten gehören ihm
 *    (Wert wechseln), die ausdrückliche Implantat-Geste dagegen nicht:
 *    Wer Alt hält, meint das Implantat, nicht die Liste.
 *  - `frei` — nichts fängt die Taste ab.
 */
export type FokusArt = 'frei' | 'dropdown' | 'texteingabe'

export function fokusArt(target: EventTarget | null): FokusArt {
  const el = target as HTMLElement | null
  const tag = el?.tagName?.toLowerCase() ?? ''
  if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) {
    return 'texteingabe'
  }
  if (tag === 'select') return 'dropdown'
  return 'frei'
}

/**
 * Darf die Schablonen-Steuerung diesen Tastendruck übernehmen?
 *
 * `istImplantatGeste` = die Taste ist ausdrücklich fürs Implantat gedacht
 * (Hüfte: Alt + Pfeil; Knie/Schulter: „+"/„−"). Nur diese Gesten dürfen
 * ein Dropdown überstimmen — blanke Pfeiltasten nicht, sonst ließe sich
 * die Größe per Tastatur gar nicht mehr wählen.
 */
export function schabloneDarfTaste(
  fokus: FokusArt,
  istImplantatGeste: boolean,
): boolean {
  if (fokus === 'texteingabe') return false
  if (fokus === 'dropdown') return istImplantatGeste
  return true
}

/** Feiner Rotationsschritt in Grad; mit Shift der grobe. */
const ROT_FEIN = 0.2
const ROT_GROB = 1

/**
 * Rotations-Schritt in Grad — oder `null`, wenn die Taste keine
 * Rotations-Geste ist.
 *
 * EINHEITLICH über Hüfte, Knie und Schulter (Nutzer-Entscheidung 08/2026;
 * vorher drehte die Hüfte mit Alt+Pfeil, Knie und Schulter mit „+"/„−"):
 *
 *   Alt + Pfeil rechts/oben   im Uhrzeigersinn
 *   Alt + Pfeil links/unten   gegen den Uhrzeigersinn
 *   „+" / „−"                 dasselbe ohne Alt — bleibt als Kurzform
 *                             erhalten, damit eingeübte Handgriffe im
 *                             Knie-Modul weiter funktionieren
 *
 * Mit Shift grob (1°) statt fein (0,2°). Auf deutscher Tastatur ist „+"
 * ungeshiftet, die Kurzform bleibt dort also fein.
 */
export function rotationsDelta(e: KeyboardEvent): number | null {
  const schritt = e.shiftKey ? ROT_GROB : ROT_FEIN
  if (e.key === '+') return +schritt
  if (e.key === '-') return -schritt
  if (!e.altKey) return null
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') return +schritt
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') return -schritt
  return null
}
