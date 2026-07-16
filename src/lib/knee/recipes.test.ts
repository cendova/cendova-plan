// Charakterisierungs-Tests (R0): Knie-Vollvermessung (17-Punkt-Workflow).
// Fixture „gerades Bein" mit handverifizierbarer Geometrie + Varus-Variante.
// Friert zusätzlich die Übereinstimmung der ZWEI parallelen Rechen-Engines
// ein (Audit-Befund D1: workflow.compute vs computeWorkflowRaw) — bis R2
// sie vereinigt, wacht dieser Test über Drift.
import { describe, expect, it } from 'vitest'
import { computeWorkflowRaw, getKneeRecipe } from './recipes'
import type { Types } from '@cornerstonejs/core'

type P = Types.Point3
const p = (x: number, y: number): P => [x, y, 0]

/** 17-Punkt-Fixture. Bild-Konvention: y wächst nach distal (unten).
 *  Reihenfolge exakt wie im Workflow-Rezept destrukturiert. */
function fixture(overrides: Partial<Record<'ankle', P>> = {}): P[] {
  const ankle = overrides.ankle ?? p(100, 900)
  return [
    // 0–2: Hüftkopf-Kontur → Kreis um (100,100), r=20
    p(80, 100), p(100, 80), p(120, 100),
    // 3–6: Femur-Schaft prox/dist (medial+lateral) → Achse x=100
    p(95, 200), p(105, 200), p(95, 400), p(105, 400),
    // 7–8: LDFA-Tangente (horizontal durchs Knie)
    p(60, 500), p(140, 500),
    // 9–10: MPTA-Tangente (horizontal, 10 darunter)
    p(60, 510), p(140, 510),
    // 11: anatomisches Kniezentrum
    p(100, 500),
    // 12–15: Tibia-Schaft prox/dist → Achse x=100
    p(95, 600), p(105, 600), p(95, 800), p(105, 800),
    // 16: Sprunggelenkmitte
    ankle,
  ]
}

describe('computeWorkflowRaw — gerades Bein', () => {
  const raw = computeWorkflowRaw(fixture(), 1)!
  it('liefert mHKA 180 / Abweichung 0 / Mikulicz 0', () => {
    expect(raw.mHKA).toBeCloseTo(180, 4)
    expect(raw.deviationFrom180).toBeCloseTo(0, 4)
    expect(raw.mikuliczMm).toBeCloseTo(0, 4)
  })
  it('liefert mLDFA = mMPTA = 90 und JLCA = 0', () => {
    expect(raw.mLDFA).toBeCloseTo(90, 4)
    expect(raw.mMPTA).toBeCloseTo(90, 4)
    expect(raw.JLCA).toBeCloseTo(0, 4)
  })
  it('β-Winkel (Femur-AMA) = 0 bei deckungsgleicher anatomischer/mechanischer Achse', () => {
    expect(raw.betaAngle).toBeCloseTo(0, 4)
  })
  it('braucht 17 Punkte', () => {
    expect(computeWorkflowRaw(fixture().slice(0, 16), 1)).toBeNull()
  })
  it('R2: liefert aHKA und die Geometrie-Primitiven (einzige Rechen-Engine)', () => {
    expect(raw.aHKA).toBeCloseTo(raw.mMPTA - raw.mLDFA, 10)
    expect(raw.hip[0]).toBeCloseTo(100, 5)
    expect(raw.hip[1]).toBeCloseTo(100, 5)
    expect(raw.hipRadius).toBeCloseTo(20, 5)
    expect(raw.kneeFemMid).toEqual([100, 500, 0])
    expect(raw.kneeTibMid).toEqual([100, 510, 0])
    expect(raw.femAnatProx).toEqual([100, 200, 0])
    expect(raw.tibAnatDist).toEqual([100, 800, 0])
    expect(raw.hipDegenerate).toBeUndefined()
  })
  it('R2: hipDegenerate wandert in die Raw-Werte (Befund D15)', () => {
    const pts = fixture()
    pts[1] = p(100, 100) // Kopfkontur platt
    expect(computeWorkflowRaw(pts, 1)!.hipDegenerate).toBe(true)
  })
})

