import { describe, expect, it } from 'vitest'
import type { Types } from '@cornerstonejs/core'
import {
  DORR_BORDERLINE_ZONES,
  DORR_CI_THRESHOLDS,
  FEMUR_PROFILE_POINT_COUNT,
  FOR_HIGH_AT,
  NSA_THRESHOLDS,
  classifyDorr,
  classifyNsa,
  classifyOffsetSubtype,
  computeCpah,
  computeFemurProfileRaw,
} from './femurProfile'

const p = (x: number, y: number, z = 0): Types.Point3 => [x, y, z]

describe('Dorr-Klassifikation', () => {
  it('klassifiziert klare A-, B- und C-Werte', () => {
    expect(classifyDorr(0.63).suggested).toBe('A')
    expect(classifyDorr(0.55).suggested).toBe('B')
    expect(classifyDorr(0.45).suggested).toBe('C')
  })

  it('markiert A/B- und B/C-Grenzbereiche', () => {
    expect(classifyDorr(0.6).borderline).toBe('A/B')
    expect(classifyDorr(0.5).borderline).toBe('B/C')
  })

  it('hat außerhalb der Grenzzonen keinen Grenzbereich', () => {
    expect(classifyDorr(0.63).borderline).toBeNull()
    expect(classifyDorr(0.55).borderline).toBeNull()
    expect(classifyDorr(0.45).borderline).toBeNull()
  })

  // Die Klassengrenzen sind EINSCHLIESSEND für B (Handoff: A ist CI > 0,60,
  // B ist 0,50 <= CI <= 0,60, C ist CI < 0,50). Exakt 0,60 und exakt 0,50
  // gehören also zu B — genau das ist beim Ablesen die Stolperstelle.
  it('ordnet die Klassengrenzen 0,60 und 0,50 dem Typ B zu', () => {
    expect(classifyDorr(DORR_CI_THRESHOLDS.dorrAAbove).suggested).toBe('B')
    expect(classifyDorr(DORR_CI_THRESHOLDS.dorrCBelow).suggested).toBe('B')
  })

  it('klassifiziert knapp jenseits der Grenzen als A bzw. C', () => {
    expect(classifyDorr(0.601).suggested).toBe('A')
    expect(classifyDorr(0.499).suggested).toBe('C')
  })

  // Die Grenzzonen sind eine EIGENE Konvention (siehe Kommentar im Modul),
  // keine Paper-Angabe — ihre Ränder gehören ausdrücklich dazu.
  it.each([
    [0.58, 'B', 'A/B'],
    [0.6, 'B', 'A/B'],
    [0.62, 'A', 'A/B'],
    [0.48, 'C', 'B/C'],
    [0.5, 'B', 'B/C'],
    [0.52, 'B', 'B/C'],
  ] as const)('CI %f → Dorr %s, Grenzbereich %s', (ci, typ, zone) => {
    const r = classifyDorr(ci)
    expect(r.suggested).toBe(typ)
    expect(r.borderline).toBe(zone)
  })

  it('liegt direkt außerhalb der Zonenränder nicht mehr im Grenzbereich', () => {
    expect(classifyDorr(0.579).borderline).toBeNull()
    expect(classifyDorr(0.621).borderline).toBeNull()
    expect(classifyDorr(0.479).borderline).toBeNull()
    expect(classifyDorr(0.521).borderline).toBeNull()
  })

  // Sicherheitsnetz: NaN würde durch alle Vergleiche fallen und still als
  // „C" enden — also als die Klasse, die eine Zementier-Warnung auslöst.
  // Ein lauter Fehler ist hier allemal besser als eine erfundene Klasse.
  it('wirft bei nicht endlichen Werten statt still C zu liefern', () => {
    expect(() => classifyDorr(Number.NaN)).toThrow()
    expect(() => classifyDorr(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('NSA-Klassifikation', () => {
  it('klassifiziert vara, norma und valga', () => {
    expect(classifyNsa(115)).toBe('vara')
    expect(classifyNsa(130)).toBe('norma')
    expect(classifyNsa(145)).toBe('valga')
  })

  // Handoff: vara < 120°, norma 120–140°, valga > 140° — die Grenzwerte
  // selbst gehören also zu norma.
  it('ordnet 120° und 140° dem Bereich norma zu', () => {
    expect(classifyNsa(NSA_THRESHOLDS.varaBelow)).toBe('norma')
    expect(classifyNsa(NSA_THRESHOLDS.valgaAbove)).toBe('norma')
  })

  it('klassifiziert knapp jenseits der Grenzen als vara bzw. valga', () => {
    expect(classifyNsa(119.9)).toBe('vara')
    expect(classifyNsa(140.1)).toBe('valga')
  })

  it('wirft bei nicht endlichen Werten', () => {
    expect(() => classifyNsa(Number.NaN)).toThrow()
  })
})

describe('Offset-Untertyp', () => {
  it('trennt normales und hohes Offset', () => {
    expect(classifyOffsetSubtype(1.4)).toBe('N')
    expect(classifyOffsetSubtype(1.8)).toBe('H')
  })

  // Handoff: N ist FOR < 1,60, H ist FOR >= 1,60 — die Schwelle selbst
  // gehört zu H.
  it('ordnet die Schwelle 1,60 dem Untertyp H zu', () => {
    expect(classifyOffsetSubtype(FOR_HIGH_AT)).toBe('H')
    expect(classifyOffsetSubtype(1.599)).toBe('N')
  })

  it('wirft bei nicht endlichen Werten', () => {
    expect(() => classifyOffsetSubtype(Number.NaN)).toThrow()
  })
})

describe('CPAH', () => {
  it('bildet Dorr B + norma + High-offset auf 5H ab', () => {
    expect(computeCpah('B', 'norma', 'H').code).toBe('5H')
  })

  // Vollständige Matrix: Dorr A = 1/2/3, B = 4/5/6, C = 7/8/9,
  // jeweils vara | norma | valga.
  it.each([
    ['A', 'vara', 1],
    ['A', 'norma', 2],
    ['A', 'valga', 3],
    ['B', 'vara', 4],
    ['B', 'norma', 5],
    ['B', 'valga', 6],
    ['C', 'vara', 7],
    ['C', 'norma', 8],
    ['C', 'valga', 9],
  ] as const)('Dorr %s + %s → Typ %i', (dorr, nsa, typ) => {
    expect(computeCpah(dorr, nsa, 'N').type).toBe(typ)
  })

  it('hängt den Offset-Untertyp an den Code an', () => {
    expect(computeCpah('A', 'vara', 'N').code).toBe('1N')
    expect(computeCpah('C', 'valga', 'H').code).toBe('9H')
  })

  it('gibt den Untertyp auch einzeln zurück', () => {
    const r = computeCpah('B', 'norma', 'H')
    expect(r.offsetSubtype).toBe('H')
    expect(r.type).toBe(5)
  })
})

describe('Schwellen-Konstanten', () => {
  // Die CpahMatrix leitet Zellgrenzen und Grenzbänder aus genau diesen
  // Konstanten ab. Liefe eine Konstante weg, zeigte das Schaubild etwas
  // anderes als die Rechenlogik — deshalb hier festgenagelt.
  it('entsprechen den im Handoff dokumentierten Werten', () => {
    expect(DORR_CI_THRESHOLDS.dorrAAbove).toBe(0.6)
    expect(DORR_CI_THRESHOLDS.dorrCBelow).toBe(0.5)
    expect(DORR_BORDERLINE_ZONES.ab).toEqual([0.58, 0.62])
    expect(DORR_BORDERLINE_ZONES.bc).toEqual([0.48, 0.52])
    expect(NSA_THRESHOLDS.varaBelow).toBe(120)
    expect(NSA_THRESHOLDS.valgaAbove).toBe(140)
    expect(FOR_HIGH_AT).toBe(1.6)
  })

  it('lässt die Grenzzonen die Klassengrenzen einschließen', () => {
    const [abLo, abHi] = DORR_BORDERLINE_ZONES.ab
    const [bcLo, bcHi] = DORR_BORDERLINE_ZONES.bc
    expect(abLo).toBeLessThan(DORR_CI_THRESHOLDS.dorrAAbove)
    expect(abHi).toBeGreaterThan(DORR_CI_THRESHOLDS.dorrAAbove)
    expect(bcLo).toBeLessThan(DORR_CI_THRESHOLDS.dorrCBelow)
    expect(bcHi).toBeGreaterThan(DORR_CI_THRESHOLDS.dorrCBelow)
  })

  it('lässt die beiden Grenzzonen einander nicht überlappen', () => {
    expect(DORR_BORDERLINE_ZONES.bc[1]).toBeLessThan(DORR_BORDERLINE_ZONES.ab[0])
  })
})

// ----------------------------------------------------------------------
// Geometrie-Engine: computeFemurProfileRaw aus den 13 Landmarken.
//
// Synthetische Referenz-Anatomie (Weltkoordinaten = mm bei factor 1),
// so gebaut, dass die Beispielwerte aus dem Plan exakt herauskommen:
//   Schaftachse vertikal (x = 0), Hüftkopf-Zentrum bei x = −64
//   → FO 64 mm; Z 40 mm, X 20 mm → CI 0,50; Calcar-Breite 40 mm
//   → CCR 0,50; FOR 64/40 = 1,60; Halsachse 135° → norma → CPAH 5H.
// ----------------------------------------------------------------------

/** Punkte 0–12 der Referenz-Anatomie. Kopfkontur: Kreis r 24 um (−64,−40). */
function referenzPunkte(): Types.Point3[] {
  return [
    p(-40, -40), // 0 Kopfkontur
    p(-64, -64), // 1 Kopfkontur
    p(-88, -40), // 2 Kopfkontur
    // 3 Halsmitte: Zentrum + 10·(cos −45°, sin −45°) → Winkel 135° zur Achse
    p(-64 + 10 * Math.SQRT1_2, -40 - 10 * Math.SQRT1_2),
    p(0, 0), // 4 Schaftachse proximal
    p(0, 100), // 5 Schaftachse distal
    p(0, 40), // 6 Mitte Trochanter minor
    // Kortikalisdicken bewusst ASYMMETRISCH (medial 12, lateral 8) —
    // nur so kann ein Test eine vertauschte Seiten-Beschriftung sehen.
    p(-22, 140), // 7 äußere Kortikalis medial (10 cm)
    p(-10, 140), // 8 innere Kortikalis medial
    p(10, 140), // 9 innere Kortikalis lateral
    p(18, 140), // 10 äußere Kortikalis lateral
    p(-20, 40), // 11 innerer Kanalrand medial (Calcar-Ebene)
    p(20, 40), // 12 innerer Kanalrand lateral
  ]
}

describe('computeFemurProfileRaw — Referenz-Anatomie', () => {
  const r = computeFemurProfileRaw(referenzPunkte(), 1)!

  it('liefert ein Ergebnis ohne Warnungen', () => {
    expect(r).not.toBeNull()
    expect(r.warnings).toEqual([])
  })

  it('findet das Kopfzentrum und den Radius', () => {
    expect(r.headCenter[0]).toBeCloseTo(-64, 6)
    expect(r.headCenter[1]).toBeCloseTo(-40, 6)
    expect(r.headRadiusWorld).toBeCloseTo(24, 6)
  })

  it('berechnet die Beispielwerte aus dem Plan', () => {
    expect(r.femoralOffsetMm).toBeCloseTo(64, 6)
    expect(r.outerDiameter10cmMm).toBeCloseTo(40, 6)
    expect(r.canalDiameter10cmMm).toBeCloseTo(20, 6)
    expect(r.corticalIndex).toBeCloseTo(0.5, 6)
    expect(r.canalCalcarMm).toBeCloseTo(40, 6)
    expect(r.canalCalcarRatio).toBeCloseTo(0.5, 6)
    expect(r.femoralOffsetRatio).toBeCloseTo(1.6, 6)
  })

  it('ordnet die Kortikalisdicken der richtigen Seite zu', () => {
    // Asymmetrische Referenz: medial 12 mm, lateral 8 mm — eine
    // vertauschte Beschriftung würde hier sofort auffallen.
    expect(r.medialCortexMm).toBeCloseTo(12, 6)
    expect(r.lateralCortexMm).toBeCloseTo(8, 6)
  })

  it('misst den NSA und klassifiziert ihn', () => {
    expect(r.nsaDeg).toBeCloseTo(135, 4)
    expect(r.nsaClass).toBe('norma')
  })

  it('klassifiziert Dorr und CPAH aus denselben Werten', () => {
    // CI exakt 0,50 → Dorr B, per Definition in der B/C-Grenzzone.
    expect(r.dorr?.suggested).toBe('B')
    expect(r.dorr?.borderline).toBe('B/C')
    expect(r.cpah?.code).toBe('5H')
  })
})

describe('computeFemurProfileRaw — Kalibrierung', () => {
  it('skaliert Längen mit dem Faktor, Winkel und Ratios nicht', () => {
    const r = computeFemurProfileRaw(referenzPunkte(), 0.5)!
    expect(r.femoralOffsetMm).toBeCloseTo(32, 6)
    expect(r.outerDiameter10cmMm).toBeCloseTo(20, 6)
    expect(r.canalCalcarMm).toBeCloseTo(20, 6)
    // Ratios und Winkel sind kalibrierungsfrei — Kern der Dorr-Logik.
    expect(r.corticalIndex).toBeCloseTo(0.5, 6)
    expect(r.canalCalcarRatio).toBeCloseTo(0.5, 6)
    expect(r.femoralOffsetRatio).toBeCloseTo(1.6, 6)
    expect(r.nsaDeg).toBeCloseTo(135, 4)
    expect(r.cpah?.code).toBe('5H')
  })
})

describe('computeFemurProfileRaw — Robustheit der Punktsetzung', () => {
  it('liefert bei vertauschter Klickrichtung medial/lateral identische Breiten', () => {
    const pts = referenzPunkte()
    ;[pts[7], pts[10]] = [pts[10], pts[7]]
    ;[pts[8], pts[9]] = [pts[9], pts[8]]
    ;[pts[11], pts[12]] = [pts[12], pts[11]]
    const r = computeFemurProfileRaw(pts, 1)!
    // Alle BREITEN sind Absolutwerte — die Klickrichtung ist egal.
    expect(r.outerDiameter10cmMm).toBeCloseTo(40, 6)
    expect(r.canalDiameter10cmMm).toBeCloseTo(20, 6)
    expect(r.canalCalcarMm).toBeCloseTo(40, 6)
    // Die SEITEN-Beschriftung folgt dagegen den Punktrollen der geführten
    // Schritte: wer die laterale Kortikalis auf den „medial"-Schritt
    // klickt, bekommt sie als medial beschriftet. Aus reiner Geometrie
    // ist die Seite nicht erkennbar (das Bild kennt keine Körperseite) —
    // die Steps-Reihenfolge ist der Vertrag.
    expect(r.medialCortexMm).toBeCloseTo(8, 6)
    expect(r.lateralCortexMm).toBeCloseTo(12, 6)
  })

  it('ignoriert Versatz ENTLANG der Achse — Breiten sind Projektionen', () => {
    const pts = referenzPunkte()
    // 2 mm daneben (entlang der Achse) geklickt — Breite bleibt gleich.
    pts[7] = p(-22, 142)
    pts[9] = p(10, 138.5)
    const r = computeFemurProfileRaw(pts, 1)!
    expect(r.outerDiameter10cmMm).toBeCloseTo(40, 6)
    expect(r.canalDiameter10cmMm).toBeCloseTo(20, 6)
  })

  it('nutzt Punkt 6 (Trochanter minor) nicht für die Rechnung', () => {
    // Punkt 6 verankert nur die 10-cm-Hilfslinie im UI. Verschieben darf
    // KEINEN Messwert ändern — sonst wäre die Doku der Punktrollen falsch.
    const a = computeFemurProfileRaw(referenzPunkte(), 1)!
    const pts = referenzPunkte()
    pts[6] = p(3, 55)
    const b = computeFemurProfileRaw(pts, 1)!
    expect(b).toEqual(a)
  })

  it('wählt beim NSA die stumpfe Winkelvariante (wie das CCD-Rezept)', () => {
    const pts = referenzPunkte()
    // Halsmitte so, dass der rohe Winkel 45° beträgt → NSA 135°.
    pts[3] = p(-64 + 10 * Math.SQRT1_2, -40 + 10 * Math.SQRT1_2)
    const r = computeFemurProfileRaw(pts, 1)!
    expect(r.nsaDeg).toBeCloseTo(135, 4)
  })
})

describe('computeFemurProfileRaw — unvollständige und ungültige Eingaben', () => {
  it('liefert null bei fehlenden oder zu wenigen Punkten', () => {
    expect(computeFemurProfileRaw([], 1)).toBeNull()
    expect(computeFemurProfileRaw(referenzPunkte().slice(0, 12), 1)).toBeNull()
  })

  it('liefert null statt zu werfen bei nicht-endlichem Maßstab', () => {
    // Ohne endlichen Maßstab gibt es keinen Messrahmen — sonst passiert
    // z. B. CI = (Inf − Inf)/Inf = NaN den Plausibilitäts-Guard und die
    // NaN-Wache der Klassifizierer wirft mitten in der Berechnung.
    expect(computeFemurProfileRaw(referenzPunkte(), Number.POSITIVE_INFINITY)).toBeNull()
    expect(computeFemurProfileRaw(referenzPunkte(), Number.NaN)).toBeNull()
  })

  it('exportiert die erwartete Punktzahl als Konstante', () => {
    expect(FEMUR_PROFILE_POINT_COUNT).toBe(13)
    expect(referenzPunkte()).toHaveLength(FEMUR_PROFILE_POINT_COUNT)
  })

  it('liefert null statt zu werfen, wenn die Schaftachse keine Länge hat', () => {
    const pts = referenzPunkte()
    pts[5] = pts[4]
    expect(() => computeFemurProfileRaw(pts, 1)).not.toThrow()
    expect(computeFemurProfileRaw(pts, 1)).toBeNull()
  })

  it('warnt bei fast kollinearen Hüftkopfpunkten statt abzustürzen', () => {
    const pts = referenzPunkte()
    pts[0] = p(-40, -40)
    pts[1] = p(-64, -40)
    pts[2] = p(-88, -40)
    const r = computeFemurProfileRaw(pts, 1)!
    expect(r).not.toBeNull()
    expect(r.warnings.some((w) => w.includes('Hüftkopf'))).toBe(true)
  })

  it('unterdrückt die Klassifikation bei X > Z (Kanal breiter als außen)', () => {
    const pts = referenzPunkte()
    pts[8] = p(-30, 140)
    pts[9] = p(30, 140)
    const r = computeFemurProfileRaw(pts, 1)!
    // Rohwert bleibt sichtbar (auch wenn negativ) — aber KEINE Klasse:
    // eine scheinpräzise Dorr-Klasse aus Messfehlern wäre das Schlimmste.
    expect(r.corticalIndex).toBeCloseTo(-0.5, 6)
    expect(r.dorr).toBeNull()
    expect(r.cpah).toBeNull()
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('unterdrückt CI, FOR und Klassifikation bei Z = 0', () => {
    const pts = referenzPunkte()
    pts[7] = p(0, 140)
    pts[10] = p(0, 141)
    const r = computeFemurProfileRaw(pts, 1)!
    expect(r.corticalIndex).toBeNull()
    expect(r.femoralOffsetRatio).toBeNull()
    expect(r.dorr).toBeNull()
    expect(r.cpah).toBeNull()
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('unterdrückt die Klassifikation bei X = 0 (Kanal unsichtbar)', () => {
    const pts = referenzPunkte()
    pts[8] = p(0, 140)
    pts[9] = p(0, 140.5)
    const r = computeFemurProfileRaw(pts, 1)!
    // CI wäre exakt 1 → scheinpräzise „Dorr A" aus einem Klickfehler.
    expect(r.dorr).toBeNull()
    expect(r.cpah).toBeNull()
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('lässt bei Y = 0 nur die CCR weg, nicht die Klassifikation', () => {
    const pts = referenzPunkte()
    pts[11] = p(5, 40)
    pts[12] = p(5, 41)
    const r = computeFemurProfileRaw(pts, 1)!
    // CCR = X/Y braucht Y; Dorr/CPAH brauchen es NICHT (CI, NSA, FOR).
    expect(r.canalCalcarRatio).toBeNull()
    expect(r.dorr?.suggested).toBe('B')
    expect(r.cpah?.code).toBe('5H')
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('unterdrückt NSA und CPAH, wenn die Halsmitte (fast) im Kopfzentrum liegt', () => {
    // Nullvektor-Falle: sub(neckPt, center) = 0 → angleBetweenVectors
    // liefert den Sentinel 0 → Stumpf-Regel macht daraus still 180° →
    // „valga" → falscher CPAH-Code ohne jede Warnung. Genau der Punkt,
    // an dem stille Scheinpräzision klinisch am teuersten wäre.
    const exakt = referenzPunkte()
    exakt[3] = p(-64, -40) // exakt auf dem Kopfzentrum
    const rExakt = computeFemurProfileRaw(exakt, 1)!
    expect(rExakt.nsaDeg).toBeNull()
    expect(rExakt.nsaClass).toBeNull()
    expect(rExakt.cpah).toBeNull()
    expect(rExakt.warnings.some((w) => w.includes('NSA'))).toBe(true)
    // Dorr braucht den Hals NICHT (nur CI) — bleibt erhalten.
    expect(rExakt.dorr?.suggested).toBe('B')

    // Fast im Zentrum: die „Richtung" ist reines Klickrauschen.
    const nah = referenzPunkte()
    nah[3] = p(-63.7, -40.2)
    const rNah = computeFemurProfileRaw(nah, 1)!
    expect(rNah.nsaDeg).toBeNull()
    expect(rNah.cpah).toBeNull()
  })

  it('unterdrückt die Klassifikation, wenn nur EIN Seitenpaar vertauscht ist', () => {
    // Lateral vertauscht (9↔10): X = 28 < Z = 32 — der x>z-Check sieht
    // NICHTS, die Dorr-Klasse wäre still falsch. Die Ordnung
    // außen–innen–innen–außen entlarvt es.
    const pts = referenzPunkte()
    ;[pts[9], pts[10]] = [pts[10], pts[9]]
    const r = computeFemurProfileRaw(pts, 1)!
    expect(r.dorr).toBeNull()
    expect(r.cpah).toBeNull()
    expect(r.warnings.some((w) => w.includes('geordnet'))).toBe(true)
  })

  it('unterdrückt die Klassifikation, wenn ein innerer Punkt außerhalb der Kortikalis sitzt', () => {
    const pts = referenzPunkte()
    pts[8] = p(-25, 140) // innere Kortikalis medial AUSSERHALB der äußeren
    const r = computeFemurProfileRaw(pts, 1)!
    expect(r.dorr).toBeNull()
    expect(r.cpah).toBeNull()
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('unterdrückt die Klassifikation bei X = Z (Kortikalisdicke null)', () => {
    const pts = referenzPunkte()
    pts[8] = p(-22, 140)
    pts[9] = p(18, 140)
    const r = computeFemurProfileRaw(pts, 1)!
    // CI wäre exakt 0 → scheinpräzises „Dorr C" bei unsichtbarer Kortikalis.
    expect(r.dorr).toBeNull()
    expect(r.cpah).toBeNull()
  })
})
