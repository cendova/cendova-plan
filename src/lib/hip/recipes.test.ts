// Charakterisierungs-Tests der Hüft-Rezepte — Start mit dem Osteotomie-
// Planer (Debug-Befund H3: der Wert ist die Kalkar→Trochanter-minor-
// Distanz der GESTRICHELTEN Strecke; er wurde als Länge der roten
// Osteotomie-Linie fehlgelesen. Kalibrierung war korrekt.)
import { describe, expect, it } from 'vitest'
import { AVAILABLE_RECIPES, getRecipe } from './recipes'
import type { Types } from '@cornerstonejs/core'

const p = (x: number, y: number, z = 0): Types.Point3 => [x, y, z]

describe('osteotomy (Resektionshöhe → Trochanter minor)', () => {
  const recipe = getRecipe('osteotomy')!

  it('misst die Kalkar→TM-Distanz (gestrichelte Strecke), nicht die rote Linie', () => {
    // TM-Spitze im Ursprung; Kalkar-Ende 34.3 WU darüber; rote Linie 19.3 WU.
    const r = recipe.compute([p(0, 0), p(-19.3, -34.3), p(0, -34.3)], 1)
    expect(r.values[0].value).toBe('3,43 cm') // Screenshot-Reproduktion
    // Label trägt jetzt den Kontext „→ TM" und sitzt auf der Mess-Strecke.
    expect(r.geometry.labels[0].text).toBe('→ TM 3,43 cm')
    expect(r.geometry.labels[0].at).toEqual([0, -17.15, 0])
  })

  it('Wert hängt NICHT vom Start der roten Osteotomie-Linie ab', () => {
    const a = recipe.compute([p(0, 0), p(-19.3, -34.3), p(0, -34.3)], 1)
    const b = recipe.compute([p(0, 0), p(-99, -34.3), p(0, -34.3)], 1)
    expect(a.values[0].value).toBe(b.values[0].value)
  })

  it('wendet mmPerWorldUnit genau einmal an', () => {
    // dist(calcar (3,−4) → TM (0,0)) = 5 WU · factor 2 = 10 mm = 1,00 cm.
    const r = recipe.compute([p(0, 0), p(-5, -4), p(3, -4)], 2)
    expect(r.values[0].value).toBe('1,00 cm')
  })
})

// ----------------------------------------------------------------------
// Femurprofil: geführte 13-Punkt-Messung über die Geometrie-Engine.
// Referenz-Anatomie identisch zu femurProfile.test.ts (CI 0,50, CCR 0,50,
// FOR 1,60, NSA 135° → CPAH 5H; Kortikalis medial 12 / lateral 8 mm).
// ----------------------------------------------------------------------

/** Punkte 0–12 der Referenz-Anatomie (Kopie aus femurProfile.test.ts). */
function femurProfilPunkte(): Types.Point3[] {
  return [
    p(-40, -40),
    p(-64, -64),
    p(-88, -40),
    p(-64 + 10 * Math.SQRT1_2, -40 - 10 * Math.SQRT1_2),
    p(0, 0),
    p(0, 100),
    p(0, 40),
    p(-22, 140),
    p(-10, 140),
    p(10, 140),
    p(18, 140),
    p(-20, 40),
    p(20, 40),
  ]
}

