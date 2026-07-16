// Charakterisierungs-Tests (R0): Implantat-Winkel & geplante CPAK.
// Verankert die Kalibrier-Konvention: „Schnitt ⊥ mechanische Achse" = 90°,
// „Implantat auf nativer Linie" = gemessener Wert (subtilste
// Vorzeichenlogik im Repo, siehe plannedJointAngle).
import { describe, expect, it } from 'vitest'
import {
  computePlannedCpak,
  extractWorkflowAxes,
  implantJointAngle,
  mechanicalAlignRotationDeg,
} from './resection'
import { computeCpak } from './cpak'
import type { Types } from '@cornerstonejs/core'

type P = Types.Point3
const p = (x: number, y: number): P => [x, y, 0]

/** Gleiche 17-Punkt-Fixture wie in recipes.test.ts (gerades Bein). */
const PTS: P[] = [
  p(80, 100), p(100, 80), p(120, 100),
  p(95, 200), p(105, 200), p(95, 400), p(105, 400),
  p(60, 500), p(140, 500),
  p(60, 510), p(140, 510),
  p(100, 500),
  p(95, 600), p(105, 600), p(95, 800), p(105, 800),
  p(100, 900),
]

describe('extractWorkflowAxes', () => {
  const axes = extractWorkflowAxes(PTS)!
  it('Hüftkopfzentrum aus Kreis, Knie-Mittelpunkte aus Tangenten', () => {
    expect(axes.hip[0]).toBeCloseTo(100, 5)
    expect(axes.hip[1]).toBeCloseTo(100, 5)
    expect(axes.kneeFemMid).toEqual([100, 500, 0])
    expect(axes.kneeTibMid).toEqual([100, 510, 0])
    expect(axes.ankle).toEqual([100, 900, 0])
  })
})

describe('implantJointAngle (Femur = LDFA-Logik)', () => {
  const axes = extractWorkflowAxes(PTS)!
  it('Schnitt ⊥ mechanischer Achse (rotation 0 bei vertikaler Achse) → 90°', () => {
    expect(implantJointAngle(axes, 'Femur', 0)).toBeCloseTo(90, 4)
  })
  it('Rotation ±3° weicht symmetrisch um 90° ab (93/87)', () => {
    // Reine Geometrie-Kennlinie; die klinische Varus/Valgus-Richtung ist
    // über die Messung (recipes.test.ts: Valgus-Femur → mLDFA<90) und die
    // Konsistenz-Probe unten verankert, nicht über das Rotations-Vorzeichen.
    expect(implantJointAngle(axes, 'Femur', 3)).toBeCloseTo(93, 4)
    expect(implantJointAngle(axes, 'Femur', -3)).toBeCloseTo(87, 4)
  })
  it('Tibia analog: rotation 0 → 90°', () => {
    expect(implantJointAngle(axes, 'Tibia', 0)).toBeCloseTo(90, 4)
  })
})

describe('implantJointAngle ↔ Messung — Achsenrichtung konsistent (Runde 3, Fund 2)', () => {
  // Kernprobe der Achsenrichtung: liegt das Implantat auf der NATIVEN
  // Gelenklinie, muss die Box exakt den gemessenen mLDFA zeigen — sonst
  // spränge die geplante CPAK beim Platzieren (native Lage 96° statt der
  // gemessenen 84°). Femur-Tangente hier gekippt (Valgus-Femur, mLDFA<90).
  const tilted: P[] = PTS.map((q) => [...q] as P)
  tilted[7] = p(60, 504) // medial distaler
  tilted[8] = p(140, 496) // lateral proximaler → mLDFA ≈ 84.3 (<90)
  const axes = extractWorkflowAxes(tilted)!
  // Rotation, die die Implantat-Schnittlinie auf die native Tangente legt.
  const nativeTangentRot =
    (Math.atan2(496 - 504, 140 - 60) * 180) / Math.PI // ≈ −5.71°

  it('Implantat auf nativer Femur-Linie → Box = gemessener mLDFA (< 90)', () => {
    const measured = implantJointAngle(axes, 'Femur', nativeTangentRot)
    expect(measured).toBeLessThan(90)
    expect(measured).toBeCloseTo(84.29, 1)
  })
})

