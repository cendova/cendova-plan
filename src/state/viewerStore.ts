import { create } from 'zustand'

export type LeftTool = 'WindowLevel' | 'Pan' | 'Zoom' | 'Length' | 'Angle'

/**
 * Planungs-Modus der Sidebar — bestimmt, welcher fachliche Werkzeug-Block
 * angezeigt wird. Fertige Messungen/Templates bleiben beim Wechsel sichtbar;
 * nur das gerade laufende Mess-Werkzeug wird abgebrochen (siehe
 * `setPlanningMode` im Toolbar/State-Übergang).
 */
export type PlanningMode = 'hip' | 'knee'

const PLANNING_MODE_KEY = 'cendova.planningMode'
/** Vor dem Rename verwendeter Schlüssel (Alt-Arbeitsname) — wird beim
 *  ersten Start einmalig migriert, damit der letzte Modus erhalten bleibt. */
const PLANNING_MODE_KEY_ALT = 'endomicad.planningMode'

/** Liest den letzten Modus aus dem localStorage, mit Hip als Default. */
function loadInitialPlanningMode(): PlanningMode {
  try {
    let v = localStorage.getItem(PLANNING_MODE_KEY)
    if (v === null) {
      // Einmal-Migration vom alten Schlüssel.
      v = localStorage.getItem(PLANNING_MODE_KEY_ALT)
      if (v !== null) {
        localStorage.setItem(PLANNING_MODE_KEY, v)
        localStorage.removeItem(PLANNING_MODE_KEY_ALT)
      }
    }
    return v === 'knee' ? 'knee' : 'hip'
  } catch {
    return 'hip'
  }
}

export interface ImageMeta {
  rows: number
  columns: number
  /** Pixelabstand aus DICOM in mm (falls vorhanden), sonst null. */
  pixelSpacing: number | null
}

/** Aus den DICOM-Tags gelesene Patienten-Identifikation. Bleibt rein
 *  lokal (wird nur über dem Bild angezeigt und ins PDF/Plan übernommen,
 *  die alle auf dem Rechner des Nutzers bleiben). */
export interface PatientInfo {
  /** Nachname (aus PatientName, Teil vor dem ersten „^"). */
  lastName: string
  /** Vorname (aus PatientName, Teil nach dem ersten „^"). */
  firstName: string
  /** Geburtsdatum, formatiert als TT.MM.JJJJ (oder null). */
  birthDate: string | null
  /** Alter in Jahren zum Aufnahmezeitpunkt (StudyDate), sonst zu heute. */
  ageYears: number | null
  /** Körpergröße in cm (aus PatientSize 0010,1020, dort in Metern), oder null. */
  heightCm: number | null
  /** Gewicht in kg (aus PatientWeight 0010,1030), oder null. */
  weightKg: number | null
}

/** Kandidaten-Auswahl bei Mehr-Bild-Ladungen (ZIP/Ordner mit mehreren
 *  DICOMs): Der Nutzer blättert mit Pfeilen durch die Kandidaten und
 *  FIXIERT dann das Planungs-Bild (Debug-Runde 2). null = Einzelbild
 *  oder nichts geladen — dann gibt es keinen Picker. */
export interface ImageSelection {
  /** Dateinamen aller Kandidaten (Anzeige im Picker-Chip). */
  fileNames: string[]
  count: number
  /** Index des aktuell angezeigten Kandidaten. */
  index: number
  /** true = Nutzer hat das Bild fixiert; Pfeile verschwinden. Wieder-
   *  öffnen über den Kalibrier-Dialog (mit Warnhinweis). */
  fixed: boolean
}

/** Eine noch nicht bestätigte Kalibriermessung (wartet auf mm-Eingabe). */
export interface PendingCalibration {
  annotationUID: string
  /** Länge der gezeichneten Strecke in Cornerstone-Weltkoordinaten. */
  worldDistance: number
}

/** Abgeschlossene Kalibrierung: Umrechnungsfaktor + Referenzangabe. */
export interface Calibration {
  /** Millimeter pro Welt-Einheit — Kernfaktor für alle Messungen. */
  mmPerWorldUnit: number
  /** Bekannte reale Länge, mit der kalibriert wurde (für Anzeige). */
  referenceMm: number
  /** Röntgen-Vergrößerungsfaktor (Default 1.0). Kompensiert die
   *  geometrische Vergrößerung im Strahlengang: typische Werte 1.10-1.25
   *  bei Beckenübersichten ohne Kalibrierkugel auf Hüfthöhe.
   *  - Mit Kalibrierkugel AUF Hüfthöhe: 1.0 (Kugel und Hüfte gleich vergrößert)
   *  - DICOM-PixelSpacing direkt genutzt: typisch 1.15 (FFD ≈ 100 cm, OFD ≈ 15 cm)
   *  - Kalibrierfeature an anderer Tiefe als Hüfte: experimentell anpassen */
  magnificationFactor: number
}

