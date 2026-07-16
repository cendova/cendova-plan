/**
 * Knie-spezifische Geometrie-Helfer. Reine Re-Exports + ein paar knie-
 * eigene Funktionen, die in der Hüfte nicht gebraucht werden.
 *
 * Designentscheidung: Wir importieren NICHT in jeder Recipe-Datei
 * `'../hip/geometry'`, sondern leiten alles über dieses Modul. So bleibt
 * der Knie-Code auch dann konsistent, wenn die Hüft-Geometrie später
 * woandershin wandert.
 */
import type { Types } from '@cornerstonejs/core'
import {
  add,
  angleBetweenVectors,
  closestPointOnLine,
  dist,
  dot,
  len,
  midpoint,
  scale,
  sub,
  unit,
} from '../hip/geometry'

export {
  add,
  angleBetweenVectors,
  closestPointOnLine,
  dist,
  dot,
  len,
  midpoint,
  scale,
  sub,
  unit,
}
export { circleFrom3Points, angleBetweenLines, perpendicularDistance } from '../hip/geometry'

type P = Types.Point3

/**
 * Vorzeichenbehafteter Abstand des Punktes `p` zur (unendlichen) Geraden
 * `a → b`, gemessen entlang der Linkssenkrechten der Richtung `a → b`.
 *
 * Wofür: Beim HKA-Winkel müssen wir wissen, ob das Kniezentrum MEDIAL
 * (Varus) oder LATERAL (Valgus) zur Hüftkopf↔Sprunggelenk-Linie liegt.
 * Der reine (positive) Lotabstand verliert diese Information.
 *
 * Konvention: Vorzeichen ist positiv, wenn `p` LINKS von `a → b` liegt
 * (mathematisch positive Halbebene). Die anatomische Interpretation
 * (medial/lateral, Varus/Valgus) muss der Aufrufer übernehmen, da sie
 * von der Seite (R/L) und der Bildorientierung abhängt.
 */
export function signedPerpDistance(p: P, a: P, b: P): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = Math.hypot(dx, dy)
  if (length === 0) return 0
  // Kreuzprodukt-z-Komponente / |b-a| = vorzeichenbehafteter Abstand.
  return ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length
}

/**
 * Spitzer Winkel (0–90°) zwischen zwei Linien. Praktisch für mLDFA/mMPTA:
 * die mechanische Achse und die Knie-Tangente bilden je nach
 * Punkt-Reihenfolge entweder einen spitzen oder stumpfen Winkel — wir
 * wollen den klinisch erwarteten ~87°-Wert anzeigen, nicht ~93°.
 *
 * (`angleBetweenLines` aus der Hüfte liefert 0–180°.)
 */
export function acuteAngleBetweenLines(a1: P, a2: P, b1: P, b2: P): number {
  const va = sub(a2, a1)
  const vb = sub(b2, b1)
  const raw = angleBetweenVectors(va, vb)
  return raw > 90 ? 180 - raw : raw
}

/**
 * Signierter GELENKLINIEN-Winkel (Grad, 0–180): Winkel zwischen der
 * DISTAL zeigenden mechanischen Achse (mechFrom → mechTo) und der
 * Gelenklinie `lineFrom → lineTo`, orientiert zur Referenzseite
 * (towardFrom → towardTo gibt die Seite an; die Linie selbst ist
 * ungerichtet und wird bei Bedarf geflippt).
 *
 * Klinische Konvention:
 *  - mMPTA: Achse kneeTibMid → ankle, Linie zur MEDIALEN Seite orientiert
 *    (toward = mptaLat → mptaMed)
 *  - mLDFA: Achse hip → kneeFemMid, Linie zur LATERALEN Seite orientiert
 *    (toward = ldfaMed → ldfaLat)
 *
 * Anders als `acuteAngleBetweenLines` bleibt die Seite erhalten (Werte
 * über 90° möglich) — ein valgisches Plateau liefert MPTA > 90 statt des
 * gefalteten Spitzwinkels. Grundlage der Varus/Valgus-Vorzeichen im
 * gesamten Implantat-/CPAK-Pfad (Debug-Befund K3: die frühere Vorzeichen-
 * Kalibrierung über den gemessenen Spitzwinkel riet bei neutralem Knie
 * und kippte bei valgischen Tangenten systematisch).
 */
export function jointLineAngle(
  mechFrom: P,
  mechTo: P,
  towardFrom: P,
  towardTo: P,
  lineFrom: P,
  lineTo: P,
): number {
  return jointLineAngleVec(
    mechFrom,
    mechTo,
    sub(towardTo, towardFrom),
    lineFrom,
    lineTo,
  )
}

/** Wie `jointLineAngle`, aber mit fertigem toward-VEKTOR (z. B. anatomisch
 *  verankert über `orientTangent`) statt zweier Referenzpunkte. */
