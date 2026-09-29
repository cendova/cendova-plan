import { useEffect, useRef } from 'react'
import type { Types } from '@cornerstonejs/core'
import { getViewport } from '../lib/cornerstone/viewer'
import { useViewportSync } from '../lib/cornerstone/useViewportSync'
import {
  benoetigteSlots,
  SLOT_TEXT,
  useKneeOsteotomieStore,
  type PunktSlot,
} from '../state/kneeOsteotomieStore'
import { polygonSchwerpunkt } from '../lib/shoulder/cropGeometry'
import { fuelleLuecke, zeichneVersetzt } from './fragmentBild'
import { StepPrompt } from './measurementOverlay'
import { useOsteotomie } from './useOsteotomie'
import { rotiere } from '../lib/knee/osteotomie'
import type { OsteotomiePlan } from '../state/kneeOsteotomieStore'

type P = Types.Point3

/** Greif-Radius der Scharnier-/Startpunkte (Bildschirm-Pixel). */
const GRIFF = 9

/** Cornerstone-Event nach jedem fertigen Render (Enums.Events.IMAGE_RENDERED)
 *  — als Text, damit keine UI-Komponente Cornerstone ins Haupt-Bundle zieht. */
const BILD_GERENDERT = 'CORNERSTONE_IMAGE_RENDERED'

type Ergebnis = ReturnType<typeof useOsteotomie>['ergebnis']

/**
 * Anzeige-Rahmen der Doppel-Level-Osteotomie: Die Tibia liegt im distalen
 * Fragment des Femurschnitts. Die Planung rechnet ihren Keil deshalb in
 * der MITGEWANDERTEN Lage. Gezeichnet wird konsistent zum Bild:
 *  - mit Bildsimulation (Knochen gedreht): Tibia-Griffe mitgewandert, wie
 *    Keil und Knochen — gezogen wird exakt zurückgerechnet;
 *  - ohne Simulation (Originalbild): Griffe UND Tibia-Keil in der
 *    Originallage.
 * Vorher lagen Griffe und Keil bis zu ~15 mm auseinander (Review
 * 29.09.2026). Der Femurschritt hängt nicht an den Tibia-Punkten — das
 * Zurückrechnen beim Ziehen hat also keine Rückkopplung.
 */
function dloRahmen(plan: OsteotomiePlan, ergebnis: Ergebnis) {
  const femur = plan.typ === 'dlo' && ergebnis?.ok ? ergebnis.anzeige.schritte[0] : null
  const simulation = plan.bildSimulation
  const drehe = (p: P, richtung: 1 | -1) =>
    femur ? rotiere(p, femur.scharnier, richtung * femur.grad) : p
  const tibia = (slot: PunktSlot) => slot === 'tibiaScharnier' || slot === 'tibiaStart'
  return {
    zeige: (slot: PunktSlot, p: P) => (simulation && tibia(slot) ? drehe(p, 1) : p),
    speichere: (slot: PunktSlot, p: P) => (simulation && tibia(slot) ? drehe(p, -1) : p),
    keil: (knochen: string, p: P) => (!simulation && knochen === 'Tibia' ? drehe(p, -1) : p),
  }
}

/**
 * Overlay der Umstellungsosteotomie (Knie, Abschnitt 6).
 *
 * Drei Ebenen:
 *  1. Bildsimulation (Canvas): das distale Fragment wird um das Scharnier
 *     gedreht dargestellt, die Lücke schwarz — gleiche Technik wie der
 *     Schaft-Crop (fragmentBild.ts), die Pixel kommen frisch aus dem
 *     Viewport.
 *  2. Planungsgeometrie (SVG): Schnittlinie, Keil, neue Traglinie,
 *     Zielpunkt auf dem Plateau.
 *  3. Interaktion: Punkte setzen und ziehen.
 *
 * WICHTIG — Einbau VOR dem KneeOverlay (Viewport.tsx): Beide hören am
 * window in der Capture-Phase; wer zuerst registriert, ist zuerst dran.
 * So gehört ein Klick beim Setzen eindeutig der Osteotomie (stopImmediate-
 * Propagation), auch wenn er zufällig neben einem Vollvermessungspunkt
 * landet, und die Scharnier-/Startgriffe schlagen die Messpunkte.
 */
