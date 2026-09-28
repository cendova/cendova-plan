/**
 * Umstellungsosteotomie am Knie — Rechenkern (HTO, DFO, Doppel-Level).
 * Fachliche Grundlage und Quellen: docs/knie-osteotomie-plan.md.
 *
 * GRUNDIDEE — keine zweite Rechen-Engine: Die Korrektur wird simuliert,
 * indem alle Landmarken der Vollvermessung, die DISTAL der Schnittlinie
 * liegen (auf der Seite des Sprunggelenks), starr um das Scharnier gedreht
 * werden. Auf die gedrehten Punkte läuft dieselbe `computeWorkflowRaw`
 * wie vor der Korrektur — alle Nachher-Werte (mHKA, WBL, mMPTA, mLDFA,
 * JLCA, MJLA) kommen damit aus exakt derselben Formel wie die Vorher-
 * Werte und können nicht gegeneinander driften.
 *
 * KORREKTURWINKEL nach Miniaci: der Drehwinkel am Scharnier, bei dem die
 * Traglinie Hüfte→Sprunggelenk den Zielpunkt auf dem Plateau trifft. Er
 * wird numerisch gesucht (Vorzeichenwechsel + Bisektion) statt über die
 * klassische Kreis-Geraden-Konstruktion — so gilt derselbe Code für HTO
 * (Plateau steht, Sprunggelenk wandert) und DFO (Plateau UND Sprunggelenk
 * wandern). Für die HTO ist das Ergebnis identisch mit der Konstruktion
 * (Test „Miniaci-Äquivalenz").
 *
 * Sprachregel: Alles ist PLANUNGSHINWEIS — keine Empfehlungsvokabel.
 */
import type { Types } from '@cornerstonejs/core'
import { computeWorkflowRaw, type WorkflowRaw } from './recipes'
import { PALEY_NORM } from './deformitaet'

type P = Types.Point3

export type OsteotomieTyp =
  | 'htoOeffnend'
  | 'htoSchliessend'
  | 'dfoOeffnend'
  | 'dfoSchliessend'
  | 'dlo'

export type Knochen = 'Femur' | 'Tibia'
export type KeilArt = 'oeffnend' | 'schliessend'

export const OSTEOTOMIE_TYPEN: {
  typ: OsteotomieTyp
  label: string
  kurz: string
  /** Operierte Knochen in Anwendungsreihenfolge (Femur vor Tibia). */
  knochen: Knochen[]
}[] = [
  { typ: 'htoOeffnend', label: 'HTO öffnend', kurz: 'öffnende HTO', knochen: ['Tibia'] },
  { typ: 'htoSchliessend', label: 'HTO schließend', kurz: 'schließende HTO', knochen: ['Tibia'] },
  { typ: 'dfoOeffnend', label: 'DFO öffnend', kurz: 'öffnende DFO', knochen: ['Femur'] },
  { typ: 'dfoSchliessend', label: 'DFO schließend', kurz: 'schließende DFO', knochen: ['Femur'] },
  { typ: 'dlo', label: 'Doppel-Level (DFO + HTO)', kurz: 'Doppel-Level-Osteotomie', knochen: ['Femur', 'Tibia'] },
]

export function osteotomieTyp(typ: OsteotomieTyp) {
  return OSTEOTOMIE_TYPEN.find((t) => t.typ === typ)!
}

/** Erwartete Keilart je Typ und Knochen. DLO nach Schröter et al. 2019
 *  (DOI 10.1007/s00402-018-3068-9): öffnende HTO + schließende DFO. */
export function erwarteteKeilArt(typ: OsteotomieTyp, knochen: Knochen): KeilArt {
  if (typ === 'dlo') return knochen === 'Tibia' ? 'oeffnend' : 'schliessend'
  return typ === 'htoOeffnend' || typ === 'dfoOeffnend' ? 'oeffnend' : 'schliessend'
}

export interface Schnitt {
  scharnier: P
  start: P
}

export interface OsteotomieHinweis {
  severity: 'info' | 'caution' | 'warning'
  code: string
  text: string
  evidence: string[]
}

// ----------------------------------------------------------------------
// Geometrie-Grundbausteine
// ----------------------------------------------------------------------