export function jointLineAngleVec(
  mechFrom: P,
  mechTo: P,
  toward: P,
  lineFrom: P,
  lineTo: P,
): number {
  const mech = sub(mechTo, mechFrom)
  let line = sub(lineTo, lineFrom)
  if (dot(line, toward) < 0) line = scale(line, -1)
  return angleBetweenVectors(mech, line)
}

/**
 * Komponente von `v` SENKRECHT zu `axis` (v minus Projektion auf axis).
 *
 * Wofür (Debug-Runde 3): Als med/lat-Anker taugt NICHT der rohe Vektor
 * Hüftkopf → proximaler Femurschaft — der zeigt fast parallel zur
 * (senkrechten) mechanischen Achse, steht damit fast im rechten Winkel
 * zur (waagerechten) Gelenk-Tangente und wird von `orientTangent`
 * verworfen (cos ≈ 0). Seine achsen-SENKRECHTE Komponente dagegen zeigt
 * rein transversal nach lateral (der Schaft liegt lateral der mech. Achse)
 * und ist damit ~parallel zur Tangente → verlässlicher Anker.
 */
export function perpComponent(v: P, axis: P): P {
  const a2 = dot(axis, axis)
  if (a2 === 0) return v
  return sub(v, scale(axis, dot(v, axis) / a2))
}

/**
 * Orientiert einen Tangenten-Vektor ANATOMISCH: zeigt `raw` von der
 * Anker-Richtung `ref` weg (dot < 0), wird er gespiegelt.
 *
 * Wofür (Debug-Runde 3): mLDFA erschien 180°-gespiegelt (96,5° statt
 * ~83,5°), wenn die medial/lateral-Tangentenpunkte vertauscht gesetzt oder
 * per Handle über die Gegenseite gezogen wurden — die Punkt-LABELS sind
 * nicht verlässlich, die Anatomie schon. Als `ref` dient die TRANSVERSALE
 * Lateral-Richtung (perpComponent des Schaftversatzes, s. o.): sie zeigt
 * im AP immer nach lateral, unabhängig von Seite (R/L) und Bildrotation.
 *
 * Schutz: Ist die Projektion zu schwach (|cos| < 0.15, Anker ≈ senkrecht
 * zur Tangente — nur bei degenerierter Geometrie, z. B. exakt gerader
 * Femur ohne Schaftversatz), bleibt die gelabelte Richtung unangetastet.
 */
export function orientTangent(raw: P, ref: P): P {
  const denom = len(raw) * len(ref)
  if (denom === 0) return raw
  const cos = dot(raw, ref) / denom
  if (Math.abs(cos) < 0.15) return raw
  return cos < 0 ? scale(raw, -1) : raw
}

/**
 * Senkrechte zu `a → b` durch den Mittelpunkt, mit halber Länge `halfLen`
 * pro Seite. Wofür: Visualisierung der Resektionsebene am Kniegelenk,
 * wenn nur die Tangente (zwei Punkte) gesetzt ist und wir die
 * Schaftrichtung quer dazu zeichnen wollen.
 */
export function perpendicularThroughMid(
  a: P,
  b: P,
  halfLen: number,
): { from: P; to: P } {
  const m = midpoint(a, b)
  const d = sub(b, a)
  const l = len(d)
  if (l === 0) return { from: m, to: m }
  // 90°-Rotation in der Bildebene: (dx, dy) → (-dy, dx).
  const perp: P = [-d[1] / l, d[0] / l, 0]
  return {
    from: add(m, scale(perp, -halfLen)),
    to: add(m, scale(perp, halfLen)),
  }
}

/**
 * Schnittpunkt zweier 2D-Linien (z = von p1 übernommen). Beide Linien
 * werden als unendlich behandelt — kein Begrenzungs-Check, nur die
 * mathematische Schnittstelle der Geraden a1–a2 und b1–b2. Gibt `null`
 * zurück, wenn die Linien parallel sind.
 *
 * Wofür: Anatomische Femur-Schaftachse bis zur LDFA-Tangente verlängern.
 * Der Stützpunkt-Vektor der Achse wird dazu nicht weiter berührt — nur
 * der visuelle Endpunkt wird gegen den Schnitt mit der Tangente getauscht.
 *
 * Formel: Cramer'sche Regel auf das 2x2-System, das aus dem Geraden-
 * Parameter-Ansatz entsteht. `t` ist der Parameter auf der ersten Geraden.
 */
export function lineLineIntersection2D(
  a1: P,
  a2: P,
  b1: P,
  b2: P,
): P | null {
  const x1 = a1[0], y1 = a1[1]
  const x2 = a2[0], y2 = a2[1]
  const x3 = b1[0], y3 = b1[1]
  const x4 = b2[0], y4 = b2[1]
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denom) < 1e-9) return null
  const t =
    ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1), a1[2]]
}