describe('implantJointAngle — Vorzeichen-Regression K3 (Debug-Runde Mac)', () => {
  // Nutzer-Report: 3° Varus an der Tibia eingestellt → Anzeige "MPTA 93 / Valgus".
  // Root-Cause: Vorzeichen-Kalibrierung riet bei neutralem Knie (||1-Fallback).
  // Fixtures mit medial = Bild-LINKS (mptaMed x=60 < mptaLat x=140).
  const clone = (): (readonly [number, number, number])[] =>
    PTS.map((q) => [...q] as [number, number, number])

  it('neutrales Knie, medial links: rot −3° = Varus-Kippung → MPTA 87 (vorher fälschlich 93)', () => {
    const axes = extractWorkflowAxes(PTS)!
    expect(implantJointAngle(axes, 'Tibia', -3)).toBeCloseTo(87, 4)
    expect(implantJointAngle(axes, 'Tibia', 3)).toBeCloseTo(93, 4)
  })

  it('varisches Knie (natives MPTA 88): Implantat auf nativer Linie → 88, −3° → 87', () => {
    const pts = clone()
    pts[9] = [60, 511.397, 0] // medial 2° tiefer (40·tan2° ≈ 1.397)
    pts[10] = [140, 508.603, 0]
    const axes = extractWorkflowAxes(pts as never)!
    expect(implantJointAngle(axes, 'Tibia', -2)).toBeCloseTo(88, 2)
    expect(implantJointAngle(axes, 'Tibia', -3)).toBeCloseTo(87, 2)
  })

  it('valgisches Knie: auf nativer Linie → signiert 92 (nicht gefaltet 88); Varus-Rotation −3° → 87', () => {
    const pts = clone()
    pts[9] = [60, 508.603, 0] // medial 2° HÖHER = valgisches Plateau
    pts[10] = [140, 511.397, 0]
    const axes = extractWorkflowAxes(pts as never)!
    expect(implantJointAngle(axes, 'Tibia', 2)).toBeCloseTo(92, 2)
    expect(implantJointAngle(axes, 'Tibia', -3)).toBeCloseTo(87, 2)
  })
})

describe('implantJointAngle mit Bild-Landmarken — Befund F1 (Femur ~6° gekippt)', () => {
  const axes = extractWorkflowAxes(PTS)!
  // Synthetisches Femur-Bild: resect-Landmarken ~6.3° gekippt (wie die
  // echten Legion-/Sphere-PNGs, die den distalen Valgusschnitt tragen).
  const femurImg = {
    path: 'test', widthPx: 200, heightPx: 200, mmPerPx: 1,
    resect: {
      left: [-0.9, 0.8] as [number, number],
      right: [0.9, 1.0] as [number, number],
    },
  }
  // Tibia-Bild: Landmarken exakt horizontal (wie alle echten Tibia-PNGs).
  const tibiaImg = {
    path: 'test', widthPx: 200, heightPx: 200, mmPerPx: 1,
    resect: {
      left: [-0.95, -0.5] as [number, number],
      right: [0.95, -0.5] as [number, number],
    },
  }

  it('Selbstkonsistenz: mechanisches Ausrichten → Box zeigt exakt 90° (beide Knochen, beide Seiten)', () => {
    for (const side of ['R', 'L'] as const) {
      const rotF = mechanicalAlignRotationDeg('Femur', axes, 0, femurImg, side)
      expect(implantJointAngle(axes, 'Femur', rotF, femurImg, side)).toBeCloseTo(90, 4)
      const rotT = mechanicalAlignRotationDeg('Tibia', axes, 0, tibiaImg, side)
      expect(implantJointAngle(axes, 'Tibia', rotT, tibiaImg, side)).toBeCloseTo(90, 4)
    }
  })

  it('von der Ausrichtung ±3° → symmetrische Box-Abweichung 87/93 (6°-Landmarken sauber kompensiert)', () => {
    // Ausgerichtet = 90°; ±3° Rotation weichen symmetrisch ab. Die
    // klinische Varus/Valgus-Richtung ist über die Messung (Valgus-Femur
    // → mLDFA<90) + Konsistenz-Probe verankert, nicht über das
    // Rotations-Vorzeichen (das von der SVG-Zeichenrichtung abhängt).
    const aligned = mechanicalAlignRotationDeg('Femur', axes, 0, femurImg, 'R')
    const dMinus = implantJointAngle(axes, 'Femur', aligned - 3, femurImg, 'R')
    const dPlus = implantJointAngle(axes, 'Femur', aligned + 3, femurImg, 'R')
    expect(dMinus).toBeCloseTo(87, 2)
    expect(dPlus).toBeCloseTo(93, 2)
  })

  it('horizontales Tibia-Bild verhält sich exakt wie ohne Bild', () => {
    for (const rot of [-3, 0, 3, 7]) {
      expect(implantJointAngle(axes, 'Tibia', rot, tibiaImg, 'R')).toBeCloseTo(
        implantJointAngle(axes, 'Tibia', rot),
        6,
      )
    }
  })

  it('ohne Bild bleibt das bisherige Verhalten (Fallback M/L-Achse)', () => {
    expect(implantJointAngle(axes, 'Femur', 0)).toBeCloseTo(90, 4)
    expect(mechanicalAlignRotationDeg('Femur', axes, 0)).toBeCloseTo(
      mechanicalAlignRotationDeg('Femur', axes, 0, null, undefined), 6,
    )
  })
})

