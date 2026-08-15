/**
 * Textzeilen des Femurprofils für den PDF-Abschnitt.
 *
 * Bewusst ein EIGENES Modul statt einer Funktion in `pdfExport.ts`: Der
 * PDF-Export arbeitet auf DOM und jsPDF und ist als Ganzes nicht sinnvoll
 * testbar (er hat bis heute keinen Test). Die Zeilen hier tragen aber
 * klinische Werte — sie gehören geprüft. Rein hinein, Strings heraus,
 * keine Abhängigkeit auf Viewer, Stores oder jsPDF.
 *
 * Dieselben Regeln wie in der Karte, nur als Text:
 *   - Rohwerte immer, KLASSE nur bei bestätigter Bildqualität,
 *   - die ärztliche Entscheidung schlägt den Vorschlag,
 *   - Dorr C bekommt eine Fixations-WARNUNG, keine Entscheidung,
 *   - fehlende Werte als „—", nie als 0.
 */
import {
  computeFemurProfileRaw,
  isFemurProfileClassifiable,
} from '../hip/femurProfile'
import type { FemurProfileReview } from '../../state/hipStore'
import type { Types } from '@cornerstonejs/core'

/** Klartext der Override-Gründe. Bewusst hier gespiegelt statt aus dem
 *  Store importiert — der Formatter soll ohne Store-Kette laufen. */
const GRUND_TEXT: Record<string, string> = {
  rotation: 'Rotationsfehlstellung der Aufnahme',
  kortikalis_unscharf: 'Kortikalisgrenzen unscharf',
  deformitaet: 'Deformität verfälscht die Messung',
  laterale_aufnahme: 'Beurteilung anhand seitlicher Aufnahme',
  gesamtmorphologie: 'Gesamtmorphologie spricht dagegen',
  sonstiges: 'Sonstiges',
}

/**
 * Ersetzt Zeichen, die jsPDF mit der Standardschrift NICHT ausgeben kann.
 *
 * Helvetica wird in WinAnsi kodiert; alles darüber hinaus fällt still
 * heraus. Am erzeugten PDF nachgemessen: `·`, `°` und Umlaute kommen
 * durch, Gedankenstrich, Halbgeviertstrich und Aufzählungspunkt NICHT —
 * aus „C — Vorschlag war B" wurde „C  Vorschlag war B". Ein stillschweigend
 * verschluckter Gedankenstrich macht eine klinische Zeile mehrdeutig,
 * darum wird hier ersetzt statt gehofft.
 *
 * Absichtlich in diesem Modul und nicht im Aufrufer: Auch die
 * Warntexte aus der Geometrie laufen hier durch, und die enthalten
 * Gedankenstriche.
 */
function pdfSicher(s: string): string {
  return s
    .replace(/[—–]/g, '-')
    .replace(/[•▪]/g, '-')
    .replace(/[„“”]/g, '"')
    .replace(/[‚‘’]/g, "'")
    .replace(/…/g, '...')
}

function zahl(v: number | null, nachkomma: number, einheit = ''): string {
  if (v == null) return '—'
  const s = v.toFixed(nachkomma)
  // Grad ohne Komma-Umstellung (wie in der Werteliste), sonst deutsch.
  return einheit === '°' ? `${s}°` : `${s.replace('.', ',')}${einheit}`
}

/**
 * Baut die Zeilen des Abschnitts „Femurprofil". Leeres Array, wenn die
 * Messung unbrauchbar ist — dann entfällt der Abschnitt ganz
 * (`writeSection` zeichnet bei leerer Liste nichts).
 */
export function femurProfilPdfZeilen(
  points: Types.Point3[],
  mmPerWorldUnit: number,
  review?: FemurProfileReview,
): string[] {
  const raw = computeFemurProfileRaw(points, mmPerWorldUnit)
  if (!raw) return []

  const quality = review?.imageQuality
  const darfKlassifizieren = isFemurProfileClassifiable(quality)
  const dorr = darfKlassifizieren ? raw.dorr : null
  const cpah = darfKlassifizieren ? raw.cpah : null
  const final = review?.dorrFinal ?? null

  const zeilen: string[] = []

  // 1) Die Klasse — oder ihr Fehlen, mit Begründung.
  if (!darfKlassifizieren) {
    zeilen.push('• Dorr/CPAH: nicht zuverlässig bestimmbar')
    const gruende = quality?.exclusionReasons ?? []
    if (gruende.length > 0) {
      zeilen.push(`   Bildqualität: ${gruende.join('; ')}`)
    } else {
      zeilen.push('   Bildqualität nicht bestätigt')
    }
  } else if (final != null) {
    const abweichend =
      review?.dorrSuggested != null && final !== review.dorrSuggested
    zeilen.push(
      abweichend
        ? `• Dorr (ärztlich): ${final} — Vorschlag war ${review?.dorrSuggested}`
        : `• Dorr bestätigt: ${final}`,
    )
    if (abweichend && review?.overrideReason) {
      zeilen.push(
        `   Grund: ${GRUND_TEXT[review.overrideReason] ?? review.overrideReason}`,
      )
    }
    // Nach der Bestätigung verschobene Punkte: dieselbe Warnung wie in
    // der Karte, sonst behauptet das PDF eine Bestätigung, die zur
    // aktuellen Rechnung nicht mehr passt.
    if (
      review?.dorrSuggested != null &&
      dorr != null &&
      dorr.suggested !== review.dorrSuggested
    ) {
      zeilen.push(
        `   Achtung: Punkte nach der Bestätigung verändert — Vorschlag lautet jetzt ${dorr.suggested}.`,
      )
    }
  } else {
    zeilen.push(
      `• Dorr-Vorschlag: ${dorr?.suggested}${
        dorr?.borderline ? ` (Grenzbereich ${dorr.borderline})` : ''
      } — ärztlich nicht bestätigt`,
    )
  }

  // 2) Rohwerte — immer, auch ohne Klasse.
  zeilen.push(
    `   Cortical Index: ${zahl(raw.corticalIndex, 2)}  ·  Canal-Calcar Ratio: ${zahl(
      raw.canalCalcarRatio,
      2,
    )}`,
  )
  zeilen.push(
    `   NSA (CCD): ${zahl(raw.nsaDeg, 1, '°')}  ·  Femorales Offset: ${zahl(
      raw.femoralOffsetMm,
      1,
      ' mm',
    )}  ·  FOR: ${zahl(raw.femoralOffsetRatio, 2)}`,
  )

  // 3) CPAH im Klartext.
  if (cpah) {
    zeilen.push(
      `   CPAH ${cpah.code} · coxa ${raw.nsaClass} · ${
        cpah.offsetSubtype === 'H' ? 'High-offset' : 'Normal-offset'
      }`,
    )
  }

  // 4) Mess-Warnungen der Geometrie.
  for (const w of raw.warnings) zeilen.push(`   Hinweis: ${w}`)

  // 5) Fixationswarnung bei Dorr C — Prüfauftrag, keine Entscheidung.
  if (cpah && cpah.type >= 7) {
    zeilen.push(
      '   Dorr C: zementierte Fixation/Alternative aktiv prüfen. Geometrischer Fit',
    )
    zeilen.push('   hebt das Frakturrisiko nicht auf.')
  }

  zeilen.push('   Planungshinweis - keine autonome Implantatentscheidung.')
  // EINE Stelle fuer die Zeichen-Sicherung: so kann keine kuenftige Zeile
  // (und kein Warntext aus der Geometrie) sie versehentlich umgehen.
  return zeilen.map(pdfSicher)
}