describe('computeWorkflowRaw — Sprunggelenk 40 lateralisiert = VALGUS-Konfiguration', () => {
  // Knie liegt MEDIAL der Traglinie Hüfte→Sprunggelenk → Valgus. Die
  // Tibia-Mechanik (100,510) → (140,900) kippt 5.86° gegen vertikal;
  // signiertes mMPTA ÖFFNET medial → > 90 (K3-Fix: die frühere
  // Spitzwinkel-Faltung meldete hier 84.14 und damit fälschlich Varus).
  const raw = computeWorkflowRaw(fixture({ ankle: p(140, 900) }), 1)!
  it('mMPTA signiert > 90 (95.86), mLDFA bleibt 90 → aHKA +5.86 = Valgus', () => {
    expect(raw.mMPTA).toBeCloseTo(95.86, 1)
    expect(raw.mLDFA).toBeCloseTo(90, 4)
    expect(raw.aHKA).toBeCloseTo(5.86, 1)
  })
  it('mHKA < 180 mit passender Abweichung', () => {
    // mHKA am Kniezentrum (100,500): vAnkle = (40,400) → atan(40/400) = 5.71°.
    expect(raw.mHKA).toBeCloseTo(174.29, 1)
    expect(raw.deviationFrom180).toBeCloseTo(5.71, 1)
  })
})

describe('computeWorkflowRaw — Sprunggelenk 40 medialisiert = VARUS-Konfiguration', () => {
  const raw = computeWorkflowRaw(fixture({ ankle: p(60, 900) }), 1)!
  it('mMPTA signiert < 90 (84.14) → aHKA −5.86 = Varus', () => {
    expect(raw.mMPTA).toBeCloseTo(84.14, 1)
    expect(raw.aHKA).toBeCloseTo(-5.86, 1)
  })
})

describe('workflow.compute (String-Engine) — Konsistenz mit Raw (Befund D1)', () => {
  const recipe = getKneeRecipe('workflow')!
  const num = (s: string) => parseFloat(s.replace(',', '.'))

  it('gerades Bein: gleiche Zahlen in beiden Engines', () => {
    const pts = fixture()
    const raw = computeWorkflowRaw(pts, 1)!
    const out = recipe.compute(pts, 1)
    const byLabel = (l: string) => out.values.find((v) => v.label === l)!.value
    expect(num(byLabel('mHKA'))).toBeCloseTo(raw.mHKA, 1)
    expect(num(byLabel('mLDFA'))).toBeCloseTo(raw.mLDFA, 1)
    expect(num(byLabel('mMPTA'))).toBeCloseTo(raw.mMPTA, 1)
    expect(num(byLabel('JLCA'))).toBeCloseTo(raw.JLCA, 1)
  })

  it('Ausrichtungs-Label: klarer Varus (medialisiertes Sprunggelenk) → „Varus"', () => {
    const out = recipe.compute(fixture({ ankle: p(60, 900) }), 1)
    const labels = out.values.map((v) => v.label)
    expect(labels).toContain('Varus')
  })

  it('Ausrichtungs-Label: klarer Valgus (lateralisiertes Sprunggelenk) → „Valgus" (K3-Fix)', () => {
    const out = recipe.compute(fixture({ ankle: p(140, 900) }), 1)
    const labels = out.values.map((v) => v.label)
    expect(labels).toContain('Valgus')
  })

  it('±2°-Schwelle: mHKA-Abweichung ≈ 1° ist „Neutral"', () => {
    // Sprunggelenk 7 lateral → mHKA-Abweichung ≈ 1.0° (innerhalb ±2°).
    // Historie: vor R1 labelte die Werteliste ab ±0.5°; seit R1 gilt die
    // MacDessi-Schwelle ±2°, seit dem Klinik-Report auf der SIGNIERTEN
    // mHKA-Abweichung statt dem aHKA (der ist um den JLCA versetzt).
    const out = recipe.compute(fixture({ ankle: p(107, 900) }), 1)
    const labels = out.values.map((v) => v.label)
    expect(labels).toContain('Neutral')
    expect(labels).not.toContain('Varus')
    expect(labels).not.toContain('Valgus')
  })

  it('R1 (Befund D15 behoben): kollineare Hüftkopf-Punkte erzeugen eine Warnzeile', () => {
    const pts = fixture()
    // Kopfkontur platt drücken: alle drei Punkte auf y=100.
    pts[1] = p(100, 100)
    const out = recipe.compute(pts, 1)
    const warn = out.values.find((v) => v.label.startsWith('⚠'))
    expect(warn).toBeTruthy()
    expect(warn!.value).toMatch(/kollinear/)
  })
})

