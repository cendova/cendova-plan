/**
 * Overlay für platzierte Schulter-Schablonen. Rendert die Paket-Konturen
 * (SHOULDER_CONTOURS) als SVG-Polygone im Haupt-Pane und bietet dieselbe
 * Minimal-Interaktion wie das Knie: Klick = selektieren, Drag = verschieben,
 * Griff = drehen, Pfeiltasten/±/Entf wie gehabt. Kein Zwei-Bild-Modus —
 * die Schulter kennt nur die a.p.-Sicht im Haupt-Pane.
 *
 * locked-Doktrin (siehe TemplateOverlay): In Mess-/Platzier-Modi dürfen
 * die Hit-Regionen KEINE Klicks abfangen — jedes messende Modul muss in
 * der locked-Bedingung stehen, sonst verschiebt ein Mess-Klick über der
 * Schablone still das Implantat.
 */
import { useEffect, useRef } from 'react'
import type { Types } from '@cornerstonejs/core'
import { getViewport } from '../lib/cornerstone/viewer'
import { useViewportSync } from '../lib/cornerstone/useViewportSync'
import { useViewerStore } from '../state/viewerStore'
import { useHipStore } from '../state/hipStore'
import { useKneeStore } from '../state/kneeStore'
import { useShoulderStore } from '../state/shoulderStore'
import { useNoteStore } from '../state/noteStore'
import { useOsteophyteStore } from '../state/osteophyteStore'
import {
  useShoulderTemplateStore,
  type ShoulderTemplate,
} from '../state/shoulderTemplateStore'
import { getShoulderContour } from '../lib/shoulder/shoulderContours'
import { getShoulderImage } from '../lib/shoulder/shoulderImages'
import { shoulderSizeLabel } from '../lib/shoulder/shoulderCatalog'
import { resolveTemplateImage } from '../lib/templates/registry'

type Vp = NonNullable<ReturnType<typeof getViewport>>

