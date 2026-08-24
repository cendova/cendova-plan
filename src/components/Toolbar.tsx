/**
 * Linke Sidebar — domänenspezifische Planungs-Werkzeuge.
 *
 * Aufgeräumt seit dem Modus-Switcher-Refactor:
 *   - Universelle Tools (Bild laden, Pan/Zoom/Window-Level, Kalibrierung,
 *     Length/Angle, Notiz) leben jetzt im Header (siehe `HeaderTools`).
 *   - Diese Sidebar zeigt NUR den Block für den aktiven Planungs-Modus
 *     (Hüfte, Knie ODER Schulter). Modus-Wechsel via Tabs oben in der
 *     Sidebar. Jeder Modus hat einen eigenen Zweig — siehe Begründung
 *     unten an der Panel-Auswahl.
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
import { useShoulderStore } from '../state/shoulderStore'
import { recipesForProsthesis } from '../lib/shoulder/recipes'
import { useUiStore } from '../state/uiStore'
import { Hint } from './Hint'
import { KeinPaketHinweis } from './KeinPaketHinweis'
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
  addShoulderTemplate,
  addStemTemplate,
  autoPlaceKneeImplant,
  openCalibrationChoice,
} from '../lib/cornerstone/viewer'
import { kneeKindPlaceable } from '../lib/knee/kneePlaceable'
import { shoulderKindPlaceable } from '../lib/shoulder/shoulderPlaceable'
import {
  shoulderFamiliesForProsthesis,
  shoulderSizeLabel,
  SHOULDER_SIZE_LABELS,
  type ShoulderImplantFamily,
  type ShoulderImplantKind,
} from '../lib/shoulder/shoulderCatalog'
import { useShoulderTemplateStore } from '../state/shoulderTemplateStore'
import { useTemplateTracerStore } from '../state/templateTracerStore'
import {
  pickHipTool,
  pickKneeTool,
  pickShoulderTool,
  setPlanningMode,
  toggleOsteophyteTool,
  toggleShaftFragmentTool,
} from '../lib/toolControls'
import { useOsteophyteStore } from '../state/osteophyteStore'
import { useShaftFragmentStore } from '../state/shaftFragmentStore'
import { useKneePanesStore } from '../state/kneePanesStore'
import { useKneeTemplateStore } from '../state/kneeTemplateStore'
import { useTemplatePackageStore } from '../state/templatePackageStore'
import {
  KNEE_IMPLANT_FAMILIES,
  entdoppleGenesisTibia,
  ohneTibiaVariantenZusatz,
  isHiddenKneeSize,
  LEGION_PS_FEMUR,
  SPHERE_FEMUR,
  SPHERE_TIBIA_BASEPLATE,
  GENESIS_II_TIBIA_FEMALE_TAPERED,
  JOURNEY_UK_FEMUR,
  JOURNEY_UK_TIBIA_MEDIAL,
  TIBIA_INSERT,
  type KneeImplantFamily,
  type KneeImplantKind,
} from '../lib/knee/smithNephewCatalog'
import { renderKneeTemplate } from '../lib/knee/templates'

export function Toolbar() {
  const planningMode = useViewerStore((s) => s.planningMode)
  const hasImage = useViewerStore((s) => s.hasImage)
  return (
    // w-60 statt w-52: bei 208px brachen die längsten Sektions-Titel selbst
    // ohne Modul-Präfix noch um (gemessenes Titel-Budget 133px neben einem
    // Status-Punkt). 240px kosten ~3% Bildfläche und lassen JEDEN Titel
    // samt Badge einzeilig — inklusive Reserve für kommende Rubriken.
    <aside className="flex w-60 flex-col border-r border-neutral-700 bg-neutral-900">
      {/* Tab-Leiste oben: schaltet zwischen Hüft-, Knie- und
          Schulter-Werkzeugen um. */}
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
        <TabButton
          label="Schulter"
          active={planningMode === 'shoulder'}
          onClick={() => setPlanningMode('shoulder')}
        />
      </div>

      <div className="flex flex-col gap-1 overflow-y-auto p-2">
        {/* Bewusst je Modus EIN eigener Zweig statt eines Ternaries:
            Ein `mode === 'hip' ? Hüfte : Knie` hätte den Schulter-Modus
            still in die Knie-Sektion fallen lassen — der Compiler warnt
            bei einem Ternary nicht. */}
        {/* Jede Sektion liest ihren activeKind SELBST aus ihrem Store —
            die Toolbar abonnierte sonst Hüft- UND Knie-Toolwechsel auch in
            Modi, die keinen von beiden rendern. */}
        {planningMode === 'hip' && <HipSection hasImage={hasImage} />}
        {planningMode === 'knee' && <KneeSection hasImage={hasImage} />}
        {planningMode === 'shoulder' && <ShoulderSection hasImage={hasImage} />}
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