describe('computeWorkflowRaw — Achsenrichtung Femur (Mac-Report 3, Fund 2)', () => {
  // KLINISCHE KERNPROBE: mLDFA/mMPTA messen gegen die mech. Achse, die vom
  // Gelenk WEG in die Diaphyse zeigt (Femur → Hüfte, Tibia → Sprunggelenk).
  // Vorher nahm der Femur die Achse Richtung Knie → SUPPLEMENTWINKEL (am
  // Nutzer-Bild 96,2° statt ~83,8°; Beweis: nur so passen aHKA/JLCA/mHKA
  // zusammen). Die Tibia war schon korrekt (mMPTA stimmte durchgängig).
  //
  // „Normal-/Valgus-Femur": laterale Kondyle etwas PROXIMALER als mediale
  // → mLDFA < 90 (physiologischer Bereich ~85–88°). Der prox. Schaft liegt
  // lateral (+x) des Hüftkopfes (Anker).
  function valgusFemurFixture(): P[] {
    return [
      p(80, 100), p(100, 80), p(120, 100), // Hüftkopf → (100,100)
      p(125, 200), p(135, 200), p(105, 400), p(115, 400), // Schaft lateral +x
      // LDFA-Tangente: medial (60,504) DISTALER, lateral (140,496) proximaler
      p(60, 504), p(140, 496),
      p(60, 510), p(140, 510), // MPTA horizontal → 90
      p(100, 500),
      p(95, 600), p(105, 600), p(95, 800), p(105, 800),
      p(100, 900),
    ]
  }

  it('Valgus-Femur → mLDFA < 90 (≈84,3), NICHT der Supplement 95,7', () => {
    const raw = computeWorkflowRaw(valgusFemurFixture(), 1)!
    expect(raw.mLDFA).toBeLessThan(90)
    expect(raw.mLDFA).toBeCloseTo(84.29, 1)
    expect(raw.mMPTA).toBeCloseTo(90, 4)
    // aHKA = mMPTA − mLDFA > 0 (Valgus), nicht < 0.
    expect(raw.aHKA).toBeCloseTo(5.71, 1)
  })

  it('vertauschte Femur-Tangentenpunkte ändern mLDFA nicht (Anker greift)', () => {
    const pts = valgusFemurFixture()
    ;[pts[7], pts[8]] = [pts[8], pts[7]]
    expect(computeWorkflowRaw(pts, 1)!.mLDFA).toBeCloseTo(84.29, 1)
  })

  it('gilt gespiegelt (linkes Bein, x→200−x): weiterhin ≈84,3 (<90)', () => {
    const pts = valgusFemurFixture().map((q) => p(200 - q[0], q[1]))
    expect(computeWorkflowRaw(pts, 1)!.mLDFA).toBeCloseTo(84.29, 1)
  })
})