/** Dreht `p` um `zentrum` (Welt, mathematisch positiv in der x/y-Ebene). */
export function rotiere(p: P, zentrum: P, grad: number): P {
  const r = (grad * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const dx = p[0] - zentrum[0]
  const dy = p[1] - zentrum[1]
  return [zentrum[0] + c * dx - s * dy, zentrum[1] + s * dx + c * dy, p[2]]
}

/** Vorzeichenbehaftete Seite von `p` relativ zur Geraden a→b. */
function seite(p: P, a: P, b: P): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
}

function gleicheSeite(p: P, q: P, a: P, b: P): boolean {
  const sp = seite(p, a, b)
  const sq = seite(q, a, b)
  return sp !== 0 && sq !== 0 && Math.sign(sp) === Math.sign(sq)
}

function abstand(a: P, b: P): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

const SPRUNGGELENK = 16

export interface AngewandterSchnitt {
  schnitt: Schnitt
  grad: number
}

export interface SimulationsSchritt {
  /** Schnitt in der Lage zum Zeitpunkt seiner Anwendung (bei DLO ist der
   *  Tibia-Schnitt bereits mit dem Femur-Fragment mitgewandert). */
  schnitt: Schnitt
  grad: number
  /** Sprunggelenk zum Anwendungszeitpunkt — definiert die distale Seite. */
  referenz: P
}

/**
 * Wendet die Schnitte der Reihe nach an: Jeder Punkt auf der Seite des
 * Sprunggelenks wird um das Scharnier gedreht. Spätere Schnitte liegen im
 * distalen Fragment früherer und wandern mit (DLO: Femur vor Tibia).
 */
export function simulierePunkte(
  punkte: P[],
  schnitte: AngewandterSchnitt[],
): { punkte: P[]; schritte: SimulationsSchritt[] } {
  let aktuell = [...punkte]
  let offen = schnitte.map((s) => ({ ...s, schnitt: { ...s.schnitt } }))
  const schritte: SimulationsSchritt[] = []
  while (offen.length > 0) {
    const [jetzt, ...rest] = offen
    const { scharnier, start } = jetzt.schnitt
    const referenz = aktuell[SPRUNGGELENK]
    const distal = (p: P) => gleicheSeite(p, referenz, start, scharnier)
    aktuell = aktuell.map((p) => (distal(p) ? rotiere(p, scharnier, jetzt.grad) : p))
    offen = rest.map((r) => ({
      ...r,
      schnitt: {
        scharnier: distal(r.schnitt.scharnier)
          ? rotiere(r.schnitt.scharnier, scharnier, jetzt.grad)
          : r.schnitt.scharnier,
        start: distal(r.schnitt.start)
          ? rotiere(r.schnitt.start, scharnier, jetzt.grad)
          : r.schnitt.start,
      },
    }))
    schritte.push({ schnitt: jetzt.schnitt, grad: jetzt.grad, referenz })
  }
  return { punkte: aktuell, schritte }
}

/**
 * Sucht die Nullstelle von f im Bereich ±`bereich` Grad: Raster nach
 * Vorzeichenwechseln absuchen, den Wechsel NÄCHST 0° nehmen (kleinste
 * Korrektur, die das Ziel erreicht) und dort bisektieren.
 */
export function loeseWinkel(
  f: (grad: number) => number | null,
  bereich = 45,
  raster = 0.5,
): number | null {
  let bester: [number, number] | null = null
  let vorher: [number, number] | null = null
  for (let g = -bereich; g <= bereich + 1e-9; g += raster) {
    const w = f(g)
    if (w == null || !Number.isFinite(w)) {
      vorher = null
      continue
    }
    if (w === 0) return g
    if (vorher && Math.sign(vorher[1]) !== Math.sign(w)) {
      const mitte = Math.abs((vorher[0] + g) / 2)
      if (!bester || mitte < Math.abs((bester[0] + bester[1]) / 2)) bester = [vorher[0], g]
    }
    vorher = [g, w]
  }
  if (!bester) return null
  let [a, b] = bester
  let fa = f(a)!
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (fm == null) return null
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m
      fa = fm
    } else {
      b = m
    }
  }
  return (a + b) / 2
}

// ----------------------------------------------------------------------
// Planung
// ----------------------------------------------------------------------

export interface OsteotomieEingabe {
  /** Die 17 Punkte der Vollvermessung (Welt). */
  punkte: P[]
  mmPerWorldUnit: number
  typ: OsteotomieTyp
  /** Zielpunkt der Traglinie in % der Plateaubreite (0 % = medial). */
  zielWblProzent: number
  /** DLO: Ziel-mLDFA des femoralen Anteils (Rest korrigiert die Tibia). */
  dloZielLdfa: number
  femur: Schnitt | null
  tibia: Schnitt | null
  /** Latente mediale Laxität ΔJLCA = JLCA(Valgusstress) − JLCA(Stand) in
   *  Grad (Ryu et al. 2021, DOI 10.1177/23259671211034151). null/0 = aus.
   *  Nur bei der öffnenden HTO wirksam (dafür ist die Formel belegt). */
  deltaJlca: number | null
}

