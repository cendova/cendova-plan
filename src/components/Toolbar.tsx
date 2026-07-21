/**
 * Linke Sidebar — domänenspezifische Planungs-Werkzeuge.
 *
 * Aufgeräumt seit dem Modus-Switcher-Refactor:
 *   - Universelle Tools (Bild laden, Pan/Zoom/Window-Level, Kalibrierung,
 *     Length/Angle, Notiz) leben jetzt im Header (siehe `HeaderTools`).
 *   - Diese Sidebar zeigt NUR den Block für den aktiven Planungs-Modus
 *     (Hüfte ODER Knie). Modus-Wechsel via Tabs oben in der Sidebar.
 *
 * Fertige Messungen und Templates bleiben über den Modus-Wechsel hinweg
 * sichtbar (`MeasurementPanel` rechts zeigt beide Modi); nur die
 * laufenden Tools werden beim Wechsel abgebrochen (siehe
 * `setPlanningMode` in `lib/toolControls.ts`).
 */
import { useEffect, useRef, useState } from 'react'
import { useViewerStore } from '../state/viewerStore'
import { useHipStore } from '../state/hipStore'
import { useKneeStore } from '../state/kneeStore'
import { useUiStore } from '../state/uiStore'
import { Hint } from './Hint'
import {
  applyNavToolsPane2,
  startSlopeToolPane2,
} from '../lib/cornerstone/viewer2'
import {
  useTemplateStore,
  type CupTemplate,
  type StemTemplate,
} from '../state/templateStore'
import { AVAILABLE_RECIPES } from '../lib/hip/recipes'
import { AVAILABLE_KNEE_RECIPES, computeWorkflowRaw } from '../lib/knee/recipes'
import {
  extractWorkflowAxes,
  computePlannedCpak,
  boneOf,
} from '../lib/knee/resection'
import {
  cupCatalogEntries,
  cupDiameterMm,
  cupInclination,
  cupShape,
  headOffsetMm,
  HEAD_OFFSET_COUNT,
  stemCatalogEntries,
} from '../lib/hip/templates'
import {
  addCupTemplate,
  addKneeTemplate,
  addStemTemplate,
  autoPlaceKneeImplant,
  openCalibrationChoice,
} from '../lib/cornerstone/viewer'
import {
  pickHipTool,
  pickKneeTool,
  setPlanningMode,
  toggleOsteophyteTool,
} from '../lib/toolControls'
import { useOsteophyteStore } from '../state/osteophyteStore'
import { useKneePanesStore } from '../state/kneePanesStore'
import { useKneeTemplateStore } from '../state/kneeTemplateStore'
import { useTemplatePackageStore } from '../state/templatePackageStore'
import {
  KNEE_IMPLANT_FAMILIES,
  isHiddenKneeSize,
  LEGION_PS_FEMUR,
  SPHERE_FEMUR,
  SPHERE_TIBIA_BASEPLATE,
  GENESIS_II_TIBIA_FEMALE_TAPERED,
  JOURNEY_UK_FEMUR,
  JOURNEY_UK_TIBIA_MEDIAL,
  TIBIA_INSERT,
  type KneeImplantKind,
} from '../lib/knee/smithNephewCatalog'
import { renderKneeTemplate } from '../lib/knee/templates'

export function Toolbar() {
  const planningMode = useViewerStore((s) => s.planningMode)
  const hasImage = useViewerStore((s) => s.hasImage)
  const hipActiveKind = useHipStore((s) => s.activeKind)
  const kneeActiveKind = useKneeStore((s) => s.activeKind)

  return (
    <aside className="flex w-52 flex-col border-r border-neutral-700 bg-neutral-900">
      {/* Tab-Leiste oben: schaltet zwischen Hüft- und Knie-Werkzeugen um. */}
      <div className="flex border-b border-neutral-700 bg-neutral-950">
        <TabButton
          label="Hüfte"
          active={planningMode === 'hip'}
          onClick={() => setPlanningMode('hip')}
        />
        <TabButton
          label="Knie"
          active={planningMode === 'knee'}
          onClick={() => setPlanningMode('knee')}
        />
      </div>

      <div className="flex flex-col gap-1 overflow-y-auto p-2">
        {planningMode === 'hip' ? (
          <HipSection
            hasImage={hasImage}
            activeKind={hipActiveKind}
          />
        ) : (
          <KneeSection
            hasImage={hasImage}
            activeKind={kneeActiveKind}
          />
        )}
      </div>

      <Hint>
        <div className="mt-auto p-3 text-xs leading-relaxed text-neutral-600">
          Maus: links = aktives Werkzeug, Cmd/Strg+links oder Mitte =
          verschieben, rechts = zoomen, Rad = blättern.
        </div>
      </Hint>
    </aside>
  )
}

// ----------------------------------------------------------------------
// Modus-Sektionen
// ----------------------------------------------------------------------

// Kuratierte Reihenfolge/Beschriftung der Schablonen-Buttons in der
// Knie-Sidebar. Ein Button erscheint nur, wenn das importierte
// Schablonen-Paket die Familie tatsächlich enthält — KNEE_IMPLANT_FAMILIES
// ist im öffentlichen Repo leer, die Demo zeigt daher weder Produktnamen
// noch tote Buttons (Klick lief vorher in den stillen Kontur-Guard von
// addKneeTemplate).
const KNEE_SIDEBAR_TEMPLATES: ReadonlyArray<{
  kind: KneeImplantKind
  label: string
  uka?: boolean
}> = [
  { kind: 'legion-ps-femur', label: 'Femur (Legion PS)' },
  { kind: 'sphere-femur', label: 'Femur (GMK Sphere)' },
  { kind: 'genesis-tibia-female', label: 'Tibia (Genesis II)' },
  { kind: 'sphere-tibia-baseplate', label: 'Tibia (GMK Sphere)' },
  { kind: 'journey-uk-femur', label: 'Journey UK Femur', uka: true },
  {
    kind: 'journey-uk-tibia-medial',
    label: 'Journey UK Tibia medial',
    uka: true,
  },
]

