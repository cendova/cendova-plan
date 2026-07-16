/**
 * Vollbild-Modal zum interaktiven Tracen von Implantat-Konturen mit
 * mehreren SUB-PFADEN pro Kombination.
 *
 * Workflow:
 *   1) Wähle Implantat + View — falls vorhanden, lädt der Hintergrund.
 *   2) BBox: ziehe ein Rechteck, das die Außenkontur umschließt — das
 *      ist die Normalisierungs-Referenz für ALLE Sub-Pfade.
 *   3) Sub-Pfade pflegen: links siehst du die Liste; der aktive Pfad
 *      bekommt neue Klicks. Beim Öffnen ist eine „Außenkontur" als
 *      Default angelegt; weitere Pfade (PS-Box, Schnitte) per „+".
 *   4) Speichern → alle Sub-Pfade landen normalisiert im Store.
 */
import { useEffect, useRef, useState } from 'react'
import {
  useTemplateTracerStore,
  type TracedSubpath,
} from '../state/templateTracerStore'
import type { KneeView } from '../state/kneeTemplateStore'
import { backgroundFor } from '../lib/knee/templateBackgrounds'
import {
  KNEE_IMPLANT_FAMILIES,
  type KneeImplantKind,
} from '../lib/knee/smithNephewCatalog'

interface Pt {
  x: number
  y: number
}

/** Lokale Repräsentation: wie TracedSubpath, aber Punkte in PIXEL-Koords
 *  (relativ zum SVG-Overlay), nicht normalisiert. Erst beim Speichern
 *  wird auf die BBox normalisiert. */
interface LocalSubpath {
  label: string
  style: 'fill' | 'line'
  closed: boolean
  points: Pt[]
}

type Mode = 'bbox' | 'trace'

const DEFAULT_OUTLINE: LocalSubpath = {
  label: 'Außenkontur',
  style: 'fill',
  closed: true,
  points: [],
}