export interface SchnittErgebnis {
  knochen: Knochen
  /** Lage zum Anwendungszeitpunkt (Welt). */
  scharnier: P
  start: P
  /** Startpunkt nach der Drehung — die Keilspitze gegenüber dem Scharnier. */
  startNeu: P
  /** Angewandter Drehwinkel (Welt-Vorzeichen). */
  grad: number
  keil: KeilArt
  /** Sehne |start → startNeu| = 2·L·sin(α/2), in mm. */
  keilhoeheMm: number
  schnittlaengeMm: number
}

export interface Fragment {
  /** Ausschnitt im ORIGINALBILD (Quelle der Pixel). */
  quelle: P[]
  /** Wo das Stück vor seiner eigenen Bewegung liegt (dort entsteht die
   *  Lücke) — bei DLO für die Tibia bereits mit dem Femur mitgewandert. */
  luecke: P[]
  /** Endlage nach allen Drehungen. */
  ziel: P[]
}

export interface OsteotomieErgebnis {
  ok: true
  vorher: WorkflowRaw
  nachher: WorkflowRaw
  punkteNachher: P[]
  schnitte: SchnittErgebnis[]
  /** Knöcherner Winkel, der das Ziel ohne Weichteilkorrektur erreichen
   *  würde (Betrag, Grad) — je operiertem Knochen der letzte Schritt. */
  zielWinkelOhneKorrektur: number
  /** Von der Tibia-Korrektur abgezogener Weichteilanteil (⅓ ΔJLCA). */
  jlcaKorrekturGrad: number
  beinlaengeDeltaMm: number
  richtung: 'valgisierend' | 'varisierend'
  hinweise: OsteotomieHinweis[]
  fragmente: Fragment[]
}

export interface OsteotomieFehler {
  ok: false
  fehler: string
}

const SEVERITY_RANG: Record<OsteotomieHinweis['severity'], number> = {
  warning: 0,
  caution: 1,
  info: 2,
}

const k1 = (v: number) => v.toFixed(1).replace('.', ',')

/**
 * Ausschnitt-Polygon des distalen Fragments: oben exakt die (beidseits
 * verlängerte) Schnittlinie, seitlich parallel zur Richtung zum
 * Sprunggelenk, unten knapp unterhalb des Sprunggelenks. Die Verlängerung
 * (60 % der Plateaubreite je Seite) fasst Weichteile und Fibula mit ein.
 */
function fragmentPolygon(schnitt: Schnitt, sprunggelenk: P, plateauBreite: number): P[] {
  const { start, scharnier } = schnitt
  const l = abstand(start, scharnier)
  const d: P = [(scharnier[0] - start[0]) / l, (scharnier[1] - start[1]) / l, 0]
  const mitte: P = [(start[0] + scharnier[0]) / 2, (start[1] + scharnier[1]) / 2, start[2]]
  const zuSg = abstand(sprunggelenk, mitte)
  const a: P = [(sprunggelenk[0] - mitte[0]) / zuSg, (sprunggelenk[1] - mitte[1]) / zuSg, 0]
  const m = plateauBreite * 0.6
  const t = zuSg * 1.12
  const p1: P = [start[0] - d[0] * m, start[1] - d[1] * m, start[2]]
  const p2: P = [scharnier[0] + d[0] * m, scharnier[1] + d[1] * m, start[2]]
  const p3: P = [p2[0] + a[0] * t, p2[1] + a[1] * t, start[2]]
  const p4: P = [p1[0] + a[0] * t, p1[1] + a[1] * t, start[2]]
  return [p1, p2, p3, p4]
}

/** Scharnier-Soll-Lage als Text (ESSKA-Konsens Teil II für MOWHTO und
 *  LCW-DFO, DOI 10.1002/ksa.12273; übrige Kombinationen spiegelbildlich). */