describe('femurProfile (geführte 13-Punkt-Messung)', () => {
  const recipe = getRecipe('femurProfile')!

  it('ist registriert, kalibrierpflichtig und heißt Femurprofil', () => {
    expect(recipe).toBeDefined()
    expect(recipe.label).toBe('Femurprofil')
    expect(recipe.needsCalibration).toBe(true)
  })

  it('steht NICHT in AVAILABLE_RECIPES (eigene Sektion statt ToolButton)', () => {
    // Wie osteotomy: in der Registry, aber nicht in der Angebotsliste der
    // Mess-Sektion — sonst erschiene das Werkzeug doppelt.
    expect(AVAILABLE_RECIPES.some((r) => r.kind === 'femurProfile')).toBe(false)
    expect(AVAILABLE_RECIPES.some((r) => r.kind === 'osteotomy')).toBe(false)
    expect(AVAILABLE_RECIPES).toHaveLength(5)
  })

  it('hat exakt 13 Steps in der dokumentierten Reihenfolge', () => {
    expect(recipe.steps).toHaveLength(13)
    // Reihenfolge-Anker: Kopfkontur → Hals → Schaftachse → Troch. minor →
    // 4× Kortikalis bei 10 cm → 2× Kanalrand auf Calcar-Höhe.
    expect(recipe.steps[0]).toContain('Hüftkopfkontur')
    expect(recipe.steps[6]).toContain('Trochanter minor')
    expect(recipe.steps[7]).toContain('medial')
    expect(recipe.steps[10]).toContain('lateral')
    expect(recipe.steps[12]).toContain('lateral')
  })

  it('beginnt mit EXAKT den sechs CCD-Steps (Prefill-Vertrag für Task 10)', () => {
    // Das CCD-Prefill übernimmt Punkte 0–5 einer CCD-Messung. Das ist nur
    // korrekt, solange beide Rezepte dieselben ersten sechs Punktrollen in
    // derselben Reihenfolge haben — hier festgenagelt.
    const ccd = getRecipe('ccd')!
    expect(recipe.steps.slice(0, 6)).toEqual(ccd.steps)
  })

  it('liefert bei gültigen Punkten Dorr, CI, CCR, FO, FOR, NSA und CPAH', () => {
    const r = recipe.compute(femurProfilPunkte(), 1)
    const wert = (label: string) => r.values.find((v) => v.label === label)?.value
    expect(wert('Dorr-Vorschlag')).toBe('B (Grenzbereich B/C)')
    expect(wert('Cortical Index')).toBe('0,50')
    expect(wert('Canal-Calcar Ratio')).toBe('0,50')
    expect(wert('NSA (CCD)')).toBe('135.0°')
    expect(wert('Femorales Offset')).toBe('64.0 mm')
    expect(wert('Femoral Offset Ratio')).toBe('1,60')
    expect(wert('CPAH')).toBe('5H')
  })

  it('zeichnet Kopfkreis, Achsen, 10-cm-Linie, Breiten und Calcar-Linie', () => {
    const r = recipe.compute(femurProfilPunkte(), 1)
    expect(r.geometry.circles).toHaveLength(1)
    expect(r.geometry.circles[0].radius).toBeCloseTo(24, 6)
    // Halsachse, Schaftachse, 10-cm-Referenzlinie, äußere + innere
    // Femurbreite, Calcar-Breite → mindestens 6 Linien.
    expect(r.geometry.lines.length).toBeGreaterThanOrEqual(6)
    // GENAU EIN Label: der geteilte Renderer zeigt nur labels[0] — mehr
    // als eines wäre totes Artefakt (Vertrag aller Bestandsrezepte).
    expect(r.geometry.labels).toHaveLength(1)
    expect(r.geometry.labels[0].text).toContain('NSA')
  })

  it('lässt das Label weg, wenn der NSA nicht messbar ist', () => {
    // Sonst rückte ein anderes Label auf Position 0 nach und das
    // sichtbare Mess-Label wechselte still seine Bedeutung.
    const pts = femurProfilPunkte()
    pts[3] = p(-64, -40) // Halsmitte exakt im Kopfzentrum
    const r = recipe.compute(pts, 1)
    expect(r.geometry.labels).toEqual([])
    expect(r.values.some((v) => v.label.startsWith('⚠'))).toBe(true)
  })

  it('skaliert die 10-cm-Referenzlinie mit dem Kalibrierfaktor', () => {
    // Bei factor 2 (1 WU = 2 mm) liegen 10 cm nur 50 WU distal des
    // Trochanter minor (Fußpunkt y = 40) → Linie bei y = 90, nicht 140.
    const r = recipe.compute(femurProfilPunkte(), 2)
    const zehnCm = r.geometry.lines.find((l) => l.dashed && Math.abs(l.from[1] - 90) < 1e-6)
    expect(zehnCm).toBeDefined()
  })

  it('zeigt bei ungültiger Geometrie Warnzeilen statt zu werfen', () => {
    const pts = femurProfilPunkte()
    pts[8] = p(-30, 140) // Kanal breiter als außen (X > Z)
    pts[9] = p(30, 140)
    expect(() => recipe.compute(pts, 1)).not.toThrow()
    const r = recipe.compute(pts, 1)
    expect(r.values.some((v) => v.label.startsWith('⚠'))).toBe(true)
    const wert = (label: string) => r.values.find((v) => v.label === label)?.value
    expect(wert('Dorr-Vorschlag')).toBe('nicht zuverlässig bestimmbar')
    expect(wert('CPAH')).toBe('nicht zuverlässig bestimmbar')
  })

  it('misst identisch, wenn die Schaftachse verkehrt herum gesetzt wird', () => {
    // Die Achsrichtung darf KEINEN Messwert kippen: das Offset ist ein
    // Lot auf die unendliche Gerade, die Breiten sind Beträge, und der
    // NSA nimmt ohnehin die stumpfe Variante. Nur die gezeichnete
    // 10-cm-Linie dreht mit — und das sieht man sofort.
    const normal = recipe.compute(femurProfilPunkte(), 1)
    const pts = femurProfilPunkte()
    ;[pts[4], pts[5]] = [pts[5], pts[4]]
    const gedreht = recipe.compute(pts, 1)
    expect(gedreht.values).toEqual(normal.values)
  })

  it('wirft auch bei unvollständigen Punkten nicht', () => {
    expect(() => recipe.compute(femurProfilPunkte().slice(0, 7), 1)).not.toThrow()
    const r = recipe.compute(femurProfilPunkte().slice(0, 7), 1)
    expect(r.values.length).toBeGreaterThan(0)
    expect(r.geometry.lines).toEqual([])
  })
})

