import { dezimalTrenner } from '../zahlFormat'
/**
 * PDF-Zeilen der Abschnitte „Deformitätsanalyse" und „Umstellungs-
 * osteotomie" (Knie). Reine Funktion über die gemeinsame Berechnung
 * (berechneOsteotomie) — dieselben Zahlen wie Karte und Overlay.
 *
 * Zwei PDF-Eigenheiten, beide wie in femurProfilText.ts behandelt:
 *  - Helvetica/WinAnsi kennt Zeichen wie → ≥ ⅓ Δ — nicht; sie fielen still
 *    heraus und machten klinische Zeilen mehrdeutig → hier ersetzt.
 *  - Lange Hinweise werden vor der Zeichenabsicherung übersetzt und
 *    vorab umbrochen; `writeSection` prüft zusätzlich die reale Textbreite.
 */
import type { OsteotomieDaten } from '../../components/useOsteotomie'
import { osteotomieTyp } from '../knee/osteotomie'
import { computeCpak } from '../knee/cpak'
import { pdfSicher } from './pdfText'
import { t, translateText } from '../../i18n'

const BREITE = 100

/** Delegiert an die zentrale Absicherung (pdfText.ts) — eine Liste für alle Module. */
export const pdfSicherOsteotomie = (s: string) => pdfSicher(translateText(s))

/** Wortumbruch auf `BREITE` Zeichen; Folgezeilen eingerückt. */
export function umbrechen(text: string, einzug = '   '): string[] {
  const woerter = translateText(text).split(/\s+/).filter(Boolean)
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

const f1 = (v: number) => v.toFixed(1).replace('.', dezimalTrenner())

export function deformitaetPdfZeilen(d: OsteotomieDaten): string[] {
  const { vorher, analyse } = d
  if (!vorher || !analyse) return []
  const zeilen = [
    t('- Achse: {0} (mHKA-Abweichung {1}°)', {
      0: t(analyse.richtung),
      1: f1(Math.abs(vorher.hkaDeviationSigned)),
    }) + (vorher.wblProzent != null
      ? ` ${t('| Traglinie {0} % der Plateaubreite', { 0: f1(vorher.wblProzent) })}`
      : ''),
    ...analyse.bewertungen.map(
      (b) =>
        `- ${b.winkel} ${f1(b.wert)}° (${t('Norm')} ${b.norm[0]}-${b.norm[1]}°)` +
        (b.status === 'normal' ? '' : ` ${t(b.status)}`),
    ),
  ]
  if (analyse.lokalisation.length > 0)
    zeilen.push(...umbrechen(t('- Lokalisation: {0}', {
      0: analyse.lokalisation.map((text) => translateText(text)).join(' | '),
    })))
  zeilen.push(...umbrechen(`- ${translateText(analyse.begruendung)}`))
  return zeilen.map(pdfSicherOsteotomie)
}

export function osteotomiePdfZeilen(
  d: OsteotomieDaten,
  { kalibriert = true }: { kalibriert?: boolean } = {},
): string[] {
  const { plan, ergebnis } = d
  if (!plan) return []
  const kopf = t('- {0} | Ziel Traglinie {1} %', {
    0: t(osteotomieTyp(plan.typ).kurz),
    1: f1(plan.zielWblProzent),
  })
  if (!ergebnis || !ergebnis.ok)
    return [
      kopf,
      // Ohne Ergebnis fehlt die (sichtbare) Vollvermessung — die Planung
      // rechnet nur auf ihr (vorher stand hier ein leerer Grund).
      t('- Planung unvollständig: {0}', {
        0: translateText(ergebnis ? ergebnis.fehler : 'Vollvermessung fehlt oder ist ausgeblendet.'),
      }),
    ].map(pdfSicherOsteotomie)
  const { vorher, nachher } = ergebnis
  const vn = (label: string, a: string, b: string) => `   ${t(label)}: ${translateText(a)} -> ${translateText(b)}`
  const zeilen = [kopf]
  if (!kalibriert)
    zeilen.push('- Bild nicht kalibriert: mm-Angaben (Öffnung/Keil, Schnitt, Beinlänge) nicht maßstabsgetreu.')
  if (plan.typ === 'dlo') zeilen.push(`- Ziel-mLDFA femoral ${f1(plan.dloZielLdfa)}°`)
  for (const s of ergebnis.schnitte)
    zeilen.push(
      t('- {0}: Korrektur {1}° |', { 0: t(s.knochen), 1: f1(Math.abs(s.grad)) }) +
        ` ${t(s.keil === 'oeffnend' ? 'Öffnung' : 'Keilbasis')} ${f1(s.keilhoeheMm)} mm | ` +
        t('Schnittlänge {0} mm', { 0: s.schnittlaengeMm.toFixed(0) }),
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
    vn(
      'CPAK',
      `Typ ${computeCpak(vorher.mLDFA, vorher.mMPTA).type}`,
      `Typ ${computeCpak(nachher.mLDFA, nachher.mMPTA).type}`,
    ),
  )
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
