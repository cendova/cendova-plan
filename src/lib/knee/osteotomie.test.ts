// Charakterisierungs-Tests der Umstellungsosteotomie (Rechenkern).
// Fixtures in mm (Maßstab 1), Bild-Konvention: y wächst nach distal,
// lateral = +x (der Femurschaft liegt lateral der mechanischen Achse und
// verankert damit die Seite).
import { describe, expect, it } from 'vitest'
import type { Types } from '@cornerstonejs/core'
import { computeWorkflowRaw } from './recipes'
import {
  loeseWinkel,
  planeOsteotomie,
  rotiere,
  scharnierHinweis,
  simulierePunkte,
  type OsteotomieEingabe,
  type OsteotomieErgebnis,
} from './osteotomie'

type P = Types.Point3
const p = (x: number, y: number): P => [x, y, 0]

/** Varusbein: Femur gerade (mLDFA 90), Tibia vara (mMPTA ≈ 84,9°),
 *  Traglinie bei ≈ 26 % der Plateaubreite. */
function varusBein(opt: { ldfaMed?: P; ldfaLat?: P } = {}): P[] {
  const sg = p(-35, 820)
  const tibAchse = (y: number) => (-35 * (y - 428)) / 392
  return [
    p(-24, 0), p(0, -24), p(24, 0),
    p(33, 150), p(57, 150), p(3, 330), p(27, 330),
    opt.ldfaMed ?? p(-38, 420), opt.ldfaLat ?? p(38, 420),
    p(-38, 428), p(38, 428),
    p(0, 424),
    p(tibAchse(550) - 12, 550), p(tibAchse(550) + 12, 550),
    p(tibAchse(750) - 10, 750), p(tibAchse(750) + 10, 750),
    sg,
  ]
}

/** Valgusbein: Femur valgisch (Kniezentrum medial, mLDFA ≈ 84,6°),
 *  Tibia senkrecht zum waagerechten Plateau (mMPTA 90°). */
function valgusBein(): P[] {
  return [
    p(-24, 0), p(0, -24), p(24, 0),
    p(8, 150), p(32, 150), p(-27, 330), p(-3, 330),
    p(-78, 420), p(-2, 420),
    p(-78, 428), p(-2, 428),
    p(-40, 424),
    p(-52, 550), p(-28, 550), p(-50, 750), p(-30, 750),
    p(-40, 820),
  ]
}

const HTO_SCHNITT = { scharnier: p(30, 445), start: p(-36, 470) }

function eingabe(over: Partial<OsteotomieEingabe> = {}): OsteotomieEingabe {
  return {
    punkte: varusBein(),
    mmPerWorldUnit: 1,
    typ: 'htoOeffnend',
    zielWblProzent: 62.5,
    dloZielLdfa: 88,
    femur: null,
    tibia: HTO_SCHNITT,
    deltaJlca: null,
    ...over,
  }
}

function ok(e: OsteotomieEingabe): OsteotomieErgebnis {
  const r = planeOsteotomie(e)
  if (!r.ok) throw new Error(r.fehler)
  return r
}

describe('Grundbausteine', () => {
  it('rotiere dreht mathematisch positiv um das Zentrum', () => {
    const q = rotiere(p(10, 0), p(0, 0), 90)
    expect(q[0]).toBeCloseTo(0, 10)
    expect(q[1]).toBeCloseTo(10, 10)
  })
  it('loeseWinkel findet die Nullstelle nächst 0°', () => {
    expect(loeseWinkel((g) => g - 12.3)).toBeCloseTo(12.3, 8)
    expect(loeseWinkel((g) => (g - 30) * (g + 5))).toBeCloseTo(-5, 8)
    expect(loeseWinkel(() => 1)).toBeNull()
  })
  it('simulierePunkte dreht nur die Punkte distal des Schnitts', () => {
    const pts = varusBein()
    const { punkte } = simulierePunkte(pts, [{ schnitt: HTO_SCHNITT, grad: 10 }])
    // Hüfte, Femur, Tangenten, Kniezentrum (0–11) bleiben stehen …
    for (let i = 0; i <= 11; i++) expect(punkte[i]).toEqual(pts[i])
    // … Tibiaschaft und Sprunggelenk wandern.
    for (let i = 12; i <= 16; i++) expect(punkte[i]).not.toEqual(pts[i])
  })
})