// Gemeinsamer Hinweis für Hüfte + Knie, wenn kein Paket geladen ist
// (Formulierung wie im rechten TemplatesPanel).
function KeinPaketHinweis() {
  return (
    <p className="mx-1 mb-1 rounded border border-amber-800/60 bg-amber-950/40 px-2 py-1.5 text-[11px] leading-snug text-amber-300">
      Kein Schablonen-Paket geladen — Schablonen sind erst nach dem Import
      verfügbar (Paket-Symbol oben in der Kopfzeile). Messen geht auch ohne.
    </p>
  )
}

function HipSection({
  hasImage,
  activeKind,
}: {
  hasImage: boolean
  activeKind: string | null
}) {
  const calibrated = useViewerStore((s) => s.calibration != null)
  // „Erledigt"-Kriterien fürs Auto-Einklappen (Debug-Runde 2): Sobald ein
  // Schritt bearbeitet ist, klappt seine Sektion standardmäßig zu — bleibt
  // aber per Klick erreichbar. Eine EXPLIZITE Nutzer-Wahl (uiStore)
  // überstimmt den Default dauerhaft.
  const hasHipMeasurement = useHipStore((s) =>
    s.measurements.some((m) => m.kind !== 'osteotomy'),
  )
  const hasOsteotomy = useHipStore((s) =>
    s.measurements.some((m) => m.kind === 'osteotomy'),
  )
  // ≥ 2 Komponenten platziert (Pfanne + Schaft) = Templating erledigt.
  const templateCount = useTemplateStore(
    (s) => s.templates.length + s.stems.length,
  )
  const hasOsteophytes = useOsteophyteStore((s) => s.regions.length > 0)
  // Ohne Katalog (kein Schablonen-Paket) sind die Hinzufügen-Buttons
  // deaktiviert: eine Pfanne degenerierte sonst zum 0-mm-Punkt, der Schaft
  // zur generischen Ersatzform. pkgInfo triggert zudem das Re-Render nach
  // Paket-Import/-Entfernen (die Katalog-Konstanten werden in-place ersetzt).
  const pkgInfo = useTemplatePackageStore((s) => s.info)
  const cupsVerfuegbar = cupCatalogEntries().length > 0
  const stemsVerfuegbar = stemCatalogEntries().length > 0
  const keinHipKatalog = !pkgInfo && !cupsVerfuegbar && !stemsVerfuegbar
  return (
    <>
      {/* Workflow-Reihenfolge: 1. Kalibrierung → 2. Messung → 3. Templating */}
      <CollapsibleSection
        id="hip-cal"
        title="1 · Kalibrierung"
        defaultCollapsed={calibrated}
        statusDot={calibrated ? 'bg-emerald-500' : 'bg-amber-500'}
      >
        <CalibrationButton hasImage={hasImage} />
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="hip-measure"
        title="2 · Hüft-Messungen"
        defaultCollapsed={hasHipMeasurement}
        statusDot={hasHipMeasurement ? 'bg-emerald-500' : 'bg-amber-500'}
      >
        {AVAILABLE_RECIPES.map((recipe) => (
          <ToolButton
            key={recipe.kind}
            label={recipe.label}
            active={activeKind === recipe.kind}
            disabled={!hasImage}
            onClick={() => pickHipTool(recipe.kind)}
          />
        ))}
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="hip-templates"
        title="3 · Hüft-Schablonen"
        defaultCollapsed={templateCount >= 2}
        statusDot={templateCount >= 2 ? 'bg-emerald-500' : 'bg-amber-500'}
      >
        {keinHipKatalog && <KeinPaketHinweis />}
        <ToolButton
          label="Pfanne hinzufügen"
          disabled={!hasImage || !cupsVerfuegbar}
          onClick={addCupTemplate}
        />
        <ToolButton
          label="Schaft hinzufügen"
          disabled={!hasImage || !stemsVerfuegbar}
          onClick={addStemTemplate}
        />
      </CollapsibleSection>
      {/* Eigenschaften der AUSGEWÄHLTEN Schablone bewusst außerhalb der
          einklappbaren Sektion — ein Klick auf eine Schablone im Bild muss
          das Panel auch bei zugeklappter Sektion zeigen. */}
      <SelectedTemplatePanel />

      <Divider />

      <CollapsibleSection
        id="hip-osteo"
        title="4 · Osteotomie"
        defaultCollapsed={hasOsteotomy}
        statusDot={hasOsteotomy ? 'bg-emerald-500' : undefined}
      >
        <ToolButton
          label="Osteotomie-Planer"
          active={activeKind === 'osteotomy'}
          disabled={!hasImage}
          onClick={() => pickHipTool('osteotomy')}
        />
        <Hint>
          <p className="px-3 pt-1 text-[10px] leading-snug text-neutral-500">
            1. Spitze Trochanter minor · 2. kranialer Schenkelhals ·
            3. Kalkaregion → Resektionshöhe in cm.
          </p>
        </Hint>
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="hip-osteophytes"
        title="5 · Osteophyten"
        defaultCollapsed={hasOsteophytes}
        statusDot={hasOsteophytes ? 'bg-emerald-500' : undefined}
      >
        <OsteophyteToolButton hasImage={hasImage} />
        <OsteophyteList />
      </CollapsibleSection>
    </>
  )
}

/** Toggle-Button für den Osteophyten-Markier-Modus (rot, damit er sich
 *  von den blauen Mess-/Template-Tools abhebt). */
