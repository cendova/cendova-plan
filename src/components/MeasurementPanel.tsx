import { useState } from 'react'
import { useViewerStore } from '../state/viewerStore'
import { Hint } from './Hint'
import { ConfirmDialog } from './ConfirmDialog'
import { useHipStore } from '../state/hipStore'
import { useKneeStore } from '../state/kneeStore'
import { useTemplateStore } from '../state/templateStore'
import { getRecipe } from '../lib/hip/recipes'
import { computeWorkflowRaw, getKneeRecipe } from '../lib/knee/recipes'
import { computeCpak } from '../lib/knee/cpak'
import {
  extractWorkflowAxes,
  computePlannedCpak,
  pickComponent,
} from '../lib/knee/resection'
import { useKneeTemplateStore } from '../state/kneeTemplateStore'
import {
  computePlanningDelta,
  stemAxisAlignment,
  femurAxisAngleCanvasDeg,
} from '../lib/hip/templates'
import { getViewport } from '../lib/cornerstone/viewer'
import {
  findPreopLLD,
  computeImplantLLDCorrection,
  buildLldBalance,
} from '../lib/hip/lldCalculation'
import {
  removeMeasurement,
  removeAllMeasurements,
  setMeasurementVisible,
} from '../lib/cornerstone/viewer'
import { CpakMatrix } from './CpakMatrix'
import { useKneePanesStore } from '../state/kneePanesStore'
import {
  removeRightMeasurement,
  setRightMeasurementVisible,
} from '../lib/cornerstone/viewer2'

