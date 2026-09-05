/**
 * Radaelli-Klassen zementfreier Primärschäfte — markenneutrale
 * Beschreibung je Klasse plus der klassenbezogene CPAH-Hinweis.
 *
 * Das ist die ÖFFENTLICHE Ebene der Schaft-Planungshinweise: Ohne
 * Schablonen-Paket (und damit ohne `StemPlanningProfile`) kann die App
 * keinen konkreten Schaft einordnen — wohl aber sagen, was die
 * Geometrieklassen bedeuten und was das CPAH-Paper über sie berichtet.
 * Die Zuordnung eigener Schäfte zu Klassen bleibt Sache des Anwenders
 * (bzw. eines lokalen Profil-Addons, scripts/build-stem-profile-addon.mjs).
 *
 * Quellen:
 *  - Taxonomie: Radaelli M et al., „A New Classification System for
 *    Cementless Femoral Stems in Total Hip Arthroplasty", J Arthroplasty
 *    2023;38(3):502–510, DOI 10.1016/j.arth.2022.09.014 (PMID 36122690).
 *    Die Kurzbeschreibungen zu A, B1, B2, C3 und D folgen der Wiedergabe
 *    in der Open-Access-Arbeit DOI 10.2106/JBJS.OA.25.00014; B3, C1, C2,
 *    E und F der Zusammenfassung in docs/HANDOFF_femurprofil-cpah.md.
 *  - CPAH: Stauss R et al., „Definition of Femoral Morphotypes Based on
 *    the Coronal Plane Alignment of the Hip Classification", J Arthroplasty
 *    2026, DOI 10.1016/j.arth.2026.05.011 (PMID 42134629, CC BY 4.0).
 *    Verwertet ist hier NUR der Abstract: „Across all CPAH types, the
 *    short stem was the best-fit implant, whereas a mismatch between
 *    anatomy and stem design was evident in up to 80 % of the cases using
 *    the anatomic stem design." Ergebnisse JE Morphotyp stehen im
 *    Volltext und sind noch nicht eingearbeitet (siehe TODO unten).
 *
 * Sprachregel wie in stemPlanningRules: Alles ist PLANUNGSHINWEIS —
 * „empfohlen", „Empfehlung", „kontraindiziert", „verwenden" sind verboten.
 */
import { RADAELLI_KLASSEN, type RadaelliKlasse, type StemPlanningProfile } from './medactaCatalog'
import type { CpahResult } from './femurProfile'
import { CPAH_SIMULIERTE_KLASSEN, type PlanningHint } from './stemPlanningRules'

export interface RadaelliKlassenInfo {
  klasse: RadaelliKlasse
  /** Kurzname für die Legende. */
  name: string
  /** Ein Satz Geometrie — was den Buchstaben ausmacht. */
  geometrie: string
  /** Zone der primären Verankerung. */
  verankerung: 'metaphysär' | 'metadiaphysär' | 'diaphysär'
  /** Querschnitt — das zweite Unterscheidungsmerkmal neben der Silhouette. */
  querschnitt: 'flach' | 'rechteckig' | 'quadrangulär' | 'oval' | 'rund'
  /** Verkürztes Design (Kurzschaft bzw. verkürzter Taper). */
  kurz: boolean
  /** Im CPAH-Paper digital simuliert (nur A, B3, C2, F). */
  cpahSimuliert: boolean
}

const simuliert = (k: RadaelliKlasse) => CPAH_SIMULIERTE_KLASSEN.includes(k)

