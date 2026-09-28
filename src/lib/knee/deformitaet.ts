/**
 * Deformitätsanalyse nach Paley — Grundlage der Umstellungsosteotomie
 * (Stufe 1, docs/knie-osteotomie-plan.md).
 *
 * Reine Funktionen: Messwerte rein, Normwert-Bewertung, Lokalisation der
 * Fehlstellung und eine VORAUSWAHL des Osteotomietyps raus. Die
 * Vorauswahl ist ein Planungshinweis, keine Therapieentscheidung — der
 * Typ bleibt im Planer frei wählbar.
 *
 * Normbereiche: Paley-Lehrbuchwerte, vom ESSKA-Konsens 2024 ausdrücklich
 * für die Deformitätsanalyse empfohlen (Dawson et al., KSSTA 2024,
 * DOI 10.1002/ksa.12256); JLCA 0–2° zusätzlich nach Micicoi et al. 2020
 * (DOI 10.1186/s40634-020-00283-1).
 */
import type { OsteotomieTyp } from './osteotomie'

export const PALEY_NORM = {
  mLPFA: [85, 95],
  mLDFA: [85, 90],
  mMPTA: [85, 90],
  mLDTA: [86, 92],
  JLCA: [0, 2],
} as const

export type PaleyWinkel = keyof typeof PALEY_NORM

export interface WinkelBewertung {
  winkel: PaleyWinkel
  wert: number
  norm: readonly [number, number]
  /** 'normal' innerhalb des Normbereichs (Grenzen eingeschlossen). */
  status: 'normal' | 'zu niedrig' | 'zu hoch'
}

export function bewerteWinkel(winkel: PaleyWinkel, wert: number): WinkelBewertung {
  const norm = PALEY_NORM[winkel]
  const status = wert < norm[0] ? 'zu niedrig' : wert > norm[1] ? 'zu hoch' : 'normal'
  return { winkel, wert, norm, status }
}

export interface DeformitaetsEingabe {
  /** Signierte mHKA-Abweichung (negativ = Varus, positiv = Valgus). */
  hkaAbweichung: number
  mLDFA: number
  mMPTA: number
  JLCA: number
  /** Optional aus den Einzelmessungen. */
  mLPFA?: number | null
  mLDTA?: number | null
}

export type Achsrichtung = 'Varus' | 'Neutral' | 'Valgus'

export interface Deformitaetsanalyse {
  richtung: Achsrichtung
  bewertungen: WinkelBewertung[]
  /** Wo die Fehlstellung sitzt — nur Einträge mit Befund. */
  lokalisation: string[]
  /** Vorausgewählter Typ; null bei neutraler Achse. */
  vorschlag: OsteotomieTyp | null
  /** Begründung der Vorauswahl in einem Satz. */
  begruendung: string
  /** Default-Ziel der Traglinie in % für die Vorauswahl. */
  zielWblProzent: number
}

/** Achse gilt ab ±2° mHKA-Abweichung als varisch/valgisch — dieselbe
 *  Schwelle wie das Ausrichtungs-Label der Vollvermessung (MacDessi). */
const NEUTRAL_GRENZE = 2

/** Default-Ziele: Varus 62,5 % (Fujisawa-Bereich, vgl. Feucht et al.
 *  2014, DOI 10.1007/s00264-014-2442-7); Valgus 50 % — EIGENE
 *  Festlegung, die Literatur ist hier uneinheitlich. */
export const ZIEL_VARUS = 62.5
export const ZIEL_VALGUS = 50

export function analysiereDeformitaet(e: DeformitaetsEingabe): Deformitaetsanalyse {
  const richtung: Achsrichtung =
    e.hkaAbweichung <= -NEUTRAL_GRENZE
      ? 'Varus'
      : e.hkaAbweichung >= NEUTRAL_GRENZE
        ? 'Valgus'
        : 'Neutral'

  const bewertungen: WinkelBewertung[] = []
  if (e.mLPFA != null) bewertungen.push(bewerteWinkel('mLPFA', e.mLPFA))
  bewertungen.push(bewerteWinkel('mLDFA', e.mLDFA))
  bewertungen.push(bewerteWinkel('mMPTA', e.mMPTA))
  if (e.mLDTA != null) bewertungen.push(bewerteWinkel('mLDTA', e.mLDTA))
  bewertungen.push(bewerteWinkel('JLCA', e.JLCA))

  // Lokalisation: ein erhöhter mLDFA ist femoraler VARUS, ein erniedrigter
  // femoraler VALGUS; beim mMPTA umgekehrt (niedrig = tibialer Varus).
  const femurVarus = e.mLDFA > PALEY_NORM.mLDFA[1]
  const femurValgus = e.mLDFA < PALEY_NORM.mLDFA[0]
  const tibiaVarus = e.mMPTA < PALEY_NORM.mMPTA[0]
  const tibiaValgus = e.mMPTA > PALEY_NORM.mMPTA[1]
  const intraartikulaer = e.JLCA > PALEY_NORM.JLCA[1]
  const lokalisation: string[] = []
  if (femurVarus) lokalisation.push('femoral varisch (mLDFA erhöht)')
  if (femurValgus) lokalisation.push('femoral valgisch (mLDFA erniedrigt)')
  if (tibiaVarus) lokalisation.push('tibial varisch (mMPTA erniedrigt)')
  if (tibiaValgus) lokalisation.push('tibial valgisch (mMPTA erhöht)')
  if (intraartikulaer) lokalisation.push('intraartikulär / Weichteile (JLCA erhöht)')

  let vorschlag: OsteotomieTyp | null = null
  let begruendung = 'Achse neutral (±2°) — keine Vorauswahl.'
  let zielWblProzent = ZIEL_VARUS
  if (richtung === 'Varus') {
    zielWblProzent = ZIEL_VARUS
    if (femurVarus && tibiaVarus) {
      vorschlag = 'dlo'
      begruendung = 'Varus femoral UND tibial — Korrektur auf beiden Ebenen (Doppel-Level) prüfen.'
    } else if (femurVarus) {
      vorschlag = 'dfoSchliessend'
      begruendung = 'Varus femoral bei normalem mMPTA — Korrektur am Femur (schließende DFO) prüfen.'
    } else {
      vorschlag = 'htoOeffnend'
      begruendung = tibiaVarus
        ? 'Varus tibial — Korrektur an der Tibia (öffnende HTO) prüfen.'
        : 'Varus ohne klare Knochenlokalisation — Standardfall öffnende HTO; Gelenklinie beachten.'
    }
  } else if (richtung === 'Valgus') {
    zielWblProzent = ZIEL_VALGUS
    if (femurValgus && tibiaValgus) {
      vorschlag = 'dlo'
      begruendung = 'Valgus femoral UND tibial — Korrektur auf beiden Ebenen (Doppel-Level) prüfen.'
    } else if (tibiaValgus) {
      vorschlag = 'htoSchliessend'
      begruendung = 'Valgus tibial bei normalem mLDFA — Korrektur an der Tibia (schließende HTO) prüfen.'
    } else {
      vorschlag = 'dfoOeffnend'
      begruendung = femurValgus
        ? 'Valgus femoral — Korrektur am Femur (öffnende DFO) prüfen.'
        : 'Valgus ohne klare Knochenlokalisation — Standardfall DFO; Gelenklinie beachten.'
    }
  }
  return { richtung, bewertungen, lokalisation, vorschlag, begruendung, zielWblProzent }
}