/** Drag-Helfer (Knie-Muster): move/up als window-capture-Listener. */
function startDrag(
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

export function ShoulderTemplateOverlay() {
  useViewportSync(getViewport)
  const svgRef = useRef<SVGSVGElement>(null)

  const templates = useShoulderTemplateStore((s) => s.templates)
  const selectedId = useShoulderTemplateStore((s) => s.selectedId)
  const calibration = useViewerStore((s) => s.calibration)
  const factor = calibration?.mmPerWorldUnit ?? 1

  // locked: siehe Doktrin-Kommentar in TemplateOverlay — JEDES messende
  // Modul muss hier stehen (Werkzeug-gegen-Hit-Region, nicht Werkzeug-
  // gegen-Werkzeug).
  const hipActive = useHipStore((s) => s.activeKind != null)
  const kneeActive = useKneeStore((s) => s.activeKind != null)
  const shoulderActive = useShoulderStore((s) => s.activeKind != null)
  const notePlacing = useNoteStore((s) => s.placing)
  const osteophytePlacing = useOsteophyteStore((s) => s.placing)
  const locked =
    hipActive || kneeActive || shoulderActive || notePlacing || osteophytePlacing

  // Pfeiltasten/±/Entf für die selektierte Schablone (Knie-Muster).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const sel = useShoulderTemplateStore.getState().selectedId
      if (!sel) return
      const tmpl = useShoulderTemplateStore
        .getState()
        .templates.find((t) => t.id === sel)
      if (!tmpl) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName.toLowerCase() ?? ''
      if (
        tag === 'input' ||
        tag === 'select' ||
        tag === 'textarea' ||
        target?.isContentEditable
      ) {
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        useShoulderTemplateStore.getState().remove(tmpl.id)
        return
      }
      const isArrow =
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      const isRot = e.key === '+' || e.key === '-'
      if (!isArrow && !isRot) return
      e.preventDefault()
      const store = useShoulderTemplateStore.getState()
      if (isRot) {
        const rotStep = e.shiftKey ? 1 : 0.2
        store.setRotationDeg(
          tmpl.id,
          tmpl.rotationDeg + (e.key === '+' ? rotStep : -rotStep),
        )
        return
      }
      const step = e.shiftKey ? 2 : 0.5
      let dx = 0
      let dy = 0
      if (e.key === 'ArrowLeft') dx = -step
      if (e.key === 'ArrowRight') dx = step
      if (e.key === 'ArrowUp') dy = -step
      if (e.key === 'ArrowDown') dy = step
      const c = tmpl.center
      store.setCenter(tmpl.id, [c[0] + dx, c[1] + dy, c[2]])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const vp = getViewport()
  if (!vp) return null
  const w2c = (p: Types.Point3): Types.Point2 => vp.worldToCanvas(p)

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {templates.filter((t) => t.visible).map((t: ShoulderTemplate) => {
        const contour = getShoulderContour(t.kind, t.sizeIndex)
        const img = getShoulderImage(t.kind, t.sizeIndex)
        if (!contour && !img) return null
        const isSelected = selectedId === t.id

        // mm → Canvas-px über Probepunkte (getrennt X/Y, wie Knie-Bildpfad).
        const centerC = w2c(t.center)
        const oneMm = 1 / factor
        const probeX = w2c([t.center[0] + oneMm, t.center[1], t.center[2]])
        const probeY = w2c([t.center[0], t.center[1] + oneMm, t.center[2]])
        const pxPerMmX = Math.abs(probeX[0] - centerC[0])
        const pxPerMmY = Math.abs(probeY[1] - centerC[1])
        // Halbmaße: mit Bild aus dessen Pixel-Geometrie (inkl. Rand), sonst
        // aus der Vektor-Kontur.
        const halfWpx = img
          ? (img.widthPx * img.mmPerPx * pxPerMmX) / 2
          : (contour!.wMm / 2) * pxPerMmX
        const halfHpx = img
          ? (img.heightPx * img.mmPerPx * pxPerMmY) / 2
          : (contour!.hMm / 2) * pxPerMmY
        const cx = centerC[0]
        const cy = centerC[1]

        // Kanonische Seite = wie aufgenommen; die Gegenseite spiegelt
        // horizontal ums Zentrum. (Welche Seite die Quell-Screenshots
        // zeigen, bestätigt der Autor bei der Sichtprüfung — ggf. hier
        // die Bedingung auf 'R' drehen.)
        const mirror = t.side === 'L'
        const groupTransform =
          `rotate(${t.rotationDeg} ${cx} ${cy})` +
          (mirror ? ` translate(${cx} 0) scale(-1 1) translate(${-cx} 0)` : '')

        const stroke = isSelected ? '#FFE08A' : '#FFC400'

        function selectAndStartDrag(e: React.MouseEvent) {
          if (e.metaKey || e.ctrlKey) return
          useShoulderTemplateStore.getState().select(t.id)
          const rect = vp!.canvas.getBoundingClientRect()
          const grab = vp!.canvasToWorld([
            e.clientX - rect.left,
            e.clientY - rect.top,
          ])
          const offX = t.center[0] - grab[0]
          const offY = t.center[1] - grab[1]
          startDrag(e, vp!, (world) => {
            useShoulderTemplateStore.getState().setCenter(t.id, [
              world[0] + offX,
              world[1] + offY,
              t.center[2],
            ])
          })
        }

        // Rotationsgriff am (gedrehten) oberen Rand.
        const rad = (t.rotationDeg * Math.PI) / 180
        const armLen = halfHpx + 18
        const handleC: Types.Point2 = [
          cx + armLen * Math.sin(rad),
          cy - armLen * Math.cos(rad),
        ]

        // --- Bild-Overlay (Vorrang, Knie-Muster): der zugeschnittene
        // Quell-Screenshot maßstabsgetreu, per Farbmatrix amber eingefärbt.
        // Alpha = 2·(B−R): schwarzer Hintergrund und weiße Linien (B=R)
        // werden transparent, die cyane Zeichnung (B≫R) deckend amber,
        // der rote Referenzkreis (R≫B) verschwindet. Hilfslinien der
        // Vorlage bleiben so automatisch erhalten — pixelscharf, ohne
        // Vektor-Erkennung.
        const imgHref = img ? resolveTemplateImage(img.path) : ''
        const x0 = cx - halfWpx
        const y0 = cy - halfHpx

        return (
          <g key={t.id}>
            {img && (
              <defs>
                <filter
                  id={`shoulder-tint-${t.id}`}
                  colorInterpolationFilters="sRGB"
                >
                  {/* Alpha = (B − R), Faktor 1 statt 2 wie beim Knie: Die
                      Schulter-Bilder werden synthetisch gerendert (sauberes
                      Cyan, Antialiasing über die Helligkeit). Ein Faktor 2
                      würde die AA-Ränder auf volle Deckung ziehen — die
                      Linien wirkten wieder hart und breiter. Knie-Screen-
                      shots brauchen die 2 dagegen, weil ihre Linien dunkler
                      sind. */}
                  <feColorMatrix
                    type="matrix"
                    values={
                      isSelected
                        ? '0 0 0 0 1  0 0 0 0 0.878  0 0 0 0 0.541  -1 0 1 0 0'
                        : '0 0 0 0 1  0 0 0 0 0.769  0 0 0 0 0  -1 0 1 0 0'
                    }
                  />
                </filter>
              </defs>
            )}
            <g transform={groupTransform}>
              {img ? (
                <>
                  <image
                    href={imgHref}
                    data-pdf-tint="shoulder"
                    x={x0}
                    y={y0}
                    width={2 * halfWpx}
                    height={2 * halfHpx}
                    preserveAspectRatio="none"
                    filter={`url(#shoulder-tint-${t.id})`}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Transparente Hit-Fläche zum Verschieben (deckt das
                      gedrehte Bild exakt ab, Knie-Muster). */}
                  <image
                    data-overlay-ui
                    href={imgHref}
                    x={x0}
                    y={y0}
                    width={2 * halfWpx}
                    height={2 * halfHpx}
                    preserveAspectRatio="none"
                    opacity={0}
                    style={{
                      pointerEvents: locked ? 'none' : 'all',
                      cursor: 'move',
                    }}
                    onMouseDown={locked ? undefined : selectAndStartDrag}
                  />
                </>
              ) : (
                <polygon
                  data-overlay-ui
                  points={contour!.points
                    .map((p) => `${cx + p.x * ((contour!.wMm / 2) * pxPerMmX)},${cy + p.y * ((contour!.hMm / 2) * pxPerMmY)}`)
                    .join(' ')}
                  fill="rgba(255, 196, 0, 0.05)"
                  stroke={stroke}
                  strokeWidth={isSelected ? 2 : 1.5}
                  className={locked ? 'pointer-events-none' : 'pointer-events-auto cursor-move'}
                  onMouseDown={locked ? undefined : selectAndStartDrag}
                />
              )}
              {/* Achse aus dem Paket (falls vorhanden) — Referenz,
                  klick-durchlässig; nur im Vektor-Fallback sinnvoll (im
                  Bild ist die Achse bereits eingezeichnet). */}
              {!img && contour?.axis && (
                <line
                  x1={cx + contour.axis[0][0] * halfWpx}
                  y1={cy + contour.axis[0][1] * halfHpx}
                  x2={cx + contour.axis[1][0] * halfWpx}
                  y2={cy + contour.axis[1][1] * halfHpx}
                  stroke={stroke}
                  strokeWidth={1.2}
                  strokeDasharray="9 4 2 4"
                  className="pointer-events-none"
                />
              )}
            </g>
            {/* Mittelpunkt-Anker */}
            <circle
              cx={cx}
              cy={cy}
              r={3}
              fill="#FFC400"
              className="pointer-events-none"
            />
            {/* Größen-Label unterhalb der Kontur */}
            <text
              x={cx}
              y={cy + halfHpx + 14}
              textAnchor="middle"
              fontSize={11}
              fill={stroke}
              className="pointer-events-none select-none"
            >
              {shoulderSizeLabel(t.kind, t.sizeIndex)}
            </text>
            {/* Rotations-Griff (nur wenn selektiert und nicht gesperrt) */}
            {isSelected && !locked && (
              <>
                <line
                  x1={cx}
                  y1={cy}
                  x2={handleC[0]}
                  y2={handleC[1]}
                  stroke="#f9a8d4"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  className="pointer-events-none"
                />
                <circle
                  data-overlay-ui
                  cx={handleC[0]}
                  cy={handleC[1]}
                  r={5}
                  fill="#0f172a"
                  stroke="#f9a8d4"
                  strokeWidth={1.5}
                  className="pointer-events-auto cursor-grab"
                  onMouseDown={(e) =>
                    startDrag(e, vp!, (world) => {
                      const c = w2c(t.center)
                      const p = vp!.worldToCanvas(world)
                      const deg =
                        (Math.atan2(p[0] - c[0], -(p[1] - c[1])) * 180) /
                        Math.PI
                      useShoulderTemplateStore
                        .getState()
                        .setRotationDeg(t.id, deg)
                    })
                  }
                />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
