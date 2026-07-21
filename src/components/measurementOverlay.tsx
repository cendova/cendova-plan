/**
 * Gemeinsamer Kern der Mess-Overlays (Hüfte + Knie) — Audit-Befund C3:
 * die beiden Overlays waren zu ~90 % identisch (Interaktions-Effekt,
 * Hit-Test, SVG-Rendering, Label-Anbindung). Hier lebt die geteilte
 * Logik EINMAL; HipOverlay/KneeOverlay liefern nur noch ihre Störgrößen
 * (Store, Rezept-Getter, Zusatz-Kästen, Banner-Stil, Leerklick-Verhalten).
 *
 * Verhaltens-Verträge (bewusst beibehalten):
 *  - Listener hängen am window (HMR-stabil), Capture-Phase; ein Treffer
 *    ruft stopPropagation (blockt Cornerstone-Pan/Zoom), stoppt aber
 *    NICHT die parallel laufenden Overlay-Listener (beide prüfen selbst).
 *  - Leerklick löst KEIN stopPropagation aus (Pan bleibt möglich).
 *  - Hit-Priorität: Endpunkt-Griffe vor Linien-Körpern.
 */
import { useEffect, useRef, type RefObject } from 'react'
import type { Types } from '@cornerstonejs/core'
import { getViewport } from '../lib/cornerstone/viewer'
import { MeasurementLabel } from './MeasurementLabel'
import type { LabelOffset, LabelStyle } from '../state/hipStore'

export type Vp = NonNullable<ReturnType<typeof getViewport>>
type P = Types.Point3

/** Struktureller Mindest-Typ einer Messung (Hip-/KneeMeasurement erfüllen ihn). */
export interface OverlayMeasurement {
  id: string
  kind: string
  points: P[]
  visible: boolean
  labelOffset: { x: number; y: number }
}

/** Struktureller Mindest-Typ eines Rezepts (Hip-/Knee-Recipe erfüllen ihn). */
export interface OverlayRecipe {
  label: string
  steps: string[]
  lineGroups: number[][]
  compute(
    points: P[],
    factor: number,
  ): {
    geometry: OverlayGeometry
  }
}

export interface OverlayGeometry {
  lines: { from: P; to: P; dashed?: boolean; color?: string; width?: number }[]
  circles: { center: P; radius: number }[]
  labels: { at: P; text: string }[]
}

/** Verweis auf einen einzelnen Landmarken-Punkt. */
interface PointRef {
  /** 'draft' für die laufende Platzierung, sonst die Mess-ID. */
  source: string
  index: number
}

/** Laufender Zieh-Vorgang. */
type DragState =
  | { kind: 'point'; ref: PointRef }
  | {
      kind: 'translate'
      refs: PointRef[]
      origin: P[]
      grab: P
    }

const HIT_RADIUS = 9
const LINE_HIT = 6

/** Store-Zugriffe, die der Interaktions-Effekt braucht (via getState —
 *  Handler dürfen nie an veraltete Render-Closures binden). */
export interface InteractionStore<M extends OverlayMeasurement> {
  measurements: M[]
  draftPoints: P[]
  activeKind: string | null
  updateDraftPoint(index: number, p: P): void
  updateMeasurementPoint(id: string, index: number, p: P): void
  addDraftPoint(p: P): void
}

export interface InteractionConfig<M extends OverlayMeasurement> {
  getState(): InteractionStore<M>
  getRecipe(kind: string): OverlayRecipe | undefined
  /** Chance, einen Nicht-Treffer-Klick zu beanspruchen (z. B. Notiz
   *  platzieren). true = beansprucht (Event wird gestoppt). */
  claimEmptyClick?(world: P): boolean
  /** Aufräumen bei echtem Leerklick (Selektionen aufheben). */
  onEmptyClick(): void
  /** Escape-Taste (Tool abbrechen + seitenspezifisches Aufräumen). */
  onEscape(): void
}

/**
 * Der komplette Maus-/Tastatur-Effekt beider Overlays: Hit-Test
 * (Griffe → Linien), Punkt-/Linien-Drag, Draft-Punkt setzen, Leerklick.
 */
