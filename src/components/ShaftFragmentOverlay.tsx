import { useEffect, useRef } from 'react'
import type { Types } from '@cornerstonejs/core'
import { getViewport } from '../lib/cornerstone/viewer'
import { useViewportSync } from '../lib/cornerstone/useViewportSync'
import { useShaftFragmentStore } from '../state/shaftFragmentStore'
import {
  fragmentPolygon,
  polygonSchwerpunkt,
  punktImPolygon,
} from '../lib/shoulder/cropGeometry'

/**
 * Overlay für ausgeschnittene Schaft-Fragmente (Osteotomie-Simulation
 * am Humerus).
 *
 * Bedienung: Werkzeug aktivieren, den Schaft mit Klicks umfahren,
 * abschließen — das eingeschlossene Stück lässt sich dann ziehen und über
 * den Griff drehen. Das Original bleibt darunter stehen, damit die
 * Verschiebung als Vorher/Nachher lesbar ist.
 *
 * WIE DAS BILD ENTSTEHT: Es werden keine Pixel gespeichert. Bei jedem Bild
 * werden die Pixel des Schnitts frisch aus dem Viewport-Canvas kopiert und
 * versetzt gezeichnet. Dadurch ist das Fragment in JEDER Zoomstufe genauso
 * scharf wie das Original darunter — ein einmaliger Schnappschuss würde
 * beim Hineinzoomen verwaschen. Gelesen wird der Bild-Canvas, nie dieses
 * Overlay, deshalb kann sich das Fragment nicht selbst kopieren.
 *
 * Warum das Auslesen überhaupt geht: vtk.js rendert mit
 * `preserveDrawingBuffer: false`, ein WebGL-Canvas wäre also nach dem
 * Compositing leer. Cornerstone rendert aber OFFSCREEN und kopiert das
 * Ergebnis in den 2D-Canvas des Viewports
 * (`ContextPoolRenderingEngine._copyToOnscreenCanvas`) — `vp.canvas` ist
 * damit ein gewöhnlicher 2D-Canvas und beliebig lesbar. Aus demselben
 * Grund funktioniert der html2canvas-Schnappschuss im PDF-Export.
 *
 * Liegt INNERHALB des `#viewport-capture-root` → erscheint im PDF-Export.
 */
