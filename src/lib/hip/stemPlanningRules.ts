/**
 * Regelbasierte Schaft-Planungshinweise (Task 15, Phase B).
 *
 * Reine Funktion: finaler Dorr + CPAH-Bausteine + optionales Schaftprofil
 * rein, erklärbare Hinweise raus. Jeder Hinweis trägt seine Belege
 * (`evidence`) — ein Hinweis, dessen Grund man nicht sehen kann, ist
 * hier ein Bug, kein Feature.
 *
 * Sprachregeln (hart, siehe FemurProfileCard):
 *  - Alles ist ein PLANUNGSHINWEIS. Die Wörter „empfohlen"/„Empfehlung",
 *    „kontraindiziert" oder Imperative wie „verwenden" sind verboten —
 *    das Programm ist nicht CE-zertifiziert und trifft keine
 *    Therapieentscheidung.
 *  - Keine erfundenen Schwellen: Die Regeln nutzen ausschließlich die
 *    belegten Klassen (Dorr, NSA-Klasse, Offset-Untertyp) — z. B. steht
 *    „enger Kanal" für die DEFINITION von Dorr A, nicht für einen
 *    zusätzlichen Zahlenwert.
 *
 * Die Regeln lesen NIE Ordner- oder Markennamen — nur die strukturierten
 * Profile aus dem Schablonen-Paket (`StemPlanningProfile`, Task 14).
 */
import type { StemPlanningProfile } from './medactaCatalog'
import type { DorrType, NsaClass, OffsetSubtype } from './femurProfile'

export interface PlanningHint {
  severity: 'info' | 'caution' | 'warning'
  /** Stabiler Regel-Code — für Tests, Diagnose und spätere Persistenz. */
  code: string
  text: string
  /** Sichtbare Belege: gemessene Werte und die verwendete Klasse. */
  evidence: string[]
}

/** Anatomie-Eingaben der Regeln — alles Nullable außer der Dorr-Klasse:
 *  ohne sie gibt es keinen einzigen anwendbaren Hinweis. */
export interface StemPlanningAnatomie {
  dorr: DorrType
  /** true nur, wenn die Klasse ärztlich bestätigt UND nicht veraltet ist. */
  dorrBestaetigt: boolean
  nsaClass: NsaClass | null
  offsetSubtype: OffsetSubtype | null
  corticalIndex: number | null
  nsaDeg: number | null
  femoralOffsetRatio: number | null
}

const komma = (v: number, stellen: number) => v.toFixed(stellen).replace('.', ',')

/** Belegzeilen aus den vorhandenen Messwerten — nur was wirklich da ist. */
function belege(a: StemPlanningAnatomie, mit: ('ci' | 'nsa' | 'for')[]): string[] {
  const zeilen = [
    `Dorr ${a.dorr} (${a.dorrBestaetigt ? 'ärztlich bestätigt' : 'Vorschlag, unbestätigt'})`,
  ]
  if (mit.includes('ci') && a.corticalIndex != null) zeilen.push(`CI ${komma(a.corticalIndex, 2)}`)
  if (mit.includes('nsa') && a.nsaDeg != null) zeilen.push(`NSA ${a.nsaDeg.toFixed(1)}°`)
  if (mit.includes('for') && a.femoralOffsetRatio != null)
    zeilen.push(`FOR ${komma(a.femoralOffsetRatio, 2)}`)
  return zeilen
}

const SEVERITY_RANG: Record<PlanningHint['severity'], number> = {
  warning: 0,
  caution: 1,
  info: 2,
}

/**
 * Erzeugt die Planungshinweise. Ohne `schaftProfil` gelten die
 * Anatomie-Regeln allein; mit Profil werden sie profilspezifisch
 * (z. B. entfällt die Dorr-C-Fixationswarnung bei zementierter Fixation).
 */
export function stemPlanningHints(
  anatomie: StemPlanningAnatomie,
  schaftProfil: StemPlanningProfile | null = null,
): PlanningHint[] {
  const hints: PlanningHint[] = []

  // --- Dorr C: Fixationsregel -------------------------------------------
  // Zementiert bekommt hier bewusst KEINEN Hinweis: die PPF-Warnung
  // gehört zur zementfreien Verankerung; Knochenqualität (Bone Health)
  // bleibt eine separate Beurteilung und wird nicht eingefaltet.
  if (anatomie.dorr === 'C') {
    if (schaftProfil == null) {
      hints.push({
        severity: 'warning',
        code: 'DORR_C_FIXATION',
        text:
          'Dorr C: zementierte Fixation/Alternative aktiv prüfen. ' +
          'Geometrischer Fit hebt das Frakturrisiko nicht auf.',
        evidence: belege(anatomie, ['ci']),
      })
    } else if (schaftProfil.fixation === 'cementless') {
      hints.push({
        severity: 'warning',
        code: 'DORR_C_ZEMENTFREI',
        text:
          `Dorr C mit zementfreiem Schaft${schaftProfil.collar === 'none' ? ' (collarless)' : ''}: ` +
          'zementierte Fixation/Alternative aktiv prüfen. ' +
          'Geometrischer Fit hebt das Frakturrisiko nicht auf.',
        evidence: belege(anatomie, ['ci']),
      })
    }
  }

  // --- Dorr A: enger, dickkortikaler Kanal ------------------------------
  if (anatomie.dorr === 'A') {
    hints.push({
      severity: 'caution',
      code: 'DORR_A_ENGER_KANAL',
      text:
        'Dorr A (enger, dickkortikaler Kanal): auf distales Verklemmen ' +
        'und metaphysäres Undersizing achten.',
      evidence: belege(anatomie, ['ci']),
    })
  }

  // --- Coxa vara + High-Offset: lateralisierte Variante vergleichen -----
  if (anatomie.nsaClass === 'vara' && anatomie.offsetSubtype === 'H') {
    hints.push({
      severity: 'info',
      code: 'VARA_HIGH_OFFSET',
      text:
        'Coxa vara mit High-Offset-Anatomie: lateralisierte ' +
        'Schaftvariante im Vergleich prüfen.',
      evidence: belege(anatomie, ['nsa', 'for']),
    })
  }

  // --- Coxa valga: Überoffset-Falle -------------------------------------
  if (anatomie.nsaClass === 'valga') {
    if (schaftProfil?.offsetVariant === 'lateralized') {
      hints.push({
        severity: 'warning',
        code: 'VALGA_LATERALISIERT',
        text: 'Coxa valga mit lateralisierter Variante: Überoffset prüfen.',
        evidence: belege(anatomie, ['nsa', 'for']),
      })
    } else {
      hints.push({
        severity: 'caution',
        code: 'VALGA_UEBEROFFSET',
        text: 'Coxa valga: bei lateralisierter Variante Überoffset prüfen.',
        evidence: belege(anatomie, ['nsa', 'for']),
      })
    }
  }

  return hints.sort((x, y) => SEVERITY_RANG[x.severity] - SEVERITY_RANG[y.severity])
}
