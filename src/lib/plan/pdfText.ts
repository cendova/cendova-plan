/**
 * Zentrale PDF-Zeichenabsicherung — sitzt in `writeSection` und gilt damit
 * für JEDE Zeile jedes Moduls.
 *
 * Hintergrund (Release-Check 29.09.2026, mit jsPDF nachgewiesen): Die
 * PDF-Standardschrift kennt nur Latin-1. Enthält eine Zeile auch nur EIN
 * Zeichen darüber (etwa das echte Minus U+2212 eines negativen
 * Mikulicz-Abstands oder einer Beinlängendifferenz, oder das „β" des
 * β-Winkels), schaltet jsPDF die GANZE Zeile auf eine 16-Bit-Kodierung
 * um — sie ist dann unlesbar. Vorher gab es nur modulweise Absicherungen
 * (Femurprofil, Osteotomie); die allgemeinen Messzeilen liefen roh durch.
 *
 * Bekannte Zeichen werden sinnvoll ersetzt; alles andere außerhalb von
 * Latin-1 wird zu „?" — lieber ein sichtbares Fragezeichen als eine
 * unlesbare Zeile.
 */
const ERSATZ: [RegExp, string][] = [
  [/[−‒–—―]/g, '-'], // Minus, Gedankenstriche
  [/[•▪●]/g, '-'], // Aufzählungspunkte
  [/[„“”]/g, '"'],
  [/[‚‘’]/g, "'"],
  [/…/g, '...'],
  [/→/g, '->'],
  [/←/g, '<-'],
  [/≥/g, '>='],
  [/≤/g, '<='],
  [/≈/g, '~'],
  [/⅓/g, '1/3'],
  [/Δ/g, 'Delta '],
  [/β/g, 'beta'],
  [/α/g, 'alpha'],
  [/[   ]/g, ' '], // schmale Leerzeichen
]

export function pdfSicher(s: string): string {
  let t = s
  for (const [muster, ersatz] of ERSATZ) t = t.replace(muster, ersatz)
  // Rest außerhalb Latin-1 → „?" (Surrogatpaare als EIN Zeichen).
  return Array.from(t, (ch) => (ch.codePointAt(0)! > 0xff ? '?' : ch)).join('')
}
