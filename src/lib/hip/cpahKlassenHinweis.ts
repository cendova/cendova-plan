/**
 * Klassenbezogener CPAH-Hinweis — die ÖFFENTLICHE, markenneutrale Ebene
 * der Schaft-Planungshinweise. Braucht kein Schablonen-Paket: Er sagt je
 * Morphotyp, was das CPAH-Paper in der digitalen Planung für die vier
 * simulierten Radaelli-Geometrieklassen gefunden hat. Die Zuordnung
 * eigener Schäfte zu Klassen bleibt Sache des Anwenders (bzw. eines
 * lokalen Profil-Addons, scripts/build-stem-profile-addon.mjs).
 *
 * Quelle (am Volltext eingearbeitet, 06.09.2026): Stauss R et al.,
 * „Definition of Femoral Morphotypes Based on the Coronal Plane Alignment
 * of the Hip Classification", J Arthroplasty 2026,
 * DOI 10.1016/j.arth.2026.05.011 (CC BY 4.0). Verwendet sind die
 * Ergebnis-Absätze „Digital Templating – Hip Coronal Reconstruction"
 * und die Diskussion (S. 5–7); Zahlen dort wörtlich:
 *  - Varus (1/4/7): beste FO-Rekonstruktion mit Kurzschaft (F) und B3;
 *    gerader Schaft (A) reduziert das FO (40 % adäquat); höchste LLD
 *    beim anatomischen Schaft (C2); Mismatch A 25,5 %, C2 40 %.
 *  - High-Offset (H): anatomischste FO-Rekonstruktion mit B3 und F;
 *    A mit Offset-Reduktion.
 *  - Valgus (3/6/9): FO steigt mit allen Designs; am geringsten F, dann
 *    B3; A und C2 in 57,8 % bzw. 66,7 % nicht simulierbar (Mismatch).
 *  - Dorr A (1–3): F und B3 passen zur Kanalform in 100 % bzw. 84 %;
 *    Mismatch A 36 %, C2 28 %.
 *  - Dorr C (7–9): beste Übereinstimmung mit F und B3; Mismatch A 32 %,
 *    C2 64 %.
 *  - 2N, 4N, 4H, 5N, 5H: ausreichende Verankerung mit allen vier
 *    Geometrien in 80–100 %.
 *  - Gesamt: Kurzschaft (F) best-fit; 5 Fälle je Typ, digitale Planung,
 *    keine klinischen Endpunkte.
 * Nur A, B3, C2 und F wurden simuliert (je 3/1/1/2 Designs) — für die
 * anderen Klassen gilt Geometrie-Analogie (Regel CPAH_EVIDENZ_KLASSE).
 *
 * Sprachregel wie in stemPlanningRules: Alles ist PLANUNGSHINWEIS —
 * „empfohlen", „Empfehlung", „kontraindiziert", „verwenden" sind verboten.
 */
import type { StemPlanningProfile } from './medactaCatalog'
import type { CpahResult, DorrType, NsaClass } from './femurProfile'
import type { PlanningHint } from './stemPlanningRules'

/** Dorr-Zeile und NSA-Spalte aus der Matrix-Nummer 1–9 (Zeile × Spalte). */
export function cpahBausteine(type: CpahResult['type']): { dorr: DorrType; nsa: NsaClass } {
  const dorr: DorrType = type <= 3 ? 'A' : type <= 6 ? 'B' : 'C'
  const rest = type % 3
  const nsa: NsaClass = rest === 1 ? 'vara' : rest === 2 ? 'norma' : 'valga'
  return { dorr, nsa }
}

const SATZ_VARUS =
  'Varus-Typen 1/4/7: beste Offset-Rekonstruktion mit kalkargeführtem Kurzschaft (F) und ' +
  'verkürztem quadrangulärem Taper (B3); gerader Schaft (A) verkleinert das Offset (nur 40 % adäquat), ' +
  'anatomischer Fit-and-fill (C2) mit der größten Beinlängendifferenz. Mismatch Anatomie–Design: A 25,5 %, C2 40 %.'
const SATZ_VALGUS =
  'Valgus-Typen 3/6/9: alle Designs vergrößern das Offset — am geringsten Kurzschaft (F), dann B3; ' +
  'gerader Schaft (A) und anatomischer Fit-and-fill (C2) in 57,8 % bzw. 66,7 % wegen Mismatch nicht planbar.'
const SATZ_NORMA_AB =
  'Norma-Typen 2N/5N/5H: ausreichende Verankerung mit allen vier simulierten Geometrien (A, B3, C2, F) in 80–100 % der Fälle.'
const SATZ_HIGH_OFFSET =
  'High-Offset-Untertyp: anatomischste Offset-Rekonstruktion mit B3 und Kurzschaft (F); gerader Schaft (A) reduziert das Offset.'
const SATZ_DORR_A =
  'Dorr A (Typ 1–3): Kurzschaft (F) und B3 passen zur Kanalform in 100 % bzw. 84 %; Mismatch bei A 36 %, bei C2 28 %.'
const SATZ_DORR_C =
  'Dorr C (Typ 7–9): beste Übereinstimmung mit Kurzschaft (F) und B3; Mismatch bei A 32 %, bei C2 64 %.'
const SATZ_GRENZE =
  'Geometrie-Aussagen aus digitaler Planung (5 Fälle je Typ), keine klinischen Endpunkte; simuliert nur A, B3, C2 und F.'

/**
 * Baut den typspezifischen Hinweis aus den Paper-Befunden zusammen.
 * Ohne Morphotyp kein Hinweis — wie alle Regeln.
 */
export function cpahKlassenHinweis(
  cpah: CpahResult | null,
  schaftProfil: StemPlanningProfile | null = null,
): PlanningHint | null {
  if (!cpah) return null
  const { dorr, nsa } = cpahBausteine(cpah.type)

  const saetze: string[] = []
  if (nsa === 'vara') saetze.push(SATZ_VARUS)
  else if (nsa === 'valga') saetze.push(SATZ_VALGUS)
  else if (dorr !== 'C') saetze.push(SATZ_NORMA_AB)
  if (cpah.offsetSubtype === 'H') saetze.push(SATZ_HIGH_OFFSET)
  if (dorr === 'A') saetze.push(SATZ_DORR_A)
  if (dorr === 'C') saetze.push(SATZ_DORR_C)
  saetze.push(SATZ_GRENZE)

  const evidence = [`CPAH ${cpah.code}`, 'Stauss et al. 2026, J Arthroplasty (Volltext)']
  if (schaftProfil?.radaelliClass) {
    evidence.push(`Platzierter Schaft: Radaelli ${schaftProfil.radaelliClass}`)
  }
  return {
    severity: 'info',
    code: 'CPAH_KLASSEN_BILANZ',
    text: `CPAH-Paper zu Typ ${cpah.code} — ${saetze.join(' ')}`,
    evidence,
  }
}