function OsteophyteToolButton({ hasImage }: { hasImage: boolean }) {
  const placing = useOsteophyteStore((s) => s.placing)
  return (
    <>
      <button
        onClick={toggleOsteophyteTool}
        disabled={!hasImage}
        className={[
          'rounded border px-3 py-2 text-left text-sm transition',
          placing
            ? 'border-red-500 bg-red-700/30 text-red-100 ring-1 ring-red-500'
            : 'border-red-900/60 bg-red-950/20 text-red-200 hover:bg-red-900/30',
          !hasImage ? 'cursor-not-allowed opacity-50' : '',
        ].join(' ')}
      >
        {placing ? 'Markieren aktiv – fertig' : 'Osteophyten markieren'}
      </button>
      <Hint>
        <p className="px-3 pt-1 text-[10px] leading-snug text-neutral-500">
          Feine Punkte um den Osteophyten setzen → rot schraffierte Fläche
          als Erinnerung zur intraop. Entfernung. Enter schließt eine Fläche
          ab, Esc verwirft sie.
        </p>
      </Hint>
    </>
  )
}

/** Liste der gesetzten Osteophyten-Flächen mit Lösch-Button. */
function OsteophyteList() {
  const regions = useOsteophyteStore((s) => s.regions)
  const removeRegion = useOsteophyteStore((s) => s.removeRegion)
  if (regions.length === 0) return null
  return (
    <div className="mx-2 mt-1 flex flex-col gap-0.5">
      {regions.map((r, i) => (
        <div
          key={r.id}
          className="flex items-center justify-between rounded px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          <span>Osteophyt {i + 1} ({r.points.length} Pkt.)</span>
          <button
            onClick={() => removeRegion(r.id)}
            className="text-red-400 hover:text-red-300"
            title="Fläche entfernen"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Kalibrier-Einstieg in der linken Spalte (Schritt 1 des Workflows).
 * Öffnet den Methoden-Wahl-Dialog (Strecke messen ODER Vergrößerungs-
 * faktor) und zeigt den aktuellen Kalibrier-Status an. Ersetzt den
 * früheren Kalibrier-Knopf in der Header-Leiste.
 */
function CalibrationButton({ hasImage }: { hasImage: boolean }) {
  const calibration = useViewerStore((s) => s.calibration)
  const isCalibrated = calibration != null
  // Status-Kurztext: Referenzlänge oder „aus DICOM", plus Mag falls ≠ 1.
  let statusText = 'Noch nicht kalibriert'
  if (calibration) {
    const mag =
      calibration.magnificationFactor && calibration.magnificationFactor !== 1.0
        ? ` · Mag ${calibration.magnificationFactor.toFixed(2)}×`
        : ''
    statusText =
      calibration.referenceMm > 0
        ? `Referenz ${calibration.referenceMm} mm${mag}`
        : `aus DICOM-Pixelabstand${mag}`
  }
  return (
    <button
      onClick={() => openCalibrationChoice('left')}
      disabled={!hasImage}
      className={[
        'rounded border px-3 py-2 text-left text-sm transition',
        isCalibrated
          ? 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/40'
          : 'border-sky-800/70 bg-sky-950/30 text-sky-200 hover:bg-sky-900/40',
        !hasImage ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <span
          className={[
            'inline-block h-2 w-2 rounded-full',
            isCalibrated ? 'bg-emerald-500' : 'bg-amber-500',
          ].join(' ')}
        />
        {isCalibrated ? 'Kalibriert ✓' : 'Kalibrieren …'}
      </div>
      <div className="mt-0.5 text-[10px] text-neutral-400">{statusText}</div>
    </button>
  )
}

/**
 * Kalibrier-Block des Knie-Moduls. Im Einzelbild-Modus EIN Button (Haupt-
 * Pane, wie Hüfte). In der Zwei-Bild-Ansicht zusätzlich ein Button für das
 * seitliche Bild + Status-Zeilen je Bild. Jeder Button setzt das Ziel-Pane
 * und öffnet denselben Methoden-Wahl-Dialog.
 */
function KneeCalibrationButtons({ hasImage }: { hasImage: boolean }) {
  const splitView = useKneePanesStore((s) => s.splitView)
  const activePane = useKneePanesStore((s) => s.activePane)
  const leftCal = useViewerStore((s) => s.calibration)
  const rightCal = useKneePanesStore((s) => s.rightCalibration)
  const rightHasImage = useKneePanesStore((s) => s.rightHasImage)

  // Drei Zustände, damit der grüne „erledigt"-Haken nur bei ECHTER (manueller)
  // Kalibrierung erscheint: 'manual' = Referenzstrecke gemessen (referenceMm>0),
  // 'dicom' = nur automatischer DICOM-Maßstab, 'none' = gar nichts.
  const calMode = (c: typeof leftCal): CalMode =>
    !c ? 'none' : c.referenceMm > 0 ? 'manual' : 'dicom'

  const calText = (c: typeof leftCal) => {
    if (!c) return 'nicht kalibriert'
    const mag =
      c.magnificationFactor && c.magnificationFactor !== 1.0
        ? ` · Mag ${c.magnificationFactor.toFixed(2)}×`
        : ''
    return c.referenceMm > 0
      ? `Referenz ${c.referenceMm} mm${mag}`
      : `aus DICOM (automatisch)${mag}`
  }

  // Einzelbild: ein Button fürs Haupt-Pane (identisch zur Hüfte).
  if (!splitView) {
    return (
      <PaneCalibrationButton
        label="Kalibrieren"
        pane="left"
        mode={calMode(leftCal)}
        statusText={calText(leftCal)}
        disabled={!hasImage}
        highlight={false}
      />
    )
  }

  // Zwei-Bild: je ein Button. Das aktive Pane wird hervorgehoben, damit klar
  // ist, welches Bild der Klick kalibriert.
  return (
    <div className="flex flex-col gap-1">
      <PaneCalibrationButton
        label="AP (links) kalibrieren"
        pane="left"
        mode={calMode(leftCal)}
        statusText={calText(leftCal)}
        disabled={!hasImage}
        highlight={activePane === 'left'}
      />
      <PaneCalibrationButton
        label="Seitlich (rechts) kalibrieren"
        pane="right"
        mode={rightHasImage ? calMode(rightCal) : 'none'}
        statusText={rightHasImage ? calText(rightCal) : 'kein Bild geladen'}
        disabled={!rightHasImage}
        highlight={activePane === 'right'}
      />
    </div>
  )
}

type CalMode = 'manual' | 'dicom' | 'none'

function PaneCalibrationButton({
  label,
  pane,
  mode,
  statusText,
  disabled,
  highlight,
}: {
  label: string
  pane: 'left' | 'right'
  mode: CalMode
  statusText: string
  disabled: boolean
  highlight: boolean
}) {
  const dotColor =
    mode === 'manual'
      ? 'bg-emerald-500'
      : mode === 'dicom'
        ? 'bg-amber-500'
        : 'bg-neutral-600'
  return (
    <button
      onClick={() => openCalibrationChoice(pane)}
      disabled={disabled}
      className={[
        'rounded border px-3 py-2 text-left text-sm transition',
        mode === 'manual'
          ? 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/40'
          : 'border-sky-800/70 bg-sky-950/30 text-sky-200 hover:bg-sky-900/40',
        highlight ? 'ring-1 ring-sky-500' : '',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <span className={['inline-block h-2 w-2 rounded-full', dotColor].join(' ')} />
        {label}
        {mode === 'manual' ? ' ✓' : ''}
      </div>
      <div className="mt-0.5 text-[10px] text-neutral-400">{statusText}</div>
    </button>
  )
}

function KneeSection({
  hasImage,
  activeKind,
}: {
  hasImage: boolean
  activeKind: string | null
}) {
  // Workflow oben als „Hero", Einzel-Messungen darunter als Spot-Tools.
  const workflow = AVAILABLE_KNEE_RECIPES.find((r) => r.kind === 'workflow')
  // Tibialer Slope wird ausschließlich auf dem seitlichen (rechten) Bild
  // gemessen (SlopeMeasureButton). Der gleichnamige Recipe-Eintrag liefe auf
  // dem AP-Pane → Dopplung, daher hier ausgeblendet.
  const singles = AVAILABLE_KNEE_RECIPES.filter(
    (r) => r.kind !== 'workflow' && r.kind !== 'tibialSlope',
  )
  const leftCalibrated = useViewerStore((s) => s.calibration != null)
  // Kalibrier-Status beider Panes aggregieren (UX-Befund P2-9): grün erst,
  // wenn das AP-Bild kalibriert ist UND das seitliche Bild (falls geladen)
  // EXPLIZIT kalibriert wurde — die automatische DICOM-Übernahme beim
  // Laden (Mag 1.0, keine Referenz) zählt nicht (Debug-Runde 3: die
  // Sektion klappte sonst zu früh ein).
  const splitView = useKneePanesStore((s) => s.splitView)
  const rightHasImage = useKneePanesStore((s) => s.rightHasImage)
  const rightCal = useKneePanesStore((s) => s.rightCalibration)
  const rightExplicitCal =
    !!rightCal &&
    (rightCal.referenceMm > 0 || (rightCal.magnificationFactor ?? 1) !== 1.0)
  const allCalibrated =
    leftCalibrated && (!splitView || !rightHasImage || rightExplicitCal)
  // Einzel-Messungen sind nach einer Vollvermessung obsolet (G2) — dann
  // klappt die Sektion standardmäßig zu, bleibt aber per Klick erreichbar.
  const hasWorkflow = useKneeStore((s) =>
    s.measurements.some((m) => m.kind === 'workflow'),
  )
  // Auto-Einklappen (Debug-Runde 2): irgendeine Knie-Messung → Einzel-
  // Messungen zu; ≥ 2 Implantat-Komponenten (Femur + Tibia; ein Klick
  // platziert AP+seitlich als EINE Gruppe) → Schablonen zu.
  const hasAnyKneeMeasurement = useKneeStore((s) => s.measurements.length > 0)
  const kneeComponentCount = useKneeTemplateStore(
    (s) => new Set(s.templates.map((t) => t.groupId)).size,
  )
  // Seiten-Abfrage vor dem Platzieren einer Schablone (UX-Befund P1-1).
  const [pendingSideKind, setPendingSideKind] =
    useState<KneeImplantKind | null>(null)
  // Schablonen-Buttons nur für Familien aus dem geladenen Paket; pkgInfo
  // triggert das Re-Render nach Import/Entfernen (die Katalog-Konstanten
  // werden von der Registry in-place ersetzt, ohne eigenes Notify).
  const pkgInfo = useTemplatePackageStore((s) => s.info)
  const kneeButtons = KNEE_SIDEBAR_TEMPLATES.filter((t) =>
    KNEE_IMPLANT_FAMILIES.some((f) => f.kind === t.kind),
  )
  const tkaButtons = kneeButtons.filter((t) => !t.uka)
  const ukaButtons = kneeButtons.filter((t) => t.uka)
  const keinKneeKatalog = !pkgInfo && kneeButtons.length === 0

  return (
    <>
      {/* „Ansicht" gilt als erledigt, sobald beide Bilder da sind. */}
      <CollapsibleSection
        id="knee-view"
        title="Ansicht"
        defaultCollapsed={splitView && rightHasImage}
      >
        <DualViewControls />
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="knee-cal"
        title="1 · Kalibrierung"
        defaultCollapsed={allCalibrated}
        statusDot={allCalibrated ? 'bg-emerald-500' : 'bg-amber-500'}
      >
        <KneeCalibrationButtons hasImage={hasImage} />
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="knee-workflow"
        title="2 · Knie-Planung"
        defaultCollapsed={hasWorkflow}
        statusDot={hasWorkflow ? 'bg-emerald-500' : 'bg-amber-500'}
      >
      {workflow && (
        <button
          onClick={() => pickKneeTool(workflow.kind)}
          disabled={!hasImage}
          className={[
            'rounded border px-3 py-2 text-left text-sm transition',
            activeKind === workflow.kind
              ? 'border-violet-500 bg-violet-700/30 text-violet-100 ring-1 ring-violet-500'
              : 'border-violet-900/60 bg-violet-950/30 text-violet-200 hover:bg-violet-900/40',
            !hasImage ? 'cursor-not-allowed opacity-50' : '',
          ].join(' ')}
        >
          <div className="font-medium">{workflow.label}</div>
          <div className="text-[10px] text-violet-300/70">
            17 Punkte · HKA · mLDFA · mMPTA · JLCA · β-Winkel
          </div>
        </button>
      )}
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="knee-singles"
        title="3 · Einzel-Messungen"
        defaultCollapsed={hasAnyKneeMeasurement}
      >
        {singles.map((recipe) => (
          <ToolButton
            key={recipe.kind}
            label={recipe.label}
            active={activeKind === recipe.kind}
            disabled={!hasImage}
            onClick={() => pickKneeTool(recipe.kind)}
          />
        ))}
        <SlopeMeasureButton hasImage={hasImage} kneeActiveKind={activeKind} />
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="knee-templates"
        title="4 · Schablonen"
        defaultCollapsed={kneeComponentCount >= 2}
        statusDot={kneeComponentCount >= 2 ? 'bg-emerald-500' : 'bg-amber-500'}
      >
      {/* Seiten-Abfrage wie bei der Hüfte (UX-Befund P1-1: vorher war die
          Seite hart auf 'R' verdrahtet). */}
      {keinKneeKatalog && <KeinPaketHinweis />}
      {tkaButtons.map((t) => (
        <ToolButton
          key={t.kind}
          label={t.label}
          disabled={!hasImage}
          onClick={() => setPendingSideKind(t.kind)}
        />
      ))}

      {ukaButtons.length > 0 && (
        <div className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
          Schlitten (UKA)
        </div>
      )}
      {ukaButtons.map((t) => (
        <ToolButton
          key={t.kind}
          label={t.label}
          disabled={!hasImage}
          onClick={() => setPendingSideKind(t.kind)}
        />
      ))}

      {pendingSideKind && (
        <div className="mx-1 mt-1 flex items-center gap-1.5 rounded border border-sky-800 bg-sky-950/40 px-2 py-1.5 text-xs">
          <span className="text-sky-200">Seite?</span>
          <button
            onClick={() => {
              addKneeTemplate(pendingSideKind, 'R')
              setPendingSideKind(null)
            }}
            className="rounded bg-sky-700 px-2 py-0.5 font-medium text-white transition hover:bg-sky-600"
          >
            Rechts
          </button>
          <button
            onClick={() => {
              addKneeTemplate(pendingSideKind, 'L')
              setPendingSideKind(null)
            }}
            className="rounded bg-sky-700 px-2 py-0.5 font-medium text-white transition hover:bg-sky-600"
          >
            Links
          </button>
          <button
            onClick={() => setPendingSideKind(null)}
            title="Abbrechen"
            className="ml-auto rounded px-1 text-neutral-400 transition hover:text-neutral-200"
          >
            ✕
          </button>
        </div>
      )}
      </CollapsibleSection>

      <Divider />

      {/* Bewusst außerhalb der Sektion (s. SelectedTemplatePanel, Hüfte). */}
      <SelectedKneeTemplatePanel />
    </>
  )
}

/**
 * Umschalter für die Zwei-Bild-Ansicht (AP + seitlich nebeneinander).
 * „Seiten tauschen" erscheint nur, wenn die geteilte Ansicht aktiv ist.
 */
/**
 * Slope-Messung — logisch bei den Einzel-Messungen (UX-Befund P1-2, vorher
 * unauffindbar im Pane-Header und ohne Zwei-Bild-Ansicht gar nicht
 * erreichbar). Mit seitlichem Bild wird die Einmal-Messung auf dem rechten
 * Pane armiert; sonst läuft das Rezept auf dem Haupt-Pane.
 */
function SlopeMeasureButton({
  hasImage,
  kneeActiveKind,
}: {
  hasImage: boolean
  kneeActiveKind: string | null
}) {
  const splitView = useKneePanesStore((s) => s.splitView)
  const rightHasImage = useKneePanesStore((s) => s.rightHasImage)
  const slopeActive = useKneePanesStore((s) => s.slopeActive)
  const useRight = splitView && rightHasImage
  return (
    <ToolButton
      label={useRight ? 'Tibialer Slope (seitliches Bild)' : 'Tibialer Slope'}
      active={useRight ? slopeActive : kneeActiveKind === 'tibialSlope'}
      disabled={!hasImage && !useRight}
      onClick={() => {
        if (useRight) {
          const store = useKneePanesStore.getState()
          const next = !store.slopeActive
          store.setSlopeActive(next)
          if (next) startSlopeToolPane2()
          else applyNavToolsPane2()
        } else {
          pickKneeTool('tibialSlope')
        }
      }}
    />
  )
}

function DualViewControls() {
  const splitView = useKneePanesStore((s) => s.splitView)
  const toggleSplitView = useKneePanesStore((s) => s.toggleSplitView)
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={toggleSplitView}
        className={[
          'rounded border px-3 py-2 text-left text-sm transition',
          splitView
            ? 'border-sky-500 bg-sky-700/30 text-sky-100 ring-1 ring-sky-500'
            : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800',
        ].join(' ')}
      >
        <div className="font-medium">
          {splitView ? 'Zwei Bilder ✓' : 'Einzelbild'}
        </div>
        <div className="text-[10px] text-neutral-400">
          {splitView
            ? 'links AP-Ganzbein · rechts seitlich'
            : 'auf Zwei-Bild umschalten'}
        </div>
      </button>
      {splitView && (
        <Hint>
          <p className="px-1 pt-0.5 text-[10px] leading-snug text-neutral-500">
            Klick wählt das aktive Bild (blauer Rahmen). Obere Werkzeuge + Laden
            gelten fürs aktive Bild.
          </p>
        </Hint>
      )}
    </div>
  )
}

/**
 * Eigenschaften-Panel für die ausgewählte Knie-Schablone. Erscheint nur,
 * wenn etwas selektiert ist.
 */
function SelectedKneeTemplatePanel() {
  const selected = useKneeTemplateStore((s) =>
    s.selectedId ? s.templates.find((t) => t.id === s.selectedId) ?? null : null,
  )
  const leftCal = useViewerStore((s) => s.calibration)
  const rightCal = useKneePanesStore((s) => s.rightCalibration)
  const kneeMeasurements = useKneeStore((s) => s.measurements)
  if (!selected) return null
  // Kalibrierung des Panes, auf dem die Schablone liegt — sonst zeigt die
  // Vorschau/Verfügbarkeit für rechts platzierte Schablonen falsche Werte.
  const calibration = (selected.pane ?? 'left') === 'right' ? rightCal : leftCal
  const store = useKneeTemplateStore.getState()
  const family = KNEE_IMPLANT_FAMILIES.find((f) => f.kind === selected.kind)
  const sizes = sizesForKind(selected.kind)
  const shape = renderKneeTemplate({
    kind: selected.kind,
    view: selected.view,
    side: selected.side,
    sizeIndex: selected.sizeIndex,
    center: selected.center,
    rotationDeg: selected.rotationDeg,
    mmPerWorldUnit: calibration?.mmPerWorldUnit ?? 1,
    insertThicknessMm: selected.insertThicknessMm,
  })
  const shapeAvailable = shape !== null
  const insertCfg = TIBIA_INSERT[selected.kind]

  // Mechanische Ausrichtung (nur Femur/Tibia in AP): Achsen aus der Voll-
  // vermessung ziehen, Schnitt ⊥ mech. Achse setzen, geplanten LDFA/MPTA
  // live anzeigen.
  const bone = boneOf(selected.kind)
  const workflow = kneeMeasurements.find(
    (m) => m.kind === 'workflow' && m.points.length >= 17,
  )
  const axes = workflow ? extractWorkflowAxes(workflow.points) : null
  const showAlign = bone != null && selected.view === 'AP'
  let plannedReadout: { label: 'LDFA' | 'MPTA'; value: number } | null = null
  if (bone && axes && workflow) {
    const raw = computeWorkflowRaw(workflow.points, calibration?.mmPerWorldUnit ?? 1)
    if (raw) {
      const planned = computePlannedCpak(
        axes,
        raw.mLDFA,
        raw.mMPTA,
        bone === 'Femur' ? selected : null,
        bone === 'Tibia' ? selected : null,
      )
      plannedReadout =
        bone === 'Femur'
          ? { label: 'LDFA', value: planned.ldfa }
          : { label: 'MPTA', value: planned.mpta }
    }
  }

  function alignMechanically() {
    // `selected` ist nach dem frühen Return oben garantiert non-null.
    const sel = selected!
    // Derselbe Löser wie die Erst-Platzierung: mechanische Rotation + Lage so,
    // dass die tiefere Resektion 9 mm misst (zuverlässig reproduzierbar).
    autoPlaceKneeImplant(sel.id, sel.kind, sel.side)
    // Sichtbares Feedback (UX-Befund P2-11): vorher blieb der Klick stumm.
    useViewerStore
      .getState()
      .setStatus(
        'Mechanisch ausgerichtet — Schnitt senkrecht zur mechanischen Achse (Ziel 90°).',
      )
  }

  return (
    <div className="mx-2 mt-2 rounded border border-pink-900/60 bg-pink-950/30 p-2 text-xs">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-pink-300">
        Ausgewählte Schablone
      </div>
      <div className="mb-2 text-[11px] text-neutral-300">
        {family?.label ?? selected.kind}
      </div>

      <KneeSelect
        label="Größe"
        value={selected.sizeIndex}
        onChange={(v) => store.setSizeIndex(selected.id, v)}
        options={sizes
          .map((s, i) => ({ value: i, label: s.size }))
          // Narrow-Größen ausgeblendet (s. isHiddenKneeSize) — eine
          // bereits gesetzte bleibt sichtbar, damit alte Pläne lesbar sind.
          .filter(
            (o) =>
              !isHiddenKneeSize(selected.kind, o.value) ||
              o.value === selected.sizeIndex,
          )}
      />

      {insertCfg && (
        <KneeSelect
          label="Inlay-Höhe"
          value={selected.insertThicknessMm ?? insertCfg.baseMm}
          onChange={(v) => store.setInsertThickness(selected.id, v)}
          options={insertCfg.thicknessesMm.map((mm) => ({ value: mm, label: `${mm} mm` }))}
        />
      )}

      <KneeSelect
        label="Seite"
        value={selected.side}
        onChange={(v) => store.setSide(selected.id, v as 'R' | 'L')}
        options={[
          { value: 'R', label: 'rechts' },
          { value: 'L', label: 'links' },
        ]}
      />

      <KneeSelect
        label="Aufnahme-Ebene"
        value={selected.view}
        onChange={(v) => store.setView(selected.id, v as 'AP' | 'lateral')}
        options={[
          { value: 'AP', label: 'AP (frontal)' },
          { value: 'lateral', label: 'lateral (seitlich)' },
        ]}
      />

      <div className="mb-2">
        <div className="mb-1 text-[10px] text-neutral-400">
          Drehung · {selected.rotationDeg.toFixed(1)}°
        </div>
        <div className="grid grid-cols-5 gap-1">
          {[-1, -0.2, 0.2, 1].map((d) => (
            <button
              key={d}
              onClick={() =>
                store.setRotationDeg(selected.id, selected.rotationDeg + d)
              }
              className="rounded border border-neutral-700 px-0.5 py-0.5 text-center text-[10px] text-neutral-300 transition hover:bg-neutral-800"
            >
              {d > 0 ? '+' : '−'}
              {Math.abs(d).toFixed(1).replace('.', ',')}
            </button>
          ))}
          <button
            onClick={() => store.setRotationDeg(selected.id, 0)}
            title="Drehung zurücksetzen"
            className="rounded border border-neutral-700 px-0.5 py-0.5 text-center text-[10px] text-neutral-400 transition hover:bg-neutral-800"
          >
            0°
          </button>
        </div>
      </div>

      {showAlign && (
        <div className="mb-2">
          {axes ? (
            <>
              <button
                onClick={alignMechanically}
                title="Schnitt senkrecht zur mechanischen Achse, auf die Gelenklinie setzen"
                className="w-full rounded border border-emerald-800/60 bg-emerald-950/30 px-2 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-900/40"
              >
                Mechanisch ausrichten
              </button>
              {plannedReadout && (
                <div className="mt-1 text-center text-[10px] text-neutral-400">
                  {plannedReadout.label} (geplant):{' '}
                  <span className="font-semibold text-amber-300">
                    {plannedReadout.value.toFixed(1).replace('.', ',')}°
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-[10px] text-neutral-500">
              Für „Mechanisch ausrichten" zuerst die Knie-Vollvermessung setzen.
            </p>
          )}
        </div>
      )}

      {!shapeAvailable && (
        <p className="mb-2 text-[10px] text-amber-500/80">
          Für diese Hersteller/Ebene-Kombination liegt noch keine
          Schablonen-Kontur vor — wird in Kürze ergänzt.
        </p>
      )}

      {!calibration && (
        <p className="mb-2 text-[10px] text-amber-500/80">
          unkalibriert — Maße sind ungenau
        </p>
      )}

      <button
        onClick={() => store.remove(selected.id)}
        className="w-full rounded border border-red-900/60 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-900/40"
      >
        Schablone entfernen
      </button>
    </div>
  )
}

/** Liefert die rohe Größenliste je nach Implantat-Familie. */
function sizesForKind(kind: KneeImplantKind): ReadonlyArray<{ size: string }> {
  switch (kind) {
    case 'legion-ps-femur':           return LEGION_PS_FEMUR
    case 'sphere-femur':              return SPHERE_FEMUR
    case 'sphere-tibia-baseplate':    return SPHERE_TIBIA_BASEPLATE
    case 'genesis-tibia-female':
    case 'genesis-tibia-male':        return GENESIS_II_TIBIA_FEMALE_TAPERED
    case 'journey-uk-femur':          return JOURNEY_UK_FEMUR
    case 'journey-uk-tibia-medial':
    case 'journey-uk-tibia-lateral':  return JOURNEY_UK_TIBIA_MEDIAL
    default:                          return []
  }
}

/** Generisches Select-Element für das Schablonen-Panel — DRY für die
 *  drei Dropdowns (Größe, Seite, View). */
function KneeSelect<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <>
      <label className="mb-1 block text-[10px] text-neutral-400">{label}</label>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value
          const matched = options.find((o) => String(o.value) === raw)
          if (matched) onChange(matched.value)
        }}
        className="mb-2 w-full rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-xs tabular-nums"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  )
}

// ----------------------------------------------------------------------
// Gemeinsame UI-Bausteine
// ----------------------------------------------------------------------

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        'flex-1 px-3 py-2 text-sm font-medium transition',
        active
          ? 'border-b-2 border-sky-500 bg-neutral-900 text-sky-200'
          : 'border-b-2 border-transparent text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

/**
 * Einklappbare Toolbar-Sektion (Debug-Befund G2): Header im
 * SectionTitle-Stil mit Chevron; Zustand pro Sektion gemerkt
 * (uiStore → localStorage). Ohne explizite Nutzer-Wahl gilt
 * `defaultCollapsed` — darf dynamisch sein (z. B. Einzel-Messungen
 * zu, sobald eine Vollvermessung existiert).
 */
function CollapsibleSection({
  id,
  title,
  defaultCollapsed = false,
  statusDot,
  children,
}: {
  id: string
  title: string
  defaultCollapsed?: boolean
  /** Tailwind-Farbklasse für einen Status-Punkt rechts im Header. */
  statusDot?: string
  children: React.ReactNode
}) {
  const stored = useUiStore((s) => s.collapsedSections[id])
  const collapsed = stored ?? defaultCollapsed
  // Auto-Einklappen beim „Erledigt"-ÜBERGANG: Kippt der dynamische Default
  // im laufenden Betrieb auf true (Schritt gerade abgeschlossen), wird
  // eine gespeicherte manuelle Wahl verworfen — sonst bliebe die Sektion
  // für immer offen, nur weil der Nutzer sie irgendwann einmal von Hand
  // aufgeklappt hatte (Debug-Runde 3: „Kalibrierung fährt nicht ein").
  // Ein danach erneutes manuelles Aufklappen bleibt bis zum nächsten
  // Erledigt-Übergang respektiert.
  const prevDefault = useRef(defaultCollapsed)
  useEffect(() => {
    if (defaultCollapsed && !prevDefault.current) {
      useUiStore.getState().clearSectionChoice(id)
    }
    prevDefault.current = defaultCollapsed
  }, [defaultCollapsed, id])
  return (
    <>
      <button
        onClick={() =>
          useUiStore.getState().setSectionCollapsed(id, !collapsed)
        }
        title={collapsed ? 'Sektion ausklappen' : 'Sektion einklappen'}
        className="flex w-full items-center gap-1.5 px-3 pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 transition hover:text-neutral-300"
      >
        <span
          className={[
            'inline-block text-[9px] transition-transform',
            collapsed ? '' : 'rotate-90',
          ].join(' ')}
        >
          ▶
        </span>
        <span className="flex-1">{title}</span>
        {statusDot && (
          <span className={`inline-block h-2 w-2 rounded-full ${statusDot}`} />
        )}
      </button>
      {!collapsed && children}
    </>
  )
}

// (SectionTitle entfiel: seit Debug-Runde 2 sind ALLE Sektionen
// einklappbar — CollapsibleSection übernimmt den Titel-Stil.)

function Divider() {
  return <div className="my-1 border-t border-neutral-800" />
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={[
        'rounded px-3 py-2 text-left text-sm transition',
        active
          ? 'bg-sky-700/40 text-sky-200 ring-1 ring-sky-600'
          : 'text-neutral-300 hover:bg-neutral-800',
        disabled
          ? 'cursor-not-allowed text-neutral-600 hover:bg-transparent'
          : '',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

// ----------------------------------------------------------------------
// Template-Eigenschaften-Panel (unverändert)
// ----------------------------------------------------------------------

function SelectedTemplatePanel() {
  const cup = useTemplateStore((s) =>
    s.selectedId ? s.templates.find((t) => t.id === s.selectedId) ?? null : null,
  )
  const stem = useTemplateStore((s) =>
    s.selectedId ? s.stems.find((t) => t.id === s.selectedId) ?? null : null,
  )
  if (cup) return <SelectedCupPanel cup={cup} />
  if (stem) return <SelectedStemPanel stem={stem} />
  return null
}

function SelectedCupPanel({ cup }: { cup: CupTemplate }) {
  const referenceLine = useTemplateStore((s) => s.referenceLine)
  const calibration = useViewerStore((s) => s.calibration)

  const factor = calibration?.mmPerWorldUnit ?? 1
  const entries = cupCatalogEntries()
  const entry = entries[cup.catalogIndex]
  const diameter = cupDiameterMm(cup.catalogIndex, cup.sizeIndex)
  const shape = cupShape(cup.center, diameter, cup.rotationDeg, factor, cup.side)
  const incl = referenceLine
    ? cupInclination(
        shape.rimFrom,
        shape.rimTo,
        referenceLine[0],
        referenceLine[1],
      )
    : null
  const store = useTemplateStore.getState()

  return (
    <div className="mx-2 mt-2 rounded border border-sky-900/60 bg-sky-950/30 p-2 text-xs">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
        Ausgewählte Pfanne
      </div>

      <label className="mb-1 block text-[10px] text-neutral-400">Typ</label>
      <select
        value={cup.catalogIndex}
        onChange={(e) =>
          store.setCatalogIndex(cup.id, parseInt(e.target.value, 10))
        }
        className="mb-2 w-full rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-xs"
      >
        {entries.map((e, i) => (
          <option key={e.folder} value={i}>
            {e.family}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-[10px] text-neutral-400">Größe</label>
      <select
        value={cup.sizeIndex}
        onChange={(e) =>
          store.setSizeIndex(cup.id, parseInt(e.target.value, 10))
        }
        className="mb-2 w-full rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-xs tabular-nums"
      >
        {entry?.sizes.map((s, i) => (
          <option key={s.refNo + i} value={i}>
            ⌀ {s.size} mm
          </option>
        ))}
      </select>

      {incl != null && (
        <div className="text-[11px] text-neutral-300">
          Inklination: <span className="tabular-nums">{incl.toFixed(1)}°</span>
        </div>
      )}
      <div className="mb-2 text-[11px] text-neutral-300">
        Seite:{' '}
        <span className="text-neutral-100">
          {cup.side === 'R' ? 'rechts' : 'links'}
        </span>
        {' · '}
        Tränenfigur:{' '}
        <span className={cup.teardrop ? 'text-emerald-400' : 'text-neutral-500'}>
          {cup.teardrop ? 'gesetzt' : '—'}
        </span>
      </div>
      {!calibration && (
        <p className="mb-2 text-[10px] text-amber-500/80">
          unkalibriert — Maße sind ungenau
        </p>
      )}

      <button
        onClick={() => store.remove(cup.id)}
        className="w-full rounded border border-red-900/60 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-900/40"
      >
        Pfanne entfernen
      </button>
    </div>
  )
}

function SelectedStemPanel({ stem }: { stem: StemTemplate }) {
  const calibration = useViewerStore((s) => s.calibration)
  const store = useTemplateStore.getState()
  const entries = stemCatalogEntries()
  const entry = entries[stem.catalogIndex]

  return (
    <div className="mx-2 mt-2 rounded border border-sky-900/60 bg-sky-950/30 p-2 text-xs">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
        Ausgewählter Schaft
      </div>

      <label className="mb-1 block text-[10px] text-neutral-400">Familie</label>
      <select
        value={stem.catalogIndex}
        onChange={(e) =>
          store.setCatalogIndex(stem.id, parseInt(e.target.value, 10))
        }
        className="mb-2 w-full rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-xs"
      >
        {entries.map((e, i) => (
          <option key={e.folder} value={i}>
            {e.family} {e.variant}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-[10px] text-neutral-400">Größe</label>
      <select
        value={stem.sizeIndex}
        onChange={(e) =>
          store.setSizeIndex(stem.id, parseInt(e.target.value, 10))
        }
        className="mb-2 w-full rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-xs tabular-nums"
      >
        {entry?.sizes.map((s, i) => (
          <option key={s.refNo + i} value={i}>
            Gr. {s.size}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-[10px] text-neutral-400">
        Kopflänge
      </label>
      <select
        value={stem.headOffsetIndex}
        onChange={(e) =>
          store.setHeadOffsetIndex(stem.id, parseInt(e.target.value, 10))
        }
        className="mb-2 w-full rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-xs tabular-nums"
      >
        {Array.from({ length: HEAD_OFFSET_COUNT }, (_, i) => {
          const mm = headOffsetMm(i)
          const label = mm >= 0 ? `+${mm} mm` : `${mm} mm`
          return (
            <option key={i} value={i}>
              {label}
            </option>
          )
        })}
      </select>

      <div className="mb-2 text-[11px] text-neutral-300">
        Seite:{' '}
        <span className="text-neutral-100">
          {stem.side === 'R' ? 'rechts' : 'links'}
        </span>
      </div>

      {!calibration && (
        <p className="mb-2 text-[10px] text-amber-500/80">
          unkalibriert — Maße sind ungenau
        </p>
      )}

      <button
        onClick={() => store.remove(stem.id)}
        className="w-full rounded border border-red-900/60 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-900/40"
      >
        Schaft entfernen
      </button>
    </div>
  )
}
