import { useEffect, useRef, useState } from 'react'
import type { Types } from '@cornerstonejs/core'
import { logDiagnostic } from '../lib/diagnostics'
import {
  finishCupPlacement,
  getViewport,
  placeStemForSide,
} from '../lib/cornerstone/viewer'
import { useViewportSync } from '../lib/cornerstone/useViewportSync'
import { useViewerStore } from '../state/viewerStore'
import { useHipStore } from '../state/hipStore'
import { useKneeStore } from '../state/kneeStore'
import { useNoteStore } from '../state/noteStore'
import { useOsteophyteStore } from '../state/osteophyteStore'
import {
  useTemplateStore,
  type CupTemplate,
  type CupSide,
  type StemTemplate,
} from '../state/templateStore'
import {
  cupShape,
  cupDiameterMm,
  cupInclination,
  headOffsetMm,
  stemCatalogEntries,
  stemShape,
} from '../lib/hip/templates'
import { MEDACTA_IMAGES } from '../lib/hip/medactaImages'
import { resolveTemplateImage } from '../lib/templates/registry'
import { add as addV, refLineFrame, scale as scaleV } from '../lib/hip/geometry'
import { CupLabel } from './CupLabel'

type Vp = NonNullable<ReturnType<typeof getViewport>>

/** Startet einen Zieh-Vorgang; ruft onMove mit dem Weltpunkt des Cursors. */
function dragHandle(
  e: React.MouseEvent,
  vp: Vp,
  onMove: (world: Types.Point3) => void,
) {
  if (e.metaKey || e.ctrlKey) return // Cmd/Strg+Links = Pan (H2)
  e.stopPropagation()
  e.preventDefault()
  const rect = vp.canvas.getBoundingClientRect()
  function move(ev: MouseEvent) {
    onMove(vp.canvasToWorld([ev.clientX - rect.left, ev.clientY - rect.top]))
  }
  function up() {
    window.removeEventListener('mousemove', move, true)
    window.removeEventListener('mouseup', up, true)
  }
  window.addEventListener('mousemove', move, true)
  window.addEventListener('mouseup', up, true)
}

