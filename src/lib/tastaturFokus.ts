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