export function scharnierHinweis(
  knochen: Knochen,
  keil: KeilArt,
  richtung: 'valgisierend' | 'varisierend',
): string {
  const scharnierLateral = (keil === 'oeffnend') === (richtung === 'valgisierend')
  if (knochen === 'Tibia') {
    if (scharnierLateral && keil === 'oeffnend')
      return 'Scharnier lateral auf Höhe der Oberkante des proximalen Tibiofibulargelenks (ESSKA), Startpunkt an der medialen Kortikalis.'
    return scharnierLateral
      ? `Scharnier lateral, ${keil === 'oeffnend' ? 'Startpunkt' : 'Keilbasis'} medial.`
      : `Scharnier medial, ${keil === 'oeffnend' ? 'Startpunkt' : 'Keilbasis'} lateral.`
  }
  if (!scharnierLateral && keil === 'schliessend')
    return 'Scharnier medial knapp oberhalb der medialen Femurkondyle (ESSKA), Keilbasis lateral.'
  return scharnierLateral
    ? `Scharnier lateral, ${keil === 'oeffnend' ? 'Startpunkt' : 'Keilbasis'} medial.`
    : `Scharnier medial oberhalb der medialen Kondyle, ${keil === 'oeffnend' ? 'Startpunkt' : 'Keilbasis'} lateral.`
}

export function planeOsteotomie(e: OsteotomieEingabe): OsteotomieErgebnis | OsteotomieFehler {
  const f = e.mmPerWorldUnit
  const vorher = computeWorkflowRaw(e.punkte, f)
  if (!vorher) return { ok: false, fehler: 'Vollvermessung unvollständig.' }
  if (vorher.wblProzent == null)
    return { ok: false, fehler: 'Traglinie schneidet das Plateau nicht — Vollvermessung prüfen.' }

  const knochenListe = osteotomieTyp(e.typ).knochen
  const schnittVon = (k: Knochen) => (k === 'Femur' ? e.femur : e.tibia)
  for (const k of knochenListe) {
    const s = schnittVon(k)
    if (!s) return { ok: false, fehler: `${k}: Scharnier und Startpunkt setzen.` }
    if (abstand(s.scharnier, s.start) * f < 1)
      return { ok: false, fehler: `${k}: Scharnier und Startpunkt liegen aufeinander.` }
  }

  const wblNach = (schnitte: AngewandterSchnitt[]) =>
    computeWorkflowRaw(simulierePunkte(e.punkte, schnitte).punkte, f)?.wblProzent ?? null

  const angewandt: AngewandterSchnitt[] = []
  let zielWinkelOhneKorrektur = 0
  let jlcaKorrekturGrad = 0

  if (e.typ === 'dlo') {
    const femur = e.femur!
    const gF = loeseWinkel((g) => {
      const r = computeWorkflowRaw(simulierePunkte(e.punkte, [{ schnitt: femur, grad: g }]).punkte, f)
      return r ? r.mLDFA - e.dloZielLdfa : null
    })
    if (gF == null)
      return { ok: false, fehler: `Femur: Ziel-mLDFA ${k1(e.dloZielLdfa)}° mit diesem Scharnier nicht erreichbar.` }
    angewandt.push({ schnitt: femur, grad: gF })
  }
  const letzterKnochen = knochenListe[knochenListe.length - 1]
  const letzterSchnitt = schnittVon(letzterKnochen)!
  const g = loeseWinkel((grad) => {
    const w = wblNach([...angewandt, { schnitt: letzterSchnitt, grad }])
    return w == null ? null : w - e.zielWblProzent
  })
  if (g == null)
    return {
      ok: false,
      fehler: `${letzterKnochen}: Traglinie ${k1(e.zielWblProzent)} % mit diesem Scharnier nicht erreichbar.`,
    }
  zielWinkelOhneKorrektur = Math.abs(g)
  let gPlan = g
  if (e.typ === 'htoOeffnend' && e.deltaJlca != null && e.deltaJlca > 0) {
    jlcaKorrekturGrad = Math.min(e.deltaJlca / 3, Math.abs(g))
    gPlan = g - Math.sign(g) * jlcaKorrekturGrad
  }
  angewandt.push({ schnitt: letzterSchnitt, grad: gPlan })

  const sim = simulierePunkte(e.punkte, angewandt)
  const nachher = computeWorkflowRaw(sim.punkte, f)
  if (!nachher) return { ok: false, fehler: 'Simulation nicht berechenbar.' }

  const schnitte: SchnittErgebnis[] = sim.schritte.map((s, i) => {
    const knochen = knochenListe[i]
    const startNeu = rotiere(s.schnitt.start, s.schnitt.scharnier, s.grad)
    // Wandert der Startpunkt auf die distale Seite, klafft der Schnitt →
    // öffnender Keil; sonst überlappen die Flächen → schließender Keil.
    const keil: KeilArt = gleicheSeite(startNeu, s.referenz, s.schnitt.start, s.schnitt.scharnier)
      ? 'oeffnend'
      : 'schliessend'
    return {
      knochen,
      scharnier: s.schnitt.scharnier,
      start: s.schnitt.start,
      startNeu,
      grad: s.grad,
      keil,
      keilhoeheMm: abstand(s.schnitt.start, startNeu) * f,
      schnittlaengeMm: abstand(s.schnitt.start, s.schnitt.scharnier) * f,
    }
  })

  const sprunggelenk = e.punkte[SPRUNGGELENK]
  const beinlaengeDeltaMm =
    (abstand(vorher.hip, sim.punkte[SPRUNGGELENK]) - abstand(vorher.hip, sprunggelenk)) * f
  const richtung = e.zielWblProzent >= vorher.wblProzent ? 'valgisierend' : 'varisierend'

  // Fragmente für die Bildsimulation (aus den ORIGINAL-Schnitten gebaut).
  const plateauBreite = abstand(vorher.plateauMedial, vorher.plateauLateral)
  const fragmente: Fragment[] = []
  const original = knochenListe.map((k) => schnittVon(k)!)
  original.forEach((schnitt, i) => {
    const quelle = fragmentPolygon(schnitt, sprunggelenk, plateauBreite)
    // Alle Drehungen bis EINSCHLIESSLICH der eigenen anwenden → Ziel;
    // alle davor → Lücke. Frühere Drehungen wirken auf das ganze Stück,
    // weil es komplett in deren distalem Fragment liegt.
    const bewege = (poly: P[], bis: number) =>
      poly.map((p) =>
        sim.schritte.slice(0, bis).reduce((q, s) => rotiere(q, s.schnitt.scharnier, s.grad), p),
      )
    fragmente.push({ quelle, luecke: bewege(quelle, i), ziel: bewege(quelle, i + 1) })
  })

  const hinweise = bewerte(e, vorher, nachher, schnitte, knochenListe, jlcaKorrekturGrad)
  return {
    ok: true,
    vorher,
    nachher,
    punkteNachher: sim.punkte,
    schnitte,
    zielWinkelOhneKorrektur,
    jlcaKorrekturGrad,
    beinlaengeDeltaMm,
    richtung,
    hinweise,
    fragmente,
  }
}