// Knie-Schablonen-Auswahl als Dropdown je Knochen — gleiche Optik wie die
// Familie-Selects der Hüft-Panels. Einträge und Beschriftungen kommen
// vollständig aus dem Katalog des importierten Pakets
// (KNEE_IMPLANT_FAMILIES, im öffentlichen Repo leer). Poly-Inserts werden
// nicht separat platziert (TIBIA_INSERT-Regler am Tibia-Template) und
// erscheinen deshalb nicht in der Auswahl.
function KneeFamilienDropdown<K extends string>({
  label,
  familien,
  disabled,
  onWahl,
}: {
  label: string
  // Struktureller Typ statt KneeImplantFamily: die Schulter-Sektion nutzt
  // dasselbe Dropdown mit ihren Familien (nur kind+label werden gebraucht).
  familien: ReadonlyArray<{ kind: K; label: string }>
  disabled: boolean
  onWahl: (kind: K) => void
}) {
  return (
    <div className="px-1">
      <label className="mb-1 block text-[10px] text-neutral-400">{label}</label>
      {/* value="" hält das Select auf dem Platzhalter — so löst auch die
          erneute Wahl derselben Familie wieder ein onChange aus. */}
      <select
        value=""
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value) onWahl(e.target.value as K)
        }}
        className="mb-2 w-full rounded border border-neutral-700 bg-neutral-950 px-1 py-1 text-xs disabled:opacity-50"
      >
        <option value="">Familie wählen …</option>
        {familien.map((f) => (
          <option key={f.kind} value={f.kind}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Paket geladen, aber dieses Modul bleibt leer — das war bisher STILL
 * (Realtest 24.08.: eingebettet „nichts erscheint", ohne jede Erklärung;
 * der KeinPaketHinweis greift nur OHNE Paket). Die Box sagt, WAS fehlt:
 * kein Katalog fürs Modul, oder Familien ohne platzierbare Kontur.
 */
function PaketOhneModulHinweis({
  paketName,
  modul,
  deklariert,
}: {
  paketName: string
  modul: string
  deklariert: number
}) {
  return (
    <div className="mx-1 mb-2 rounded border border-amber-900 bg-amber-950/40 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200">
      Paket „{paketName}" ist geladen,{' '}
      {deklariert > 0
        ? `${deklariert} ${modul}-Familien stehen im Katalog — aber keine hat eine platzierbare Kontur.`
        : `enthält aber keine ${modul}-Daten.`}{' '}
      Kennzahlen: „Diagnose" in der Fußzeile.
    </div>
  )
}

function HipSection({ hasImage }: { hasImage: boolean }) {
  const activeKind = useHipStore((s) => s.activeKind)
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
  // Pfanne UND Schaft platziert = Schablonen-Schritt erledigt.
  // Vorher stand hier `templates.length + stems.length >= 2` — zwei Pfannen
  // ohne Schaft meldeten damit „fertig". Das Knie prüft seit jeher auf zwei
  // verschiedene KOMPONENTEN (Gruppen); die Hüfte tut das jetzt auch.
  const templatesFertig = useTemplateStore(
    (s) => s.templates.length > 0 && s.stems.length > 0,
  )
  const hasOsteophytes = useOsteophyteStore((s) => s.regions.length > 0)
  // Ohne Katalog (kein Schablonen-Paket) sind die Hinzufügen-Buttons
  // deaktiviert: eine Pfanne degenerierte sonst zum 0-mm-Punkt, der Schaft
  // zur generischen Ersatzform. pkgInfo triggert zudem das Re-Render nach
  // Paket-Import/-Entfernen (die Katalog-Konstanten werden in-place ersetzt).
  const pkgInfo = useTemplatePackageStore((s) => s.info)
  const cupsVerfuegbar = cupCatalogEntries().length > 0
  const stemsVerfuegbar = stemCatalogEntries().length > 0
  // Zwei getrennte Fragen: Der Status-PUNKT hängt an der Katalog-LEERE
  // dieses Moduls (auch ein importiertes Nur-Knie-Paket lässt die
  // Hüft-Buttons tot — dann wäre amber eine Aufforderung ins Leere).
  // Der HINWEIS hängt am fehlenden Paket, denn sein Text sagt „Kein
  // Schablonen-Paket geladen" — bei einem Teil-Paket wäre das falsch.
  const hipKatalogLeer = !cupsVerfuegbar && !stemsVerfuegbar
  const keinHipKatalog = !pkgInfo && hipKatalogLeer
  return (
    <>
      {/* Ablauf: 1 Kalibrierung → 2 Messungen → 3 Schablonen, danach die
          beiden optionalen Zusatzschritte 4 Osteotomie und 5 Osteophyten.
          Optional heisst hier: emerald wenn getan, sonst gar kein Punkt —
          amber wäre die Behauptung, es stünde noch etwas aus. */}
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
        title="2 · Messungen"
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
        title="3 · Schablonen"
        defaultCollapsed={templatesFertig}
        // Ohne Katalog KEIN amber: die Hinzufügen-Buttons sind dann
        // deaktiviert — ein „hier steht etwas aus"-Punkt fordert zu einer
        // Handlung auf, die gerade unmöglich ist. Den fehlenden Import
        // meldet der KeinPaketHinweis in der Sektion selbst.
        statusDot={
          templatesFertig
            ? 'bg-emerald-500'
            : hipKatalogLeer
              ? undefined
              : 'bg-amber-500'
        }
      >
        {keinHipKatalog && <KeinPaketHinweis />}
        {pkgInfo && hipKatalogLeer && (
          <PaketOhneModulHinweis paketName={pkgInfo.name} modul="Hüft" deklariert={0} />
        )}
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
        id="hip-osteotomy"
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
        {placing ? 'Markieren aktiv — fertig' : 'Osteophyten markieren'}
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
    if (!c) return 'Noch nicht kalibriert'
    const mag =
      c.magnificationFactor && c.magnificationFactor !== 1.0
        ? ` · Mag ${c.magnificationFactor.toFixed(2)}×`
        : ''
    return c.referenceMm > 0
      ? `Referenz ${c.referenceMm} mm${mag}`
      : `aus DICOM-Pixelabstand${mag}`
  }

  // Einzelbild: ein Button fürs Haupt-Pane (identisch zur Hüfte).
  if (!splitView) {
    return (
      <PaneCalibrationButton
        label="Kalibrieren …"
        labelDone="Kalibriert ✓"
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
        label="Kalibrieren: AP (links) …"
        labelDone="Kalibriert: AP (links) ✓"
        pane="left"
        mode={calMode(leftCal)}
        statusText={calText(leftCal)}
        disabled={!hasImage}
        highlight={activePane === 'left'}
      />
      <PaneCalibrationButton
        label="Kalibrieren: seitlich (rechts) …"
        labelDone="Kalibriert: seitlich (rechts) ✓"
        pane="right"
        mode={rightHasImage ? calMode(rightCal) : 'none'}
        statusText={rightHasImage ? calText(rightCal) : 'Kein Bild geladen'}
        disabled={!rightHasImage}
        highlight={activePane === 'right'}
      />
    </div>
  )
}

type CalMode = 'manual' | 'dicom' | 'none'

function PaneCalibrationButton({
  label,
  labelDone,
  pane,
  mode,
  statusText,
  disabled,
  highlight,
}: {
  label: string
  /** Beschriftung nach MANUELLER Kalibrierung — wie der Hüft-Button, der
   *  von „Kalibrieren …" auf „Kalibriert ✓" kippt. Vorher blieb hier die
   *  Aufforderung stehen und bekam nur einen Haken angehängt
   *  („Kalibrieren … ✓"). */
  labelDone: string
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
        {mode === 'manual' ? labelDone : label}
      </div>
      <div className="mt-0.5 text-[10px] text-neutral-400">{statusText}</div>
    </button>
  )
}

function KneeSection({ hasImage }: { hasImage: boolean }) {
  const activeKind = useKneeStore((s) => s.activeKind)
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
  // Erledigt-Kriterium der Vollvermessung (Sektion 3).
  const hasWorkflow = useKneeStore((s) =>
    s.measurements.some((m) => m.kind === 'workflow'),
  )
  // EIGENER Fortschritt der Mess-Sektion (4) — die Vollvermessung zählt
  // bewusst NICHT mit. Vorher lief beides über `measurements.length > 0`,
  // wodurch der Status-Punkt fremden Fortschritt gemeldet hätte. Die Hüfte
  // filtert an derselben Stelle die Osteotomie heraus; das Knie tut es
  // jetzt genauso.
  const hatEinzelmessung = useKneeStore((s) =>
    s.measurements.some((m) => m.kind !== 'workflow'),
  )
  // ≥ 2 Implantat-Komponenten (Femur + Tibia; ein Klick platziert
  // AP + seitlich als EINE Gruppe) → Schablonen erledigt.
  const kneeComponentCount = useKneeTemplateStore(
    (s) => new Set(s.templates.map((t) => t.groupId)).size,
  )
  // Seiten-Abfrage vor dem Platzieren einer Schablone (UX-Befund P1-1).
  const [pendingSideKind, setPendingSideKind] =
    useState<KneeImplantKind | null>(null)
  // Dropdown-Einträge je Knochen aus dem Paket-Katalog; pkgInfo triggert
  // das Re-Render nach Import/Entfernen (die Katalog-Konstanten werden
  // von der Registry in-place ersetzt, ohne eigenes Notify). Die Trace-
  // Subscription aktualisiert die Liste, sobald im Tracer eine Kontur
  // entsteht (macht eine Familie platzierbar → Eintrag erscheint).
  const pkgInfo = useTemplatePackageStore((s) => s.info)
  useTemplateTracerStore((s) => s.traces)
  // Nur PLATZIERBARE Familien anbieten (Kontur vorhanden): Pakete können
  // Familien deklarieren, ohne Konturen mitzuliefern (z. B. Genesis II
  // male tapered) — die liefen sonst in den stillen Guard.
  const zeigbar = (f: KneeImplantFamily) =>
    f.kind !== 'sphere-insert' && kneeKindPlaceable(f.kind)
  const femurFamilien = KNEE_IMPLANT_FAMILIES.filter(
    (f) => f.bone === 'Femur' && zeigbar(f),
  )
  // EIN Genesis-II-Eintrag statt female/male tapered (s. Katalog-Helfer):
  // die Entdopplung laeuft NACH dem Platzierbarkeits-Filter, damit die
  // uebrig bleibende Variante sicher platzierbar ist.
  const tibiaFamilien = entdoppleGenesisTibia(
    KNEE_IMPLANT_FAMILIES.filter((f) => f.bone === 'Tibia' && zeigbar(f)),
  )
  // Punkt an der Katalog-Leere, Hinweis am fehlenden Paket — gleiche
  // Trennung wie bei der Hüfte (s. dort).
  const kneeKatalogLeer =
    femurFamilien.length === 0 && tibiaFamilien.length === 0
  const keinKneeKatalog = !pkgInfo && kneeKatalogLeer

  return (
    <>
      {/* Ablauf: 1 Ansicht → 2 Kalibrierung → 3 Vollvermessung →
          4 Messungen → 5 Schablonen. „Ansicht" steht VOR der Kalibrierung,
          weil man ein zweites Bild erst laden muss, um es kalibrieren zu
          können — sie ist damit ein echter Schritt und trägt jetzt auch
          eine Nummer. Als EINSTELLUNG bekommt sie ein Badge statt eines
          Punkts (Doktrin s. CollapsibleSection): eingeklappt wäre sonst
          unsichtbar, ob eine oder zwei Aufnahmen aktiv sind — und daran
          hängt, wo der tibiale Slope gemessen wird. */}
      <CollapsibleSection
        id="knee-view"
        title="1 · Ansicht"
        defaultCollapsed={splitView && rightHasImage}
        badge={splitView ? 'zwei Bilder' : 'ein Bild'}
      >
        <DualViewControls />
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="knee-cal"
        title="2 · Kalibrierung"
        defaultCollapsed={allCalibrated}
        statusDot={allCalibrated ? 'bg-emerald-500' : 'bg-amber-500'}
      >
        <KneeCalibrationButtons hasImage={hasImage} />
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="knee-fullmeasure"
        title="3 · Vollvermessung"
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

      {/* OPTIONALER Schritt: nach der Vollvermessung sind die Einzelmasse
          in der Regel obsolet — deshalb emerald-oder-nichts statt amber,
          wie bei Osteotomie und Osteophyten der Hüfte. Der Punkt meldet
          den EIGENEN Fortschritt; dass die Sektion auch nach einer
          Vollvermessung zuklappt, ist Absicht und steht getrennt davon. */}
      <CollapsibleSection
        id="knee-measure"
        title="4 · Messungen"
        defaultCollapsed={hasWorkflow || hatEinzelmessung}
        statusDot={hatEinzelmessung ? 'bg-emerald-500' : undefined}
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
        title="5 · Schablonen"
        defaultCollapsed={kneeComponentCount >= 2}
        // Ohne Katalog kein amber — gleiche Begründung wie bei der Hüfte.
        statusDot={
          kneeComponentCount >= 2
            ? 'bg-emerald-500'
            : kneeKatalogLeer
              ? undefined
              : 'bg-amber-500'
        }
      >
      {/* Seiten-Abfrage wie bei der Hüfte (UX-Befund P1-1: vorher war die
          Seite hart auf 'R' verdrahtet). */}
      {keinKneeKatalog && <KeinPaketHinweis />}
      {pkgInfo && kneeKatalogLeer && (
        <PaketOhneModulHinweis
          paketName={pkgInfo.name}
          modul="Knie"
          deklariert={KNEE_IMPLANT_FAMILIES.length}
        />
      )}
      {femurFamilien.length > 0 && (
        <KneeFamilienDropdown
          label="Femurkomponente"
          familien={femurFamilien}
          disabled={!hasImage}
          onWahl={setPendingSideKind}
        />
      )}
      {tibiaFamilien.length > 0 && (
        <KneeFamilienDropdown
          label="Tibiakomponente"
          familien={tibiaFamilien}
          disabled={!hasImage}
          onWahl={setPendingSideKind}
        />
      )}

      {pendingSideKind && (
        <div className="mx-1 mt-1 rounded border border-sky-800 bg-sky-950/40 px-2 py-1.5 text-xs">
          {/* Gewählte Familie anzeigen — bei den Dropdowns ist die Wahl
              sonst nicht mehr sichtbar, sobald das Select zurückspringt. */}
          <div className="mb-1 truncate text-sky-200">
            {(() => {
              const l = KNEE_IMPLANT_FAMILIES.find(
                (f) => f.kind === pendingSideKind,
              )?.label
              return l ? ohneTibiaVariantenZusatz(l) : 'Schablone'
            })()}{' '}
            — Seite?
          </div>
          <div className="flex items-center gap-1.5">
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
        </div>
      )}
      </CollapsibleSection>
      {/* Bewusst außerhalb der Sektion (s. SelectedTemplatePanel, Hüfte) —
          aber DIREKT dahinter, ohne Trenner: das Panel gehört noch zur
          Schablonen-Sektion. Vorher stand hier ein <Divider /> davor; ohne
          ausgewählte Schablone liefert das Panel null, und die Leiste endete
          mit einer Trennlinie, unter der nichts mehr kam. Regel: Trenner nur
          ZWISCHEN Sektionen, nie am Ende. */}
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
        {family ? ohneTibiaVariantenZusatz(family.label) : selected.kind}
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
          { value: 'AP', label: 'AP' },
          { value: 'lateral', label: 'seitlich' },
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
              Für „Mechanisch ausrichten" zuerst die Vollvermessung setzen.
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

/**
 * Schulter-Sektion. Aufbau und Optik bewusst identisch zu `HipSection`
 * und `KneeSection`: durchnummerierte, einklappbare Sektionen mit
 * `Divider` dazwischen, Status-Punkt amber/grün und Auto-Einklappen,
 * sobald ein Schritt erledigt ist.
 *
 * Reihenfolge 1 Kalibrierung → 2 Seite → 3 Prothese → 4 Messungen →
 * 5 Schablonen. Die beiden Einstellungen stehen VOR den Messungen, weil
 * sie festlegen, wie diese ausgewertet werden:
 *  - Seite: „lateral" ist auf der a.p.-Aufnahme seitenabhängig (CSA,
 *    Akromion-Index). Die Seite wird beim Anlegen jeder Messung
 *    eingefroren, ein späteres Umschalten deutet Bestehendes NICHT um.
 *  - Prothesentyp: filtert nur das Rezept-Angebot (die Bilanz-Winkel
 *    DSA/LSA gelten nur invers) — nie die Rechenlogik.
 *
 * Beide tragen deshalb ein Header-Badge mit dem aktuellen Wert: eingeklappt
 * bliebe eine Wahl sonst unsichtbar, die das Ergebnis mitbestimmt. Ein
 * amber/grüner Punkt wäre hier falsch — es gibt nichts zu erledigen, der
 * Wert ist immer gesetzt.
 */
function ShoulderSection({ hasImage }: { hasImage: boolean }) {
  const calibrated = useViewerStore((s) => s.calibration != null)
  const side = useShoulderStore((s) => s.side)
  const setSide = useShoulderStore((s) => s.setSide)
  const prosthesis = useShoulderStore((s) => s.prosthesis)
  const setProsthesis = useShoulderStore((s) => s.setProsthesis)
  const activeKind = useShoulderStore((s) => s.activeKind)
  // „Erledigt"-Kriterium wie bei Hüfte/Knie: sobald gemessen wurde, klappen
  // die vorgelagerten Einstellungen und die Werkzeugliste standardmäßig zu.
  const hatMessung = useShoulderStore((s) => s.measurements.length > 0)
  // Angebot haengt am Prothesentyp: die Bilanz-Winkel (DSA/LSA) sind nur
  // bei der inversen Prothese sinnvoll. Die Rechnung kennt den Typ nicht.
  const rezepte = recipesForProsthesis(prosthesis)

  return (
    <>
      <CollapsibleSection
        id="shoulder-cal"
        title="1 · Kalibrierung"
        defaultCollapsed={calibrated}
        statusDot={calibrated ? 'bg-emerald-500' : 'bg-amber-500'}
      >
        <CalibrationButton hasImage={hasImage} />
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="shoulder-side"
        title="2 · Seite"
        defaultCollapsed={hatMessung}
        badge={side === 'R' ? 'rechts' : 'links'}
      >
        <div className="flex gap-1 px-1">
          <SegmentButton
            label="Rechts"
            active={side === 'R'}
            onClick={() => setSide('R')}
          />
          <SegmentButton
            label="Links"
            active={side === 'L'}
            onClick={() => setSide('L')}
          />
        </div>
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="shoulder-prosthesis"
        title="3 · Prothese"
        defaultCollapsed={hatMessung}
        badge={prosthesis === 'reverse' ? 'invers' : 'anatomisch'}
      >
        <div className="flex gap-1 px-1">
          <SegmentButton
            label="Anatomisch"
            active={prosthesis === 'anatomic'}
            onClick={() => setProsthesis('anatomic')}
          />
          <SegmentButton
            label="Invers"
            active={prosthesis === 'reverse'}
            onClick={() => setProsthesis('reverse')}
          />
        </div>
      </CollapsibleSection>

      <Divider />

      <CollapsibleSection
        id="shoulder-measure"
        title="4 · Messungen"
        defaultCollapsed={hatMessung}
        statusDot={hatMessung ? 'bg-emerald-500' : 'bg-amber-500'}
      >
        {rezepte.map((r) => (
          <ToolButton
            key={r.kind}
            label={r.label}
            active={activeKind === r.kind}
            disabled={!hasImage}
            onClick={() => pickShoulderTool(r.kind)}
          />
        ))}
        <Hint>
          <p className="px-3 pt-1 text-[10px] leading-snug text-neutral-500">
            Gilt für die echte a.p.-Aufnahme; Glenoid-Version und Walch-Typ
            bleiben dem CT vorbehalten.
          </p>
        </Hint>
      </CollapsibleSection>

      <Divider />

      <ShaftFragmentSection hasImage={hasImage} />

      <Divider />

      <ShoulderTemplatesSection hasImage={hasImage} />
    </>
  )
}

/**
 * Sektion „5 · Schaft-Crop": Schnittkontur um den Humerusschaft legen,
 * das Fragment dann verschieben/drehen.
 *
 * VOR den Schablonen: Erst wird die Knochensituation hergestellt, dann
 * die Komponente daran ausgerichtet — deshalb liegt das Fragment im
 * Viewport auch UNTER den Schablonen. Emerald, sobald ein Fragment
 * existiert; kein amber, weil der Schritt optional ist (wie die
 * Osteophyten bei der Hüfte).
 */
function ShaftFragmentSection({ hasImage }: { hasImage: boolean }) {
  const fragmente = useShaftFragmentStore((s) => s.fragments)
  const placing = useShaftFragmentStore((s) => s.placing)
  const draftPoints = useShaftFragmentStore((s) => s.draftPoints)
  const store = useShaftFragmentStore()

  return (
    <CollapsibleSection
      id="shoulder-crop"
      title="5 · Schaft-Crop"
      defaultCollapsed={fragmente.length === 0}
      statusDot={fragmente.length > 0 ? 'bg-emerald-500' : undefined}
    >
      <button
        onClick={toggleShaftFragmentTool}
        disabled={!hasImage}
        className={[
          'rounded border px-3 py-2 text-left text-sm transition',
          placing
            ? 'border-sky-500 bg-sky-700/30 text-sky-100 ring-1 ring-sky-500'
            : 'border-sky-900/60 bg-sky-950/20 text-sky-200 hover:bg-sky-900/30',
          !hasImage ? 'cursor-not-allowed opacity-50' : '',
        ].join(' ')}
      >
        {placing ? 'Schneiden aktiv — fertig' : 'Schaft ausschneiden'}
      </button>

      {placing && (
        <button
          onClick={() => store.finishFragment()}
          disabled={draftPoints.length < 3}
          className="mt-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-left text-[11px] text-neutral-200 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Schnitt abschließen ({draftPoints.length} Punkte)
        </button>
      )}

      {fragmente.map((f, i) => (
        <div
          key={f.id}
          className="mt-1 flex items-center gap-2 rounded border border-neutral-800 px-2 py-1 text-[11px] text-neutral-300"
        >
          <span className="flex-1">Fragment {i + 1}</span>
          <button
            onClick={() => store.setVisible(f.id, !f.visible)}
            className="text-neutral-400 transition hover:text-neutral-100"
            title={f.visible ? 'ausblenden' : 'einblenden'}
          >
            {f.visible ? '👁' : '🚫'}
          </button>
          <button
            onClick={() => store.remove(f.id)}
            className="text-red-400 transition hover:text-red-200"
            title="entfernen"
          >
            ✕
          </button>
        </div>
      ))}

      <Hint>
        <p className="px-3 pt-1 text-[10px] leading-snug text-neutral-500">
          Den Schaft mit Klicks umfahren, Enter schließt den Schnitt
          (Rücktaste nimmt einen Punkt zurück, Esc verwirft). Das
          ausgeschnittene Stück lässt sich ziehen und am Griff darüber
          drehen (± = fein, Entf = löschen). An der Ausgangsstelle bleibt
          eine schwarze Lücke, gestrichelt umrandet — die Verschiebung ist
          damit als Vorher/Nachher lesbar.
        </p>
      </Hint>
    </CollapsibleSection>
  )
}

/**
 * Sektion „6 · Schablonen" der Schulter — amber/emerald-Muster wie Hüfte/
 * Knie: amber nur, wenn der Schulter-Katalog NICHT leer ist (sonst gäbe es
 * nichts zu tun); emerald sobald eine Schablone platziert wurde.
 *
 * Das Angebot ist doppelt gefiltert: `prosthesis` (anatomisch/revers, wie
 * recipesForProsthesis — filtert nur das ANGEBOT, nie Rechnung) und
 * `shoulderKindPlaceable` (nur Familien mit zeichenbarer Kontur).
 * Die Seite kommt aus dem Schulter-Modul (Sektion „2 · Seite") — anders
 * als beim Knie gibt es hier bereits eine explizite Seiten-Wahl, eine
 * zweite Abfrage pro Schablone wäre redundant. Pro Schablone bleibt die
 * Seite im Auswahl-Panel änderbar.
 */
function ShoulderTemplatesSection({ hasImage }: { hasImage: boolean }) {
  const prosthesis = useShoulderStore((s) => s.prosthesis)
  const side = useShoulderStore((s) => s.side)
  const placedCount = useShoulderTemplateStore((s) => s.templates.length)
  // pkgInfo triggert Re-Render nach Paket-Import (die Familien-Arrays
  // werden in-place ersetzt und wären sonst referenz-gleich).
  const pkgInfo = useTemplatePackageStore((s) => s.info)
  void pkgInfo
  const placeable = (f: ShoulderImplantFamily) => shoulderKindPlaceable(f.kind)
  const familien = shoulderFamiliesForProsthesis(prosthesis).filter(placeable)
  const humerusFamilien = familien.filter((f) => f.bone === 'Humerus')
  const glenoidFamilien = familien.filter((f) => f.bone === 'Glenoid')
  const katalogLeer = familien.length === 0
  const keinKatalog = !pkgInfo && katalogLeer

  function platziere(kind: ShoulderImplantKind) {
    const id = addShoulderTemplate(kind, side)
    if (id) {
      useViewerStore
        .getState()
        .setStatus(
          'Schablone platziert — per Drag verschieben, Griff oder Alt+Pfeil drehen.',
        )
    }
  }

  return (
    <>
      <CollapsibleSection
        id="shoulder-templates"
        title="6 · Schablonen"
        defaultCollapsed={placedCount >= 1}
        // Ohne Katalog kein amber — gleiche Begründung wie Hüfte/Knie.
        statusDot={
          placedCount >= 1
            ? 'bg-emerald-500'
            : katalogLeer
              ? undefined
              : 'bg-amber-500'
        }
      >
        {keinKatalog && <KeinPaketHinweis />}
        {pkgInfo && katalogLeer && (
          <PaketOhneModulHinweis
            paketName={pkgInfo.name}
            modul="Schulter"
            deklariert={shoulderFamiliesForProsthesis(prosthesis).length}
          />
        )}
        {humerusFamilien.length > 0 && (
          <KneeFamilienDropdown
            label="Humerus-Komponente"
            familien={humerusFamilien}
            disabled={!hasImage}
            onWahl={platziere}
          />
        )}
        {glenoidFamilien.length > 0 && (
          <KneeFamilienDropdown
            label="Glenoid-Komponente"
            familien={glenoidFamilien}
            disabled={!hasImage}
            onWahl={platziere}
          />
        )}
      </CollapsibleSection>
      {/* Direkt hinter der Sektion, ohne Trenner (Regel: Trenner nur
          ZWISCHEN Sektionen — s. SelectedKneeTemplatePanel). */}
      <SelectedShoulderTemplatePanel />
    </>
  )
}

/** Eigenschaften-Panel der ausgewählten Schulter-Schablone (Knie-Muster,
 *  ohne Ebene/Inlay — die Schulter kennt nur die a.p.-Sicht). */
function SelectedShoulderTemplatePanel() {
  const selected = useShoulderTemplateStore((s) =>
    s.selectedId ? s.templates.find((t) => t.id === s.selectedId) ?? null : null,
  )
  if (!selected) return null
  const store = useShoulderTemplateStore.getState()
  const family = shoulderFamiliesForProsthesis('anatomic')
    .concat(shoulderFamiliesForProsthesis('reverse'))
    .find((f) => f.kind === selected.kind)
  const labels = SHOULDER_SIZE_LABELS[selected.kind] ?? []

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
        options={labels.map((l, i) => ({ value: i, label: l }))}
      />

      <KneeSelect
        label="Seite"
        value={selected.side}
        onChange={(v) => store.setSide(selected.id, v as 'R' | 'L')}
        options={[
          { value: 'R', label: 'rechts' },
          { value: 'L', label: 'links' },
        ]}
      />

      <div className="text-[10px] text-neutral-500">
        Größe: {shoulderSizeLabel(selected.kind, selected.sizeIndex)} · Drag =
        verschieben · Pfeile/± = fein · Entf = löschen
      </div>

      <button
        onClick={() => store.remove(selected.id)}
        className="mt-2 w-full rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-900/40"
      >
        Schablone entfernen
      </button>
    </div>
  )
}

/** Kleiner Zwei-/Mehrfach-Umschalter (Seite, Prothesentyp). */
function SegmentButton({
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
        'flex-1 rounded border px-2 py-1.5 text-xs font-medium transition',
        active
          ? 'border-sky-600 bg-sky-950/60 text-sky-200'
          : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-neutral-200',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

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
/**
 * DOKTRIN DER SEKTIONEN (gilt für Hüfte, Knie UND Schulter).
 *
 * Sie stand bisher nirgends und wurde deshalb in jedem Modul etwas anders
 * ausgelegt. Vier Typen, mehr gibt es nicht:
 *
 *  SCHRITT (Pflicht)   `statusDot` amber → emerald. Der Ausdruck, der auf
 *                      emerald schaltet, IST das `defaultCollapsed`-
 *                      Kriterium: grün und zugeklappt bedeuten dasselbe.
 *  SCHRITT (optional)  `statusDot` emerald ODER `undefined`. Kein amber —
 *                      es wäre die Behauptung „hier ist noch etwas offen",
 *                      obwohl der Schritt übersprungen werden darf.
 *  EINSTELLUNG         `badge` statt Punkt. Ein Wert, der immer gesetzt
 *                      ist, kann nicht „erledigt" sein; eingeklappt bliebe
 *                      er ohne Badge unsichtbar, obwohl er die Auswertung
 *                      mitbestimmt.
 *  PLATZHALTER         weder noch, `defaultCollapsed` konstant. Sobald es
 *                      Inhalt gibt, wird daraus ein SCHRITT.
 *
 * Die NUMMER im Titel sagt nur, an welcher Stelle des Ablaufs die Sektion
 * steht — sie ist unabhängig vom Typ. Jede Sektion trägt eine, damit die
 * Leiste in allen drei Modulen als durchgehende Abfolge lesbar ist.
 *
 * Der Titel trägt KEIN Modul-Präfix: welcher Modus aktiv ist, steht in der
 * Tab-Leiste darüber, und es ist immer nur ein Modul sichtbar. Genau das
 * macht die rechte Leiste seit jeher so („Messungen", „Schablonen").
 */
function CollapsibleSection({
  id,
  title,
  defaultCollapsed = false,
  statusDot,
  badge,
  children,
}: {
  id: string
  title: string
  defaultCollapsed?: boolean
  /** Tailwind-Farbklasse für einen Status-Punkt rechts im Header. */
  statusDot?: string
  /** Kurzer Wert im Header — für Sektionen, die eine EINSTELLUNG halten
   *  statt eines erledigt/offen-Schritts (Schulter: Seite, Prothese).
   *  Ohne ihn würde das Einklappen eine Wahl verbergen, an der die
   *  Auswertung hängt. */
  badge?: string
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
  // Nur SCHRITT-Sektionen (statusDot) verwerfen die manuelle Wahl: dort
  // bedeutet der Kipp-Übergang „dieser Schritt wurde gerade erledigt".
  // Einstellungs-Sektionen (Badge) klappen dagegen durch FREMDEN
  // Fortschritt zu — z. B. Seite/Prothese, sobald die erste Messung
  // gesetzt ist. Wer sie bewusst offen hält, soll sie behalten.
  //
  // Die Flanke wird auf der KONJUNKTION (Schritt UND erledigt) verfolgt,
  // nicht auf defaultCollapsed allein: Bei „4 · Messungen" (Knie) kippt
  // defaultCollapsed schon durch die Vollvermessung, während der eigene
  // Punkt noch fehlt — die Kante wäre verbraucht, und der spätere EIGENE
  // Erledigt-Übergang (erste Einzelmessung) fände keine mehr vor.
  const istSchritt = statusDot != null
  const fertigerSchritt = istSchritt && defaultCollapsed
  const prevFertig = useRef(fertigerSchritt)
  useEffect(() => {
    if (fertigerSchritt && !prevFertig.current) {
      useUiStore.getState().clearSectionChoice(id)
    }
    prevFertig.current = fertigerSchritt
  }, [fertigerSchritt, id])
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
        {/* `min-w-0 truncate` ist der Umbruch-Schutz: der Titel bleibt
            einzeilig, statt die Kopfzeile auf zwei Zeilen zu sprengen.
            Badge und Punkt bekommen `shrink-0`, damit nicht stattdessen
            SIE gestaucht werden. Bei den heutigen Titeln greift `truncate`
            nie — es ist das Netz für künftige längere Rubriken. */}
        <span className="min-w-0 flex-1 truncate" title={title}>
          {title}
        </span>
        {badge && (
          <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-neutral-300">
            {badge}
          </span>
        )}
        {statusDot && (
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDot}`}
          />
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
// Hüft-Schablonen-Panels (Pfanne/Schaft der Auswahl)
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
        Ausgewählte Schablone
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
        Schablone entfernen
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
        Ausgewählte Schablone
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
        Schablone entfernen
      </button>
    </div>
  )
}
