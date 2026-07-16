/**
 * Overlay für platzierte Knie-Schablonen. Rendert die Master-Konturen
 * (aus `renderKneeTemplate`) als SVG-Polygone und bietet einfache
 * Maus-Interaktion: Klick auf das Polygon = selektieren, Drag in der
 * Mitte = verschieben, Drag am Rotationsgriff = drehen.
 *
 * Bewusst minimal gehalten — komplexere Editor-Operationen (Spiegeln,
 * Größenwechsel, Notiz-Anker) leben im rechten Eigenschaften-Panel,
 * nicht im Overlay.
 */
import { useEffect, useRef } from 'react'
import { type Types } from '@cornerstonejs/core'
import { getViewport } from '../lib/cornerstone/viewer'
import { getViewport2 } from '../lib/cornerstone/viewer2'
import { useViewportSync } from '../lib/cornerstone/useViewportSync'
import { useViewerStore } from '../state/viewerStore'
import { useKneePanesStore } from '../state/kneePanesStore'
import {
  useKneeTemplateStore,
  type TemplatePane,
  type KneeTemplate,
} from '../state/kneeTemplateStore'
import { useTemplateTracerStore } from '../state/templateTracerStore'
import { useKneeStore } from '../state/kneeStore'
import { renderKneeTemplate, sizeLabelFor } from '../lib/knee/templates'
import { getKneeImage, type KneeImage } from '../lib/knee/kneeImages'
import { contourGeomImage, getKneeContour } from '../lib/knee/kneeContours'
import { resolveTemplateImage } from '../lib/templates/registry'
import {
  extractWorkflowAxes,
  implantJointAngle,
  towardLateral,
  towardMedial,
  type WorkflowAxes,
} from '../lib/knee/resection'
import { computeResectionLine, perpDistWorld } from '../lib/knee/resectionLine'
import { femoralDistalThicknessMm } from '../lib/knee/smithNephewCatalog'
import { computeWorkflowRaw } from '../lib/knee/recipes'
import {
  add as add3,
  scale as scale3,
  sub as sub3,
  unit as unit3,
} from '../lib/knee/geometry'
import { DraggableImageBox } from './DraggableImageBox'

type Vp = NonNullable<ReturnType<typeof getViewport>>

const fmtMm = (mm: number): string => `${mm.toFixed(1).replace('.', ',')}`

interface ResectionRender {
  aPre: { x: number; y: number }
  bPre: { x: number; y: number }
}

/**
 * Resektionslinie eines AP-Implantats — die beiden Schnitt-Endpunkte VOR der
 * Bild-Gruppen-Transform (Canvas), zum Zeichnen INNERHALB der Bildgruppe.
 * Femur: Schnitt liegt `distalThicknessMm` proximal der Gelenkfläche; Tibia:
 * Baseplate-Unterkante.
 */
function buildResection(
  vp: Vp,
  center: Types.Point3,
  rotationDeg: number,
  side: 'R' | 'L',
  img: KneeImage,
  distalThicknessMm: number | null,
  isFemur: boolean,
  factor: number,
): ResectionRender | null {
  const line = computeResectionLine(
    vp, center, rotationDeg, side, img, distalThicknessMm, isFemur, factor,
  )
  if (!line) return null
  return { aPre: line.aPre, bPre: line.bPre }
}

// Welt-Vektor-Helfer: geteilte Geometrie aus lib (Audit-Befund D4/C6) —
// alle Punkte liegen in einer Bildebene, daher sind die 3D-Varianten
// identisch zu den früheren lokalen 2D-Helfern.
type V3 = Types.Point3

export interface ImplantBox {
  key: string
  lines: string[]
  world: V3
}

/**
 * Frei verschiebbare Info-Kästen eines AP-Femur-/Tibia-Implantats mit
 * Welt-Startposition nahe dem Implantat:
 *   - Resektionstiefe medial + lateral (je auf ihrer Seite, außerhalb)
 *   - LDFA (Femur, lateral-superior) bzw. MPTA (Tibia, medial-inferior) als
 *     Delta zu 90° in Varus/Valgus
 *   - Implantatgröße
 */