describe('HTO öffnend (Miniaci)', () => {
  const r = ok(eingabe())
  const vorher = computeWorkflowRaw(varusBein(), 1)!

  it('Ausgangslage: Varus, Traglinie medial', () => {
    expect(vorher.wblProzent!).toBeCloseTo(25.96, 1)
    expect(vorher.mMPTA).toBeCloseTo(84.9, 1)
  })
  it('trifft den Zielpunkt der Traglinie exakt', () => {
    expect(r.nachher.wblProzent!).toBeCloseTo(62.5, 6)
  })
  it('Miniaci-Äquivalenz: gleicher Winkel wie die klassische Kreis-Geraden-Konstruktion', () => {
    const [pm, pl] = [vorher.plateauMedial, vorher.plateauLateral]
    const ziel = p(pm[0] + 0.625 * (pl[0] - pm[0]), pm[1] + 0.625 * (pl[1] - pm[1]))
    const h = HTO_SCHNITT.scharnier
    const a = varusBein()[16]
    const radius = Math.hypot(a[0] - h[0], a[1] - h[1])
    // Punkt auf der Geraden Hüfte→Ziel (distal des Ziels) mit Abstand radius zum Scharnier.
    const hip = vorher.hip
    const dx = ziel[0] - hip[0]
    const dy = ziel[1] - hip[1]
    const fx = hip[0] - h[0]
    const fy = hip[1] - h[1]
    const A = dx * dx + dy * dy
    const B = 2 * (fx * dx + fy * dy)
    const C = fx * fx + fy * fy - radius * radius
    const t = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A)
    const aNeu = p(hip[0] + t * dx, hip[1] + t * dy)
    const w1 = Math.atan2(a[1] - h[1], a[0] - h[0])
    const w2 = Math.atan2(aNeu[1] - h[1], aNeu[0] - h[0])
    const miniaci = Math.abs(((w2 - w1) * 180) / Math.PI)
    expect(Math.abs(r.schnitte[0].grad)).toBeCloseTo(miniaci, 6)
  })
  it('Femur und Gelenkflächen bleiben unberührt (mLDFA, JLCA exakt gleich)', () => {
    expect(r.nachher.mLDFA).toBeCloseTo(vorher.mLDFA, 10)
    expect(r.nachher.JLCA).toBeCloseTo(vorher.JLCA, 10)
  })
  it('mMPTA steigt um ungefähr den Korrekturwinkel', () => {
    const delta = r.nachher.mMPTA - vorher.mMPTA
    expect(Math.abs(delta - Math.abs(r.schnitte[0].grad))).toBeLessThan(1)
  })
  it('öffnender Keil; Keilhöhe = Sehne 2·L·sin(α/2)', () => {
    const s = r.schnitte[0]
    expect(s.keil).toBe('oeffnend')
    const erwartet = 2 * s.schnittlaengeMm * Math.sin((Math.abs(s.grad) * Math.PI) / 360)
    expect(s.keilhoeheMm).toBeCloseTo(erwartet, 8)
  })
  it('Aufrichtung des Varusbeins verlängert es', () => {
    expect(r.beinlaengeDeltaMm).toBeGreaterThan(0)
    expect(r.richtung).toBe('valgisierend')
  })
  it('ein Fragment für die Bildsimulation, oben exakt auf der Schnittlinie', () => {
    expect(r.fragmente).toHaveLength(1)
    const f = r.fragmente[0]
    expect(f.luecke).toEqual(f.quelle)
    // Scharnier liegt auf der Oberkante des Polygons und bleibt bei der
    // Drehung stehen → Abstand Oberkante-Scharnier bleibt 0.
    const [p1, p2] = f.quelle
    const kreuz =
      (p2[0] - p1[0]) * (HTO_SCHNITT.scharnier[1] - p1[1]) -
      (p2[1] - p1[1]) * (HTO_SCHNITT.scharnier[0] - p1[0])
    expect(Math.abs(kreuz)).toBeLessThan(1e-6)
  })
})

describe('Laxitätskorrektur nach Ryu (⅓ ΔJLCA)', () => {
  it('verringert die knöcherne Korrektur um ΔJLCA/3', () => {
    const ohne = ok(eingabe())
    const mit = ok(eingabe({ deltaJlca: 6 }))
    expect(Math.abs(mit.schnitte[0].grad)).toBeCloseTo(Math.abs(ohne.schnitte[0].grad) - 2, 6)
    expect(mit.jlcaKorrekturGrad).toBeCloseTo(2, 10)
    expect(mit.zielWinkelOhneKorrektur).toBeCloseTo(Math.abs(ohne.schnitte[0].grad), 6)
    expect(mit.nachher.wblProzent!).toBeLessThan(62.5)
    expect(mit.hinweise.map((h) => h.code)).toContain('JLCA_KORREKTUR')
  })
  it('wirkt nur bei der öffnenden HTO', () => {
    const r = ok(eingabe({ typ: 'htoSchliessend', deltaJlca: 6 }))
    expect(r.jlcaKorrekturGrad).toBe(0)
  })
})