export const RADAELLI_KLASSEN_INFO: Record<RadaelliKlasse, RadaelliKlassenInfo> = {
  A: {
    klasse: 'A',
    name: 'Flacher Taper',
    geometrie:
      'Flach und dünn in der Sagittalebene, Verjüngung vor allem in der Koronarebene; porös beschichtet.',
    verankerung: 'metaphysär',
    querschnitt: 'flach',
    kurz: false,
    cpahSimuliert: simuliert('A'),
  },
  B1: {
    klasse: 'B1',
    name: 'Rechteckiger Taper',
    geometrie:
      'Rechteckiger Querschnitt mit gleichmäßiger Verjüngung, Verankerung vor allem metadiaphysär; gestrahlte Oberfläche.',
    verankerung: 'metadiaphysär',
    querschnitt: 'rechteckig',
    kurz: false,
    cpahSimuliert: simuliert('B1'),
  },
  B2: {
    klasse: 'B2',
    name: 'Quadrangulärer Taper',
    geometrie:
      'Metaphysärer Flare in Koronar- UND Sagittalebene für proximalen Kortikaliskontakt; HA-beschichtet.',
    verankerung: 'metadiaphysär',
    querschnitt: 'quadrangulär',
    kurz: false,
    cpahSimuliert: simuliert('B2'),
  },
  B3: {
    klasse: 'B3',
    name: 'Verkürzter quadrangulärer Taper',
    geometrie: 'Wie B2, aber distal verkürzt — Verankerung rückt weiter nach proximal.',
    verankerung: 'metaphysär',
    querschnitt: 'quadrangulär',
    kurz: true,
    cpahSimuliert: simuliert('B3'),
  },
  C1: {
    klasse: 'C1',
    name: 'Fit-and-fill',
    geometrie:
      'Füllt Metaphyse und proximale Diaphyse aus (proximaler und distaler Formschluss).',
    verankerung: 'metadiaphysär',
    querschnitt: 'oval',
    kurz: false,
    cpahSimuliert: simuliert('C1'),
  },
  C2: {
    klasse: 'C2',
    name: 'Anatomischer Fit-and-fill',
    geometrie: 'Fit-and-fill mit seitenspezifischer Krümmung, die der Femurform folgt.',
    verankerung: 'metadiaphysär',
    querschnitt: 'oval',
    kurz: false,
    cpahSimuliert: simuliert('C2'),
  },
  C3: {
    klasse: 'C3',
    name: 'Kurzer Fit-and-fill',
    geometrie:
      'Verkürzter Fit-and-fill, der proximal-distale Größenkonflikte vermeidet; HA-beschichtet.',
    verankerung: 'metaphysär',
    querschnitt: 'oval',
    kurz: true,
    cpahSimuliert: simuliert('C3'),
  },
  D: {
    klasse: 'D',
    name: 'Konisch (Spline)',
    geometrie:
      'Runder Querschnitt, distal konisch verjüngt, mit Längsrippen für axiale und rotatorische Stabilität; gestrahlt.',
    verankerung: 'diaphysär',
    querschnitt: 'rund',
    kurz: false,
    cpahSimuliert: simuliert('D'),
  },
  E: {
    klasse: 'E',
    name: 'Zylindrisch',
    geometrie: 'Runder Querschnitt ohne Verjüngung, vollständig beschichtet, diaphysäre Verankerung.',
    verankerung: 'diaphysär',
    querschnitt: 'rund',
    kurz: false,
    cpahSimuliert: simuliert('E'),
  },
  F: {
    klasse: 'F',
    name: 'Kalkargeführter Kurzschaft',
    geometrie: 'Kurz, folgt dem Kalkarbogen, metaphysärer Press-fit.',
    verankerung: 'metaphysär',
    querschnitt: 'quadrangulär',
    kurz: true,
    cpahSimuliert: simuliert('F'),
  },
}

/** Alle Klassen in Taxonomie-Reihenfolge. */
export const RADAELLI_KLASSEN_LISTE: readonly RadaelliKlassenInfo[] = RADAELLI_KLASSEN.map(
  (k) => RADAELLI_KLASSEN_INFO[k],
)

/**
 * Klassenbezogener CPAH-Hinweis — braucht KEIN Schaftprofil, nur den
 * abgeleiteten Morphotyp. Er trägt die Kernaussage des CPAH-Abstracts
 * und weist die Evidenzgrenzen aus.
 *
 * TODO (fachlich, nach Volltext-Abgleich mit Philipp): Ergebnisse je
 * CPAH-Typ (Offset-/Beinlängen-Rekonstruktion und Mismatch je Design)
 * ergänzen. Bis dahin gilt bewusst nur die typübergreifende Aussage.
 */
export function radaelliKlassenHinweis(
  cpah: CpahResult | null,
  schaftProfil: StemPlanningProfile | null = null,
): PlanningHint | null {
  if (!cpah) return null
  const evidence = [`CPAH ${cpah.code}`, 'Stauss et al. 2026 (J Arthroplasty), Abstract']
  if (schaftProfil?.radaelliClass) {
    evidence.push(`Platzierter Schaft: Radaelli ${schaftProfil.radaelliClass}`)
  }
  return {
    severity: 'info',
    code: 'CPAH_KLASSEN_BILANZ',
    text:
      'CPAH-Paper (digitale Planung, wenige Fälle je Typ, keine Outcome-Endpunkte): ' +
      'kalkargeführter Kurzschaft (F) über alle Morphotypen mit dem besten geometrischen Fit; ' +
      'anatomischer Fit-and-fill (C2) mit Mismatch in bis zu 80 % der Fälle. ' +
      'Direkt simuliert nur A, B3, C2 und F — für andere Klassen gilt Geometrie-Analogie.',
    evidence,
  }
}