describe('computeWorkflowRaw — mHKA-Label aus der mHKA-Abweichung (Klinik-Report)', () => {
  // Nutzer-Report (Klinikrechner): mHKA 176° (4° Abweichung) wurde als
  // „Neutral" gelabelt, weil das Label vom aHKA kam — der ist um den JLCA
  // versetzt (beobachtete Neutral-Spanne ~6–7° Varus bis 2–3° Valgus).
  // Klinische Festlegung: Label aus der SIGNIERTEN mHKA-Abweichung, ±2°
  // wie MacDessi. Richtung anatomisch: Kniezentrum lateral der Traglinie
  // = Varus (über den Lateral-Anker seitenunabhängig).
  //
  // Fixture = Diskrepanz-Fall wie das Nutzer-Knie: Valgus-Femur (mLDFA
  // 84,3) + varische Tibia-Mechanik → aHKA ≈ +1,6 („neutral"e Knochen),
  // aber Traglinie 4° varisch (Sprunggelenk 28 nach medial).
  function discrepancyFixture(ankleX: number): P[] {
    return [
      p(80, 100), p(100, 80), p(120, 100), // Hüftkopf → (100,100)
      p(125, 200), p(135, 200), p(105, 400), p(115, 400), // Schaft lateral +x
      p(60, 504), p(140, 496), // LDFA-Tangente: Valgus-Femur → 84.29
      p(60, 510), p(140, 510), // MPTA-Tangente horizontal
      p(100, 500),
      p(95, 600), p(105, 600), p(95, 800), p(105, 800),
      p(ankleX, 900),
    ]
  }

  it('4° Varus-Traglinie bei neutralem aHKA → Label „Varus" (nicht „Neutral")', () => {
    const pts = discrepancyFixture(72) // Sprunggelenk 28 medial → dev ≈ 4.0°
    const raw = computeWorkflowRaw(pts, 1)!
    expect(raw.deviationFrom180).toBeCloseTo(4.0, 1)
    expect(raw.hkaDeviationSigned).toBeCloseTo(-4.0, 1) // negativ = Varus
    expect(raw.aHKA).toBeCloseTo(1.6, 1) // aHKA wäre „Neutral" — Diskrepanz
    const out = getKneeRecipe('workflow')!.compute(pts, 1)
    const labels = out.values.map((v) => v.label)
    expect(labels).toContain('Varus')
    expect(labels).not.toContain('Neutral')
  })

  it('Gegenseite: 4° Valgus-Traglinie → „Valgus", Vorzeichen positiv', () => {
    const raw = computeWorkflowRaw(discrepancyFixture(128), 1)!
    expect(raw.hkaDeviationSigned).toBeCloseTo(4.0, 1)
    const out = getKneeRecipe('workflow')!.compute(discrepancyFixture(128), 1)
    expect(out.values.map((v) => v.label)).toContain('Valgus')
  })

  it('±2°-Fenster gilt auf der mHKA-Abweichung: 1,4° → „Neutral" trotz aHKA +7', () => {
    const pts = discrepancyFixture(110) // dev ≈ 1.43° — innerhalb ±2°
    const raw = computeWorkflowRaw(pts, 1)!
    expect(Math.abs(raw.hkaDeviationSigned)).toBeLessThan(2)
    expect(raw.aHKA).toBeGreaterThan(2) // aHKA hätte „Valgus" gesagt
    const out = getKneeRecipe('workflow')!.compute(pts, 1)
    expect(out.values.map((v) => v.label)).toContain('Neutral')
  })
})

describe('computeWorkflowRaw — TRANSVERSALER Anker bei fast senkrechtem Schaft (Mac-Report 3)', () => {
  // Der Schaftversatz (Hüftkopf → prox. Schaft) ist FAST SENKRECHT (kleiner
  // x-, großer y-Anteil) — als roher Anker steht er fast im rechten Winkel
  // zur waagerechten Tangente (|cos|<0.15) und würde verworfen. Die
  // TRANSVERSALE Ankerkomponente steht ~parallel zur Tangente und greift.
  //
  // „Varus-Femur": laterale Kondyle etwas DISTALER → mLDFA > 90. Die
  // Femur-Tangentenpunkte sind zusätzlich VERTAUSCHT geklickt (Anker muss
  // trotzdem die richtige Seite liefern), die der Tibia nicht.
  function nearVerticalShaftFixture(): P[] {
    return [
      p(80, 100), p(100, 80), p(120, 100), // Hüftkopf → (100,100)
      p(110, 360), p(130, 360), // prox. Schaft tief, Mitte (120,360), lateral +x
      p(105, 470), p(115, 470), // dist. Schaft
      // LDFA-Tangente VERTAUSCHT geklickt: „medial" auf lateraler Position
      // (140,501, distaler), „lateral" auf medialer (60,499).
      p(140, 501), p(60, 499),
      p(60, 510), p(140, 510), // MPTA korrekt
      p(100, 500),
      p(95, 600), p(105, 600), p(95, 800), p(105, 800),
      p(100, 900),
    ]
  }

  it('Varus-Femur → mLDFA > 90 (≈91,4) trotz vertauschter Punkte, mMPTA bleibt 90', () => {
    const raw = computeWorkflowRaw(nearVerticalShaftFixture(), 1)!
    expect(raw.mLDFA).toBeGreaterThan(90)
    expect(raw.mLDFA).toBeCloseTo(91.43, 1)
    expect(raw.mMPTA).toBeCloseTo(90, 1)
  })
})