export function ShaftFragmentOverlay() {
  useViewportSync()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fragments = useShaftFragmentStore((s) => s.fragments)
  const placing = useShaftFragmentStore((s) => s.placing)
  const draftPoints = useShaftFragmentStore((s) => s.draftPoints)
  const selectedId = useShaftFragmentStore((s) => s.selectedId)

  // --- Klicks im Schneide-Modus setzen Konturpunkte -----------------
  useEffect(() => {
    const main = canvasRef.current?.parentElement
    if (!main) return

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey) return // Cmd/Strg+Links = Pan
      if (!useShaftFragmentStore.getState().placing) return
      if ((e.target as Element | null)?.closest('button, [data-overlay-ui]')) return
      const vp = getViewport()
      if (!vp) return
      e.stopPropagation()
      e.preventDefault()
      const rect = (main as HTMLElement).getBoundingClientRect()
      const welt = vp.canvasToWorld([e.clientX - rect.left, e.clientY - rect.top])
      useShaftFragmentStore.getState().addPoint(welt)
    }

    main.addEventListener('mousedown', onMouseDown, true)
    return () => main.removeEventListener('mousedown', onMouseDown, true)
  }, [])

  // --- Tastatur: Schnitt abschließen/verwerfen, Fragment feinjustieren
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const store = useShaftFragmentStore.getState()
      if (store.placing) {
        if (e.key === 'Enter') {
          e.preventDefault()
          store.finishFragment()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          store.cancelDraft()
        } else if (e.key === 'Backspace') {
          e.preventDefault()
          store.removeLastPoint()
        }
        return
      }
      const id = store.selectedId
      if (!id) return
      const f = store.fragments.find((x) => x.id === id)
      if (!f) return
      if (e.key === 'Delete') {
        e.preventDefault()
        store.remove(id)
        return
      }
      const istPfeil = e.key.startsWith('Arrow')
      const istDreh = e.key === '+' || e.key === '-'
      if (!istPfeil && !istDreh) return
      e.preventDefault()
      if (istDreh) {
        const schritt = e.shiftKey ? 1 : 0.2
        store.setRotationDeg(id, f.rotationDeg + (e.key === '+' ? schritt : -schritt))
        return
      }
      const s = e.shiftKey ? 2 : 0.5
      const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0
      const dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0
      store.setOffset(id, [f.offset[0] + dx, f.offset[1] + dy])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // --- Zeichnen ------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    const vp = getViewport()
    if (!canvas || !vp) return
    const quelle = vp.canvas
    const breite = quelle.clientWidth
    const hoehe = quelle.clientHeight
    // Geräte-Pixel: sonst wäre das Fragment auf HiDPI-Schirmen weicher
    // als das Bild darunter.
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(breite * dpr)
    canvas.height = Math.round(hoehe * dpr)
    canvas.style.width = `${breite}px`
    canvas.style.height = `${hoehe}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, breite, hoehe)

    const w2c = (p: Types.Point3) => vp.worldToCanvas(p)

    const sichtbar = fragments.filter((f) => f.visible && f.points.length >= 3)
    const geometrie = sichtbar.map((f) => {
      const zielWelt = fragmentPolygon(f.points, f.rotationDeg, f.offset)
      return { f, quellPoly: f.points.map(w2c), zielPoly: zielWelt.map(w2c), zielWelt }
    })

    // DURCHGANG 1 — alle Ursprungsbereiche schwarz füllen: Das Stück ist
    // herausgelöst, an seiner alten Stelle bleibt eine Lücke; sonst stünde
    // der Schaft doppelt im Bild und die Verschiebung wäre nicht ablesbar.
    // Schwarz statt transparent, weil der Bildhintergrund schwarz ist.
    //
    // Bewusst ein eigener Durchgang VOR dem Zeichnen: Sonst könnte die
    // Füllung eines später bearbeiteten Fragments ein bereits gezeichnetes
    // früheres wieder ausradieren.
    for (const { quellPoly } of geometrie) {
      ctx.save()
      ctx.beginPath()
      quellPoly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.closePath()
      ctx.fillStyle = '#000000'
      ctx.fill()
      ctx.restore()
    }

    // DURCHGANG 2 — die Fragmente an ihrer neuen Lage zeichnen.
    for (const { f, quellPoly, zielPoly, zielWelt } of geometrie) {
      // Pixel des Schnitts versetzt zeichnen: auf das ZIEL-Polygon
      // clippen und den Quell-Canvas so transformiert einzeichnen, dass
      // der Schnitt genau in dieses Polygon fällt.
      const qs = w2c(polygonSchwerpunkt(f.points))
      const zs = w2c(polygonSchwerpunkt(zielWelt))
      ctx.save()
      ctx.beginPath()
      zielPoly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.closePath()
      ctx.clip()
      // Canvas-Drehwinkel aus einem transformierten Referenzpunkt ableiten —
      // so stimmt die Richtung auch, wenn der Viewport selbst gedreht oder
      // gespiegelt ist. Genommen wird der Punkt mit dem GRÖSSTEN Abstand
      // zum Schwerpunkt: Läge der Referenzpunkt nahe am Drehpunkt, würde
      // schon Rundungsrauschen den Winkel beliebig ausschlagen lassen und
      // das Fragment sichtbar verdrehen.
      let refIdx = 0
      let refDist = -1
      for (let i = 0; i < quellPoly.length; i++) {
        const d = Math.hypot(quellPoly[i][0] - qs[0], quellPoly[i][1] - qs[1])
        if (d > refDist) {
          refDist = d
          refIdx = i
        }
      }
      const a0 = quellPoly[refIdx]
      const b0 = zielPoly[refIdx]
      const winkel =
        refDist < 1e-6
          ? 0
          : Math.atan2(b0[1] - zs[1], b0[0] - zs[0]) -
            Math.atan2(a0[1] - qs[1], a0[0] - qs[0])
      ctx.translate(zs[0], zs[1])
      ctx.rotate(winkel)
      ctx.translate(-qs[0], -qs[1])
      ctx.drawImage(quelle, 0, 0, quelle.width, quelle.height, 0, 0, breite, hoehe)
      ctx.restore()

      // Umrisse: Ziel durchgezogen, Ursprung gestrichelt (umrandet die
      // entstandene Lücke und zeigt, woher das Stück kommt).
      const gewaehlt = f.id === selectedId
      ctx.save()
      ctx.lineWidth = gewaehlt ? 2 : 1.25
      ctx.strokeStyle = gewaehlt ? '#7DD3FC' : '#38BDF8'
      ctx.beginPath()
      zielPoly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = 'rgba(56,189,248,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      quellPoly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }

    // Offener Schnitt: Linienzug + Punkte.
    if (placing && draftPoints.length) {
      const pts = draftPoints.map(w2c)
      ctx.save()
      ctx.strokeStyle = '#38BDF8'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#7DD3FC'
      pts.forEach((p) => {
        ctx.beginPath()
        ctx.arc(p[0], p[1], 3, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.restore()
    }
  })

  // --- Ziehen ---------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    const main = canvas?.parentElement
    if (!main) return

    function onMouseDown(e: MouseEvent) {
      const store = useShaftFragmentStore.getState()
      if (store.placing || e.button !== 0 || e.metaKey || e.ctrlKey) return
      // Klicks, die einem SVG-Overlay gelten (Schablonen, Messpunkte),
      // nicht abfangen: Dieser Listener läuft in der Capture-Phase und
      // wäre sonst VOR deren eigenen Handlern dran — ein Fragment über
      // einer Schablone würde deren Ziehen blockieren.
      if ((e.target as Element | null)?.closest('svg, button, [data-overlay-ui]'))
        return
      const vp = getViewport()
      if (!vp) return
      const rect = (main as HTMLElement).getBoundingClientRect()
      const start = vp.canvasToWorld([e.clientX - rect.left, e.clientY - rect.top])
      // Oberstes Fragment unter dem Zeiger greifen.
      const treffer = [...store.fragments]
        .reverse()
        .find(
          (f) =>
            f.visible &&
            punktImPolygon(
              [start[0], start[1]],
              fragmentPolygon(f.points, f.rotationDeg, f.offset),
            ),
        )
      if (!treffer) return
      e.stopPropagation()
      e.preventDefault()
      store.select(treffer.id)
      const startOffset: [number, number] = [...treffer.offset]

      function onMove(ev: MouseEvent) {
        const v = getViewport()
        if (!v) return
        const r = (main as HTMLElement).getBoundingClientRect()
        const jetzt = v.canvasToWorld([ev.clientX - r.left, ev.clientY - r.top])
        useShaftFragmentStore
          .getState()
          .setOffset(treffer!.id, [
            startOffset[0] + (jetzt[0] - start[0]),
            startOffset[1] + (jetzt[1] - start[1]),
          ])
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    main.addEventListener('mousedown', onMouseDown, true)
    return () => main.removeEventListener('mousedown', onMouseDown, true)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
    />
  )
}