export function useMeasurementInteraction<M extends OverlayMeasurement>(
  cfg: InteractionConfig<M>,
): void {
  const dragRef = useRef<DragState | null>(null)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  useEffect(() => {
    // Listener am window (statt am gerade-gemounteten <main>), weil:
    //  - HMR kann das <main> ersetzen — alter Listener bliebe verwaist.
    //  - Bei First-Render mit noch nicht ready-er Viewport-Instanz wäre
    //    die Anhängung stillschweigend ausgefallen.
    // Im Handler prüfen wir per `contains`, ob der Klick im Viewport
    // landete (DOM-Element "viewport-capture-root" aus Viewport.tsx).
    function canvasPoint(e: MouseEvent, vp: Vp): Types.Point2 {
      const rect = vp.canvas.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }

    function setPoint(ref: PointRef, p: P) {
      const store = cfgRef.current.getState()
      if (ref.source === 'draft') store.updateDraftPoint(ref.index, p)
      else store.updateMeasurementPoint(ref.source, ref.index, p)
    }

    /** Abstand eines Punktes zum Segment a–b (Canvas-Pixel). */
    function distToSegment(p: Types.Point2, a: Types.Point2, b: Types.Point2) {
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const l2 = dx * dx + dy * dy
      if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
      let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2
      t = Math.max(0, Math.min(1, t))
      return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t))
    }

    function hitTest(cp: Types.Point2, vp: Vp): DragState | null {
      const near = (world: P) => {
        const c = vp.worldToCanvas(world)
        return Math.hypot(c[0] - cp[0], c[1] - cp[1]) <= HIT_RADIUS
      }
      const state = cfgRef.current.getState()
      const ms = state.measurements.filter((m) => m.visible)
      const dp = state.draftPoints

      // 1) Endpunkt-Griffe — folgen dem Cursor.
      for (const m of ms) {
        for (let i = 0; i < m.points.length; i++) {
          if (near(m.points[i])) {
            return { kind: 'point', ref: { source: m.id, index: i } }
          }
        }
      }
      for (let i = 0; i < dp.length; i++) {
        if (near(dp[i])) {
          return { kind: 'point', ref: { source: 'draft', index: i } }
        }
      }

      // 2) Linien-Körper — verschieben beide Endpunkte gemeinsam.
      for (const m of ms) {
        const recipe = cfgRef.current.getRecipe(m.kind)
        if (!recipe) continue
        for (const [gi, gj] of recipe.lineGroups) {
          const a = m.points[gi]
          const b = m.points[gj]
          if (!a || !b) continue
          const ca = vp.worldToCanvas(a)
          const cb = vp.worldToCanvas(b)
          if (distToSegment(cp, ca, cb) <= LINE_HIT) {
            return {
              kind: 'translate',
              refs: [
                { source: m.id, index: gi },
                { source: m.id, index: gj },
              ],
              origin: [a, b],
              grab: vp.canvasToWorld(cp),
            }
          }
        }
      }
      return null
    }

    function applyDrag(e: MouseEvent) {
      const vp = getViewport()
      const drag = dragRef.current
      if (!vp || !drag) return
      const world = vp.canvasToWorld(canvasPoint(e, vp))
      if (drag.kind === 'point') {
        setPoint(drag.ref, world)
      } else {
        const dx = world[0] - drag.grab[0]
        const dy = world[1] - drag.grab[1]
        const dz = world[2] - drag.grab[2]
        drag.refs.forEach((ref, i) => {
          const o = drag.origin[i]
          setPoint(ref, [o[0] + dx, o[1] + dy, o[2] + dz])
        })
      }
    }

    function onDragMove(e: MouseEvent) {
      e.preventDefault()
      applyDrag(e)
    }

    function onDragEnd() {
      dragRef.current = null
      window.removeEventListener('mousemove', onDragMove, true)
      window.removeEventListener('mouseup', onDragEnd, true)
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return // mittlere/rechte Taste: Pan/Zoom durchlassen
      // Cmd/Strg+Links = Pan (Trackpad ohne Mitteltaste, Debug-Befund H2) —
      // Modifier-Klicks gehören Cornerstone, nie den Overlays.
      if (e.metaKey || e.ctrlKey) return
      // Nur Klicks im Viewport-Container sind relevant.
      const root = document.getElementById('viewport-capture-root')
      if (!root || !root.contains(e.target as Node)) return
      // Klicks auf Notizen/Beschriftungen behandeln diese selbst; BUTTONS
      // (z. B. „← Zurück" im StepPrompt) dürfen NIE als Draft-Punkt enden
      // (Debug-Befund K2: der Banner-Klick setzte erst einen Punkt, den der
      // Button-Click dann wieder entfernte — Netto-Null, Button wirkte tot).
      if ((e.target as Element | null)?.closest('button, [data-overlay-ui]')) return

      const vp = getViewport()
      if (!vp) return
      const cp = canvasPoint(e, vp)

      const hit = hitTest(cp, vp)
      if (hit) {
        e.stopPropagation()
        e.preventDefault()
        dragRef.current = hit
        window.addEventListener('mousemove', onDragMove, true)
        window.addEventListener('mouseup', onDragEnd, true)
        return
      }

      if (cfgRef.current.getState().activeKind) {
        e.stopPropagation()
        e.preventDefault()
        cfgRef.current.getState().addDraftPoint(vp.canvasToWorld(cp))
        return
      }

      if (cfgRef.current.claimEmptyClick?.(vp.canvasToWorld(cp))) {
        e.stopPropagation()
        e.preventDefault()
        return
      }

      // Leerer Klick: seitenspezifische Selektionen aufheben.
      cfgRef.current.onEmptyClick()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      cfgRef.current.onEscape()
    }

    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousemove', onDragMove, true)
      window.removeEventListener('mouseup', onDragEnd, true)
    }
  }, [])
}