export function TemplateOverlay() {
  useViewportSync()
  const svgRef = useRef<SVGSVGElement>(null)

  const templates = useTemplateStore((s) => s.templates)
  const stems = useTemplateStore((s) => s.stems)
  const referenceLine = useTemplateStore((s) => s.referenceLine)
  const pending = useTemplateStore((s) => s.pending)
  const calibration = useViewerStore((s) => s.calibration)
  const factor = calibration?.mmPerWorldUnit ?? 1

  // Wenn ein Platzier-/Mess-Werkzeug aktiv ist, dürfen die Schablonen-
  // Hit-Regionen (Drag/Rotate) KEINE Klicks abfangen — sonst kann der
  // Nutzer dort, wo Pfanne/Schaft liegen (= genau die relevante Region),
  // keine Osteotomie-/Osteophyten-/Mess-Punkte setzen. In diesen Modi
  // werden alle Hit-Regionen auf pointer-events:none gestellt, sodass
  // Klicks bis zum Viewport durchfallen.
  const hipActive = useHipStore((s) => s.activeKind != null)
  const kneeActive = useKneeStore((s) => s.activeKind != null)
  const notePlacing = useNoteStore((s) => s.placing)
  const osteophytePlacing = useOsteophyteStore((s) => s.placing)
  const locked =
    hipActive || kneeActive || notePlacing || osteophytePlacing || pending != null

  // Mousedown-Capture für die Tränenfigur-Stufe und Esc zum Abbruch.
  useEffect(() => {
    const main = svgRef.current?.parentElement
    if (!main) return

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey) return // Cmd/Strg+Links = Pan (H2)
      if ((e.target as Element | null)?.closest('button, [data-overlay-ui]')) return
      const p = useTemplateStore.getState().pending
      if (!p) return
      const vp = getViewport()
      if (!vp) return
      const rect = vp.canvas.getBoundingClientRect()
      const world = vp.canvasToWorld([
        e.clientX - rect.left,
        e.clientY - rect.top,
      ])

      // Pfannen-Tränenfigur — direkter Klick-zu-Punkt.
      if (p.kind === 'cup' && p.stage === 'teardrop') {
        e.stopPropagation()
        e.preventDefault()
        finishCupPlacement(world)
        return
      }

      // Schaft-Femurachse — zwei Klicks (proximal, distal).
      if (p.kind === 'stem' && p.stage === 'femur-axis') {
        e.stopPropagation()
        e.preventDefault()
        const firstPoint = useTemplateStore.getState().addFemurAxisPoint(world)
        if (firstPoint) {
          // Zweiter Klick: Achse ist komplett — Schaft platzieren.
          placeStemForSide(p.side, [firstPoint, world])
        }
        return
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        useTemplateStore.getState().cancelPlacement()
        return
      }
      // Pfeiltasten-Navigation für die selektierte Schablone.
      // Ohne Modifier: feine Verschiebung in 0,5-mm-Schritten (mit Shift: 2 mm).
      // Alt-Modifier: feine Rotation um 0,2° (mit Shift: 1°).
      // Ignorieren, wenn Fokus in einem Eingabefeld liegt.
      const target = e.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return
      }
      const isArrow =
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      if (!isArrow) return
      const s = useTemplateStore.getState()
      const selId = s.selectedId
      if (!selId) return
      const stem = s.stems.find((t) => t.id === selId)
      const cup = s.templates.find((t) => t.id === selId)
      if (!stem && !cup) return
      e.preventDefault()
      const calibration = useViewerStore.getState().calibration
      const mmPerWorldUnit = calibration?.mmPerWorldUnit ?? 1
      const isRotate = e.altKey
      // Feine Verschiebung: 0,5 mm pro Tastendruck (mit Shift 2 mm) —
      // analog zur feinen Rotation, für die präzise Schaft-/Pfannen-
      // Platzierung.
      const step = e.shiftKey ? 2 : 0.5
      if (isRotate && stem) {
        // Rotation: Up/Right = CW, Down/Left = CCW. Deutlich feinere
        // Schritte als die Verschiebung — für die präzise Varus/Valgus-
        // Ausrichtung: 0,2° pro Tastendruck, mit Shift 1°.
        const rotStep = e.shiftKey ? 1 : 0.2
        const deltaDeg =
          e.key === 'ArrowRight' || e.key === 'ArrowUp' ? +rotStep : -rotStep
        s.setRotation(stem.id, stem.rotationDeg + deltaDeg)
        return
      }
      // Verschiebung — in Welt-Einheiten umrechnen.
      const stepWorld = step / mmPerWorldUnit
      let dx = 0
      let dy = 0
      if (e.key === 'ArrowLeft') dx = -stepWorld
      if (e.key === 'ArrowRight') dx = +stepWorld
      // Canvas-Y zeigt nach UNTEN; ArrowUp soll im Bild NACH OBEN.
      if (e.key === 'ArrowUp') dy = -stepWorld
      if (e.key === 'ArrowDown') dy = +stepWorld
      if (stem) {
        s.updateCenter(stem.id, [
          stem.headCenter[0] + dx,
          stem.headCenter[1] + dy,
          stem.headCenter[2],
        ])
      } else if (cup) {
        s.updateCenter(cup.id, [
          cup.center[0] + dx,
          cup.center[1] + dy,
          cup.center[2],
        ])
      }
    }

    main.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      main.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const vp = getViewport()
  // SVG-Wrapper IMMER rendern (auch leer), damit die svgRef beim ersten
  // Mount gesetzt ist und der useEffect oben den Mousedown-Listener
  // zuverlässig anhängen kann.
  if (!vp) {
    return (
      <svg
        ref={svgRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    )
  }

  const w2c = (p: Types.Point3): Types.Point2 => vp.worldToCanvas(p)

  return (
    <>
      <svg
        ref={svgRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {referenceLine && (
          <ReferenceLine line={referenceLine} vp={vp} w2c={w2c} />
        )}
        {templates
          .filter((cup) => cup.visible !== false)
          .map((cup) => (
            <CupGraphic
              key={cup.id}
              cup={cup}
              vp={vp}
              factor={factor}
              w2c={w2c}
              refLine={referenceLine}
              locked={locked}
            />
          ))}
        {stems
          .filter((s) => s.visible !== false)
          .map((stem) => (
            <StemGraphic
              key={stem.id}
              stem={stem}
              vp={vp}
              factor={factor}
              w2c={w2c}
              locked={locked}
            />
          ))}

        {/* Femur-Schaft-Achsen der platzierten Schäfte als dezente
            gestrichelte Linien — zeigt klinisch, wogegen der Schaft als
            Varus/Valgus gemessen wird. */}
        {stems
          .filter((s) => s.visible !== false && s.femurAxis != null)
          .map((stem) => {
            const a = w2c(stem.femurAxis![0])
            const b = w2c(stem.femurAxis![1])
            return (
              <g key={`axis-${stem.id}`} style={{ pointerEvents: 'none' }}>
                <line
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                  strokeDasharray="6 4"
                  opacity={0.55}
                />
              </g>
            )
          })}

        {/* Während des Femur-Achse-Klick-Workflows: erster bereits
            gesetzter Punkt als kleines Kreuz, damit der Nutzer sieht,
            wovon ausgehend der nächste Klick die Achse definiert. */}
        {pending?.kind === 'stem' &&
          pending.stage === 'femur-axis' &&
          pending.axisDraft && (
            <g style={{ pointerEvents: 'none' }}>
              {(() => {
                const p = w2c(pending.axisDraft)
                const arm = 7
                return (
                  <>
                    <line
                      x1={p[0] - arm}
                      y1={p[1]}
                      x2={p[0] + arm}
                      y2={p[1]}
                      stroke="#fde047"
                      strokeWidth={2}
                    />
                    <line
                      x1={p[0]}
                      y1={p[1] - arm}
                      x2={p[0]}
                      y2={p[1] + arm}
                      stroke="#fde047"
                      strokeWidth={2}
                    />
                  </>
                )
              })()}
            </g>
          )}
      </svg>

      {templates
        .filter((cup) => cup.visible !== false)
        .map((cup) => (
          <CupLabel
            key={cup.id}
            cup={cup}
            lines={[
              calibration
                ? `⌀ ${cupDiameterMm(cup.catalogIndex, cup.sizeIndex)} mm`
                : `⌀ ${cupDiameterMm(cup.catalogIndex, cup.sizeIndex)} mm (unkal.)`,
            ]}
            anchor={cup.center}
            vp={vp}
          />
        ))}

      {stems
        .filter((s) => s.visible !== false)
        .map((stem) => {
          const entry = stemCatalogEntries()[stem.catalogIndex]
          const size = entry?.sizes[stem.sizeIndex]
          const offsetMm = headOffsetMm(stem.headOffsetIndex)
          const offsetTxt = offsetMm >= 0 ? `+${offsetMm}` : `${offsetMm}`
          return (
            <CupLabel
              key={stem.id}
              cup={stem}
              lines={[
                `${entry?.family ?? 'Schaft'} ${entry?.variant ?? ''}`.trim(),
                `Gr. ${size?.size ?? '?'} · Kopf ${offsetTxt} mm`,
              ]}
              anchor={stem.headCenter}
              vp={vp}
            />
          )
        })}

      {pending && <PlacementBanner pending={pending} />}
    </>
  )
}

function ReferenceLine({
  line,
  vp,
  w2c,
}: {
  line: [Types.Point3, Types.Point3]
  vp: Vp
  w2c: (p: Types.Point3) => Types.Point2
}) {
  const a = w2c(line[0])
  const b = w2c(line[1])

  function moveLine(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const rect = vp.canvas.getBoundingClientRect()
    const start = vp.canvasToWorld([
      e.clientX - rect.left,
      e.clientY - rect.top,
    ])
    // Beide Endpunkte beim Startklick merken — anschließend um Delta verschieben.
    const startLine = useTemplateStore.getState().referenceLine
    if (!startLine) return
    const [s0, s1] = [startLine[0], startLine[1]]
    function move(ev: MouseEvent) {
      const w = vp.canvasToWorld([
        ev.clientX - rect.left,
        ev.clientY - rect.top,
      ])
      const dx = w[0] - start[0]
      const dy = w[1] - start[1]
      const store = useTemplateStore.getState()
      store.setReferencePoint(0, [s0[0] + dx, s0[1] + dy, s0[2]])
      store.setReferencePoint(1, [s1[0] + dx, s1[1] + dy, s1[2]])
    }
    function up() {
      window.removeEventListener('mousemove', move, true)
      window.removeEventListener('mouseup', up, true)
    }
    window.addEventListener('mousemove', move, true)
    window.addEventListener('mouseup', up, true)
  }

  return (
    <g>
      {/* Sichtbarer gestrichelter Strich */}
      <line
        x1={a[0]}
        y1={a[1]}
        x2={b[0]}
        y2={b[1]}
        stroke="#e2e8f0"
        strokeWidth={1}
        strokeDasharray="6 4"
      />
      {/* Großzügiger transparenter Hit-Bereich zum Verschieben der ganzen Linie */}
      <line
        data-overlay-ui
        x1={a[0]}
        y1={a[1]}
        x2={b[0]}
        y2={b[1]}
        stroke="transparent"
        strokeWidth={14}
        style={{ pointerEvents: 'stroke', cursor: 'move' }}
        onMouseDown={moveLine}
      />
      {([0, 1] as const).map((i) => {
        const c = i === 0 ? a : b
        return (
          <circle
            key={i}
            data-overlay-ui
            cx={c[0]}
            cy={c[1]}
            r={5}
            fill="#334155"
            stroke="#cbd5e1"
            strokeWidth={1.5}
            style={{ pointerEvents: 'all', cursor: 'grab' }}
            onMouseDown={(e) =>
              dragHandle(e, vp, (world) =>
                useTemplateStore.getState().setReferencePoint(i, world),
              )
            }
          />
        )
      })}
    </g>
  )
}

const CROSS_ARM = 7
const HIT_RADIUS = 14
const HIT_STROKE = 14

function CupGraphic({
  cup,
  vp,
  factor,
  w2c,
  refLine,
  locked,
}: {
  cup: CupTemplate
  vp: Vp
  factor: number
  w2c: (p: Types.Point3) => Types.Point2
  refLine: [Types.Point3, Types.Point3] | null
  /** Wenn true (Platzier-/Mess-Modus aktiv), fangen die Hit-Regionen
   *  keine Klicks ab → Klicks fallen zum Viewport durch. */
  locked: boolean
}) {
  const selected = useTemplateStore((s) => s.selectedId === cup.id)
  const diameter = cupDiameterMm(cup.catalogIndex, cup.sizeIndex)
  const shape = cupShape(cup.center, diameter, cup.rotationDeg, factor, cup.side)

  const c = w2c(shape.center)
  const rot = w2c(shape.rotationHandle)
  const rimA = w2c(shape.rimLineFrom)
  const rimB = w2c(shape.rimLineTo)
  const axisA = w2c(shape.axisFrom)
  const axisB = w2c(shape.axisTo)
  const domePts = shape.domeArc.map(w2c)
  const cranialPts = shape.cranialEdge.map(w2c)
  const cranialAnchor = w2c(shape.cranialAnchor)
  // Inklination als kleine dezente Beschriftung am Rand.
  const inclination = refLine
    ? cupInclination(shape.rimFrom, shape.rimTo, refLine[0], refLine[1])
    : null

  // Pfannen-Farbe: Bernstein (Amber), konsistent mit den Knie-Schablonen
  // und dem (ebenfalls amber getönten) Schaft. Selektiert helleres Amber
  // als Aktiv-Signal — analog zur Knie-Schablone.
  const accent = selected ? '#FFE08A' : '#FFC400'
  // Pfannen-Linie etwas kräftiger als der (feine) Schaft — gewünschter
  // Kontrast, damit die Pfanne klar ablesbar bleibt.
  const domeWidth = selected ? 3 : 2.5

  function startMove(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const store = useTemplateStore.getState()
    store.select(cup.id)
    useNoteStore.getState().select(null)
    useHipStore.getState().selectLabel(null)
    const rect = vp.canvas.getBoundingClientRect()
    const start = vp.canvasToWorld([
      e.clientX - rect.left,
      e.clientY - rect.top,
    ])
    const off = [cup.center[0] - start[0], cup.center[1] - start[1]]
    function move(ev: MouseEvent) {
      const w = vp.canvasToWorld([
        ev.clientX - rect.left,
        ev.clientY - rect.top,
      ])
      store.updateCenter(cup.id, [w[0] + off[0], w[1] + off[1], cup.center[2]])
    }
    function up() {
      window.removeEventListener('mousemove', move, true)
      window.removeEventListener('mouseup', up, true)
    }
    window.addEventListener('mousemove', move, true)
    window.addEventListener('mouseup', up, true)
  }

  function rotateCup(e: React.MouseEvent) {
    useTemplateStore.getState().select(cup.id)
    dragHandle(e, vp, (world) => {
      const deg =
        (Math.atan2(world[1] - cup.center[1], world[0] - cup.center[0]) *
          180) /
          Math.PI -
        90
      useTemplateStore.getState().setRotation(cup.id, deg)
    })
  }

  return (
    <g>
      {/* Tränenfigur-Messung (falls Tränenfigur gesetzt) */}
      {cup.teardrop && refLine && (
        <TeardropMeasure
          teardrop={cup.teardrop}
          rimFrom={shape.rimFrom}
          rimTo={shape.rimTo}
          refLine={refLine}
          factor={factor}
          w2c={w2c}
          side={cup.side}
        />
      )}

      {/* Verlängerte Achsen — sichtbar UND klickbar zum Verschieben */}
      {!locked && (
        <line
          data-overlay-ui
          x1={rimA[0]}
          y1={rimA[1]}
          x2={rimB[0]}
          y2={rimB[1]}
          stroke="transparent"
          strokeWidth={HIT_STROKE}
          style={{ pointerEvents: 'stroke', cursor: 'move' }}
          onMouseDown={startMove}
        />
      )}
      <line
        x1={rimA[0]}
        y1={rimA[1]}
        x2={rimB[0]}
        y2={rimB[1]}
        stroke={accent}
        strokeWidth={domeWidth}
        opacity={0.9}
      />
      {!locked && (
        <line
          data-overlay-ui
          x1={axisA[0]}
          y1={axisA[1]}
          x2={axisB[0]}
          y2={axisB[1]}
          stroke="transparent"
          strokeWidth={HIT_STROKE}
          style={{ pointerEvents: 'stroke', cursor: 'move' }}
          onMouseDown={startMove}
        />
      )}
      <line
        x1={axisA[0]}
        y1={axisA[1]}
        x2={axisB[0]}
        y2={axisB[1]}
        stroke={accent}
        strokeWidth={domeWidth}
        opacity={0.9}
      />

      {/* Pfannen-Kuppel.
          SVG-`polygon` schließt automatisch — die domePts gehen von
          rimTo über den Kuppelscheitel zurück zu rimFrom; das implizite
          Schließen ergibt einen Halbkreis-Pie. Wir nutzen das als
          unsichtbare Hit-Region (transparenter Fill), damit der Nutzer
          die Pfanne durch Klick irgendwo IM Halbkreis verschieben kann
          — nicht nur über das kleine Mittel-Kreuz. Die sichtbare Linie
          ist die normale `polyline` darunter. */}
      {!locked && (
        <>
          <polygon
            data-overlay-ui
            points={domePts.map((p) => `${p[0]},${p[1]}`).join(' ')}
            fill="transparent"
            style={{ pointerEvents: 'fill', cursor: 'move' }}
            onMouseDown={startMove}
          />
          <polyline
            data-overlay-ui
            points={domePts.map((p) => `${p[0]},${p[1]}`).join(' ')}
            fill="none"
            stroke="transparent"
            strokeWidth={HIT_STROKE}
            style={{ pointerEvents: 'stroke', cursor: 'move' }}
            onMouseDown={startMove}
          />
        </>
      )}
      <polyline
        points={domePts.map((p) => `${p[0]},${p[1]}`).join(' ')}
        fill="none"
        stroke={accent}
        strokeWidth={domeWidth}
      />

      {/* Cranial Edge: kurzer 5°-Bogen AUSSERHALB am kaudalen Rim-Eck … */}
      <polyline
        points={cranialPts.map((p) => `${p[0]},${p[1]}`).join(' ')}
        fill="none"
        stroke={accent}
        strokeWidth={domeWidth}
      />
      {/* … plus „wahrer Pfannenrand": Sehne vom äußeren Endpunkt des
          Cranial-Edge-Bogens zum gegenüberliegenden (kranial-medialen)
          Rim-Eck — leicht gegenüber der Diameter-Linie gekippt. */}
      <line
        x1={cranialPts[cranialPts.length - 1][0]}
        y1={cranialPts[cranialPts.length - 1][1]}
        x2={cranialAnchor[0]}
        y2={cranialAnchor[1]}
        stroke={accent}
        strokeWidth={domeWidth}
      />

      {/* Rotationsgriff (im Platzier-/Mess-Modus ausgeblendet) */}
      {!locked && (
        <circle
          data-overlay-ui
          cx={rot[0]}
          cy={rot[1]}
          r={5}
          fill="#0c4a6e"
          stroke="#e0f2fe"
          strokeWidth={1.5}
          style={{ pointerEvents: 'all', cursor: 'grab' }}
          onMouseDown={rotateCup}
        />
      )}

      {/* Zentrum: feines Kreuz */}
      <line
        x1={c[0] - CROSS_ARM}
        y1={c[1]}
        x2={c[0] + CROSS_ARM}
        y2={c[1]}
        stroke={accent}
        strokeWidth={1.5}
      />
      <line
        x1={c[0]}
        y1={c[1] - CROSS_ARM}
        x2={c[0]}
        y2={c[1] + CROSS_ARM}
        stroke={accent}
        strokeWidth={1.5}
      />
      <circle
        data-overlay-ui
        cx={c[0]}
        cy={c[1]}
        r={HIT_RADIUS}
        fill="transparent"
        style={{ pointerEvents: 'all', cursor: 'move' }}
        onMouseDown={startMove}
      />

      {/* Inklination — dezente Anmerkung IMMER am kranialen Rim-Eck
          (= das mit kleinerem Canvas-y, also weiter oben im Bild).
          So sitzt das Label für R UND L spiegelbildlich an der gleichen
          klinischen Position. */}
      {inclination != null && (() => {
        const cranialRim = rimA[1] <= rimB[1] ? rimA : rimB
        return (
          <text
            x={cranialRim[0] + 6}
            y={cranialRim[1] - 4}
            fill="#cbd5e1"
            fontSize={11}
            fontFamily="system-ui, sans-serif"
            paintOrder="stroke"
            stroke="#0f172a"
            strokeWidth={3}
          >
            {`${inclination.toFixed(1)}°`}
          </text>
        )
      })()}
    </g>
  )
}

/**
 * Schaft-Schablone — rein PDF-basiert.
 *
 * Interaktion:
 *  - Verschieben: Klick auf die Implantat-Kontur (Hit-Region = das
 *    Bild-Bounding-Box selber, transparent darübergelegt). Die alten
 *    stilisierten Trapez-/Hals-Polygone sind weg.
 *  - Drehen: Kreis-Pfeil-Icon an der LATERALEN SCHULTER (= apOrigin
 *    aus dem Medacta-Template, dort sitzt der natürliche Pivot bei
 *    Varus-/Valgus-Tilt der Schaftachse). Pivot bleibt stationär;
 *    Kopf wandert mit.
 *  - Kopfzentrum-Kreuz: nur visueller Marker für den Pfannen-Kontakt.
 */
function StemGraphic({
  stem,
  vp,
  factor,
  w2c,
  locked,
}: {
  stem: StemTemplate
  vp: Vp
  factor: number
  w2c: (p: Types.Point3) => Types.Point2
  /** Im Platzier-/Mess-Modus: Hit-Regionen ausblenden, damit Klicks zum
   *  Viewport durchfallen (Osteotomie/Osteophyt über dem Schaft). */
  locked: boolean
}) {
  const selected = useTemplateStore((s) => s.selectedId === stem.id)
  const contour = useStemContourPlacement(stem, factor, vp)
  // Wenn das Schaft-PNG nicht lädt/rendert: auf die Strich-Kontur zurückfallen,
  // damit der Schaft NIE komplett unsichtbar ist (Ursache des „Schaft weg"-Bugs).
  // Beim Bildwechsel (neue href) den Fehler zurücksetzen.
  const [imgError, setImgError] = useState(false)
  useEffect(() => setImgError(false), [contour?.href])
  const useImage = contour != null && !imgError
  // Stylized shape ist der Fallback, wenn kein PDF vorliegt ODER es nicht lud.
  const shape = stemShape(
    stem.headCenter,
    stem.rotationDeg,
    stem.catalogIndex,
    stem.sizeIndex,
    stem.headOffsetIndex,
    factor,
    stem.side,
  )
  const headC = w2c(shape.headCenter)
  const fallbackBodyPts = shape.bodyPolygon.map(w2c)
  const fallbackNeckPts = shape.neckPolygon.map(w2c)
  const accent = selected ? '#FFE08A' : '#FFC400'

  /**
   * Verschiebung: Cursor-Delta wird auf headCenter angewendet — Kopf
   * folgt der Maus, der Rest der Schablone wandert mit.
   */
  function startMove(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const store = useTemplateStore.getState()
    store.select(stem.id)
    useNoteStore.getState().select(null)
    useHipStore.getState().selectLabel(null)
    const rect = vp.canvas.getBoundingClientRect()
    const start = vp.canvasToWorld([e.clientX - rect.left, e.clientY - rect.top])
    const startHead = stem.headCenter
    function move(ev: MouseEvent) {
      const w = vp.canvasToWorld([ev.clientX - rect.left, ev.clientY - rect.top])
      store.updateCenter(stem.id, [
        startHead[0] + (w[0] - start[0]),
        startHead[1] + (w[1] - start[1]),
        startHead[2],
      ])
    }
    function up() {
      window.removeEventListener('mousemove', move, true)
      window.removeEventListener('mouseup', up, true)
    }
    window.addEventListener('mousemove', move, true)
    window.addEventListener('mouseup', up, true)
  }

  // Hinweis: Die Maus-Rotation (früher per Kreis-Pfeil-Icon an der
  // Schulter) wurde entfernt. Der Schaft wird jetzt ausschließlich per
  // Tastatur fein ausgerichtet (Alt + Pfeiltasten, siehe TemplateOverlay-
  // Keyboard-Handler).

  return (
    <g>
      {/* PDF-Kontur (gerastert + gecroppt). feColorMatrix färbt das
          dunkle Strichbild BERNSTEIN ein (konsistent mit Pfanne + Knie).
            normal:    Amber-400  #FFC400 = (1, 0.769, 0)
            selected:  helleres   #FFE08A = (1, 0.878, 0.541)

          Die ersten drei Matrix-Zeilen setzen R/G/B konstant auf den Sky-
          Wert (Eingangsfarbe ignoriert). Die ALPHA-Zeile ist
          `-1 -1 -1 1.5 0` → Alpha = 1,5·A_in − R − G − B:
           • WEISSER PNG-Hintergrund (1,1,1,1): 1,5 − 3 = −1,5 → 0 = transparent.
             (WICHTIG: die Medacta-PNGs haben einen weißen, KEINEN trans-
             parenten Hintergrund. Ohne die −1−1−1-Terme würde die ganze
             Bounding-Box als volle Fläche eingefärbt.)
           • DUNKLE Linie (≈0,0,0,1): 1,5 → 1 = voll deckend sky-400.
           • MITTELGRAUE Antialiasing-Kante (0.5,0.5,0.5,1): 0,75 − 1,5 < 0
             → transparent → schlankere Linie.
          Der Faktor 1,5 (statt 2) hält nur den dunklen Linienkern deckend
          und blendet die Kanten aus → feinere Schaft-Linie. */}
      {contour && !imgError && (
        <>
          <defs>
            <filter
              id={`stem-tint-${stem.id}`}
              colorInterpolationFilters="sRGB"
            >
              {/* Beim RAUSZOOMEN (PNG verkleinert) mitteln sich die dünnen
                  Linien mit dem weißen Grund zu Mittelgrau — die strenge
                  Kern-Regel (Alpha = 1,5·A − R − G − B) blendet die ganze
                  Schablone dann aus (Klinik-Report: „Quadra short neck
                  beinahe unsichtbar"). Unter 90 % Darstellungsgröße darum
                  tolerante Luminanz-Regel: Alpha = 1,6·(1 − Helligkeit) —
                  Weiß bleibt exakt transparent (1,6 − 3·0,5333 = 0). */}
              <feColorMatrix
                type="matrix"
                values={
                  contour.scaleCanvasPerPng >= 0.9
                    ? selected
                      ? '0 0 0 0 1  0 0 0 0 0.878  0 0 0 0 0.541  -1 -1 -1 1.5 0'
                      : '0 0 0 0 1  0 0 0 0 0.769  0 0 0 0 0  -1 -1 -1 1.5 0'
                    : selected
                      ? '0 0 0 0 1  0 0 0 0 0.878  0 0 0 0 0.541  -0.5333 -0.5333 -0.5333 1.6 0'
                      : '0 0 0 0 1  0 0 0 0 0.769  0 0 0 0 0  -0.5333 -0.5333 -0.5333 1.6 0'
                }
              />
            </filter>
          </defs>
          {/* Transform-Reihenfolge (SVG: rechts-nach-links wirksam):
              Erst ggf. horizontal um den Anker spiegeln (scale -1,1
              um anchor.x) — nötig für L-Hüfte, weil alle Medacta-PDFs
              in R-Konvention vorliegen. Dann Rotation um den Anker. */}
          <image
            href={contour.href}
            // PDF-Export: html2canvas kann SVG-Filter nicht — der Export
            // färbt markierte Bilder vorab pixelweise ein (Modus „stem" =
            // weißer Hintergrund raus, dunkle Linie deckend).
            data-pdf-tint="stem"
            x={contour.topLeftCanvas[0]}
            y={contour.topLeftCanvas[1]}
            width={contour.widthCanvas}
            height={contour.heightCanvas}
            transform={
              contour.mirror
                ? `rotate(${contour.rotationDeg} ${contour.anchorCanvas[0]} ${contour.anchorCanvas[1]}) translate(${contour.anchorCanvas[0]} 0) scale(-1 1) translate(${-contour.anchorCanvas[0]} 0)`
                : `rotate(${contour.rotationDeg} ${contour.anchorCanvas[0]} ${contour.anchorCanvas[1]})`
            }
            opacity={1}
            filter={`url(#stem-tint-${stem.id})`}
            preserveAspectRatio="none"
            style={{ pointerEvents: 'none' }}
            onError={() => {
              logDiagnostic(`Schaft-PNG nicht ladbar/renderbar: ${contour.href}`)
              setImgError(true)
            }}
          />
          {/* Hit-Region zum Verschieben: identisches Bild, vollständig
              transparent, NUR Klicks abfangen. Im Platzier-/Mess-Modus
              (locked) NICHT gerendert, damit Osteotomie-/Osteophyten-/
              Mess-Klicks ÜBER dem Schaft zum Viewport durchfallen. */}
          {!locked && (
            <image
              data-overlay-ui
              href={contour.href}
              x={contour.topLeftCanvas[0]}
              y={contour.topLeftCanvas[1]}
              width={contour.widthCanvas}
              height={contour.heightCanvas}
              transform={
                contour.mirror
                  ? `rotate(${contour.rotationDeg} ${contour.anchorCanvas[0]} ${contour.anchorCanvas[1]}) translate(${contour.anchorCanvas[0]} 0) scale(-1 1) translate(${-contour.anchorCanvas[0]} 0)`
                  : `rotate(${contour.rotationDeg} ${contour.anchorCanvas[0]} ${contour.anchorCanvas[1]})`
              }
              opacity={0}
              preserveAspectRatio="none"
              style={{ pointerEvents: 'all', cursor: 'move' }}
              onMouseDown={startMove}
            />
          )}
        </>
      )}

      {/* Fallback: stilisierte Geometrie, wenn kein PDF-Bild da ist ODER es
          nicht lud (dann ist der Schaft wenigstens als Kontur sichtbar). */}
      {!useImage && (
        <>
          <polygon
            points={fallbackBodyPts.map((p) => `${p[0]},${p[1]}`).join(' ')}
            fill="none"
            stroke={accent}
            strokeWidth={selected ? 2.5 : 2}
          />
          {!locked && (
            <polygon
              data-overlay-ui
              points={fallbackBodyPts.map((p) => `${p[0]},${p[1]}`).join(' ')}
              fill="transparent"
              style={{ pointerEvents: 'fill', cursor: 'move' }}
              onMouseDown={startMove}
            />
          )}
          <polygon
            points={fallbackNeckPts.map((p) => `${p[0]},${p[1]}`).join(' ')}
            fill="none"
            stroke={accent}
            strokeWidth={selected ? 2.5 : 2}
          />
        </>
      )}

      {/* Fettes Kreuz am Schaft-Anker (= Pfannen-Drehzentrum nach
          Initial-Placement). Markiert die Position der GEWÄHLTEN
          Kopflänge. Die anderen 4 Halsverlängerungen sind im PDF als
          kleine Kugeln auf dem Hals-Konus weiterhin sichtbar. */}
      {contour && !imgError && (
        <g style={{ pointerEvents: 'none' }}>
          <line
            x1={contour.anchorCanvas[0] - CROSS_ARM}
            y1={contour.anchorCanvas[1]}
            x2={contour.anchorCanvas[0] + CROSS_ARM}
            y2={contour.anchorCanvas[1]}
            stroke={accent}
            strokeWidth={2.5}
          />
          <line
            x1={contour.anchorCanvas[0]}
            y1={contour.anchorCanvas[1] - CROSS_ARM}
            x2={contour.anchorCanvas[0]}
            y2={contour.anchorCanvas[1] + CROSS_ARM}
            stroke={accent}
            strokeWidth={2.5}
          />
        </g>
      )}

      {/* Fallback ohne (nutzbares) Bild: zumindest das Kopfzentrum-Kreuz
          am Anker zeigen. */}
      {!useImage && (
        <g style={{ pointerEvents: 'none' }}>
          <line
            x1={headC[0] - CROSS_ARM}
            y1={headC[1]}
            x2={headC[0] + CROSS_ARM}
            y2={headC[1]}
            stroke={accent}
            strokeWidth={2.5}
          />
          <line
            x1={headC[0]}
            y1={headC[1] - CROSS_ARM}
            x2={headC[0]}
            y2={headC[1] + CROSS_ARM}
            stroke={accent}
            strokeWidth={2.5}
          />
        </g>
      )}

    </g>
  )
}

/** Zwei parallele Linien an Tränenfigur und kaudaler Pfannenkante + mm-Distanz.
 *  Beschriftung liegt richtung Beckeninnenseite — auf der Mitte der Sehne
 *  zwischen den medialen Endpunkten der beiden Parallelen. */
function TeardropMeasure({
  teardrop,
  rimFrom,
  rimTo,
  refLine,
  factor,
  w2c,
  side,
}: {
  teardrop: Types.Point3
  rimFrom: Types.Point3
  rimTo: Types.Point3
  refLine: [Types.Point3, Types.Point3]
  factor: number
  w2c: (p: Types.Point3) => Types.Point2
  side: CupSide
}) {
  // Kaudale Pfannenkante = Rim-Endpunkt mit größerem Canvas-y (= weiter unten).
  const fromC = w2c(rimFrom)
  const toC = w2c(rimTo)
  const caudal = fromC[1] >= toC[1] ? rimFrom : rimTo

  // Richtung + Normale der Referenzlinie aus hip/geometry — dieselbe
  // Konvention wie alle LLD-/Offset-Rechnungen (Audit-Befund D3/D4).
  const { u, n } = refLineFrame(refLine[0], refLine[1])

  // Lot-Distanz Tränenfigur ↔ Pfannenkante (entlang n; Betrag —
  // Orientierung der Normalen ist hier egal).
  const dx = teardrop[0] - caudal[0]
  const dy = teardrop[1] - caudal[1]
  const perpDistWorld = Math.abs(dx * n[0] + dy * n[1])
  const mm = perpDistWorld * factor

  // Beide Parallelen: 30 mm lang, zentriert über dem Punkt.
  const halfLen = 15 / factor
  // Medialer Endpunkt jeder Parallele liegt richtung Beckeninnenseite:
  // R-Hüfte ist auf Bild-LINKS → medial = +u (nach rechts).
  // L-Hüfte ist auf Bild-RECHTS → medial = −u (nach links).
  // Wir wählen die Endpunkte so, dass `…Inner` immer der mediale Endpunkt
  // ist und der Label dort hin wandert.
  const medialSign = side === 'R' ? +1 : -1
  const tInner = w2c(addV(teardrop, scaleV(u, +medialSign * halfLen)))
  const tOuter = w2c(addV(teardrop, scaleV(u, -medialSign * halfLen)))
  const cInner = w2c(addV(caudal, scaleV(u, +medialSign * halfLen)))
  const cOuter = w2c(addV(caudal, scaleV(u, -medialSign * halfLen)))

  // Label: Mitte der Sehne zwischen den beiden medialen Endpunkten.
  // Etwas weiter nach medial geschoben, damit der Text nicht direkt
  // auf der Linie sitzt.
  const labelDx = ((tInner[0] - tOuter[0]) / Math.hypot(tInner[0] - tOuter[0], tInner[1] - tOuter[1])) * 14
  const labelDy = ((tInner[1] - tOuter[1]) / Math.hypot(tInner[0] - tOuter[0], tInner[1] - tOuter[1])) * 14
  const labelAt: Types.Point2 = [
    (tInner[0] + cInner[0]) / 2 + labelDx,
    (tInner[1] + cInner[1]) / 2 + labelDy,
  ]

  return (
    <g>
      <line
        x1={tOuter[0]}
        y1={tOuter[1]}
        x2={tInner[0]}
        y2={tInner[1]}
        stroke={MEASUREMENT_STROKE}
        strokeWidth={1.4}
      />
      <line
        x1={cOuter[0]}
        y1={cOuter[1]}
        x2={cInner[0]}
        y2={cInner[1]}
        stroke={MEASUREMENT_STROKE}
        strokeWidth={1.4}
      />
      <text
        x={labelAt[0]}
        y={labelAt[1] + 4}
        textAnchor="middle"
        fill="#cbd5e1"
        fontSize={11}
        fontFamily="system-ui, sans-serif"
        paintOrder="stroke"
        stroke="#0f172a"
        strokeWidth={3}
      >
        {mm.toFixed(1)} mm
      </text>
    </g>
  )
}

/** Gemeinsame Farbe aller Mess-Overlays: CYAN — die Komplementärfarbe zum
 *  Amber der Implantat-Schablonen, damit Messung und Implantat nie ver-
 *  schwimmen. Wird hier in TeardropMeasure, in Hip-/KneeOverlay, den
 *  Mess-Rezepten und den Cornerstone-Längen/Winkel-Tools (init.ts) genutzt. */
const MEASUREMENT_STROKE = '#e2e8f0'

/** Ergebnis-Typ für Konturen-Platzierung — alle Zahlen in Canvas-px. */
interface StemContourPlacement {
  href: string
  topLeftCanvas: Types.Point2
  widthCanvas: number
  heightCanvas: number
  /** Canvas-Pixel pro PNG-Pixel (min. der beiden Achsen). < 1 heißt:
   *  das Schablonen-PNG wird verkleinert dargestellt (rausgezoomt). */
  scaleCanvasPerPng: number
  /** Rotationswinkel (Grad) — wird auf das Bild um den HEAD-Anker
   *  angewendet, sodass die head→apOrigin-Achse mit der Schaftachse
   *  im Canvas übereinstimmt. */
  rotationDeg: number
  /** Anker-Punkt im Canvas (= headCenter, dort steht das Kreuz). */
  anchorCanvas: Types.Point2
  /** Lateraler Schulter-Punkt der Prothese in Canvas-Koordinaten —
   *  Pivot für die Drehung (Kreis-Pfeil-Icon greift hier). */
  shoulderCanvas: Types.Point2
  /** Lateraler Schulter-Punkt in Welt-Koordinaten — für die
   *  Drag-Mathematik, damit der Pivot beim Drehen stationär bleibt. */
  shoulderWorld: Types.Point3
  /** Alle 5 Kopfzentren (Halslängen-Stufen) in Canvas-Koord, inkl.
   *  Rotation um den Anker. Werden als kleine Kreuze gezeichnet,
   *  die gewählte Stufe (siehe `stem.headOffsetIndex`) bekommt ein
   *  fettes Kreuz. */
  headPositionsCanvas: Types.Point2[]
  /** Für L-Hüfte: PNG wird horizontal um den Anker gespiegelt, weil
   *  alle Medacta-PDFs in der Rechts-Konvention vorliegen (Hals oben-
   *  rechts, Body unten-links). Für die linke Hüfte ist das anatomisch
   *  spiegelverkehrt — der Hals muss oben-links zeigen, der Body unten-
   *  rechts. Die SVG-Transform bekommt zusätzlich `scale(-1, 1)` um
   *  den Anker. */
  mirror: boolean
}

/**
 * Berechnet, wo und wie groß die rasterisierte (und gecroppte) PDF-
 * Kontur in den SVG-Canvas eingezeichnet werden muss, damit:
 *  - der headPoint des Implantats (Pixel-Koordinaten aus dem Index)
 *    exakt auf dem Welt-Anker `stem.headCenter` landet,
 *  - die head→apOrigin-Richtung im Bild mit der vom Nutzer gewählten
 *    Schaftachse (`stem.rotationDeg`) übereinstimmt,
 *  - der Maßstab stimmt: `mmPerPx` aus dem Bild-Index, weiter via
 *    `mmPerWorldUnit` (`factor`) in Welt → Canvas.
 *
 * Liefert zusätzlich die laterale Schulter (= apOrigin) in Canvas- UND
 * Welt-Koordinaten — die nutzt das StemGraphic als Rotations-Pivot
 * (Kreis-Pfeil-Icon sitzt dort).
 *
 * Gibt `null` zurück, wenn für den ausgewählten Schaft kein Bild da ist.
 */
function useStemContourPlacement(
  stem: StemTemplate,
  factor: number,
  vp: Vp,
): StemContourPlacement | null {
  const catalog = stemCatalogEntries()[stem.catalogIndex]
  const size = catalog?.sizes[stem.sizeIndex]
  if (!catalog || !size) return null
  const imgMeta = MEDACTA_IMAGES[catalog.folder]?.[size.refNo]
  if (!imgMeta) return null
  const headPx = imgMeta.headPointsPx[stem.headOffsetIndex] ?? imgMeta.headPointsPx[0]
  if (!headPx) return null
  const apPx = imgMeta.apOriginPx

  // Komplett canvas-basierte Math: vermeidet Y-Flip-Probleme mit dem
  // Cornerstone-Welt-Koordinatensystem.
  //
  // 1) Anker (Pfannenzentrum) ins Canvas projizieren.
  // 2) Canvas-Pixel pro Welt-Einheit messen über 1-mm-Probe — getrennt
  //    für X und Y, weil die Achsen unterschiedlich skaliert oder
  //    gespiegelt sein können (Y oft umgekehrt).
  // 3) Bild-Top-Left + Größe direkt in Canvas-px berechnen, sodass
  //    `headPx` exakt auf `headCenter_canvas` landet.
  // 4) Rotation als CW-SVG-Transform um `headCenter_canvas`.
  const headCenterCanvas = vp.worldToCanvas(stem.headCenter)
  const oneMmInWorld = 1 / factor
  const probeX = vp.worldToCanvas([
    stem.headCenter[0] + oneMmInWorld,
    stem.headCenter[1],
    stem.headCenter[2],
  ])
  const probeY = vp.worldToCanvas([
    stem.headCenter[0],
    stem.headCenter[1] + oneMmInWorld,
    stem.headCenter[2],
  ])
  // Canvas-px pro PNG-px (Absolut-Werte — Bild-Dimensionen müssen
  // positiv sein, egal ob die Welt-Achse gespiegelt ist).
  const cppx = Math.abs(probeX[0] - headCenterCanvas[0]) * imgMeta.mmPerPx
  const cppy = Math.abs(probeY[1] - headCenterCanvas[1]) * imgMeta.mmPerPx

  const widthCanvas = imgMeta.widthPx * cppx
  const heightCanvas = imgMeta.heightPx * cppy
  // Top-Left so wählen, dass `headPx` (in Canvas-px gemessen vom
  // top-left) auf `headCenter_canvas` zu liegen kommt.
  const topLeftCanvas: Types.Point2 = [
    headCenterCanvas[0] - headPx[0] * cppx,
    headCenterCanvas[1] - headPx[1] * cppy,
  ]

  // Rotation: die SICHTBARE Schaftmittellinie (= Längsachse des
  // gerenderten PNGs) soll im Canvas dem Winkel `stem.rotationDeg`
  // entsprechen. Konvention: 0° = +x (rechts), 90° = +y (unten) — CW positiv.
  //
  // Wir benutzen den vom Rasterizer ermittelten `bodyAxisAngleDeg` (Achse
  // der Schaft-Längsmitte im PNG, per Zeilen-Mittelpunkts-PCA bestimmt)
  // als Baseline — nicht mehr die head→ap-Linie. Vorteil: (a) die Math
  // stimmt mit dem überein, was der Operateur visuell als „Implantat-
  // Mittellinie" wahrnimmt, (b) das Implantat rotiert NICHT mehr beim
  // Wechsel der Halslänge (denn der Body-Axis-Winkel ist eine feste
  // PNG-Eigenschaft, kein Function von headPx).
  //
  // Fallback bei alten medactaImages.ts-Files ohne bodyAxisAngleDeg:
  // historische head→ap-Methode (= aus apOriginPx und headPx berechnet).
  const baselineDeg =
    typeof imgMeta.bodyAxisAngleDeg === 'number'
      ? imgMeta.bodyAxisAngleDeg
      : (Math.atan2(apPx[1] - headPx[1], apPx[0] - headPx[0]) * 180) / Math.PI
  const rotationDeg = stem.rotationDeg - baselineDeg

  // Hilfsfunktion: PNG-Pixel → Canvas-Punkt NACH Rotation um den Anker.
  const rotRad = (rotationDeg * Math.PI) / 180
  const cosR = Math.cos(rotRad)
  const sinR = Math.sin(rotRad)
  function pxToCanvas(px: [number, number]): Types.Point2 {
    // Pre-rotation: einfacher Offset vom Top-Left.
    const preX = topLeftCanvas[0] + px[0] * cppx
    const preY = topLeftCanvas[1] + px[1] * cppy
    const dx = preX - headCenterCanvas[0]
    const dy = preY - headCenterCanvas[1]
    return [
      headCenterCanvas[0] + dx * cosR - dy * sinR,
      headCenterCanvas[1] + dx * sinR + dy * cosR,
    ]
  }

  // L-Hüfte: PNG horizontal spiegeln, weil Medacta-PDFs nur in
  // R-Konvention vorliegen. Bei der Bestimmung von Schulter- und
  // Kopfpositionen die PNG-Pixel um headPx in der X-Achse spiegeln —
  // das matched mit der späteren SVG-Transform (scale(-1,1) um Anker
  // VOR der Rotation), sodass beide auf den exakt gleichen Canvas-
  // Punkten landen.
  const mirror = stem.side === 'L'
  function pngPxForRender(p: [number, number]): [number, number] {
    return mirror ? [2 * headPx[0] - p[0], p[1]] : p
  }

  // Laterale Schulter (Top-Left-most Inkable-Pixel im gecroppten Bild).
  const shoulderSrc = imgMeta.shoulderPx ?? apPx
  const shoulderCanvas = pxToCanvas(pngPxForRender(shoulderSrc))
  // Welt-Position der Schulter — für die Drag-Math als Pivot.
  const shoulderWorld = vp.canvasToWorld(shoulderCanvas)

  // Alle 5 Kopfzentren in Canvas für die Kreuz-Visualisierung.
  const headPositionsCanvas: Types.Point2[] = imgMeta.headPointsPx.map((p) =>
    pxToCanvas(pngPxForRender(p as [number, number])),
  )

  return {
    href: resolveTemplateImage(imgMeta.path),
    topLeftCanvas,
    widthCanvas,
    heightCanvas,
    scaleCanvasPerPng: Math.min(cppx, cppy),
    rotationDeg,
    anchorCanvas: headCenterCanvas,
    shoulderCanvas,
    shoulderWorld,
    headPositionsCanvas,
    mirror,
  }
}

/** Banner über dem Viewport für Pfannen- und Schaft-Anlage-Ablauf. */
function PlacementBanner({
  pending,
}: {
  pending: NonNullable<ReturnType<typeof useTemplateStore.getState>['pending']>
}) {
  const store = useTemplateStore.getState()
  const kindLabel = pending.kind === 'cup' ? 'Pfanne' : 'Schaft'
  const sideLabel: Record<CupSide, string> = { R: 'rechts', L: 'links' }

  if (pending.stage === 'side') {
    // Für Stem: Side-Klick wechselt jetzt in die Femur-Achse-Stage
    // (2 Klicks zum Definieren der Femur-Schaft-Achse). Cup wechselt
    // wie bisher in die Tränenfigur-Stage.
    const pickSide = (side: CupSide) => {
      store.chooseSide(side)
    }
    return (
      <div
        data-overlay-ui
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded bg-sky-700/95 px-3 py-1.5 text-xs font-medium text-white shadow"
      >
        <span>{kindLabel} — welche Seite?</span>
        <button
          onClick={() => pickSide('R')}
          className="rounded bg-sky-900/80 px-2 py-0.5 hover:bg-sky-900"
        >
          Rechts
        </button>
        <button
          onClick={() => pickSide('L')}
          className="rounded bg-sky-900/80 px-2 py-0.5 hover:bg-sky-900"
        >
          Links
        </button>
        <button
          onClick={store.cancelPlacement}
          className="ml-2 text-sky-200 hover:text-white"
        >
          Abbrechen
        </button>
      </div>
    )
  }

  // Stem Femur-Achse: zwei Klicks (proximal, distal). Schritt-Anzeige.
  if (pending.kind === 'stem' && pending.stage === 'femur-axis') {
    const stepNum = pending.axisDraft == null ? 1 : 2
    const stepText =
      stepNum === 1
        ? 'PROXIMAL am Femur-Schaft klicken'
        : 'DISTAL am Femur-Schaft klicken'
    return (
      <div
        data-overlay-ui
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded bg-sky-700/95 px-3 py-1.5 text-xs font-medium text-white shadow"
      >
        <span>
          Schaft ({sideLabel[pending.side]}) — Schritt {stepNum}/2:{' '}
          {stepText}
        </span>
        <button
          onClick={store.cancelPlacement}
          className="ml-2 text-sky-200 hover:text-white"
        >
          Abbrechen
        </button>
      </div>
    )
  }

  // Nach der Seite-Stufe verbleibt nur noch der Cup-Tränenfigur-Klick.
  const prompt = `${kindLabel} (${pending.kind === 'cup' ? sideLabel[pending.side] : ''}) — Tränenfigur im Bild anklicken`
  const skip = () => finishCupPlacement(null)
  return (
    <div
      data-overlay-ui
      className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded bg-sky-700/95 px-3 py-1.5 text-xs font-medium text-white shadow"
    >
      <span>{prompt}</span>
      <button
        onClick={skip}
        className="rounded bg-sky-900/80 px-2 py-0.5 hover:bg-sky-900"
      >
        Überspringen
      </button>
      <button
        onClick={store.cancelPlacement}
        className="ml-2 text-sky-200 hover:text-white"
      >
        Abbrechen
      </button>
    </div>
  )
}
