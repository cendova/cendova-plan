import { useState, type ReactNode } from 'react'
import { useViewerStore } from '../state/viewerStore'
import { Hint } from './Hint'
import { ConfirmDialog } from './ConfirmDialog'
import { useHipStore } from '../state/hipStore'
import { useKneeStore, type KneeMeasurement } from '../state/kneeStore'
import { useTemplateStore } from '../state/templateStore'
import { getRecipe } from '../lib/hip/recipes'
import { computeWorkflowRaw, getKneeRecipe } from '../lib/knee/recipes'
import { getShoulderRecipe } from '../lib/shoulder/recipes'
import { useShoulderStore } from '../state/shoulderStore'
import { computeCpak } from '../lib/knee/cpak'
import { KneeBeinachseKarte, KneeOsteotomieKarte } from './KneeOsteotomieKarten'
import { findeVollvermessung, useOsteotomie } from './useOsteotomie'
import {
  extractWorkflowAxes,
  computePlannedCpak,
  pickComponent,
  type PlannedCpak,
} from '../lib/knee/resection'
import { useKneeTemplateStore, type KneeTemplate } from '../state/kneeTemplateStore'
import {
  computePlanningDelta,
  stemAxisAlignment,
  femurAxisAngleCanvasDeg,
} from '../lib/hip/templates'
import { getViewport } from '../lib/cornerstone/viewer'
import {
  findPreopLLDMessung,
  computeImplantLLDCorrection,
  buildLldBalance,
} from '../lib/hip/lldCalculation'
import {
  removeMeasurement,
  removeAllMeasurements,
  setMeasurementVisible,
} from '../lib/cornerstone/viewer'
import { CpakMatrix } from './CpakMatrix'
import { FemurProfileCard } from './FemurProfileCard'
import { useKneePanesStore } from '../state/kneePanesStore'
import {
  removeRightMeasurement,
  setRightMeasurementVisible,
} from '../lib/cornerstone/viewer2'
import { cmMitVorzeichen, grad, mm, mmMitVorzeichen } from '../lib/zahlFormat'
import { Abschnitt, Karte, Kennwerte, type KennwertZeile } from './Ergebnis'

/**
 * Rechte Spalte: oben die MESSLISTE, darunter die AUSWERTUNG.
 *
 * Grundsatz (Realtest 29.09.2026, „sehr voll und uneinheitlich"): Jeder
 * Wert steht genau EINMAL da. Eine Messung, deren Ergebnis eine Karte
 * zeigt, bleibt in der Liste nur als Griff (Name, Auge, Löschen) mit einem
 * Verweis auf die Karte. Messungen ohne Karte zeigen ihre Werte direkt in
 * der Zeile — im selben Tabellenformat wie die Karten (Ergebnis.tsx).
 *
 * Die Karten hängen nur an den Daten, nicht am Modus oder aneinander:
 * Prothesen-Schablonen und Umstellungsosteotomie funktionieren je für sich
 * und teilen sich nur die Anzeige der Beinachse.
 */

type Werte = { label: string; value: string }[]

/** Ein einzelner Wert mit dem Namen der Messung wandert in die Kopfzeile. */
function aufteilen(label: string, values: Werte) {
  if (values.length === 1 && values[0].label === label) {
    return { wert: values[0].value, zeilen: [] as KennwertZeile[] }
  }
  return {
    wert: undefined,
    zeilen: values.map((v): KennwertZeile => ({ label: v.label, werte: [v.value] })),
  }
}

/** Geplante Knie-Achse aus den platzierten AP-Komponenten (Haupt-Pane). */
function implantatPlan(
  m: KneeMeasurement,
  templates: KneeTemplate[],
  mmPerWorldUnit: number,
): PlannedCpak | null {
  const raw = computeWorkflowRaw(m.points, mmPerWorldUnit)
  const axes = extractWorkflowAxes(m.points)
  if (!raw || !axes) return null
  const apLeft = templates.filter((t) => (t.pane ?? 'left') === 'left' && t.view === 'AP')
  const fem = pickComponent(apLeft, 'Femur')
  const tib = pickComponent(apLeft, 'Tibia')
  return fem || tib ? computePlannedCpak(axes, raw.mLDFA, raw.mMPTA, fem, tib) : null
}