describe('mechanicalAlignRotationDeg', () => {
  const axes = extractWorkflowAxes(PTS)!
  it('liefert eine Rotation, deren Implantat-Winkel exakt 90° ergibt', () => {
    const rotF = mechanicalAlignRotationDeg('Femur', axes, 5)
    expect(implantJointAngle(axes, 'Femur', rotF)).toBeCloseTo(90, 4)
    const rotT = mechanicalAlignRotationDeg('Tibia', axes, -12)
    expect(implantJointAngle(axes, 'Tibia', rotT)).toBeCloseTo(90, 4)
  })
})

describe('computePlannedCpak', () => {
  const axes = extractWorkflowAxes(PTS)!
  it('ohne platzierte Komponenten: reiner Durchreich der Messwerte', () => {
    const r = computePlannedCpak(axes, 88, 84, null, null)
    expect(r.ldfa).toBe(88)
    expect(r.mpta).toBe(84)
    expect(r.femPlaced).toBe(false)
    expect(r.tibPlaced).toBe(false)
    expect(r.cpak).toEqual(computeCpak(88, 84))
  })
  it('mit mechanisch ausgerichteter Femur-Komponente wandert LDFA auf 90', () => {
    const rot = mechanicalAlignRotationDeg('Femur', axes, 0)
    const r = computePlannedCpak(axes, 88, 84, { kind: 'legion-ps-femur', rotationDeg: rot }, null)
    expect(r.femPlaced).toBe(true)
    expect(r.ldfa).toBeCloseTo(90, 4)
    expect(r.mpta).toBe(84)
  })
})

describe('implantJointAngle — anatomischer Lateral-Anker (Debug-Runde 3)', () => {
  // VERTAUSCHTE med/lat-Labels (Klick-Reihenfolge oder Handle über die
  // Gegenseite gezogen) dürfen das Implantat-Vorzeichen nicht kippen,
  // sobald der anatomische Anker (lateralDir) vorliegt. Im PTS-Fixture
  // ist lateral = +x (mptaLat/ldfaLat bei x=140).
  const base = extractWorkflowAxes(PTS)!
  const anchored = { ...base, lateralDir: p(80, 0) }

  it('vertauschte LDFA-Labels: Femur-Winkel unverändert (93° bei +3°)', () => {
    const swapped = {
      ...anchored,
      ldfaMed: anchored.ldfaLat,
      ldfaLat: anchored.ldfaMed,
    }
    expect(implantJointAngle(swapped, 'Femur', 3)).toBeCloseTo(
      implantJointAngle(anchored, 'Femur', 3),
      4,
    )
    expect(implantJointAngle(swapped, 'Femur', 3)).toBeCloseTo(93, 4)
  })

  it('vertauschte MPTA-Labels: Tibia-Winkel unverändert (87° bei −3°)', () => {
    const swapped = {
      ...anchored,
      mptaMed: anchored.mptaLat,
      mptaLat: anchored.mptaMed,
    }
    expect(implantJointAngle(swapped, 'Tibia', -3)).toBeCloseTo(87, 4)
    expect(implantJointAngle(swapped, 'Tibia', 3)).toBeCloseTo(93, 4)
  })
})