function implantBoxes(
  vp: Vp,
  t: KneeTemplate,
  img: KneeImage,
  axes: WorkflowAxes,
  factor: number,
): ImplantBox[] {
  const isFemur = t.kind.includes('femur')
  const line = computeResectionLine(
    vp, t.center, t.rotationDeg, t.side, img,
    femoralDistalThicknessMm(t.kind, t.sizeIndex), isFemur, factor,
  )
  if (!line) return []
  const { aWorld, bWorld } = line
  // medial/lateral ANATOMISCH auflösen statt den Punkt-Labels zu trauen
  // (Debug-Runde 3: vertauschte med/lat-Klicks hängten sonst die M-/L-
  // Tiefen an die falschen Seiten). Femur: medial = −towardLateral
  // (LDFA-Tangente), Tibia: towardMedial (MPTA-Tangente).
  const toMed = isFemur
    ? scale3(towardLateral(axes), -1)
    : towardMedial(axes)
  const rawMed = isFemur ? axes.ldfaMed : axes.mptaMed
  const rawLat = isFemur ? axes.ldfaLat : axes.mptaLat
  const labelsSwapped =
    (rawMed[0] - rawLat[0]) * toMed[0] + (rawMed[1] - rawLat[1]) * toMed[1] < 0
  const nMed = labelsSwapped ? rawLat : rawMed
  const nLat = labelsSwapped ? rawMed : rawLat
  const depthMed = perpDistWorld(nMed, aWorld, bWorld) * factor
  const depthLat = perpDistWorld(nLat, aWorld, bWorld) * factor
  const d2 = (p: V3, q: V3) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
  const aIsMed = d2(aWorld, nMed) <= d2(bWorld, nMed)
  const medEnd = aIsMed ? aWorld : bWorld
  const latEnd = aIsMed ? bWorld : aWorld

  // Welt-Richtungen am Implantat.
  const medialDir = unit3(sub3(nMed, nLat))
  const lateralDir = scale3(medialDir, -1)
  const superiorDir = isFemur
    ? unit3(sub3(axes.hip, axes.kneeFemMid)) // Femur: proximal = zur Hüfte
    : unit3(sub3(axes.kneeTibMid, axes.ankle)) // Tibia: proximal = zum Knie
  const inferiorDir = scale3(superiorDir, -1)
  const halfW = (img.widthPx * img.mmPerPx) / 2 / factor
  const halfH = (img.heightPx * img.mmPerPx) / 2 / factor
  const out = 16 / factor

  // LDFA/MPTA-Delta zu 90°. Femur: <90° = Valgus, >90° = Varus. Tibia umgekehrt.
  const angleName = isFemur ? 'LDFA' : 'MPTA'
  // Bild + Seite mitgeben: Der Winkel misst exakt die GEZEICHNETE
  // Resektionslinie (Befund F1 — Femur-Landmarken tragen ~6° Valgus).
  const angle = implantJointAngle(
    axes, isFemur ? 'Femur' : 'Tibia', t.rotationDeg, img, t.side,
  )
  const delta = Math.abs(angle - 90)
  const sideWord =
    delta < 0.5 ? 'neutral'
      : isFemur ? (angle < 90 ? 'Valgus' : 'Varus')
        : angle < 90 ? 'Varus' : 'Valgus'
  const angleLines = [
    `${angleName} ${fmtMm(angle)}°`,
    delta < 0.5 ? 'neutral' : `${fmtMm(delta)}° ${sideWord}`,
  ]
  const angleWorld = isFemur
    ? add3(add3(t.center, scale3(lateralDir, halfW + out)), scale3(superiorDir, halfH * 0.55))
    : add3(add3(t.center, scale3(medialDir, halfW + out)), scale3(inferiorDir, halfH * 0.55))

  // Implantatgröße — kompakt: F<Größe> (Femur) bzw. T<Größe> (Tibia).
  const sizeLabel = `${isFemur ? 'F' : 'T'}${sizeLabelFor(t.kind, t.sizeIndex)}`
  const sizeWorld = isFemur
    ? add3(add3(t.center, scale3(medialDir, halfW + out)), scale3(superiorDir, halfH * 0.55))
    : add3(add3(t.center, scale3(lateralDir, halfW + out)), scale3(inferiorDir, halfH * 0.55))

  // Schlitten (UKA) versorgen nur EIN Kompartiment — die Resektionstiefe
  // der Gegenseite ist klinisch bedeutungslos und entfällt (Debug-Runde 3).
  const boxes: ImplantBox[] = []
  if (t.kind !== 'journey-uk-tibia-lateral') {
    boxes.push({
      key: `${t.id}-resM`,
      lines: [`M ${fmtMm(depthMed)} mm`],
      world: add3(medEnd, scale3(medialDir, out)),
    })
  }
  if (t.kind !== 'journey-uk-tibia-medial') {
    boxes.push({
      key: `${t.id}-resL`,
      lines: [`L ${fmtMm(depthLat)} mm`],
      world: add3(latEnd, scale3(lateralDir, out)),
    })
  }
  boxes.push(
    { key: `${t.id}-angle`, lines: angleLines, world: angleWorld },
    { key: `${t.id}-size`, lines: [sizeLabel], world: sizeWorld },
  )
  return boxes
}

