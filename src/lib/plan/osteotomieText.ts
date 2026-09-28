/**
 * PDF-Zeilen der Abschnitte „Deformitätsanalyse" und „Umstellungs-
 * osteotomie" (Knie). Reine Funktion über die gemeinsame Berechnung
 * (berechneOsteotomie) — dieselben Zahlen wie Karte und Overlay.
 *
 * Zwei PDF-Eigenheiten, beide wie in femurProfilText.ts behandelt:
 *  - Helvetica/WinAnsi kennt Zeichen wie → ≥ ⅓ Δ — nicht; sie fielen still
 *    heraus und machten klinische Zeilen mehrdeutig → hier ersetzt.
 *  - `writeSection` bricht nicht um → lange Hinweise werden hier auf
 *    Seitenbreite umbrochen.
 */
import type { OsteotomieDaten } from '../../components/useOsteotomie'
import { osteotomieTyp } from '../knee/osteotomie'

const BREITE = 100

export function pdfSicherOsteotomie(s: string): string {
  return s
    .replace(/[—–]/g, '-')
    .replace(/→/g, '->')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/⅓/g, '1/3')
    .replace(/Δ/g, 'Delta ')
    .replace(/[„“”]/g, '"')
    .replace(/[‚‘’]/g, "'")
}

/** Wortumbruch auf `BREITE` Zeichen; Folgezeilen eingerückt. */
export function umbrechen(text: string, einzug = '   '): string[] {
  const woerter = text.split(/\s+/).filter(Boolean)
  const zeilen: string[] = []
  let zeile = ''
  for (const w of woerter) {
    const kandidat = zeile ? `${zeile} ${w}` : w
    if (kandidat.length > BREITE && zeile) {
      zeilen.push(zeile)
      zeile = einzug + w
    } else {
      zeile = kandidat
    }
  }
  if (zeile) zeilen.push(zeile)
  return zeilen
}

const f1 = (v: number) => v.toFixed(1).replace('.', ',')

export function deformitaetPdfZeilen(d: OsteotomieDaten): string[] {
  const { vorher, analyse } = d
  if (!vorher || !analyse) return []
  const zeilen = [
    `- Achse: ${analyse.richtung} (mHKA-Abweichung ${f1(Math.abs(vorher.hkaDeviationSigned))}°)` +
      (vorher.wblProzent != null ? ` | Traglinie ${f1(vorher.wblProzent)} % der Plateaubreite` : ''),
    ...analyse.bewertungen.map(
      (b) =>
        `- ${b.winkel} ${f1(b.wert)}° (Norm ${b.norm[0]}-${b.norm[1]}°)` +
        (b.status === 'normal' ? '' : ` ${b.status}`),
    ),
  ]
  if (analyse.lokalisation.length > 0)
    zeilen.push(...umbrechen(`- Lokalisation: ${analyse.lokalisation.join(' | ')}`))
  zeilen.push(...umbrechen(`- ${analyse.begruendung}`))
  return zeilen.map(pdfSicherOsteotomie)
}

export function osteotomiePdfZeilen(d: OsteotomieDaten): string[] {
  const { plan, ergebnis } = d
  if (!plan) return []
  const kopf = `- ${osteotomieTyp(plan.typ).kurz} | Ziel Traglinie ${f1(plan.zielWblProzent)} %`
  if (!ergebnis || !ergebnis.ok)
    return [kopf, `- Planung unvollständig: ${ergebnis && !ergebnis.ok ? ergebnis.fehler : ''}`].map(
      pdfSicherOsteotomie,
    )
  const { vorher, nachher } = ergebnis
  const vn = (label: string, a: string, b: string) => `   ${label}: ${a} -> ${b}`
  const zeilen = [kopf]
  if (plan.typ === 'dlo') zeilen.push(`- Ziel-mLDFA femoral ${f1(plan.dloZielLdfa)}°`)
  for (const s of ergebnis.schnitte)
    zeilen.push(
      `- ${s.knochen}: Korrektur ${f1(Math.abs(s.grad))}° | ` +
        `${s.keil === 'oeffnend' ? 'Öffnung' : 'Keilbasis'} ${f1(s.keilhoeheMm)} mm | ` +
        `Schnittlänge ${s.schnittlaengeMm.toFixed(0)} mm`,
    )
  if (ergebnis.jlcaKorrekturGrad > 0)
    zeilen.push(
      `- Laxitätskorrektur nach Ryu: -${f1(ergebnis.jlcaKorrekturGrad)}° ` +
        `(ohne Korrektur ${f1(ergebnis.zielWinkelOhneKorrektur)}°)`,
    )
  zeilen.push('- Vorher -> nachher:')
  zeilen.push(
    vn(
      'mHKA-Abweichung',
      `${f1(Math.abs(vorher.hkaDeviationSigned))}° ${vorher.hkaDeviationSigned < 0 ? 'Varus' : 'Valgus'}`,
      `${f1(Math.abs(nachher.hkaDeviationSigned))}° ${nachher.hkaDeviationSigned < 0 ? 'Varus' : 'Valgus'}`,
    ),
  )
  if (vorher.wblProzent != null && nachher.wblProzent != null)
    zeilen.push(vn('Traglinie', `${f1(vorher.wblProzent)} %`, `${f1(nachher.wblProzent)} %`))
  zeilen.push(vn('mLDFA', `${f1(vorher.mLDFA)}°`, `${f1(nachher.mLDFA)}°`))
  zeilen.push(vn('mMPTA', `${f1(vorher.mMPTA)}°`, `${f1(nachher.mMPTA)}°`))
  zeilen.push(vn('JLCA', `${f1(vorher.JLCA)}°`, `${f1(nachher.JLCA)}°`))
  zeilen.push(vn('JLO (MJLA)', `${f1(vorher.mjla)}°`, `${f1(nachher.mjla)}°`))
  zeilen.push(
    `- Beinlänge ${ergebnis.beinlaengeDeltaMm >= 0 ? '+' : '-'}${f1(Math.abs(ergebnis.beinlaengeDeltaMm))} mm`,
  )
  for (const h of ergebnis.hinweise) {
    const marke = h.severity === 'warning' ? '(!)' : h.severity === 'caution' ? '(Achtung)' : '(i)'
    zeilen.push(...umbrechen(`${marke} ${h.text} [${h.evidence.join(' | ')}]`))
  }
  zeilen.push(
    ...umbrechen(
      'Geometrische Simulation auf der AP-Ganzbeinaufnahme (Miniaci); Slope, Rotation und ' +
        'Patellahöhe nicht abgebildet. Planungshinweis - keine autonome Therapieentscheidung.',
    ),
  )
  return zeilen.map(pdfSicherOsteotomie)
}
