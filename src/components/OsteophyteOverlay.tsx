import { useEffect, useRef } from 'react'
import type { Types } from '@cornerstonejs/core'
import { getViewport } from '../lib/cornerstone/viewer'
import { useViewportSync } from '../lib/cornerstone/useViewportSync'
import { useOsteophyteStore } from '../state/osteophyteStore'

/**
 * Overlay für Osteophyten-Markierungen: halbtransparent rot schraffierte
 * Flächen als Erinnerung an intraoperativ zu entfernende Osteophyten.
 *
 * Bedienung: Werkzeug aktivieren (Toolbar → „Osteophyten markieren"),
 * dann mit der Maus feine Punkte rund um den Osteophyten setzen. Die
 * aufgespannte Fläche wird live rot schraffiert. „Fläche abschließen"
 * (oder Enter) sichert sie und startet eine neue; Esc verwirft die
 * aktuelle. Mehrere Flächen sind möglich.
 *
 * Liegt INNERHALB des `#viewport-capture-root` → erscheint im PDF-Export.
 */
export function OsteophyteOverlay() {
  // Re-render bei Zoom/Pan, damit die Flächen mit der Bild-Skalierung
  // mitlaufen (wie die anderen Overlays).
  useViewportSync()
  const svgRef = useRef<SVGSVGElement>(null)
  const regions = useOsteophyteStore((s) => s.regions)
  const placing = useOsteophyteStore((s) => s.placing)
  const draftPoints = useOsteophyteStore((s) => s.draftPoints)

  // Klick-Handler: im Platzier-Modus setzt jeder Klick einen Punkt.
  useEffect(() => {
    const main = svgRef.current?.parentElement
    if (!main) return

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey) return // Cmd/Strg+Links = Pan (H2)
      if (!useOsteophyteStore.getState().placing) return
      if ((e.target as Element | null)?.closest('button, [data-overlay-ui]')) return
      const vp = getViewport()
      if (!vp) return
      e.stopPropagation()
      e.preventDefault()
      const rect = vp.canvas.getBoundingClientRect()
      const world = vp.canvasToWorld([
        e.clientX - rect.left,
        e.clientY - rect.top,
      ])
      useOsteophyteStore.getState().addPoint(world)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!useOsteophyteStore.getState().placing) return
      const target = e.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        useOsteophyteStore.getState().finishRegion()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        useOsteophyteStore.getState().cancelDraft()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        useOsteophyteStore.getState().removeLastPoint()
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
  if (!vp) {
    return (
      <svg
        ref={svgRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    )
  }
  const w2c = (p: Types.Point3): Types.Point2 => vp.worldToCanvas(p)

  const draftCanvas = draftPoints.map(w2c)

  return (
    <>
      <svg
        ref={svgRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <defs>
          {/* Rote Diagonal-Schraffur, halbtransparent. */}
          <pattern
            id="osteophyte-hatch"
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="7" height="7" fill="rgba(239,68,68,0.14)" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="7"
              stroke="rgba(239,68,68,0.7)"
              strokeWidth="1.3"
            />
          </pattern>
        </defs>

        {/* Fertige Flächen: rote Schraffur + gestrichelte Umrandung,
            OHNE Eckpunkte. */}
        {regions.map((r) => {
          const pts = r.points.map(w2c)
          const ptsStr = pts.map((p) => `${p[0]},${p[1]}`).join(' ')
          return (
            <polygon
              key={r.id}
              points={ptsStr}
              fill="url(#osteophyte-hatch)"
              stroke="rgba(239,68,68,0.9)"
              strokeWidth={1.8}
              strokeDasharray="6 4"
              strokeLinejoin="round"
            />
          )
        })}

        {/* Aktuelle, noch nicht abgeschlossene Fläche (live). */}
        {draftCanvas.length > 0 && (
          <g>
            {draftCanvas.length >= 3 && (
              <polygon
                points={draftCanvas.map((p) => `${p[0]},${p[1]}`).join(' ')}
                fill="url(#osteophyte-hatch)"
                stroke="rgba(239,68,68,0.85)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
            {draftCanvas.length === 2 && (
              <line
                x1={draftCanvas[0][0]}
                y1={draftCanvas[0][1]}
                x2={draftCanvas[1][0]}
                y2={draftCanvas[1][1]}
                stroke="rgba(239,68,68,0.85)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
            {draftCanvas.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={2.8} fill="#ef4444" stroke="#fff" strokeWidth={0.8} />
            ))}
          </g>
        )}
      </svg>

      {/* Bedien-Banner während des Markierens. */}
      {placing && (
        <div
          data-overlay-ui
          className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded bg-red-700/95 px-3 py-1.5 text-xs font-medium text-white shadow"
        >
          <span className="pointer-events-none">
            Osteophyten markieren · {draftPoints.length} Punkt
            {draftPoints.length === 1 ? '' : 'e'}
          </span>
          <button
            onClick={() => useOsteophyteStore.getState().finishRegion()}
            disabled={draftPoints.length < 3}
            className="rounded bg-red-900/80 px-2 py-0.5 enabled:hover:bg-red-900 disabled:opacity-40"
          >
            Fläche abschließen (Enter)
          </button>
          <button
            onClick={() => useOsteophyteStore.getState().setPlacing(false)}
            className="rounded bg-red-900/60 px-2 py-0.5 hover:bg-red-900"
          >
            Fertig
          </button>
        </div>
      )}
    </>
  )
}