export function MeasurementPanel() {
  const measurements = useViewerStore((s) => s.measurements)
  const calibration = useViewerStore((s) => s.calibration)
  const hipMeasurements = useHipStore((s) => s.measurements)
  const removeHip = useHipStore((s) => s.removeMeasurement)
  const removeAllHip = useHipStore((s) => s.removeAll)
  const setHipVisible = useHipStore((s) => s.setVisible)
  const kneeMeasurements = useKneeStore((s) => s.measurements)
  const removeKnee = useKneeStore((s) => s.removeMeasurement)
  const removeAllKnee = useKneeStore((s) => s.removeAll)
  const setKneeVisible = useKneeStore((s) => s.setVisible)
  // Platzierte Knie-Schablonen — für die „geplante" (post-OP) CPAK aus der
  // Implantat-Position. Reaktiv, damit der geplante Punkt live mitwandert.
  const kneeTemplates = useKneeTemplateStore((s) => s.templates)
  const stems = useTemplateStore((s) => s.stems)
  const cups = useTemplateStore((s) => s.templates)
  const referenceLine = useTemplateStore((s) => s.referenceLine)
  // Mess-Ergebnisse des rechten (seitlichen) Panes — eigene Liste, da der
  // rechte Viewport eine isolierte Cornerstone-Instanz ist.
  const rightMeasurements = useKneePanesStore((s) => s.rightMeasurements)
  const splitView = useKneePanesStore((s) => s.splitView)

  const factor = calibration?.mmPerWorldUnit ?? 1
  // LLD-/Offset-Deltas pro Seite, sofern Pfanne (= geplantes Drehzentrum)
  // UND Schaft (= erreichbare Kopfposition) UND Becken-Referenzlinie
  // vorhanden sind. Der Vektor Pfannenzentrum → Schaftkopf zeigt, wie
  // das Implantat die Beinlänge und das Offset verändern würde.
  const deltas = (['R', 'L'] as const).flatMap((side) => {
    const stem = stems.find((s) => s.side === side && s.visible !== false)
    const cup = cups.find((c) => c.side === side && c.visible !== false)
    if (!stem || !cup || !referenceLine) return []
    const d = computePlanningDelta(
      cup.center,
      stem.headCenter,
      referenceLine,
      side,
      factor,
    )
    // Achsen-Referenz: wenn der Schaft eine Femur-Achse trägt, deren
    // Canvas-Winkel als Bezug; sonst fällt stemAxisAlignment auf 90°
    // zurück. Viewport kann ggf. null sein (bei sehr früher Mount-
    // Phase), dann liefern wir undefined.
    const vp = getViewport()
    let referenceAngleDeg: number | undefined
    if (stem.femurAxis && vp) {
      referenceAngleDeg = femurAxisAngleCanvasDeg(stem.femurAxis, (p) =>
        vp.worldToCanvas(p),
      )
    }
    return [
      { side, ...d, stemRotationDeg: stem.rotationDeg, referenceAngleDeg },
    ]
  })

  // Beinlängen-Bilanz: prä-OP + Implantat-Korrektur = post-OP.
  // Nur sinnvoll, wenn es eine LLD-Messung UND mindestens eine Pfanne-
  // Schaft-Kombination gibt (sonst null, dann wird der Block nicht
  // gezeigt).
  const preopLLD = findPreopLLD(hipMeasurements, factor)
  const lldCorrection = computeImplantLLDCorrection(
    cups,
    stems,
    referenceLine,
    factor,
  )
  // Bilanz erscheint, sobald eine BLD-Messung vorliegt (Prä-OP); Korrektur +
  // Post-OP kommen dazu, sobald Pfanne + Schaft der operierten Seite stehen.
  const bal = preopLLD != null ? buildLldBalance(preopLLD, lldCorrection) : null
  const showLldBalance = bal != null
  const hasAny =
    measurements.length > 0 ||
    hipMeasurements.length > 0 ||
    kneeMeasurements.length > 0 ||
    deltas.length > 0 ||
    rightMeasurements.length > 0

  function clearAll() {
    removeAllMeasurements()
    removeAllHip()
    removeAllKnee()
    rightMeasurements.forEach((m) => removeRightMeasurement(m.id))
  }
  // Bestätigung vor dem Sammel-Löschen (UX-Befund P1-5: Länge/Winkel und
  // rechte Messungen sind nicht undo-fähig).
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-y border-neutral-700 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Messungen
        </span>
        {hasAny && (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-[11px] text-neutral-500 transition hover:text-red-400"
          >
            Alle löschen
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirmClear}
        title="Alle Messungen löschen?"
        confirmLabel="Alle löschen"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAll()
          setConfirmClear(false)
        }}
      >
        Alle Messungen beider Bilder werden entfernt. Längen-/Winkel- und
        seitliche Messungen lassen sich NICHT über Rückgängig zurückholen.
      </ConfirmDialog>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!hasAny && (
          <Hint>
            <p className="px-1 py-1 text-xs text-neutral-500">
              Noch keine Messungen. Ein Mess-, Hüft- oder Knie-Werkzeug wählen
              und im Bild platzieren.
            </p>
          </Hint>
        )}

        {measurements.length > 0 && (
          <ul className="flex flex-col gap-1">
            {measurements.map((m) => (
              <Row
                key={m.id}
                badge={m.label}
                badgeColor={
                  m.kind === 'length' ? 'text-sky-400' : 'text-sky-300'
                }
                visible={m.visible}
                onToggleVisible={() => setMeasurementVisible(m.id, !m.visible)}
                onDelete={() => removeMeasurement(m.id)}
                main={
                  <>
                    {m.value.toFixed(1)} {m.unit}
                    {m.kind === 'length' && !m.calibrated && (
                      <span className="ml-1 text-[10px] text-amber-500">
                        unkal.
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </ul>
        )}

        {splitView && rightMeasurements.length > 0 && (
          <div className="mt-1">
            <div className="px-1 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
              Seitliches Bild
            </div>
            <ul className="flex flex-col gap-1">
              {rightMeasurements.map((m) => (
                <Row
                  key={m.id}
                  badge={m.label}
                  badgeColor={m.kind === 'length' ? 'text-sky-400' : 'text-violet-300'}
                  visible={m.visible}
                  onToggleVisible={() =>
                    setRightMeasurementVisible(m.id, !m.visible)
                  }
                  onDelete={() => removeRightMeasurement(m.id)}
                  main={
                    <>
                      {m.value.toFixed(1)} {m.unit}
                      {m.kind === 'length' && !m.calibrated && (
                        <span className="ml-1 text-[10px] text-amber-500">
                          unkal.
                        </span>
                      )}
                    </>
                  }
                />
              ))}
            </ul>
          </div>
        )}

        {showLldBalance && bal && (
          <div className="mb-2 mt-1 rounded border border-amber-700/50 bg-amber-950/30 px-2.5 py-2 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Beinlängen-Bilanz
              </span>
              {!calibration && (
                <span className="text-[10px] text-amber-500">unkalibriert</span>
              )}
            </div>
            <LldRow label="Prä-OP" value={bal.preopText} />
            {bal.hasImplants &&
              lldCorrection.perSide.map((c) => (
                <LldCorrectionRow key={c.side} side={c.side} mm={c.mm} />
              ))}
            {bal.hasImplants && bal.postopText && (
              <div className="mt-1 border-t border-amber-700/40 pt-1">
                <LldRow label="Post-OP" value={bal.postopText} bold />
              </div>
            )}
            {!bal.hasImplants && (
              <Hint>
                <div className="mt-0.5 text-[10px] text-neutral-500">
                  Pfanne + Schaft planen für die Post-OP-Bilanz.
                </div>
              </Hint>
            )}
          </div>
        )}

        {deltas.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {deltas.map(({ side, lldMm, offsetMm, stemRotationDeg, referenceAngleDeg }) => {
              const sign = (v: number) =>
                v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)
              const longer = lldMm > 0
              // offsetMm < 0 = Kopf weiter lateral (= globales Offset
              // kleiner). Der beschreibende Text folgt der Kopf-Lage.
              const lat = offsetMm < 0
              const align = stemAxisAlignment(
                stemRotationDeg,
                side,
                referenceAngleDeg,
              )
              return (
                <li
                  key={side}
                  className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-800"
                >
                  <span className="w-7 shrink-0 text-xs font-semibold text-amber-300">
                    Δ{side}
                  </span>
                  <div className="flex flex-1 flex-col leading-tight">
                    <span className="text-[11px] text-neutral-400">
                      Plan-Änderung ({side === 'R' ? 'rechts' : 'links'})
                      {!calibration && (
                        <span className="ml-1 text-amber-500">· unkalibriert</span>
                      )}
                    </span>
                    <span className="tabular-nums">
                      <span className="text-neutral-500">Länge: </span>
                      {sign(lldMm)} mm
                      <span className="ml-1 text-[10px] text-neutral-500">
                        ({longer ? 'länger' : 'kürzer'})
                      </span>
                    </span>
                    <span className="tabular-nums">
                      <span className="text-neutral-500">Offset: </span>
                      {sign(offsetMm)} mm
                      <span className="ml-1 text-[10px] text-neutral-500">
                        ({lat ? 'mehr lateral' : 'medialer'})
                      </span>
                    </span>
                    <span className="tabular-nums">
                      <span className="text-neutral-500">Schaft-Achse: </span>
                      {align.label === 'Neutral'
                        ? 'neutral (0°)'
                        : `${align.degrees.toFixed(1)}° ${align.label}`}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {hipMeasurements.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {hipMeasurements.map((m) => {
              const recipe = getRecipe(m.kind)
              if (!recipe) return null
              const { values } = recipe.compute(m.points, factor)
              return (
                <Row
                  key={m.id}
                  badge="H"
                  badgeColor="text-sky-200"
                  visible={m.visible}
                  onToggleVisible={() => setHipVisible(m.id, !m.visible)}
                  onDelete={() => removeHip(m.id)}
                  main={
                    <div className="flex flex-col">
                      <span className="text-[11px] text-neutral-400">
                        {recipe.label}
                        {recipe.needsCalibration && !calibration && (
                          <span className="ml-1 text-amber-500">
                            · unkalibriert
                          </span>
                        )}
                      </span>
                      {values.map((v, i) => (
                        <span key={i} className="tabular-nums">
                          {values.length > 1 && (
                            <span className="text-neutral-500">
                              {v.label}:{' '}
                            </span>
                          )}
                          {v.value}
                        </span>
                      ))}
                    </div>
                  }
                />
              )
            })}
          </ul>
        )}

        {kneeMeasurements.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {kneeMeasurements.map((m) => {
              const recipe = getKneeRecipe(m.kind)
              if (!recipe) return null
              const { values } = recipe.compute(m.points, factor)
              return (
                <Row
                  key={m.id}
                  badge="K"
                  badgeColor="text-violet-300"
                  visible={m.visible}
                  onToggleVisible={() => setKneeVisible(m.id, !m.visible)}
                  onDelete={() => removeKnee(m.id)}
                  main={
                    <div className="flex flex-col">
                      <span className="text-[11px] text-neutral-400">
                        {recipe.label}
                        {recipe.needsCalibration && !calibration && (
                          <span className="ml-1 text-amber-500">
                            · unkalibriert
                          </span>
                        )}
                      </span>
                      {values.map((v, i) => (
                        <span key={i} className="tabular-nums">
                          {values.length > 1 && (
                            <span className="text-neutral-500">
                              {v.label}:{' '}
                            </span>
                          )}
                          {v.value}
                        </span>
                      ))}
                    </div>
                  }
                />
              )
            })}
          </ul>
        )}

        {/* CPAK-Schaubild pro Workflow-Messung — leitet sich direkt aus den
            17 Punkten ab und braucht keine eigene Mess-Aktion. */}
        {kneeMeasurements
          .filter((m) => m.kind === 'workflow' && m.visible)
          .map((m) => {
            const raw = computeWorkflowRaw(m.points, factor)
            if (!raw) return null
            const cpak = computeCpak(raw.mLDFA, raw.mMPTA)
            // „Geplante" CPAK aus den platzierten AP-Komponenten (Haupt-Pane).
            const axes = extractWorkflowAxes(m.points)
            const apLeft = kneeTemplates.filter(
              (t) => (t.pane ?? 'left') === 'left' && t.view === 'AP',
            )
            const fem = pickComponent(apLeft, 'Femur')
            const tib = pickComponent(apLeft, 'Tibia')
            const planned =
              axes && (fem || tib)
                ? computePlannedCpak(axes, raw.mLDFA, raw.mMPTA, fem, tib)
                : null
            return (
              <div key={`cpak-${m.id}`} className="mt-2">
                <CpakMatrix result={cpak} planned={planned} />
              </div>
            )
          })}
      </div>
    </div>
  )
}

function Row({
  badge,
  badgeColor,
  main,
  visible,
  onToggleVisible,
  onDelete,
}: {
  badge: string
  badgeColor: string
  main: React.ReactNode
  visible: boolean
  onToggleVisible: () => void
  onDelete: () => void
}) {
  return (
    <li className="group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-800">
      <span className={`w-7 shrink-0 text-xs font-semibold ${badgeColor}`}>
        {badge}
      </span>
      <span
        className={[
          'flex-1',
          visible ? 'text-neutral-200' : 'text-neutral-500',
        ].join(' ')}
      >
        {main}
      </span>
      <button
        onClick={onToggleVisible}
        className="shrink-0 text-neutral-500 transition hover:text-sky-300"
        title={visible ? 'Im Bild ausblenden' : 'Im Bild einblenden'}
      >
        <EyeIcon off={!visible} />
      </button>
      <button
        onClick={onDelete}
        className="shrink-0 text-xs text-neutral-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
        title="Messung löschen"
      >
        ✕
      </button>
    </li>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    >
      <path d="M1 7s2.3-4 6-4 6 4 6 4-2.3 4-6 4-6-4-6-4z" />
      <circle cx="7" cy="7" r="1.8" />
      {off && <line x1="1.5" y1="1.5" x2="12.5" y2="12.5" />}
    </svg>
  )
}

/** Eine Zeile der Beinlängen-Bilanz: Label + fertig formatierter Wert
 *  (der Wert kommt aus buildLldBalance, immer relativ zur Bezugsseite). */
function LldRow({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 leading-tight">
      <span
        className={
          bold
            ? 'text-[11px] font-semibold text-amber-100'
            : 'text-[11px] text-neutral-400'
        }
      >
        {label}
      </span>
      <span
        className={
          bold
            ? 'tabular-nums text-sm font-semibold text-amber-100'
            : 'tabular-nums text-sm text-neutral-200'
        }
      >
        {value}
      </span>
    </div>
  )
}

/** Zeile für die Implantat-bedingte Korrektur pro Seite. Positiv =
 *  operiertes Bein wird länger. */
function LldCorrectionRow({ side, mm }: { side: 'R' | 'L'; mm: number }) {
  const sign = mm > 0 ? '+' : ''
  return (
    <div className="flex items-baseline justify-between gap-2 leading-tight">
      <span className="text-[11px] text-neutral-400">Korrektur {side}</span>
      <span className="tabular-nums text-sm text-neutral-200">
        {sign}
        {(mm / 10).toFixed(2).replace('.', ',')} cm
      </span>
    </div>
  )
}