function bewerte(
  e: OsteotomieEingabe,
  vorher: WorkflowRaw,
  nachher: WorkflowRaw,
  schnitte: SchnittErgebnis[],
  knochenListe: Knochen[],
  jlcaKorrekturGrad: number,
): OsteotomieHinweis[] {
  const h: OsteotomieHinweis[] = []
  const tibiaOperiert = knochenListe.includes('Tibia')
  const femurOperiert = knochenListe.includes('Femur')
  const p = e.punkte

  // Lage der Schnitte: Tibia unterhalb des Plateaus, Femur oberhalb der
  // Kondylentangente — sonst dreht die Simulation die falschen Landmarken.
  for (const s of schnitte) {
    const [a, b] = s.knochen === 'Tibia' ? [p[9], p[10]] : [p[7], p[8]]
    const erwartetDistal = s.knochen === 'Tibia'
    // Gegen die ORIGINAL-Lage prüfen: bei DLO ist der Tibia-Schnitt im
    // Ergebnis schon mit dem Femur-Fragment mitgewandert.
    const orig = s.knochen === 'Tibia' ? e.tibia! : e.femur!
    const ok = [orig.scharnier, orig.start].every((q) =>
      erwartetDistal ? gleicheSeite(q, p[SPRUNGGELENK], a, b) : !gleicheSeite(q, p[SPRUNGGELENK], a, b),
    )
    if (!ok)
      h.push({
        severity: 'warning',
        code: 'SCHNITT_LAGE',
        text:
          s.knochen === 'Tibia'
            ? 'Tibia-Schnitt liegt nicht vollständig unterhalb des Tibiaplateaus — Scharnier und Startpunkt prüfen.'
            : 'Femur-Schnitt liegt nicht vollständig oberhalb der Kondylentangente — Scharnier und Startpunkt prüfen.',
        evidence: [`${s.knochen}-Schnitt`],
      })
    const erwartet = erwarteteKeilArt(e.typ, s.knochen)
    if (s.keil !== erwartet)
      h.push({
        severity: e.typ === 'dlo' ? 'caution' : 'warning',
        code: 'KEIL_WIDERSPRUCH',
        text:
          `${s.knochen}: Mit diesem Scharnier entsteht ein ${s.keil === 'oeffnend' ? 'öffnender' : 'schließender'} Keil. ` +
          `Für einen ${erwartet === 'oeffnend' ? 'öffnenden' : 'schließenden'} Keil das Scharnier auf die Gegenseite setzen.`,
        evidence: [`${s.knochen}: Korrektur ${k1(Math.abs(s.grad))}°`],
      })
  }

  if (tibiaOperiert && nachher.mMPTA > 95)
    h.push({
      severity: 'warning',
      code: 'MPTA_UEBER_95',
      text:
        `Geplanter mMPTA ${k1(nachher.mMPTA)}° liegt über 95°: Gelenklinienschräge prüfen, ` +
        'Doppel-Level-Osteotomie erwägen.',
      evidence: [
        `mMPTA ${k1(vorher.mMPTA)}° → ${k1(nachher.mMPTA)}°`,
        'Kim 2022, Servant 2022; nach 10 J. ohne Effekt: Rosso 2022',
      ],
    })
  else if (tibiaOperiert && (nachher.mMPTA < PALEY_NORM.mMPTA[0] || nachher.mMPTA > PALEY_NORM.mMPTA[1]))
    h.push({
      severity: 'info',
      code: 'MPTA_AUSSERHALB',
      text: `mMPTA nachher ${k1(nachher.mMPTA)}° außerhalb des Normbereichs 85–90°.`,
      evidence: [`mMPTA ${k1(vorher.mMPTA)}° → ${k1(nachher.mMPTA)}°`],
    })
  if (femurOperiert && (nachher.mLDFA < PALEY_NORM.mLDFA[0] || nachher.mLDFA > PALEY_NORM.mLDFA[1]))
    h.push({
      severity: 'info',
      code: 'LDFA_AUSSERHALB',
      text: `mLDFA nachher ${k1(nachher.mLDFA)}° außerhalb des Normbereichs 85–90°.`,
      evidence: [`mLDFA ${k1(vorher.mLDFA)}° → ${k1(nachher.mLDFA)}°`],
    })

  if (tibiaOperiert && vorher.JLCA >= 5)
    h.push({
      severity: 'caution',
      code: 'JLCA_HOCH',
      text:
        'JLCA ≥ 5°: Risikofaktor für einen mMPTA ≥ 95° nach öffnender HTO und für Überkorrektur ' +
        'durch den Weichteilanteil.',
      evidence: [`JLCA ${k1(vorher.JLCA)}°`, 'Sohn 2022'],
    })
  else if (tibiaOperiert && vorher.JLCA > PALEY_NORM.JLCA[1] && jlcaKorrekturGrad === 0)
    h.push({
      severity: 'info',
      code: 'JLCA_UEBER_NORM',
      text:
        'JLCA über Norm (0–2°): Der Weichteilanteil kann die knöcherne Korrektur verstärken. ' +
        'Laxitätskorrektur nach Ryu (ΔJLCA aus Valgusstress-Aufnahme) zuschaltbar.',
      evidence: [`JLCA ${k1(vorher.JLCA)}°`],
    })
  if (tibiaOperiert && Math.abs(vorher.mjla - 90) >= 3)
    h.push({
      severity: 'caution',
      code: 'JLO_VOR',
      text:
        'Gelenklinie präoperativ bereits ≥ 3° schräg: Risikofaktor für einen mMPTA ≥ 95° nach ' +
        'öffnender HTO.',
      evidence: [`MJLA ${k1(vorher.mjla)}°`, 'Sohn 2022'],
    })
  if (jlcaKorrekturGrad > 0)
    h.push({
      severity: 'info',
      code: 'JLCA_KORREKTUR',
      text:
        `Knöcherne Korrektur um ⅓ ΔJLCA = ${k1(jlcaKorrekturGrad)}° verringert: Die Traglinie ` +
        'erreicht den Zielwert erst mit der erwarteten Weichteilkorrektur.',
      evidence: [`ΔJLCA ${k1(e.deltaJlca ?? 0)}°`, 'Ryu 2021'],
    })
  return h.sort((a, b) => SEVERITY_RANG[a.severity] - SEVERITY_RANG[b.severity])
}