export function TemplateTracer() {
  const open = useTemplateTracerStore((s) => s.open)
  const closeTracer = useTemplateTracerStore((s) => s.closeTracer)
  const setTrace = useTemplateTracerStore((s) => s.setTrace)
  const deleteTrace = useTemplateTracerStore((s) => s.deleteTrace)
  const traces = useTemplateTracerStore((s) => s.traces)
  const getTrace = useTemplateTracerStore.getState().getTrace

  // Lokaler Edit-State (wird beim Schließen/Wechseln resettet).
  const [kind, setKind] = useState<KneeImplantKind>(
    open?.kind ?? 'legion-ps-femur',
  )
  const [view, setView] = useState<KneeView>(open?.view ?? 'lateral')
  // Größenband (nur für Komponenten mit Band-Definition, z. B. Journey
  // Femur lateral). undefined = keine Bänder → eine Trace für alle Größen.
  const [band, setBand] = useState<string | undefined>(open?.band)
  const [mode, setMode] = useState<Mode>('bbox')
  const [bbox, setBbox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [bboxDraft, setBboxDraft] = useState<{ x1: number; y1: number } | null>(null)
  const [subpaths, setSubpaths] = useState<LocalSubpath[]>([
    { ...DEFAULT_OUTLINE, points: [] },
  ])
  const [activeIdx, setActiveIdx] = useState<number>(0)
  const [dragRef, setDragRef] = useState<{ subIdx: number; ptIdx: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftStyle, setDraftStyle] = useState<'fill' | 'line'>('line')
  const [draftClosed, setDraftClosed] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)

  // Sync mit Store-open-Wechsel.
  useEffect(() => {
    if (!open) return
    setKind(open.kind)
    setView(open.view)
    setBand(open.band)
    setMode('bbox')
    setBbox(null)
    setBboxDraft(null)
    setSubpaths([{ ...DEFAULT_OUTLINE, points: [] }])
    setActiveIdx(0)
  }, [open])

  // Tastatur.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeTracer()
      } else if (e.key === 'Backspace' && mode === 'trace') {
        e.preventDefault()
        setSubpaths((curr) =>
          curr.map((sp, i) =>
            i === activeIdx ? { ...sp, points: sp.points.slice(0, -1) } : sp,
          ),
        )
      } else if (e.key === 'Enter' && mode === 'trace' && bbox) {
        // Mindestens ein Sub-Pfad muss benutzbare Punkte haben.
        const ok = subpaths.some((sp) =>
          sp.closed ? sp.points.length >= 3 : sp.points.length >= 2,
        )
        if (ok) {
          e.preventDefault()
          save()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, subpaths, activeIdx, bbox])

  if (!open) return null

  const bg = backgroundFor(kind, view, band)
  const families = KNEE_IMPLANT_FAMILIES

  function svgCoords(e: React.MouseEvent): Pt {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onSvgMouseDown(e: React.MouseEvent) {
    if (mode === 'bbox') {
      const p = svgCoords(e)
      setBboxDraft({ x1: p.x, y1: p.y })
    } else if (mode === 'trace') {
      const p = svgCoords(e)
      // Hit-Test über ALLE Sub-Pfad-Punkte → drag.
      for (let si = 0; si < subpaths.length; si++) {
        const sp = subpaths[si]
        const hit = sp.points.findIndex(
          (pp) => Math.hypot(pp.x - p.x, pp.y - p.y) <= 8,
        )
        if (hit >= 0) {
          setDragRef({ subIdx: si, ptIdx: hit })
          // Auto-Active auf den gedragten Sub-Pfad setzen.
          setActiveIdx(si)
          return
        }
      }
      // Kein Treffer → neuer Punkt im aktiven Sub-Pfad.
      setSubpaths((curr) =>
        curr.map((sp, i) =>
          i === activeIdx ? { ...sp, points: [...sp.points, p] } : sp,
        ),
      )
    }
  }

  function onSvgMouseMove(e: React.MouseEvent) {
    if (mode === 'bbox' && bboxDraft) {
      const p = svgCoords(e)
      setBbox({ x1: bboxDraft.x1, y1: bboxDraft.y1, x2: p.x, y2: p.y })
    } else if (mode === 'trace' && dragRef) {
      const p = svgCoords(e)
      setSubpaths((curr) =>
        curr.map((sp, si) =>
          si === dragRef.subIdx
            ? {
                ...sp,
                points: sp.points.map((pp, pi) =>
                  pi === dragRef.ptIdx ? p : pp,
                ),
              }
            : sp,
        ),
      )
    }
  }

  function onSvgMouseUp() {
    if (mode === 'bbox' && bboxDraft && bbox) {
      const w = Math.abs(bbox.x2 - bbox.x1)
      const h = Math.abs(bbox.y2 - bbox.y1)
      if (w >= 20 && h >= 20) {
        setMode('trace')
        // Vorhandene Trace de-normalisieren. Gespeicherte Punkte sind
        // BREITEN-normalisiert (Kontur-x ∈ [-1,+1], siehe save()). Wir
        // platzieren die Kontur so, dass ihre Breite die gezogene BBox-
        // Breite füllt — symmetrisch zur Speicher-Normalisierung, daher
        // round-trip-stabil. Beide Achsen teilen denselben Faktor (halbe
        // BBox-Breite), damit das Aspect-Verhältnis erhalten bleibt.
        const existing = getTrace(kind, view, band)
        if (existing && existing.length > 0) {
          const cx = (bbox.x1 + bbox.x2) / 2
          const cy = (bbox.y1 + bbox.y2) / 2
          const halfW = Math.abs(bbox.x2 - bbox.x1) / 2
          setSubpaths(
            existing.map((sp) => ({
              label: sp.label,
              style: sp.style,
              closed: sp.closed,
              points: sp.points.map((p) => ({
                x: cx + p.x * halfW,
                y: cy + p.y * halfW,
              })),
            })),
          )
          setActiveIdx(0)
        }
      } else {
        setBbox(null)
      }
      setBboxDraft(null)
    }
    setDragRef(null)
  }

  function save() {
    if (!bbox) return
    // Skalierungs-Referenz = die AUSSENKONTUR (erster geschlossener
    // Sub-Pfad), NICHT die gezogene BBox. Dadurch skaliert die Schablone
    // IMMER korrekt — egal, wie grob die BBox gezogen wurde.
    //
    // Origin = Mitte der Kontur-Bounding-Box. Maßstab = halbe BREITE der
    // Kontur. Die Breite ist die Leitmaß-Achse (ML bei AP-, A/P bei
    // Lateral-Sicht) und wird im Renderer auf `widthMm` aus dem Katalog
    // abgebildet. Weil x UND y denselben Faktor teilen, bleibt das
    // Seitenverhältnis der getrackten Kontur erhalten und die Höhe ergibt
    // sich automatisch — robust auch für Komponenten, bei denen die Höhe
    // größer ist als die Breite.
    const outline =
      subpaths.find((sp) => sp.closed && sp.points.length >= 3) ?? subpaths[0]
    if (!outline || outline.points.length < 2) return
    const oxs = outline.points.map((p) => p.x)
    const oys = outline.points.map((p) => p.y)
    const cx = (Math.min(...oxs) + Math.max(...oxs)) / 2
    const cy = (Math.min(...oys) + Math.max(...oys)) / 2
    const halfW = (Math.max(...oxs) - Math.min(...oxs)) / 2
    if (halfW < 1) return // entartete Kontur (keine Breite) — nicht speichern
    const normalized: TracedSubpath[] = subpaths
      .filter((sp) =>
        sp.closed ? sp.points.length >= 3 : sp.points.length >= 2,
      )
      .map((sp) => ({
        label: sp.label,
        style: sp.style,
        closed: sp.closed,
        points: sp.points.map((p) => ({
          x: (p.x - cx) / halfW,
          y: (p.y - cy) / halfW,
        })),
      }))
    if (normalized.length === 0) return
    setTrace(kind, view, normalized, band)
    closeTracer()
  }

  function reset() {
    setMode('bbox')
    setBbox(null)
    setBboxDraft(null)
    setSubpaths([{ ...DEFAULT_OUTLINE, points: [] }])
    setActiveIdx(0)
  }

  function addSubpath() {
    if (!draftLabel.trim()) return
    setSubpaths((curr) => [
      ...curr,
      {
        label: draftLabel.trim(),
        style: draftStyle,
        closed: draftClosed,
        points: [],
      },
    ])
    setActiveIdx(subpaths.length) // neuer Pfad wird aktiv
    setAdding(false)
    setDraftLabel('')
  }

  function deleteSubpath(idx: number) {
    if (subpaths.length <= 1) return // immer mindestens einer
    setSubpaths((curr) => curr.filter((_, i) => i !== idx))
    setActiveIdx((curr) => (curr >= subpaths.length - 1 ? 0 : curr))
  }

  async function exportTrace() {
    const existing = getTrace(kind, view, band)
    // `band` nur ausgeben, wenn gesetzt (abwärtskompatibles JSON-Format).
    const payload = JSON.stringify(
      band
        ? { kind, view, band, subpaths: existing ?? [] }
        : { kind, view, subpaths: existing ?? [] },
      null,
      2,
    )
    const bandNote = band ? ` (${band})` : ''
    try {
      await navigator.clipboard.writeText(payload)
      alert(`Trace „${kind} · ${view}${bandNote}" in die Zwischenablage kopiert.`)
    } catch {
      window.prompt('Trace zum Kopieren:', payload)
    }
  }

  async function importTrace() {
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      text = window.prompt('Trace-JSON einfügen:') ?? ''
    }
    if (!text.trim()) return
    try {
      const parsed = JSON.parse(text)
      // Band aus dem JSON, sonst das aktuell offene Band. Akzeptiert
      // sowohl neues (subpaths) als auch altes (points) Format.
      const importBand = parsed?.band ?? band
      if (parsed && Array.isArray(parsed.subpaths)) {
        setTrace(parsed.kind ?? kind, parsed.view ?? view, parsed.subpaths, importBand)
        alert(`Importiert: ${parsed.subpaths.length} Sub-Pfade.`)
      } else if (parsed && Array.isArray(parsed.points)) {
        setTrace(
          parsed.kind ?? kind,
          parsed.view ?? view,
          [
            {
              label: 'Außenkontur',
              style: 'fill',
              closed: true,
              points: parsed.points,
            },
          ],
          importBand,
        )
        alert(`Importiert: ${parsed.points.length} Punkte als Außenkontur.`)
      } else {
        alert('Ungültiges Trace-Format.')
      }
    } catch (e) {
      alert(`Parse-Fehler: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const usable = subpaths.some((sp) =>
    sp.closed ? sp.points.length >= 3 : sp.points.length >= 2,
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950/95">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-700 bg-neutral-900 px-4 py-2 text-sm">
        <span className="font-semibold text-pink-300">Schablonen-Tracer</span>
        <select
          value={kind}
          onChange={(e) => { setKind(e.target.value as KneeImplantKind); reset() }}
          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
        >
          {families.map((f) => (
            <option key={f.kind} value={f.kind}>{f.label}</option>
          ))}
        </select>
        <select
          value={view}
          onChange={(e) => { setView(e.target.value as KneeView); reset() }}
          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
        >
          <option value="AP">AP (frontal)</option>
          <option value="lateral">lateral (seitlich)</option>
        </select>
        <span className="ml-4 text-[11px] text-neutral-400">
          {mode === 'bbox'
            ? '1. Rechteck um die Außenkontur ziehen.'
            : `2. Aktiver Sub-Pfad: „${subpaths[activeIdx]?.label}" — Klick = Punkt, Drag = verschieben, Backspace = letzten löschen.`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {(traces[`${kind}|${view}`]?.length ?? 0) >= 1 && (
            <button
              onClick={() => {
                if (window.confirm(`Gespeicherte Kontur „${kind} · ${view}" wirklich löschen?`)) {
                  deleteTrace(kind, view)
                  reset()
                }
              }}
              className="rounded border border-red-900/60 px-3 py-1 text-xs text-red-300 hover:bg-red-900/30"
            >
              Gespeicherte Kontur löschen
            </button>
          )}
          <button
            onClick={exportTrace}
            className="rounded border border-cyan-900/60 px-3 py-1 text-xs text-cyan-300 hover:bg-cyan-900/30"
          >
            Export
          </button>
          <button
            onClick={importTrace}
            className="rounded border border-cyan-900/60 px-3 py-1 text-xs text-cyan-300 hover:bg-cyan-900/30"
          >
            Import
          </button>
          <button
            onClick={reset}
            className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Zurücksetzen
          </button>
          <button
            onClick={closeTracer}
            className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Abbrechen (Esc)
          </button>
          <button
            onClick={save}
            disabled={!bbox || !usable}
            className="rounded bg-pink-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-pink-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
          >
            Speichern (Enter)
          </button>
        </div>
      </div>

      {/* Body: Sub-Pfad-Sidebar links, Stage rechts */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 border-r border-neutral-700 bg-neutral-900 p-2 text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Sub-Pfade
          </div>
          <ul className="flex flex-col gap-1">
            {subpaths.map((sp, i) => {
              const active = i === activeIdx
              return (
                <li key={i}>
                  <button
                    onClick={() => setActiveIdx(i)}
                    className={[
                      'flex w-full items-start gap-1 rounded px-2 py-1 text-left transition',
                      active
                        ? 'bg-pink-700/30 text-pink-100 ring-1 ring-pink-600'
                        : 'text-neutral-300 hover:bg-neutral-800',
                    ].join(' ')}
                  >
                    <span className="flex-1 truncate">
                      {sp.label}
                      <div className="text-[10px] text-neutral-500">
                        {sp.points.length} Pkt · {sp.style} · {sp.closed ? 'closed' : 'open'}
                      </div>
                    </span>
                    {subpaths.length > 1 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteSubpath(i)
                        }}
                        className="ml-1 cursor-pointer rounded px-1 text-neutral-500 hover:bg-red-900/40 hover:text-red-300"
                        title="Sub-Pfad löschen"
                      >
                        ×
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          {adding ? (
            <div className="mt-2 rounded border border-neutral-700 bg-neutral-950 p-2">
              <input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="Label, z. B. PS-Box"
                className="mb-1 w-full rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-xs"
                autoFocus
              />
              <div className="mb-1 flex gap-1">
                <button
                  onClick={() => setDraftStyle('line')}
                  className={[
                    'flex-1 rounded px-1 py-0.5 text-[10px]',
                    draftStyle === 'line'
                      ? 'bg-pink-700/40 text-pink-100'
                      : 'border border-neutral-700 text-neutral-400',
                  ].join(' ')}
                >
                  line
                </button>
                <button
                  onClick={() => setDraftStyle('fill')}
                  className={[
                    'flex-1 rounded px-1 py-0.5 text-[10px]',
                    draftStyle === 'fill'
                      ? 'bg-pink-700/40 text-pink-100'
                      : 'border border-neutral-700 text-neutral-400',
                  ].join(' ')}
                >
                  fill
                </button>
              </div>
              <label className="mb-1 flex items-center gap-1 text-[10px] text-neutral-400">
                <input
                  type="checkbox"
                  checked={draftClosed}
                  onChange={(e) => setDraftClosed(e.target.checked)}
                />
                geschlossen
              </label>
              <div className="flex gap-1">
                <button
                  onClick={addSubpath}
                  disabled={!draftLabel.trim()}
                  className="flex-1 rounded bg-pink-600 px-2 py-0.5 text-[10px] text-white disabled:bg-neutral-700"
                >
                  Anlegen
                </button>
                <button
                  onClick={() => {
                    setAdding(false)
                    setDraftLabel('')
                  }}
                  className="rounded border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setAdding(true)
                setDraftLabel('')
                setDraftStyle('line')
                setDraftClosed(true)
              }}
              className="mt-2 w-full rounded border border-dashed border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 hover:bg-neutral-800"
            >
              + Sub-Pfad
            </button>
          )}
        </aside>

        {/* Stage */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
          <div
            className="relative h-full max-h-[85vh] w-auto"
            style={{ aspectRatio: bg ? undefined : '4 / 3' }}
          >
            {bg ? (
              <img
                src={bg.src}
                alt={bg.description}
                className="block h-full w-auto select-none"
                draggable={false}
              />
            ) : (
              <div className="flex h-[60vh] w-[60vw] items-center justify-center border border-dashed border-neutral-700 text-xs text-neutral-500">
                Kein Vorlage-Bild für diese Kombination — frei tracen
              </div>
            )}

            <svg
              ref={svgRef}
              className="absolute inset-0 h-full w-full cursor-crosshair"
              onMouseDown={onSvgMouseDown}
              onMouseMove={onSvgMouseMove}
              onMouseUp={onSvgMouseUp}
              onMouseLeave={onSvgMouseUp}
            >
              {bbox && (
                <rect
                  x={Math.min(bbox.x1, bbox.x2)}
                  y={Math.min(bbox.y1, bbox.y2)}
                  width={Math.abs(bbox.x2 - bbox.x1)}
                  height={Math.abs(bbox.y2 - bbox.y1)}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth={1.2}
                  strokeDasharray="6 4"
                />
              )}

              {/* Live-Hülle der gesetzten Punkte (alle Sub-Pfade
                  zusammen). Hilft beim Tracen: wenn die gelbe Box mit
                  der cyanen BBox deckungsgleich ist, sitzt die BBox
                  eng genug für eine saubere mm-Skalierung. */}
              {(() => {
                const allPts = subpaths.flatMap((sp) => sp.points)
                if (allPts.length < 2) return null
                let minX = Infinity, maxX = -Infinity
                let minY = Infinity, maxY = -Infinity
                for (const p of allPts) {
                  if (p.x < minX) minX = p.x
                  if (p.x > maxX) maxX = p.x
                  if (p.y < minY) minY = p.y
                  if (p.y > maxY) maxY = p.y
                }
                return (
                  <rect
                    x={minX}
                    y={minY}
                    width={maxX - minX}
                    height={maxY - minY}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth={0.8}
                    strokeDasharray="3 3"
                    opacity={0.7}
                  />
                )
              })()}

              {subpaths.map((sp, si) => {
                const active = si === activeIdx
                const pointsStr = sp.points
                  .map((p) => `${p.x},${p.y}`)
                  .join(' ')
                const stroke = active ? '#ec4899' : '#9333ea'
                const sw = active ? 1.6 : 1.1
                if (sp.points.length === 0) return null
                if (sp.points.length === 1) {
                  return (
                    <circle
                      key={si}
                      cx={sp.points[0].x}
                      cy={sp.points[0].y}
                      r={4}
                      fill={stroke}
                    />
                  )
                }
                const ShapeEl = sp.closed ? 'polygon' : 'polyline'
                return (
                  <g key={si}>
                    <ShapeEl
                      points={pointsStr}
                      fill={
                        sp.style === 'fill' && sp.closed
                          ? 'rgba(236,72,153,0.10)'
                          : 'none'
                      }
                      stroke={stroke}
                      strokeWidth={sw}
                    />
                    {sp.points.map((p, pi) => (
                      <circle
                        key={pi}
                        cx={p.x}
                        cy={p.y}
                        r={4}
                        fill={pi === 0 && active ? '#facc15' : stroke}
                        stroke="#fff"
                        strokeWidth={1}
                      />
                    ))}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-neutral-700 bg-neutral-900 px-4 py-2 text-[11px] text-neutral-400">
        <span>{bg?.description ?? 'Frei tracen ohne Hintergrundbild'}</span>
        <span>
          Aktiver Pfad bekommt Klicks. Inaktive Pfade in violett, aktiver in pink.
        </span>
      </div>
    </div>
  )
}