export function KneeOsteotomieOverlay() {
  useViewportSync()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const plan = useKneeOsteotomieStore((s) => s.plan)
  const setzen = useKneeOsteotomieStore((s) => s.setzen)
  const { ergebnis } = useOsteotomie()
  const rahmen = plan ? dloRahmen(plan, ergebnis) : null
  const rahmenRef = useRef(rahmen)
  rahmenRef.current = rahmen

  // --- Interaktion: Setzen + Ziehen --------------------------------------
  useEffect(() => {
    function canvasPunkt(e: MouseEvent): [number, number] | null {
      const vp = getViewport()
      if (!vp) return null
      const r = vp.canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey) return
      const root = document.getElementById('viewport-capture-root')
      if (!root || !root.contains(e.target as Node)) return
      if ((e.target as Element | null)?.closest('button, [data-overlay-ui]')) return
      const vp = getViewport()
      const cp = canvasPunkt(e)
      if (!vp || !cp) return
      const st = useKneeOsteotomieStore.getState()
      // Rahmen zum Zeitpunkt des Klicks — gilt für das ganze Ziehen.
      const r = rahmenRef.current
      if (st.setzen) {
        e.stopImmediatePropagation()
        e.preventDefault()
        const w = vp.canvasToWorld(cp)
        st.setzePunkt(r ? r.speichere(st.setzen, w) : w)
        return
      }
      const plan = st.plan
      if (!plan || !plan.sichtbar) return
      const treffer = benoetigteSlots(plan.typ).find((slot) => {
        const w = plan[slot]
        if (!w) return false
        const c = vp.worldToCanvas(r ? r.zeige(slot, w) : w)
        return Math.hypot(c[0] - cp[0], c[1] - cp[1]) <= GRIFF
      })
      if (!treffer) return
      e.stopImmediatePropagation()
      e.preventDefault()
      const ziehe = (ev: MouseEvent) => {
        const v = getViewport()
        const q = canvasPunkt(ev)
        if (!v || !q) return
        ev.preventDefault()
        const w = v.canvasToWorld(q)
        useKneeOsteotomieStore.getState().verschiebePunkt(treffer, r ? r.speichere(treffer, w) : w)
      }
      const los = () => {
        window.removeEventListener('mousemove', ziehe, true)
        window.removeEventListener('mouseup', los, true)
      }
      window.addEventListener('mousemove', ziehe, true)
      window.addEventListener('mouseup', los, true)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && useKneeOsteotomieStore.getState().setzen) {
        useKneeOsteotomieStore.getState().abbrechenSetzen()
      }
    }
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // --- Bildsimulation (Canvas) -----------------------------------------
  // Gezeichnet wird nach jedem React-Render UND nach jedem Cornerstone-
  // Render: Die Pixel kommen aus dem Viewport-Canvas, und eine geänderte
  // Fensterung (Kontrast) bewegt die Kamera nicht — ohne das Event behielt
  // das Fragment die alten Kontraste (Review 29.09.2026).
  const zeichneRef = useRef<() => void>(() => {})
  zeichneRef.current = () => {
    const canvas = canvasRef.current
    const vp = getViewport()
    if (!canvas || !vp) return
    const quelle = vp.canvas
    const breite = quelle.clientWidth
    const hoehe = quelle.clientHeight
    const dpr = window.devicePixelRatio || 1
    const b = Math.round(breite * dpr)
    const h = Math.round(hoehe * dpr)
    if (canvas.width !== b) canvas.width = b
    if (canvas.height !== h) canvas.height = h
    canvas.style.width = `${breite}px`
    canvas.style.height = `${hoehe}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, breite, hoehe)
    if (!plan?.sichtbar || !plan.bildSimulation || !ergebnis?.ok) return
    const w2c = (p: P) => vp.worldToCanvas(p)
    // Reihenfolge ist Pflicht (DLO): erst das Femur-Fragment (ganzes Bein
    // distal), dann das Tibia-Fragment an der mitgewanderten Lücke.
    for (const f of ergebnis.fragmente) {
      fuelleLuecke(ctx, f.luecke.map(w2c))
      zeichneVersetzt(
        ctx,
        quelle,
        breite,
        hoehe,
        f.quelle.map(w2c),
        f.ziel.map(w2c),
        w2c(polygonSchwerpunkt(f.quelle)),
        w2c(polygonSchwerpunkt(f.ziel)),
      )
    }
  }
  useEffect(() => zeichneRef.current())
  // Bei jedem Render neu anhängen: Nach einem Bildwechsel kann der
  // Viewport (und damit sein Element) ein anderer sein.
  useEffect(() => {
    const el = getViewport()?.element
    if (!el) return
    const neu = () => zeichneRef.current()
    el.addEventListener(BILD_GERENDERT, neu)
    return () => el.removeEventListener(BILD_GERENDERT, neu)
  })

  const vp = getViewport()
  if (!vp || !plan) return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
  const c = (p: P) => vp.worldToCanvas(p)
  const slots = benoetigteSlots(plan.typ)
  const slotIndex = setzen ? slots.indexOf(setzen) : -1

  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
      {plan.sichtbar && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {ergebnis?.ok && (
            <Planungsgeometrie c={c} ergebnis={ergebnis} ziel={plan.zielWblProzent} keil={rahmen!.keil} />
          )}
          {slots.map((slot) => {
            const w = plan[slot]
            return <Griff key={slot} slot={slot} punkt={w && rahmen!.zeige(slot, w)} c={c} />
          })}
        </svg>
      )}
      {setzen && (
        <StepPrompt
          tone="violet"
          recipeLabel="Umstellungsosteotomie"
          stepIndex={slotIndex + 1}
          stepCount={slots.length}
          prompt={SLOT_TEXT[setzen]}
          showBack={slotIndex > 0}
          onBack={() => useKneeOsteotomieStore.getState().zurueck()}
        />
      )}
    </>
  )
}

function Griff({
  slot,
  punkt,
  c,
}: {
  slot: PunktSlot
  punkt: P | null
  c: (p: P) => Types.Point2
}) {
  if (!punkt) return null
  const [x, y] = c(punkt)
  const scharnier = slot.endsWith('Scharnier')
  return scharnier ? (
    <g>
      <circle cx={x} cy={y} r={7} fill="rgba(251,191,36,0.25)" stroke="#fbbf24" strokeWidth={2} />
      <circle cx={x} cy={y} r={2} fill="#fbbf24" />
    </g>
  ) : (
    <circle cx={x} cy={y} r={5} fill="#ef4444" stroke="#fee2e2" strokeWidth={1.5} />
  )
}

function Planungsgeometrie({
  c,
  ergebnis,
  ziel,
  keil,
}: {
  c: (p: P) => Types.Point2
  ergebnis: Extract<ReturnType<typeof useOsteotomie>['ergebnis'], { ok: true }>
  ziel: number
  /** Lage des Keils im Bild (DLO ohne Simulation: Tibia zurück in die
   *  Originallage, siehe dloRahmen). */
  keil: (knochen: string, p: P) => P
}) {
  const { nachher, vorher, punkteNachher, schnitte } = ergebnis
  const hip = c(vorher.hip)
  const sgNeu = c(punkteNachher[16])
  // Zielpunkt auf dem Plateau in seiner Lage NACH der Korrektur (bei der
  // DFO wandert das Plateau mit).
  const pm = nachher.plateauMedial
  const pl = nachher.plateauLateral
  const t = ziel / 100
  const zielPunkt = c([pm[0] + t * (pl[0] - pm[0]), pm[1] + t * (pl[1] - pm[1]), pm[2]])
  const fmt = (v: number) => v.toFixed(1).replace('.', ',')
  return (
    <g>
      {/* Neue Traglinie Hüfte → Sprunggelenk (nachher). */}
      <line x1={hip[0]} y1={hip[1]} x2={sgNeu[0]} y2={sgNeu[1]} stroke="#4ade80" strokeWidth={2} />
      <circle cx={sgNeu[0]} cy={sgNeu[1]} r={4} fill="#4ade80" />
      <circle cx={zielPunkt[0]} cy={zielPunkt[1]} r={5} fill="none" stroke="#4ade80" strokeWidth={2} />
      <text
        x={zielPunkt[0] + 8}
        y={zielPunkt[1] - 8}
        fill="#bbf7d0"
        fontSize={12}
        stroke="#000"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {fmt(ziel)} %
      </text>
      {schnitte.map((s) => {
        const h = c(keil(s.knochen, s.scharnier))
        const a = c(keil(s.knochen, s.start))
        const b = c(keil(s.knochen, s.startNeu))
        const oeffnend = s.keil === 'oeffnend'
        return (
          <g key={s.knochen}>
            <polygon
              points={`${h[0]},${h[1]} ${a[0]},${a[1]} ${b[0]},${b[1]}`}
              fill={oeffnend ? 'rgba(56,189,248,0.28)' : 'rgba(244,63,94,0.28)'}
              stroke={oeffnend ? '#38bdf8' : '#f43f5e'}
              strokeWidth={1}
            />
            <line x1={a[0]} y1={a[1]} x2={h[0]} y2={h[1]} stroke="#ef4444" strokeWidth={2} />
            <line
              x1={b[0]}
              y1={b[1]}
              x2={h[0]}
              y2={h[1]}
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text
              x={b[0] + (b[0] < h[0] ? -8 : 8)}
              y={b[1] + 16}
              textAnchor={b[0] < h[0] ? 'end' : 'start'}
              fill="#fecaca"
              fontSize={12}
              stroke="#000"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {`${s.knochen} ${fmt(Math.abs(s.grad))}° · ${oeffnend ? 'Öffnung' : 'Keilbasis'} ${fmt(s.keilhoeheMm)} mm`}
            </text>
          </g>
        )
      })}
    </g>
  )
}