// ----------------------------------------------------------------------
// 10-cm-Hilfslinie WÄHREND der Platzierung (computeDraft).
// ----------------------------------------------------------------------

describe('femurProfile — 10-cm-Hilfslinie während der Platzierung', () => {
  const recipe = getRecipe('femurProfile')!
  /** Die erste gestrichelte Linie ist die Hilfslinie. */
  const hilfslinie = (g: { lines: { from: Types.Point3; to: Types.Point3; dashed?: boolean }[] }) =>
    g.lines.find((l) => l.dashed)

  it('ist als optionale Rezept-Fähigkeit definiert', () => {
    expect(typeof recipe.computeDraft).toBe('function')
  })

  it('lassen andere Rezepte unberührt — sie haben kein computeDraft', () => {
    // Rezepte ohne computeDraft rendern exakt wie bisher; Knie und
    // Schulter setzen den neuen Prop gar nicht erst.
    expect(getRecipe('ccd')!.computeDraft).toBeUndefined()
    expect(getRecipe('lld')!.computeDraft).toBeUndefined()
    expect(getRecipe('osteotomy')!.computeDraft).toBeUndefined()
  })

  it('zeigt vor dem Trochanter-minor-Punkt noch nichts', () => {
    // Erst mit Punkt 7 (Index 6) steht der Bezugspunkt fest.
    const g = recipe.computeDraft!(femurProfilPunkte().slice(0, 6), 1)
    expect(g.lines).toEqual([])
    expect(g.circles).toEqual([])
  })

  it('zeichnet ab Punkt 7 eine Linie 10 cm distal, senkrecht zur Achse', () => {
    const g = recipe.computeDraft!(femurProfilPunkte().slice(0, 7), 1)
    const l = hilfslinie(g)!
    expect(l).toBeDefined()
    // Achse vertikal, TM-Fußpunkt bei y = 40 → Linie bei y = 140.
    expect(l.from[1]).toBeCloseTo(140, 6)
    expect(l.to[1]).toBeCloseTo(140, 6)
    // Senkrecht zur Achse heißt hier: rein horizontal, symmetrisch um
    // die Achse. Welcher Endpunkt links liegt, ist bedeutungslos.
    expect(Math.min(l.from[0], l.to[0])).toBeCloseTo(-45, 6)
    expect(Math.max(l.from[0], l.to[0])).toBeCloseTo(45, 6)
  })

  it('skaliert den 10-cm-Abstand mit dem Kalibrierfaktor', () => {
    // factor 2 (1 WU = 2 mm) → 10 cm sind 50 WU → Linie bei y = 90.
    const g = recipe.computeDraft!(femurProfilPunkte().slice(0, 7), 2)
    expect(hilfslinie(g)!.from[1]).toBeCloseTo(90, 6)
  })

  it('steht auch auf einer SCHRÄGEN Schaftachse senkrecht', () => {
    const pts = femurProfilPunkte().slice(0, 7)
    // Achse 3-4-5-schräg: Richtung (0.6, 0.8); TM auf der Achse bei t=50.
    pts[4] = p(0, 0)
    pts[5] = p(60, 80)
    pts[6] = p(30, 40)
    const l = hilfslinie(recipe.computeDraft!(pts, 1))!
    const mitte: Types.Point3 = [
      (l.from[0] + l.to[0]) / 2,
      (l.from[1] + l.to[1]) / 2,
      0,
    ]
    // Mitte liegt 100 WU (= 10 cm) weiter distal als der TM-Fußpunkt (30,40).
    expect(Math.hypot(mitte[0] - 30, mitte[1] - 40)).toBeCloseTo(100, 6)
    // Skalarprodukt von Linienrichtung und Achsrichtung ist null.
    const lr = [l.to[0] - l.from[0], l.to[1] - l.from[1]]
    expect(lr[0] * 0.6 + lr[1] * 0.8).toBeCloseTo(0, 6)
  })

  it('zeigt OHNE Kalibrierung keine scheinbar metrische Linie', () => {
    // Kriterium ist `calibration != null` (hier: null), NICHT
    // `factor === 1` — bei DICOM-Pixelabstand ist 1 ein ECHTER Faktor.
    const g = recipe.computeDraft!(femurProfilPunkte().slice(0, 7), null)
    expect(g.lines).toEqual([])
  })

  it('zeichnet bei echtem Faktor 1 sehr wohl', () => {
    const g = recipe.computeDraft!(femurProfilPunkte().slice(0, 7), 1)
    expect(hilfslinie(g)).toBeDefined()
  })

  it('zeichnet nichts bei unbrauchbarem Faktor', () => {
    for (const f of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(recipe.computeDraft!(femurProfilPunkte().slice(0, 7), f).lines).toEqual([])
    }
  })

  it('zeichnet nichts ohne Achsrichtung', () => {
    const pts = femurProfilPunkte().slice(0, 7)
    pts[5] = pts[4]
    expect(recipe.computeDraft!(pts, 1).lines).toEqual([])
  })

  it('ist unabhängig davon, WO auf dem Trochanter minor geklickt wurde', () => {
    // Der Punkt liegt medial neben der Schaftachse; entscheidend ist nur
    // seine HÖHE. Deshalb wird auf die Achse gelotet — sonst wanderte die
    // Linie mit dem seitlichen Klick-Versatz.
    const pts = femurProfilPunkte().slice(0, 7)
    const a = recipe.computeDraft!(pts, 1)
    pts[6] = p(15, 40) // 15 mm weiter lateral, gleiche Höhe
    const b = recipe.computeDraft!(pts, 1)
    expect(b).toEqual(a)
  })

  it('kehrt sich um, wenn die Schaftachse verkehrt herum gesetzt wird', () => {
    // Dokumentiert eine bewusst NICHT abgefangene Fehlbedienung: proximal
    // und distal vertauscht schickt die Linie 10 cm nach kranial, also
    // sichtbar ins Becken. Das ist selbsterklärend falsch — anders als ein
    // stiller Zahlenfehler braucht es dafür keine Warnung.
    const pts = femurProfilPunkte().slice(0, 7)
    pts[4] = p(0, 100)
    pts[5] = p(0, 0)
    const l = hilfslinie(recipe.computeDraft!(pts, 1))!
    expect(l.from[1]).toBeCloseTo(-60, 6)
  })

  it('liegt exakt dort, wo die fertige Messung ihre Linie zeichnet', () => {
    // Der springende Punkt: Der Nutzer setzt die Kortikalis-Punkte AUF
    // die Hilfslinie. Läge die fertige Linie woanders, wäre die Führung
    // eine Lüge — beide kommen deshalb aus derselben Funktion.
    const draft = hilfslinie(recipe.computeDraft!(femurProfilPunkte().slice(0, 7), 1))!
    const fertig = recipe
      .compute(femurProfilPunkte(), 1)
      .geometry.lines.find((l) => l.dashed && l.color === '#94a3b8')!
    const mitte = (l: { from: Types.Point3; to: Types.Point3 }) => [
      (l.from[0] + l.to[0]) / 2,
      (l.from[1] + l.to[1]) / 2,
    ]
    expect(mitte(draft)[0]).toBeCloseTo(mitte(fertig)[0], 6)
    expect(mitte(draft)[1]).toBeCloseTo(mitte(fertig)[1], 6)
  })
})