/** Generischer Drag-Helfer: bindet move/up an window-capture-Listener
 *  und übergibt jeden neuen Mausort als Weltpunkt an `onMove`. */
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

/**
 * `pane`: auf welchem Pane dieses Overlay rendert. Default 'left' (Haupt-
 * Pane). Für die Zwei-Bild-Ansicht wird zusätzlich eine zweite Instanz mit
 * pane='right' in `KneePane2` gemountet. Jede Instanz nutzt den eigenen
 * Viewport + die eigene Kalibrierung und filtert die Schablonen nach Pane.
 */
export function KneeTemplateOverlay({
  pane = 'left',
}: {
  pane?: TemplatePane
}) {
  const getVp = pane === 'right' ? getViewport2 : getViewport
  useViewportSync(getVp)
  const svgRef = useRef<SVGSVGElement>(null)

  const allTemplates = useKneeTemplateStore((s) => s.templates)
  const templates = allTemplates.filter((t) => (t.pane ?? 'left') === pane)
  const selectedId = useKneeTemplateStore((s) => s.selectedId)
  // Kalibrierung pro Pane: links global (viewerStore), rechts aus dem
  // kneePanesStore (eigene Vergrößerung der seitlichen Aufnahme).
  const leftCalibration = useViewerStore((s) => s.calibration)
  const rightCalibration = useKneePanesStore((s) => s.rightCalibration)
  const calibration = pane === 'right' ? rightCalibration : leftCalibration
  // Subscribe auf traces, damit Live-Update wenn der Tracer eine Kontur
  // ändert — sonst würde das Polygon erst beim nächsten Re-Render einer
  // anderen Komponente neu gezeichnet werden.
  useTemplateTracerStore((s) => s.traces)
  const factor = calibration?.mmPerWorldUnit ?? 1

  // Vollvermessungs-Achsen (nur Haupt-Pane) — Basis für die Resektions-Tiefe.
  const workflowPoints = useKneeStore((s) => {
    const wf = s.measurements.find(
      (m) => m.kind === 'workflow' && m.points.length >= 17,
    )
    return wf ? wf.points : null
  })
  const workflowAxes =
    pane === 'left' && workflowPoints ? extractWorkflowAxes(workflowPoints) : null
  // Roh-Mess-Werte (mLDFA/mMPTA) für die Implantat-Winkel-Kästen.
  const raw =
    pane === 'left' && workflowPoints
      ? computeWorkflowRaw(workflowPoints, factor)
      : null

  // Pfeiltasten verschieben / „+"/„−" rotieren die selektierte Schablone —
  // analog zum Hüft-Schaft (siehe TemplateOverlay). Bewusst VOR dem
  // frühen `return null` unten, damit der Hook nicht bedingt läuft.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const sel = useKneeTemplateStore.getState().selectedId
      if (!sel) return
      const tmpl = useKneeTemplateStore
        .getState()
        .templates.find((t) => t.id === sel)
      if (!tmpl) return
      // Doppel-Mount-Guard: nur die Overlay-Instanz reagiert, deren Pane
      // die selektierte Schablone besitzt — sonst würden beide Instanzen
      // (links + rechts) dieselbe Schablone bewegen (= doppelter Schritt).
      if ((tmpl.pane ?? 'left') !== pane) return
      // Nicht eingreifen, wenn der Fokus in einem Eingabefeld/Dropdown
      // liegt (sonst würden die Pfeile z. B. das Größen-Select kapern).
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

      // Entfernen-Taste löscht die selektierte Schablone — gruppenweit, also
      // verschwindet das gekoppelte AP+lateral-Paar gemeinsam.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        useKneeTemplateStore.getState().remove(tmpl.id)
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

      const store = useKneeTemplateStore.getState()
      if (isRot) {
        // Feinrotation: Shift = 1°, sonst 0.2° (wie beim Schaft).
        const rotStep = e.shiftKey ? 1 : 0.2
        const delta = e.key === '+' ? rotStep : -rotStep
        store.setRotationDeg(tmpl.id, tmpl.rotationDeg + delta)
        return
      }
      // Bewegung: Shift = 2 Welt-Einheiten (grob), sonst 0.5 (fein).
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

  // WICHTIG: das Viewport DIESES Panes verwenden (getVp), nicht hart
  // getViewport() — sonst projiziert das rechte Overlay seine Schablonen-
  // Weltpunkte mit der LINKEN Kamera und sie landen außerhalb des rechten
  // Canvas (= unsichtbar). Das war die Ursache, warum rechts nichts erschien.
  const vp = getVp()
  if (!vp) return null

  const w2c = (p: Types.Point3): Types.Point2 => vp.worldToCanvas(p)

  return (
    <>
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {templates.filter((t) => t.visible).map((t) => {
        const isSelected = selectedId === t.id

        // Greif-Drag mit Offset — gemeinsam für Bild- und Polygon-Pfad.
        function selectAndStartDrag(e: React.MouseEvent) {
          if (e.metaKey || e.ctrlKey) return // Cmd/Strg+Links = Pan (H2)
          useKneeTemplateStore.getState().select(t.id)
          // vp ist oben per `if (!vp) return null` garantiert non-null.
          // Greif-Offset: Differenz Zentrum ↔ Anfasspunkt merken, sonst
          // springt das Zentrum beim ersten move-Event unter die Maus.
          const rect = vp!.canvas.getBoundingClientRect()
          const grab = vp!.canvasToWorld([
            e.clientX - rect.left,
            e.clientY - rect.top,
          ])
          const offX = t.center[0] - grab[0]
          const offY = t.center[1] - grab[1]
          startDrag(e, vp!, (world) => {
            useKneeTemplateStore.getState().setCenter(t.id, [
              world[0] + offX,
              world[1] + offY,
              t.center[2],
            ])
          })
        }

        // --- Bild-Overlay (wie Hüfte): existiert ein per-Größe-Screenshot? ---
        // Dann den echten Implantat-Screenshot maßstabsgetreu über das Röntgen
        // legen (schwarzer Screenshot-Hintergrund rausgefiltert) statt die
        // Vektor-Kontur zu zeichnen.
        //
        // Der SCREENSHOT hat Vorrang, wo einer existiert (fotografische
        // Detailqualität). Die DXF-Konturen (quelle 'dxf') füllen nur
        // LÜCKEN — konkret die Narrow-Femora, die keinen Screenshot haben;
        // dort greift automatisch der Vektor-Pfad unten. (Nutzer-Entscheid:
        // Screenshots sind qualitativ vorzuziehen; DXF nur wo nötig.)
        const img = getKneeImage(t.kind, t.view, t.sizeIndex)
        if (img) {
          const centerCanvas = w2c(t.center)
          const oneMm = 1 / factor
          const probeX = w2c([t.center[0] + oneMm, t.center[1], t.center[2]] as Types.Point3)
          const probeY = w2c([t.center[0], t.center[1] + oneMm, t.center[2]] as Types.Point3)
          // Canvas-px pro Bild-px (getrennt X/Y wegen evtl. anisotroper Skala).
          const cppx = Math.abs(probeX[0] - centerCanvas[0]) * img.mmPerPx
          const cppy = Math.abs(probeY[1] - centerCanvas[1]) * img.mmPerPx
          const wC = img.widthPx * cppx
          const hC = img.heightPx * cppy
          const cx = centerCanvas[0]
          const cy = centerCanvas[1]
          const x0 = cx - wC / 2
          const y0 = cy - hC / 2
          const rot = t.rotationDeg
          const mirror = t.side === 'L'
          // Gruppen-Transform: erst (optional) horizontal um das Zentrum
          // spiegeln (L-Knie), dann um das Zentrum drehen.
          const groupTransform =
            `rotate(${rot} ${cx} ${cy})` +
            (mirror ? ` translate(${cx} 0) scale(-1 1) translate(${-cx} 0)` : '')
          // Rotationsgriff am (gedrehten) oberen Bildrand.
          const rad = (rot * Math.PI) / 180
          const armLen = hC / 2 + 18
          const handleC: Types.Point2 = [
            cx + armLen * Math.sin(rad),
            cy - armLen * Math.cos(rad),
          ]
          // Resektions-SCHNITTLINIE am Implantat (nur AP-Femur/Tibia). Die
          // mm-Tiefen + Winkel-/Größen-Kästen rendern als HTML-Boxen nach dem
          // SVG (implantBoxes), nicht hier.
          const isFemur = t.kind.includes('femur')
          const isTibia = t.kind.includes('tibia')
          const resection =
            img.resect && t.view === 'AP' && (isFemur || isTibia)
              ? buildResection(
                  vp,
                  t.center,
                  rot,
                  t.side,
                  img,
                  femoralDistalThicknessMm(t.kind, t.sizeIndex),
                  isFemur,
                  factor,
                )
              : null
          return (
            <g key={t.id}>
              <defs>
                {/* Implantat-Linie auf BERNSTEIN umfärben UND Hintergrund/
                    Callouts ausblenden. Wie beim Hüft-Schaft: die ersten drei
                    Zeilen setzen RGB KONSTANT auf den Amber-Wert (Eingangsfarbe
                    egal), die Alpha-Zeile maskiert über die „Blauheit" B−R der
                    Quelle: outAlpha = 2·(B − R).
                      • Schwarzer Screenshot-Hintergrund (B=R) → 0 → transparent
                      • Weiße Screenshot-Callouts/Achsen (B=R) → 0 → transparent
                      • Blaue Implantat-Linie (B≫R)            → ≥1 → deckend Amber
                    Normal  Amber-400 #FFC400 = (1, 0.769, 0).
                    Selektiert helleres Amber #FFE08A = (1, 0.878, 0.541) als
                    klares Aktiv-Signal (analog sky-heller beim Hüft-Cup).
                    sRGB erzwingen, sonst linearisiert der Filter B/R und die
                    (dunkleren) lateralen Linien würden zu blass maskiert. */}
                <filter
                  id={`knee-tint-${t.id}`}
                  colorInterpolationFilters="sRGB"
                >
                  <feColorMatrix
                    type="matrix"
                    values={
                      isSelected
                        ? '0 0 0 0 1  0 0 0 0 0.878  0 0 0 0 0.541  -2 0 2 0 0'
                        : '0 0 0 0 1  0 0 0 0 0.769  0 0 0 0 0  -2 0 2 0 0'
                    }
                  />
                </filter>
              </defs>
              <g transform={groupTransform}>
                <image
                  href={resolveTemplateImage(img.path)}
                  // PDF-Export: Filter werden von html2canvas ignoriert —
                  // Modus „knee" = Blauheits-Maske (2·(B−R)) vorab anwenden.
                  data-pdf-tint="knee"
                  x={x0}
                  y={y0}
                  width={wC}
                  height={hC}
                  preserveAspectRatio="none"
                  filter={`url(#knee-tint-${t.id})`}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Bewusst KEIN gestrichelter Auswahl-Rahmen ums Bild: er
                    verdeckte das Röntgen ringsum. Selektion zeigt sich am
                    Rotations-Griff + Mittelpunkt-Anker (wie beim Hüft-Schaft). */}
                {/* Transparente Hit-Fläche zum Verschieben (deckt das
                    gedrehte Bild exakt ab). */}
                <image
                  data-overlay-ui
                  href={resolveTemplateImage(img.path)}
                  x={x0}
                  y={y0}
                  width={wC}
                  height={hC}
                  preserveAspectRatio="none"
                  opacity={0}
                  style={{ pointerEvents: 'all', cursor: 'move' }}
                  onMouseDown={selectAndStartDrag}
                />
                {/* Resektionslinie + medial/laterale Resektionspunkte —
                    INNERHALB der Bildgruppe (Spiegelung+Rotation gelten mit). */}
                {resection && (
                  <>
                    <line
                      x1={resection.aPre.x}
                      y1={resection.aPre.y}
                      x2={resection.bPre.x}
                      y2={resection.bPre.y}
                      stroke="#FFC400"
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                      style={{ pointerEvents: 'none' }}
                    />
                    <circle cx={resection.aPre.x} cy={resection.aPre.y} r={3.5} fill="#FFC400" style={{ pointerEvents: 'none' }} />
                    <circle cx={resection.bPre.x} cy={resection.bPre.y} r={3.5} fill="#FFC400" style={{ pointerEvents: 'none' }} />
                  </>
                )}
              </g>
              {/* Mittelpunkt-Anker */}
              <circle cx={cx} cy={cy} r={3} fill="#ec4899" style={{ pointerEvents: 'none' }} />
              {/* Rotations-Griff (nur wenn selektiert) */}
              {isSelected && (
                <>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={handleC[0]}
                    y2={handleC[1]}
                    stroke="#f9a8d4"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    style={{ pointerEvents: 'none' }}
                  />
                  <circle
                    cx={handleC[0]}
                    cy={handleC[1]}
                    r={5}
                    fill="#0f172a"
                    stroke="#f9a8d4"
                    strokeWidth={1.5}
                    className="pointer-events-auto cursor-grab"
                    onMouseDown={(e) =>
                      startDrag(e, vp, (world) => {
                        // Winkel Center→Cursor in CANVAS-Koordinaten (passt
                        // zur SVG-rotate-Konvention des Bildes).
                        const cC = vp.worldToCanvas(world)
                        const deg =
                          (Math.atan2(cC[1] - cy, cC[0] - cx) * 180) / Math.PI + 90
                        useKneeTemplateStore.getState().setRotationDeg(t.id, deg)
                      })
                    }
                  />
                </>
              )}
            </g>
          )
        }

        // --- Fallback: bisheriger Polygon-/Kontur-Pfad ---
        const shape = renderKneeTemplate({
          kind: t.kind,
          view: t.view,
          side: t.side,
          sizeIndex: t.sizeIndex,
          center: t.center,
          rotationDeg: t.rotationDeg,
          mmPerWorldUnit: factor,
          insertThicknessMm: t.insertThicknessMm,
        })
        if (!shape) return null

        const centerC = w2c(shape.center)
        const handleC = w2c(shape.rotationHandle)
        // Messing/Amber wie der Bild-Pfad — Schablonen sehen unabhängig von
        // der Datenquelle (Screenshot-PNG vs. DXF-Kontur) gleich aus.
        const stroke = isSelected ? '#FFE08A' : '#FFC400'
        const strokeWidth = isSelected ? 2 : 1.5
        // Resektionslinie + med/lat Referenzpunkte kommen jetzt direkt aus
        // dem Renderer (shape.resection), in Weltkoordinaten. Bis zu den
        // Implantaträndern gezogen; die Punkte an den Kondylen.
        const vResection = shape.resection ?? null

        return (
          <g key={t.id}>
            {/* Pro Sub-Pfad: closed → <polygon>, open → <polyline>.
                Style 'fill' bekommt eine zarte Füllung, 'line' bleibt
                durchsichtig (nur Stroke). Selektion-Drag funktioniert
                über alle Sub-Pfade. */}
            {shape.paths.map((path, i) => {
              const pointsStr = path.polygon
                .map((p) => {
                  const c = w2c(p)
                  return `${c[0]},${c[1]}`
                })
                .join(' ')
              const fill =
                path.style === 'fill' ? 'rgba(255, 196, 0, 0.05)' : 'none'
              const swStyleAdj =
                path.style === 'line' ? strokeWidth - 0.3 : strokeWidth
              if (path.closed) {
                return (
                  <polygon
                    key={i}
                    points={pointsStr}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={swStyleAdj}
                    className="pointer-events-auto cursor-move"
                    onMouseDown={selectAndStartDrag}
                  />
                )
              }
              if (path.style === 'axis') {
                // Ausricht-Achse: gestrichelt, dünn, klick-durchlässig (kein
                // Drag — reine Referenz zum Ausrichten an der anatomischen Achse).
                // Strich-Punkt-Optik wie auf den Original-Schablonen.
                return (
                  <polyline
                    key={i}
                    points={pointsStr}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.5}
                    strokeDasharray="9 4 2 4"
                    className="pointer-events-none"
                  />
                )
              }
              return (
                <polyline
                  key={i}
                  points={pointsStr}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={swStyleAdj}
                  className="pointer-events-auto cursor-move"
                  onMouseDown={selectAndStartDrag}
                />
              )
            })}

            {/* Resektionslinie (distale Femurresektion bzw. Baseplate) — läuft
                bis zu den Implantaträndern; die zwei Punkte markieren die
                med/lat Resektionsstellen an den Kondylen. Welt-Koordinaten. */}
            {vResection && (() => {
              const p0 = w2c(vResection.line[0])
              const p1 = w2c(vResection.line[1])
              const med = w2c(vResection.med)
              const lat = w2c(vResection.lat)
              return (
                <>
                  <line
                    x1={p0[0]}
                    y1={p0[1]}
                    x2={p1[0]}
                    y2={p1[1]}
                    stroke="#FFC400"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    className="pointer-events-none"
                  />
                  <circle cx={med[0]} cy={med[1]} r={3.5} fill="#FFC400" className="pointer-events-none" />
                  <circle cx={lat[0]} cy={lat[1]} r={3.5} fill="#FFC400" className="pointer-events-none" />
                </>
              )
            })()}

            {/* Mittelpunkt-Anker — zur visuellen Orientierung */}
            <circle
              cx={centerC[0]}
              cy={centerC[1]}
              r={3}
              fill="#FFC400"
              className="pointer-events-none"
            />

            {/* Rotations-Griff (nur sichtbar, wenn selektiert) */}
            {isSelected && (
              <>
                <line
                  x1={centerC[0]}
                  y1={centerC[1]}
                  x2={handleC[0]}
                  y2={handleC[1]}
                  stroke="#FFE08A"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  className="pointer-events-none"
                />
                <circle
                  cx={handleC[0]}
                  cy={handleC[1]}
                  r={5}
                  fill="#0f172a"
                  stroke="#FFE08A"
                  strokeWidth={1.5}
                  className="pointer-events-auto cursor-grab"
                  onMouseDown={(e) =>
                    startDrag(e, vp, (world) => {
                      // Winkel vom Center zum Cursor — daraus die neue
                      // Rotation ableiten. Wir nehmen die Differenz zum
                      // Standard-„Handle oben"-Winkel (−90° in Welt-y-
                      // unten-Konvention) als Rotation.
                      const dx = world[0] - t.center[0]
                      const dy = world[1] - t.center[1]
                      const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
                      useKneeTemplateStore.getState().setRotationDeg(t.id, deg)
                    })
                  }
                />
              </>
            )}
          </g>
        )
      })}
    </svg>

      {/* Frei verschiebbare Info-Kästen je AP-Implantat (HTML, wie Hüfte):
          Resektionstiefe med/lat, LDFA/MPTA-Delta, Implantatgröße. */}
      {workflowAxes &&
        raw &&
        templates
          .filter(
            (t) =>
              t.visible &&
              t.view === 'AP' &&
              (t.kind.includes('femur') || t.kind.includes('tibia')),
          )
          .map((t) => {
            const img = getKneeImage(t.kind, t.view, t.sizeIndex)
            const contour = getKneeContour(t.kind, t.view, t.sizeIndex)
            const geom =
              img?.resect
                ? img
                : contour?.resect
                  ? (contourGeomImage(contour) as KneeImage)
                  : null
            if (!geom?.resect) return null
            return implantBoxes(vp, t, geom, workflowAxes, factor).map((b) => (
              <DraggableImageBox
                key={b.key}
                vp={vp}
                lines={b.lines}
                initialWorld={b.world}
              />
            ))
          })}

      {/* Größen-Kasten auch für SEITLICHE Schablonen (Debug-Runde 3):
          Resektions-/Winkel-Kästen brauchen die AP-Vollvermessung, die
          Größenangabe nicht — sie erscheint rechts neben dem Implantat. */}
      {templates
        .filter(
          (t) =>
            t.visible &&
            t.view === 'lateral' &&
            (t.kind.includes('femur') || t.kind.includes('tibia')),
        )
        .map((t) => {
          const img = getKneeImage(t.kind, t.view, t.sizeIndex)
          if (!img) return null
          const isFemur = t.kind.includes('femur')
          const halfW = (img.widthPx * img.mmPerPx) / 2 / factor
          const label = `${isFemur ? 'F' : 'T'}${sizeLabelFor(t.kind, t.sizeIndex)}`
          const world: V3 = [
            t.center[0] + halfW + 16 / factor,
            t.center[1],
            t.center[2],
          ]
          return (
            <DraggableImageBox
              key={`${t.id}-size-lat`}
              vp={vp}
              lines={[label]}
              initialWorld={world}
            />
          )
        })}
    </>
  )
}