/** Eine fertige Messung (Strecke oder Winkel) für das Mess-Panel. */
export interface Measurement {
  /** annotationUID der zugehörigen Cornerstone-Annotation. */
  id: string
  kind: 'length' | 'angle'
  /** Anzeigename, z. B. „L1" oder „W1". */
  label: string
  /** Wert in mm (Strecke) bzw. Grad (Winkel). */
  value: number
  unit: 'mm' | '°'
  /** Nur für Strecken relevant: ob eine Kalibrierung angewandt wurde. */
  calibrated: boolean
  /** Ob die Messung im Bild sichtbar ist. */
  visible: boolean
}

interface ViewerState {
  /** Ob aktuell ein Bild im Viewport angezeigt wird. */
  hasImage: boolean
  /** Metadaten des aktuell geladenen Bildes. */
  imageMeta: ImageMeta | null
  /** imageId des aktuell angezeigten Bildes. */
  currentImageId: string | null
  /** Welches Werkzeug auf der linken Maustaste liegt. */
  leftTool: LeftTool
  /** Statusmeldung in der Fußzeile. */
  status: string
  /** Abgeschlossene Kalibrierung (null = nicht kalibriert). */
  calibration: Calibration | null
  /** Offene Kalibriermessung, die eine mm-Eingabe erwartet. */
  pendingCalibration: PendingCalibration | null
  /** Steuert, ob der Methoden-Wahl-Dialog für die Kalibrierung offen
   *  ist. Wird vor `startCalibration` angezeigt — User entscheidet
   *  zwischen Strecke-Messen und reinem Vergrößerungsfaktor. */
  calibrationChoiceOpen: boolean
  /** Steuert den Mag-Only-Dialog (ohne Messung — direkt Vergrößerungs-
   *  faktor eingeben). Erfordert, dass das Bild eine PixelSpacing-Skala
   *  hat (sonst gibt es keine Skalierungsbasis). */
  magnificationOnlyOpen: boolean
  /** Alle aktuellen Messungen. */
  measurements: Measurement[]
  /** Aktueller Planungs-Modus (steuert die Sidebar-Tabs). */
  planningMode: PlanningMode
  /** Aus den DICOM-Tags gelesene Patienten-Identifikation (null = kein
   *  Bild / keine Tags). */
  patientInfo: PatientInfo | null
  /** Klinische Beinlängendifferenz-Notiz (aus dem Arztbrief), erfasst im
   *  Planungsdaten-Dialog (Hüftmodul); wird im Plan persistiert und steht
   *  im PDF groß in der Kopfzeile. */
  clinicalBld: string
  /** Kandidaten-Auswahl des Haupt-Panes bei Mehr-Bild-Ladungen. */
  imageSelection: ImageSelection | null
  setHasImage: (v: boolean) => void
  setImageMeta: (m: ImageMeta | null) => void
  setCurrentImageId: (id: string | null) => void
  setLeftTool: (t: LeftTool) => void
  setStatus: (s: string) => void
  setCalibration: (c: Calibration | null) => void
  setPendingCalibration: (p: PendingCalibration | null) => void
  setCalibrationChoiceOpen: (v: boolean) => void
  setMagnificationOnlyOpen: (v: boolean) => void
  setMeasurements: (m: Measurement[]) => void
  setPlanningMode: (m: PlanningMode) => void
  setPatientInfo: (p: PatientInfo | null) => void
  setClinicalBld: (s: string) => void
  setImageSelection: (s: ImageSelection | null) => void
}

/** Klinische BLD startet leer — der Platzhalter lebt im Eingabefeld des
 *  Planungsdaten-Dialogs (früher Standardtext in der Patientenleiste). */
export const DEFAULT_CLINICAL_BLD = ''

export const useViewerStore = create<ViewerState>((set) => ({
  hasImage: false,
  imageMeta: null,
  currentImageId: null,
  leftTool: 'WindowLevel',
  status: 'Bereit',
  calibration: null,
  pendingCalibration: null,
  calibrationChoiceOpen: false,
  magnificationOnlyOpen: false,
  measurements: [],
  planningMode: loadInitialPlanningMode(),
  patientInfo: null,
  clinicalBld: DEFAULT_CLINICAL_BLD,
  imageSelection: null,

  setHasImage: (v) => set({ hasImage: v }),
  setImageMeta: (m) => set({ imageMeta: m }),
  setCurrentImageId: (id) => set({ currentImageId: id }),
  setLeftTool: (t) => set({ leftTool: t }),
  setStatus: (s) => set({ status: s }),
  setCalibration: (c) => set({ calibration: c }),
  setPendingCalibration: (p) => set({ pendingCalibration: p }),
  setCalibrationChoiceOpen: (v) => set({ calibrationChoiceOpen: v }),
  setMagnificationOnlyOpen: (v) => set({ magnificationOnlyOpen: v }),
  setMeasurements: (m) => set({ measurements: m }),
  setPlanningMode: (m) => {
    try {
      localStorage.setItem(PLANNING_MODE_KEY, m)
    } catch {
      // localStorage kann in Privatmodus / SSR fehlen — kein Drama
    }
    set({ planningMode: m })
  },
  setPatientInfo: (p) => set({ patientInfo: p }),
  setClinicalBld: (s) => set({ clinicalBld: s }),
  setImageSelection: (s) => set({ imageSelection: s }),
}))