export function MeasurementPanel() {
  const measurements = useViewerStore((s) => s.measurements)
  const calibration = useViewerStore((s) => s.calibration)
  const planningMode = useViewerStore((s) => s.planningMode)
  const { plan: osteoPlan, ergebnis: osteo } = useOsteotomie()
  const hipMeasurements = useHipStore((s) => s.measurements)
  const removeHip = useHipStore((s) => s.removeMeasurement)
  const removeAllHip = useHipStore((s) => s.removeAll)
  const setHipVisible = useHipStore((s) => s.setVisible)
  const kneeMeasurements = useKneeStore((s) => s.measurements)
  const removeKnee = useKneeStore((s) => s.removeMeasurement)
  const removeAllKnee = useKneeStore((s) => s.removeAll)
  const setKneeVisible = useKneeStore((s) => s.setVisible)
  const shoulderMeasurements = useShoulderStore((s) => s.measurements)
  const removeShoulder = useShoulderStore((s) => s.removeMeasurement)
  const removeAllShoulder = useShoulderStore((s) => s.removeAll)
  const setShoulderVisible = useShoulderStore((s) => s.setVisible)
  // Platzierte Knie-Schablonen — für die „geplante" (post-OP) Achse aus der
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

  // Beinlängen-Bilanz: prä-OP + Implantat-Korrektur = post-OP. Erscheint
  // ab der LLD-Messung; Korrektur + Post-OP kommen dazu, sobald Pfanne +
  // Schaft der operierten Seite stehen.
  const preop = findPreopLLDMessung(hipMeasurements, factor)
  const lldCorrection = computeImplantLLDCorrection(
    cups,
    stems,
    referenceLine,
    factor,
  )
  const bal = preop ? buildLldBalance(preop.lldMm, lldCorrection) : null

  // Knie: die maßgebliche Vollvermessung trägt Beinachse + Osteotomie.
  const massgeblich = findeVollvermessung(kneeMeasurements)
  const osteoCpak: PlannedCpak | null =
    osteoPlan?.sichtbar && osteo?.ok
      ? {
          cpak: computeCpak(osteo.nachher.mLDFA, osteo.nachher.mMPTA),
          ldfa: osteo.nachher.mLDFA,
          mpta: osteo.nachher.mMPTA,
          femPlaced: true,
          tibPlaced: true,
          quelle: 'osteotomie',
        }
      : null
  // Die mLPFA/mLDTA, die in die Paley-Analyse der Beinachse eingehen: je
  // die jüngste sichtbare Einzelmessung (dieselbe Regel wie useOsteotomie).
  const paleyIds = new Set(
    massgeblich
      ? (['mLPFA', 'mLDTA'] as const).flatMap((k) => {
          const m = [...kneeMeasurements].reverse().find((x) => x.kind === k && x.visible)
          return m ? [m.id] : []
        })
      : [],
  )

  // „Alle löschen" umfasst nur, was sich damit auch löschen lässt —
  // Messungen. Die Hüft-Planungswerte sind ABLEITUNGEN aus platzierten
  // Schablonen: sie verschwinden mit den Schablonen (Panel darunter),
  // nicht mit den Messungen. Messungen des rechten Panes zählen nur,
  // solange die Zwei-Bild-Ansicht sie zeigt.
  const hatLoeschbareMessungen =
    measurements.length > 0 ||
    hipMeasurements.length > 0 ||
    kneeMeasurements.length > 0 ||
    shoulderMeasurements.length > 0 ||
    (splitView && rightMeasurements.length > 0)
  const hatHuefteKarte = bal != null || deltas.length > 0
  // Der Leerzustands-Hinweis verschwindet dagegen, sobald IRGENDETWAS in
  // der Spalte steht — auch eine abgeleitete Karte.
  const zeigtInhalt = hatLoeschbareMessungen || hatHuefteKarte

  function clearAll() {
    removeAllMeasurements()
    removeAllHip()
    removeAllKnee()
    removeAllShoulder()
    rightMeasurements.forEach((m) => removeRightMeasurement(m.id))
  }
  // Bestätigung vor dem Sammel-Löschen (UX-Befund P1-5: Länge/Winkel und
  // rechte Messungen sind nicht undo-fähig).
  const [confirmClear, setConfirmClear] = useState(false)

  const unkalibriert = (noetig: boolean) =>
    noetig && !calibration ? <span className="text-amber-500"> · unkalibriert</span> : null

  // --- Auswertung (Karten) ------------------------------------------------
  const karten: ReactNode[] = []
  if (hatHuefteKarte) {
    karten.push(
      <HuefteBilanzKarte
        key="huefte"
        kalibriert={calibration != null}
        tm={
          preop
            ? (getRecipe('lld')
                ?.compute(preop.messung.points, factor)
                .values.filter((v) => v.label.startsWith('TM ')) ?? [])
            : []
        }
        bal={bal}
        deltas={deltas}
      />,
    )
  }
  for (const m of hipMeasurements) {
    if (m.kind !== 'femurProfile' || !m.visible) continue
    karten.push(
      <FemurProfileCard
        key={`fp-${m.id}`}
        id={m.id}
        points={m.points}
        mmPerWorldUnit={factor}
        review={m.femurProfileReview}
      />,
    )
  }
  if (massgeblich) {
    karten.push(
      <KneeBeinachseKarte
        key="beinachse"
        implantat={implantatPlan(massgeblich, kneeTemplates, factor)}
      />,
    )
  }
  // CPAK pro sichtbarer Vollvermessung; die Osteotomie gehört zur
  // maßgeblichen und hat dort Vorrang vor Implantaten (beides zugleich ist
  // kein klinisches Szenario).
  for (const m of kneeMeasurements) {
    if (m.kind !== 'workflow' || !m.visible) continue
    const raw = computeWorkflowRaw(m.points, factor)
    if (!raw) continue
    const planned =
      (m === massgeblich ? osteoCpak : null) ?? implantatPlan(m, kneeTemplates, factor)
    karten.push(
      <CpakMatrix
        key={`cpak-${m.id}`}
        result={computeCpak(raw.mLDFA, raw.mMPTA)}
        planned={planned}
      />,
    )
  }
  if (massgeblich) karten.push(<KneeOsteotomieKarte key="osteotomie" />)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-y border-neutral-700 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Messungen
        </span>
        {hatLoeschbareMessungen && (
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
        {!zeigtInhalt && (
          <Hint>
            {/* Nennt wie das Schablonen-Panel die Werkzeuge des AKTIVEN
                Modus samt Ort. Die generischen Länge-/Winkel-Werkzeuge
                liegen in der Kopfzeile, nicht in der linken Leiste. */}
            <p className="px-1 py-1 text-xs text-neutral-500">
              {planningMode === 'hip' &&
                'Noch keine Messungen. Ein Hüft-Werkzeug in der linken Leiste wählen — oder Länge/Winkel in der Kopfzeile.'}
              {planningMode === 'knee' &&
                'Noch keine Messungen. Vollvermessung oder ein Messwerkzeug in der linken Leiste wählen — oder Länge/Winkel in der Kopfzeile.'}
              {planningMode === 'shoulder' &&
                'Noch keine Messungen. Ein Schulter-Werkzeug in der linken Leiste wählen — oder Länge/Winkel in der Kopfzeile.'}
            </p>
          </Hint>
        )}

        {hatLoeschbareMessungen && (
          <ul className="flex flex-col gap-0.5">
            {measurements.map((m) => (
              <Row
                key={m.id}
                badge={m.label}
                badgeColor="text-sky-300"
                titel={
                  <>
                    {m.kind === 'length' ? 'Länge' : 'Winkel'}
                    {m.kind === 'length' && !m.calibrated && (
                      <span className="text-amber-500"> · unkalibriert</span>
                    )}
                  </>
                }
                wert={m.unit === '°' ? grad(m.value) : mm(m.value)}
                visible={m.visible}
                onToggleVisible={() => setMeasurementVisible(m.id, !m.visible)}
                onDelete={() => removeMeasurement(m.id)}
              />
            ))}

            {hipMeasurements.map((m) => {
              const recipe = getRecipe(m.kind)
              if (!recipe) return null
              // Femurprofil und die Bilanz-LLD zeigen ihre Werte
              // AUSSCHLIESSLICH in der eigenen Karte; die Zeile bleibt Griff.
              // Beim Femurprofil wäre eine zweite Anzeige zudem UNGLEICH:
              // `compute` ist rein und kennt die gespeicherte Checkliste
              // älterer Pläne nicht, zeigte also eine Klasse, die die Karte
              // unterdrückt.
              const istFemurprofil = m.kind === 'femurProfile'
              const inBilanz = preop?.messung.id === m.id
              const { wert, zeilen } =
                istFemurprofil || inBilanz
                  ? { wert: undefined, zeilen: [] }
                  : aufteilen(recipe.label, recipe.compute(m.points, factor).values)
              return (
                <Row
                  key={m.id}
                  badge="H"
                  badgeColor="text-sky-200"
                  titel={
                    <>
                      {recipe.label}
                      {unkalibriert(recipe.needsCalibration === true)}
                    </>
                  }
                  wert={wert}
                  zeilen={zeilen}
                  verweis={
                    istFemurprofil
                      ? m.visible
                        ? 'siehe „Morphologie & Fixation"'
                        : 'Karte erscheint beim Einblenden'
                      : inBilanz
                        ? 'siehe „Beinlänge & Offset"'
                        : undefined
                  }
                  visible={m.visible}
                  onToggleVisible={() => setHipVisible(m.id, !m.visible)}
                  onDelete={() => removeHip(m.id)}
                />
              )
            })}

            {kneeMeasurements.map((m) => {
              const recipe = getKneeRecipe(m.kind)
              if (!recipe) return null
              const verweis =
                m === massgeblich
                  ? 'siehe „Beinachse" und „CPAK"'
                  : paleyIds.has(m.id)
                    ? 'siehe „Beinachse"'
                    : undefined
              const { wert, zeilen } = verweis
                ? { wert: undefined, zeilen: [] }
                : aufteilen(recipe.label, recipe.compute(m.points, factor).values)
              return (
                <Row
                  key={m.id}
                  badge="K"
                  badgeColor="text-violet-300"
                  titel={
                    <>
                      {recipe.label}
                      {unkalibriert(recipe.needsCalibration === true)}
                    </>
                  }
                  wert={wert}
                  zeilen={zeilen}
                  verweis={verweis}
                  visible={m.visible}
                  onToggleVisible={() => setKneeVisible(m.id, !m.visible)}
                  onDelete={() => removeKnee(m.id)}
                />
              )
            })}

            {/* Schulter: zusätzlich die SEITE, weil sie pro Messung
                eingefroren wird — ein späteres Umschalten in der Toolbar
                deutet bestehende Messungen bewusst nicht um. */}
            {shoulderMeasurements.map((m) => {
              const recipe = getShoulderRecipe(m.kind)
              if (!recipe) return null
              const { wert, zeilen } = aufteilen(
                recipe.label,
                recipe.compute(m.points, factor).values,
              )
              return (
                <Row
                  key={m.id}
                  badge="S"
                  badgeColor="text-emerald-300"
                  titel={
                    <>
                      {recipe.label}
                      <span className="text-neutral-500">
                        {' '}
                        · {m.side === 'R' ? 'rechts' : 'links'}
                      </span>
                      {unkalibriert(recipe.needsCalibration === true)}
                    </>
                  }
                  wert={wert}
                  zeilen={zeilen}
                  visible={m.visible}
                  onToggleVisible={() => setShoulderVisible(m.id, !m.visible)}
                  onDelete={() => removeShoulder(m.id)}
                />
              )
            })}

            {splitView && rightMeasurements.length > 0 && (
              <li className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                Seitliches Bild
              </li>
            )}
            {splitView &&
              rightMeasurements.map((m) => (
                <Row
                  key={m.id}
                  badge={m.label}
                  badgeColor="text-sky-300"
                  titel={
                    <>
                      {m.kind === 'length' ? 'Länge' : 'Winkel'}
                      {m.kind === 'length' && !m.calibrated && (
                        <span className="text-amber-500"> · unkalibriert</span>
                      )}
                    </>
                  }
                  wert={m.unit === '°' ? grad(m.value) : mm(m.value)}
                  visible={m.visible}
                  onToggleVisible={() => setRightMeasurementVisible(m.id, !m.visible)}
                  onDelete={() => removeRightMeasurement(m.id)}
                />
              ))}
          </ul>
        )}

        {karten.length > 0 && (
          <>
            <div className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
              Auswertung
            </div>
            <div className="flex flex-col gap-2">{karten}</div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Hüfte: Beinlängen-Bilanz UND Planungsänderung in EINER Karte. Vorher
 * standen die Implantat-Korrektur zweimal da (Bilanz in cm, „Δ"-Zeile in
 * mm) und die TM-Abstände zusätzlich in der Messliste.
 */
function HuefteBilanzKarte({
  kalibriert,
  tm,
  bal,
  deltas,
}: {
  kalibriert: boolean
  /** TM-Abstände der Bilanz-LLD-Messung (bereits formatiert). */
  tm: Werte
  bal: ReturnType<typeof buildLldBalance> | null
  deltas: {
    side: 'R' | 'L'
    lldMm: number
    offsetMm: number
    stemRotationDeg: number
    referenceAngleDeg?: number
  }[]
}) {
  const seite = (s: 'R' | 'L') => (s === 'R' ? 'rechts' : 'links')
  const achse = (d: (typeof deltas)[number]) => {
    const a = stemAxisAlignment(d.stemRotationDeg, d.side, d.referenceAngleDeg)
    return a.label === 'Neutral' ? 'neutral' : `${grad(a.degrees)} ${a.label}`
  }
  return (
    <Karte
      titel="Beinlänge & Offset"
      kennung={kalibriert ? undefined : <span className="text-amber-500">unkalibriert</span>}
      fuss={
        deltas.length > 0
          ? 'Planung = Verschiebung Pfannenzentrum → Schaftkopf relativ zur Beckenlinie.'
          : undefined
      }
    >
      {bal && (
        <Kennwerte
          zeilen={[
            ...tm.map((v): KennwertZeile => ({ label: v.label, werte: [v.value] })),
            {
              label: 'Differenz prä-OP',
              werte: [bal.preopText],
              titel: 'Bezug: operierte Seite, ohne Planung die längere',
            },
          ]}
        />
      )}
      {deltas.length > 0 && (
        <MaybeAbschnitt trennen={bal != null}>
          <Kennwerte
            spalten={deltas.map((d) => `Plan ${seite(d.side)}`)}
            zeilen={[
              {
                label: 'Beinlänge',
                norm: '+ länger',
                werte: deltas.map((d) => cmMitVorzeichen(d.lldMm)),
              },
              {
                label: 'Offset',
                norm: '− lateral',
                titel: 'Negativ = Kopf weiter lateral, positiv = medialer',
                werte: deltas.map((d) => mmMitVorzeichen(d.offsetMm)),
              },
              { label: 'Schaftachse', werte: deltas.map(achse) },
            ]}
          />
        </MaybeAbschnitt>
      )}
      {bal?.hasImplants && bal.postopText && (
        <Abschnitt>
          <Kennwerte zeilen={[{ label: 'Differenz post-OP', werte: [bal.postopText], betont: true }]} />
        </Abschnitt>
      )}
      {bal && !bal.hasImplants && (
        <Hint>
          <div className="mt-1 text-[10px] text-neutral-500">
            Pfanne + Schaft planen für die Post-OP-Bilanz.
          </div>
        </Hint>
      )}
    </Karte>
  )
}

function MaybeAbschnitt({ trennen, children }: { trennen: boolean; children: ReactNode }) {
  return trennen ? <Abschnitt>{children}</Abschnitt> : <>{children}</>
}

/**
 * Eine Zeile der Messliste. Einzelwert rechts in der Kopfzeile, mehrere
 * Werte als Kennwert-Tabelle darunter — oder nur ein Verweis, wenn eine
 * Karte die Werte zeigt.
 */
function Row({
  badge,
  badgeColor,
  titel,
  wert,
  zeilen,
  verweis,
  visible,
  onToggleVisible,
  onDelete,
}: {
  badge: string
  badgeColor: string
  titel: ReactNode
  wert?: string
  zeilen?: KennwertZeile[]
  verweis?: string
  visible: boolean
  onToggleVisible: () => void
  onDelete: () => void
}) {
  return (
    <li className="group flex items-start gap-2 rounded px-2 py-1 hover:bg-neutral-800/70">
      <span
        className={`w-7 shrink-0 text-[11px] font-semibold leading-5 ${badgeColor}`}
        title={BADGE_TITEL[badge] ?? undefined}
      >
        {badge}
      </span>
      <div className={['min-w-0 flex-1', visible ? '' : 'opacity-50'].join(' ')}>
        <div className="flex items-baseline justify-between gap-2 leading-5">
          <span className="min-w-0 truncate text-[11px] text-neutral-300">{titel}</span>
          {wert != null && (
            <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-neutral-100">
              {wert}
            </span>
          )}
        </div>
        {zeilen && zeilen.length > 0 && <Kennwerte zeilen={zeilen} />}
        {verweis && <div className="text-[10px] leading-snug text-neutral-500">{verweis}</div>}
      </div>
      <button
        onClick={onToggleVisible}
        className="mt-0.5 shrink-0 text-neutral-500 transition hover:text-sky-300"
        title={visible ? 'Im Bild ausblenden' : 'Im Bild einblenden'}
      >
        <EyeIcon off={!visible} />
      </button>
      <button
        onClick={onDelete}
        className="shrink-0 text-xs leading-5 text-neutral-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
        title="Messung löschen"
      >
        ✕
      </button>
    </li>
  )
}

/** Klartext der Modul-Kürzel vor jeder Messung (Tooltip). */
const BADGE_TITEL: Record<string, string> = {
  H: 'Hüft-Messung',
  K: 'Knie-Messung',
  S: 'Schulter-Messung',
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
