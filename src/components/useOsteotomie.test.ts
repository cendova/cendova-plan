// Gemeinsame Osteotomie-Rechnung: EIN Ergebnis für alle Nutzer (Cache)
// und der eingefrorene Stand beim Ziehen einer Landmarke (Review
// 29.09.2026 — vorher lief der gespeicherte Punkt unsichtbar davon).
import { beforeEach, describe, expect, it } from 'vitest'
import type { Types } from '@cornerstonejs/core'
import { friereOsteotomieEin, osteotomieJetzt, taueOsteotomieAuf } from './useOsteotomie'
import { useKneeStore, type KneeMeasurement } from '../state/kneeStore'
import { useKneeOsteotomieStore } from '../state/kneeOsteotomieStore'
import { speicherePunkt, zeigePunkt } from '../lib/knee/osteotomie'

const p = (x: number, y: number): Types.Point3 => [x, y, 0]
const tib = (y: number) => (-35 * (y - 428)) / 392
const PUNKTE = [
  p(-24, 0), p(0, -24), p(24, 0),
  p(33, 150), p(57, 150), p(3, 330), p(27, 330),
  p(-38, 420), p(38, 420), p(-38, 428), p(38, 428), p(0, 424),
  p(tib(550) - 12, 550), p(tib(550) + 12, 550), p(tib(750) - 10, 750), p(tib(750) + 10, 750),
  p(-35, 820),
]
const messung = (punkte: Types.Point3[]) =>
  ({
    id: 'k1',
    kind: 'workflow',
    points: punkte,
    visible: true,
    labelOffset: { x: 0, y: 0 },
    labelStyle: { fontSize: 13, color: '#fff', bold: false, underline: false },
  }) as KneeMeasurement

function htoPlan() {
  const s = useKneeOsteotomieStore.getState()
  s.starte('htoOeffnend', 62.5)
  useKneeOsteotomieStore.getState().setzePunkt(p(30, 445))
  useKneeOsteotomieStore.getState().setzePunkt(p(-36, 470))
}

beforeEach(() => {
  taueOsteotomieAuf()
  useKneeOsteotomieStore.getState().reset()
  useKneeStore.setState({ measurements: [messung(PUNKTE)] })
})

describe('gemeinsame Osteotomie-Rechnung', () => {
  it('rechnet für unveränderte Eingaben nur einmal (gleiches Objekt)', () => {
    htoPlan()
    const a = osteotomieJetzt()
    expect(a.ergebnis?.ok).toBe(true)
    expect(osteotomieJetzt()).toBe(a)
  })

  it('friert beim Ziehen ein: der Punkt folgt dem Cursor, die Rückrechnung bleibt exakt', () => {
    htoPlan()
    const vorher = osteotomieJetzt()
    if (!vorher.ergebnis?.ok) throw new Error('Planung erwartet')
    const t = vorher.ergebnis.anzeige
    friereOsteotomieEin()
    // Sprunggelenk (16) im Bild 20 mm nach lateral ziehen.
    const angezeigt = zeigePunkt(t, 16, PUNKTE[16])
    const cursor = p(angezeigt[0] + 20, angezeigt[1])
    const gespeichert = speicherePunkt(t, 16, cursor)
    const neu = [...PUNKTE]
    neu[16] = gespeichert
    useKneeStore.setState({ measurements: [messung(neu)] })
    // Eingefroren: dieselbe Rechnung, der Punkt steht im Bild am Cursor.
    const waehrend = osteotomieJetzt()
    expect(waehrend).toBe(vorher)
    const bild = zeigePunkt(t, 16, gespeichert)
    expect(bild[0]).toBeCloseTo(cursor[0], 9)
    expect(bild[1]).toBeCloseTo(cursor[1], 9)
    // Loslassen: neu gelöst, mit dem neuen Sprunggelenk.
    taueOsteotomieAuf()
    const danach = osteotomieJetzt()
    expect(danach).not.toBe(vorher)
    expect(danach.ergebnis?.ok).toBe(true)
  })

  it('ein geänderter Plan hebt das Einfrieren auf', () => {
    htoPlan()
    const vorher = osteotomieJetzt()
    friereOsteotomieEin()
    useKneeOsteotomieStore.getState().setZiel(55)
    const nachher = osteotomieJetzt()
    expect(nachher).not.toBe(vorher)
    expect(nachher.plan?.zielWblProzent).toBe(55)
  })
})