describe('Plausibilitäts-Hinweise', () => {
  it('Keilart passt nicht zum Typ → Warnung', () => {
    const r = ok(eingabe({ typ: 'htoSchliessend' }))
    expect(r.schnitte[0].keil).toBe('oeffnend')
    expect(r.hinweise.map((h) => h.code)).toContain('KEIL_WIDERSPRUCH')
  })
  it('Tibia-Schnitt oberhalb des Plateaus → Warnung zur Schnittlage', () => {
    const r = planeOsteotomie(eingabe({ tibia: { scharnier: p(30, 400), start: p(-36, 410) } }))
    if (r.ok) expect(r.hinweise.map((h) => h.code)).toContain('SCHNITT_LAGE')
  })
  it('große Korrektur mit mMPTA > 95° → Warnung, DLO erwägen', () => {
    const r = ok(eingabe({ zielWblProzent: 95 }))
    expect(r.nachher.mMPTA).toBeGreaterThan(95)
    const w = r.hinweise.find((h) => h.code === 'MPTA_UEBER_95')!
    expect(w.severity).toBe('warning')
    expect(w.text).toContain('Doppel-Level')
  })
  it('unerreichbares Ziel → Fehler statt Scheinergebnis', () => {
    const r = planeOsteotomie(eingabe({ zielWblProzent: 900 }))
    expect(r.ok).toBe(false)
  })
  it('fehlende Punkte → Fehler mit Handlungsanweisung', () => {
    const r = planeOsteotomie(eingabe({ tibia: null }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toContain('Scharnier und Startpunkt setzen')
  })
  it('hält die Sprachregel — keine Empfehlungs- oder Verbotsvokabel', () => {
    for (const e of [
      eingabe({ zielWblProzent: 95 }),
      eingabe({ typ: 'htoSchliessend' }),
      eingabe({ deltaJlca: 6 }),
    ]) {
      const r = planeOsteotomie(e)
      if (!r.ok) continue
      for (const h of r.hinweise)
        expect(h.text).not.toMatch(/empfohlen|Empfehlung|kontraindiziert|verwenden/i)
    }
  })
})

describe('DFO (Valgusbein, Femur)', () => {
  const vorher = computeWorkflowRaw(valgusBein(), 1)!
  const r = ok(
    eingabe({
      punkte: valgusBein(),
      typ: 'dfoSchliessend',
      zielWblProzent: 50,
      tibia: null,
      femur: { scharnier: p(-8, 385), start: p(-70, 380) },
    }),
  )
  it('Ausgangslage: Valgus mit erniedrigtem mLDFA', () => {
    expect(vorher.mLDFA).toBeLessThan(85)
    expect(vorher.wblProzent!).toBeGreaterThan(50)
  })
  it('trifft das Ziel; Tibia und Gelenkflächen bewegen sich starr mit', () => {
    expect(r.nachher.wblProzent!).toBeCloseTo(50, 6)
    expect(r.nachher.mMPTA).toBeCloseTo(vorher.mMPTA, 8)
    expect(r.nachher.JLCA).toBeCloseTo(vorher.JLCA, 8)
    expect(r.nachher.mLDFA).toBeGreaterThan(vorher.mLDFA)
    expect(r.richtung).toBe('varisierend')
  })
  it('medial schließende DFO: Scharnier lateral ergibt den erwarteten Keil', () => {
    expect(r.schnitte[0].keil).toBe('schliessend')
    expect(r.hinweise.map((h) => h.code)).not.toContain('KEIL_WIDERSPRUCH')
    expect(r.hinweise.map((h) => h.code)).not.toContain('SCHNITT_LAGE')
  })
})

describe('Doppel-Level-Osteotomie', () => {
  // Varus femoral (mLDFA ≈ 94,5°) UND tibial.
  const punkte = varusBein({ ldfaMed: p(-38, 417), ldfaLat: p(38, 423) })
  const r = ok(
    eingabe({
      punkte,
      typ: 'dlo',
      femur: { scharnier: p(-30, 385), start: p(32, 375) },
      tibia: HTO_SCHNITT,
    }),
  )
  it('Femur auf Ziel-mLDFA, Tibia auf Ziel-Traglinie', () => {
    expect(computeWorkflowRaw(punkte, 1)!.mLDFA).toBeGreaterThan(90)
    expect(r.nachher.mLDFA).toBeCloseTo(88, 6)
    expect(r.nachher.wblProzent!).toBeCloseTo(62.5, 6)
  })
  it('schließende DFO + öffnende HTO passen zum Typ (kein Widerspruch)', () => {
    expect(r.schnitte.map((s) => s.knochen)).toEqual(['Femur', 'Tibia'])
    expect(r.schnitte[0].keil).toBe('schliessend')
    expect(r.schnitte[1].keil).toBe('oeffnend')
    expect(r.hinweise.map((h) => h.code)).not.toContain('KEIL_WIDERSPRUCH')
  })
  it('zwei Fragmente; die Tibia-Lücke liegt dort, wohin das Femur-Fragment sie getragen hat', () => {
    expect(r.fragmente).toHaveLength(2)
    expect(r.fragmente[1].luecke).not.toEqual(r.fragmente[1].quelle)
  })
})

describe('scharnierHinweis', () => {
  it('öffnende valgisierende HTO → ESSKA-Lage lateral am Tibiofibulargelenk', () => {
    expect(scharnierHinweis('Tibia', 'oeffnend', 'valgisierend')).toContain('Tibiofibulargelenks')
  })
  it('schließende valgisierende DFO → medial oberhalb der Kondyle (ESSKA)', () => {
    expect(scharnierHinweis('Femur', 'schliessend', 'valgisierend')).toContain(
      'medialen Femurkondyle',
    )
  })
  it('öffnende varisierende DFO → Scharnier medial', () => {
    expect(scharnierHinweis('Femur', 'oeffnend', 'varisierend')).toMatch(/^Scharnier medial/)
  })
})