/** Projektions-Helfer eines Viewports (world→canvas + Radius). */
export function overlayProjection(vp: Vp) {
  const w2c = (p: P): Types.Point2 => vp.worldToCanvas(p)
  const radiusToCanvas = (center: P, radius: number): number => {
    const c = w2c(center)
    const edge = w2c([center[0] + radius, center[1], center[2]])
    return Math.hypot(edge[0] - c[0], edge[1] - c[1])
  }
  return { w2c, radiusToCanvas }
}

/** Sichtbare Messungen einmal durchrechnen — für SVG-Geometrie und Labels. */
export function computeVisible<M extends OverlayMeasurement>(
  measurements: M[],
  getRecipe: (kind: string) => OverlayRecipe | undefined,
  factor: number,
): Array<{ m: M; geometry: OverlayGeometry }> {
  return measurements
    .filter((m) => m.visible)
    .map((m) => {
      const recipe = getRecipe(m.kind)
      if (!recipe) return null
      return { m, geometry: recipe.compute(m.points, factor).geometry }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

/**
 * Geteiltes SVG der Mess-Geometrie: Linien, Kreise, Punkt-Griffe,
 * optional Label-Verbinder (Knie) und Draft-Verbindungslinien (Hüfte —
 * das Knie zeichnet bewusst KEINE, die Landmarken sind eigenständig).
 */
export function MeasurementSvg<M extends OverlayMeasurement>({
  svgRef,
  computed,
  draftPoints,
  vp,
  showLabelConnector = false,
  draftLineGroups,
}: {
  svgRef: RefObject<SVGSVGElement | null>
  computed: Array<{ m: M; geometry: OverlayGeometry }>
  draftPoints: P[]
  vp: Vp
  showLabelConnector?: boolean
  /** lineGroups des aktiven Rezepts — nur gesetzt, wenn Draft-Paare
   *  verbunden werden sollen (eine Gruppe erst ab BEIDEN Endpunkten). */
  draftLineGroups?: number[][]
}) {
  const { w2c, radiusToCanvas } = overlayProjection(vp)
  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {computed.map(({ m, geometry }) => {
        const label = geometry.labels[0]
        const anchor = showLabelConnector && label ? w2c(label.at) : null
        return (
          <g key={m.id}>
            {geometry.lines.map((ln, i) => {
              const a = w2c(ln.from)
              const b = w2c(ln.to)
              return (
                <line
                  key={`l${i}`}
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke={ln.color ?? '#e2e8f0'}
                  strokeWidth={ln.width ?? 1.5}
                  strokeDasharray={ln.dashed ? '5 4' : undefined}
                />
              )
            })}
            {geometry.circles.map((ci, i) => {
              const c = w2c(ci.center)
              return (
                <circle
                  key={`c${i}`}
                  cx={c[0]}
                  cy={c[1]}
                  r={radiusToCanvas(ci.center, ci.radius)}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth={1.5}
                />
              )
            })}
            {m.points.map((p, i) => {
              const c = w2c(p)
              return (
                <circle
                  key={`h${i}`}
                  cx={c[0]}
                  cy={c[1]}
                  r={4}
                  fill="#334155"
                  stroke="#e2e8f0"
                  strokeWidth={1.5}
                />
              )
            })}
            {anchor && (
              <line
                x1={anchor[0]}
                y1={anchor[1]}
                x2={anchor[0] + m.labelOffset.x}
                y2={anchor[1] + m.labelOffset.y + 9}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            )}
          </g>
        )
      })}

      {/* Laufende Platzierung */}
      {draftPoints.length > 0 && (
        <g>
          {draftLineGroups?.map(([i0, i1], gi) => {
            if (i0 >= draftPoints.length || i1 >= draftPoints.length) {
              return null
            }
            const a = w2c(draftPoints[i0])
            const b = w2c(draftPoints[i1])
            return (
              <line
                key={`dl${gi}`}
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke="#fbbf24"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )
          })}
          {draftPoints.map((p, i) => {
            const c = w2c(p)
            return (
              <circle
                key={`dp${i}`}
                cx={c[0]}
                cy={c[1]}
                r={4}
                fill="#78350f"
                stroke="#fde68a"
                strokeWidth={1.5}
              />
            )
          })}
        </g>
      )}
    </svg>
  )
}

/** Label-Store-Anbindung — Adapter zwischen MeasurementLabel und dem
 *  jeweiligen Zustand-Store (Hüfte/Knie). `useIsSelected` ist ein Hook
 *  (echte Subscription — sonst rerendert das Label beim Selektions-
 *  Wechsel nicht). */
export interface OverlayLabelAdapter {
  useIsSelected(id: string): boolean
  select(id: string): void
  setOffset(id: string, o: LabelOffset): void
  setStyle(id: string, s: Partial<LabelStyle>): void
}

/** Alle Mess-Labels eines Overlays (ein MeasurementLabel je Messung). */
export function OverlayLabels<M extends OverlayMeasurement>({
  computed,
  vp,
  adapter,
}: {
  computed: Array<{ m: M; geometry: OverlayGeometry }>
  vp: Vp
  adapter: OverlayLabelAdapter
}) {
  return (
    <>
      {computed.map(({ m, geometry }) => {
        const label = geometry.labels[0]
        if (!label) return null
        return (
          <BoundLabel
            key={m.id}
            m={m}
            text={label.text}
            anchor={label.at}
            vp={vp}
            adapter={adapter}
          />
        )
      })}
    </>
  )
}

function BoundLabel<M extends OverlayMeasurement>({
  m,
  text,
  anchor,
  vp,
  adapter,
}: {
  m: M
  text: string
  anchor: P
  vp: Vp
  adapter: OverlayLabelAdapter
}) {
  const isSelected = adapter.useIsSelected(m.id)
  return (
    <MeasurementLabel
      measurement={m}
      text={text}
      anchor={anchor}
      vp={vp}
      store={{
        isSelected,
        select: () => adapter.select(m.id),
        setOffset: (o) => adapter.setOffset(m.id, o),
        setStyle: (s) => adapter.setStyle(m.id, s),
      }}
    />
  )
}

/** Schritt-Banner der laufenden Platzierung (Farbe/Lage je Seite). */
export function StepPrompt({
  tone,
  recipeLabel,
  stepIndex,
  stepCount,
  prompt,
  showBack,
  onBack,
}: {
  tone: 'amber' | 'violet'
  recipeLabel: string
  stepIndex: number
  stepCount: number
  prompt: string
  showBack: boolean
  onBack(): void
}) {
  // Beide Banner unten + klick-durchlässig (Debug-Befund H1: oben
  // kollidierten sie auf kleinen Bildschirmen mit der Patientenleiste;
  // unten liegt nichts — Platzierungs-, Schritt- und Osteophyten-Banner
  // schließen sich gegenseitig aus).
  const isViolet = tone === 'violet'
  return (
    <div
      data-overlay-ui
      className={[
        'pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded px-3 py-1.5 text-xs font-medium text-white shadow',
        isViolet ? 'bg-violet-600/95' : 'bg-amber-600/95',
      ].join(' ')}
    >
      <span>
        {recipeLabel} · Schritt {stepIndex}/{stepCount}: {prompt}
      </span>
      {showBack && (
        <button
          onClick={onBack}
          className={[
            'pointer-events-auto rounded px-1.5 py-0.5 text-[11px]',
            isViolet
              ? 'bg-violet-800/80 hover:bg-violet-800'
              : 'bg-amber-800/80 hover:bg-amber-800',
          ].join(' ')}
        >
          ← Zurück
        </button>
      )}
      <span className={isViolet ? 'text-violet-200' : 'text-amber-200'}>
        Esc: Abbruch
      </span>
    </div>
  )
}
