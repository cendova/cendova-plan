import { useState } from 'react'
import type { Types } from '@cornerstonejs/core'
import { getViewport } from '../lib/cornerstone/viewer'

type Vp = NonNullable<ReturnType<typeof getViewport>>

/**
 * Frei verschiebbarer Text-Kasten IM Bild — WELT-verankert, d. h. er wandert
 * beim Zoomen/Pannen mit dem Bild (wie die Mess-Labels), statt bildschirm-fix
 * stehenzubleiben. Default-Position: unten-mittig im Viewport. Geteilt vom
 * Hüft-Overlay (Korrektur) und Knie-Overlay (Ausrichtung/CPAK).
 *
 * Die Position ist session-lokal (useState als Welt-Anker) — beim nächsten Bild
 * wieder mittig.
 */
/** Eine Box-Zeile: schlichter Text (weiß) oder Text mit eigener Farbe
 *  (z. B. der grün hervorgehobene, korrigierte Ausrichtungswert). */
export type BoxLine = string | { text: string; color: string }

export function DraggableImageBox({
  vp,
  lines,
  initialWorld,
}: {
  vp: Vp
  lines: BoxLine[]
  /** Welt-Startposition (z. B. nahe dem Implantat). Default: unten-mittig. */
  initialWorld?: Types.Point3
}) {
  const [anchor, setAnchor] = useState<Types.Point3>(
    () =>
      initialWorld ??
      vp.canvasToWorld([vp.canvas.clientWidth / 2, vp.canvas.clientHeight - 70]),
  )
  const c = vp.worldToCanvas(anchor)

  function startDrag(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey) return // Cmd/Strg+Links = Pan (H2)
    e.stopPropagation()
    e.preventDefault()
    const rect = vp.canvas.getBoundingClientRect()
    // Greif-Offset merken, damit der Kasten nicht unter die Maus springt.
    const a0 = vp.worldToCanvas(anchor)
    const grabX = a0[0] - (e.clientX - rect.left)
    const grabY = a0[1] - (e.clientY - rect.top)
    function move(ev: MouseEvent) {
      setAnchor(
        vp.canvasToWorld([
          ev.clientX - rect.left + grabX,
          ev.clientY - rect.top + grabY,
        ]),
      )
    }
    function up() {
      window.removeEventListener('mousemove', move, true)
      window.removeEventListener('mouseup', up, true)
    }
    window.addEventListener('mousemove', move, true)
    window.addEventListener('mouseup', up, true)
  }

  return (
    <div
      data-overlay-ui
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: c[0], top: c[1] }}
    >
      <div
        data-overlay-ui
        onMouseDown={startDrag}
        className="cursor-move rounded bg-slate-900/85 px-2 py-1 text-[17px] font-semibold leading-tight text-slate-50"
      >
        {lines.map((ln, i) => {
          const text = typeof ln === 'string' ? ln : ln.text
          const color = typeof ln === 'string' ? undefined : ln.color
          return (
            <div key={i} className="whitespace-pre" style={color ? { color } : undefined}>
              {text}
            </div>
          )
        })}
      </div>
    </div>
  )
}
