import { create } from 'zustand'
import type {
  ImageMeta,
  Calibration,
  PatientInfo,
  Measurement,
  ImageSelection,
} from './viewerStore'

/**
 * Zustand der ZWEI-BILD-Ansicht im Knie-Modus (AP + seitlich nebeneinander).
 *
 * Bewusste Trennung vom `viewerStore`:
 *   - Das LINKE (Haupt-)Pane bleibt komplett im `viewerStore` + dem
 *     bestehenden Single-View-Viewport. Dadurch ändert sich am erprobten
 *     Mess-/Schablonen-/Recovery-Pfad NICHTS.
 *   - Dieser Store hält nur den Zustand des ZWEITEN (rechten) Panes plus
 *     den Split-Schalter. So bleibt der Blast-Radius klein.
 *
 * Feste Rollen: Haupt-Pane (links) = AP-Ganzbein, zweites Pane (rechts) =
 * seitliche Aufnahme. Kein Tausch — die anatomische Aufnahme-Ebene jeder
 * Seite ist eindeutig, ein Vertauschen würde nur Verwechslung stiften.
 *
 * v1: Das rechte Pane dient der Ansicht (Pan/Zoom/Fenstern) + eigener
 * Auto-Kalibrierung aus DICOM-PixelSpacing. Messen/Schablonen auf dem
 * rechten Pane ist Schritt 2 (dann kommt auch ein `activePane`-Konzept).
 *
 * Datenschutz: rein lokal (Anzeige), wie der restliche Viewer-State.
 */
/** Welches Pane gerade „aktiv" ist — Ziel für Messungen/Schablonen.
 *  'left' = Haupt-Pane (viewerStore), 'right' = zweites Pane. */
export type ActivePane = 'left' | 'right'

interface KneePanesState {
  /** Zwei-Bild-Modus an/aus (nur im Knie-Modus wirksam). */
  splitView: boolean
  /** Aktives Pane (Klick-Auswahl). Bei Split AUS implizit immer 'left'. */
  activePane: ActivePane
  /** Ziel-Pane der aktuell laufenden Kalibrierung. Reaktiv, damit die
   *  Kalibrier-Dialoge das richtige Bild-PixelSpacing prüfen. Hüft-Modul
   *  setzt immer 'left'. */
  calibrationTarget: ActivePane
  /** Ob das Slope-Winkel-Werkzeug auf dem rechten Pane gerade aktiv ist
   *  (linke Maustaste = Winkel zeichnen statt Fenstern). */
  slopeActive: boolean
  /** Vollbild-Modus: welches Pane maximiert ist (null = geteilt). Nur in
   *  der Zwei-Bild-Ansicht wirksam; beim Verlassen des Split-Modus
   *  automatisch zurückgesetzt. */
  maximizedPane: ActivePane | null

  /** Ob im rechten Pane ein Bild liegt. */
  rightHasImage: boolean
  rightImageMeta: ImageMeta | null
  /** Eigene Kalibrierung des rechten Bildes (AP/seitlich haben andere
   *  Vergrößerung/PixelSpacing → eigener Wert, nicht der globale). */
  rightCalibration: Calibration | null
  rightPatientInfo: PatientInfo | null
  /** Statuszeile speziell fürs rechte Pane (Lade-/Fehlermeldungen). */
  rightStatus: string
  /** Mess-Ergebnisse (Länge/Winkel) des rechten Panes — analog zu
   *  `viewerStore.measurements` fürs Haupt-Pane. */
  rightMeasurements: Measurement[]
  /** Kandidaten-Auswahl des rechten Panes bei Mehr-Bild-Ladungen. */
  rightImageSelection: ImageSelection | null

  setSplitView: (v: boolean) => void
  toggleSplitView: () => void
  setActivePane: (p: ActivePane) => void
  setCalibrationTarget: (p: ActivePane) => void
  setSlopeActive: (v: boolean) => void
  setMaximizedPane: (p: ActivePane | null) => void
  setRightHasImage: (v: boolean) => void
  setRightImageMeta: (m: ImageMeta | null) => void
  setRightCalibration: (c: Calibration | null) => void
  setRightPatientInfo: (p: PatientInfo | null) => void
  setRightStatus: (s: string) => void
  setRightMeasurements: (m: Measurement[]) => void
  setRightImageSelection: (s: ImageSelection | null) => void
  /** Rechtes Pane vollständig leeren (z. B. neues Bild verworfen). */
  resetRight: () => void
}

export const useKneePanesStore = create<KneePanesState>((set) => ({
  splitView: false,
  activePane: 'left',
  calibrationTarget: 'left',
  slopeActive: false,
  maximizedPane: null,

  rightHasImage: false,
  rightImageMeta: null,
  rightCalibration: null,
  rightPatientInfo: null,
  rightStatus: 'Kein Bild',
  rightMeasurements: [],
  rightImageSelection: null,

  // Beim Verlassen des Split-Modus immer aufs linke Pane zurück, damit
  // die Planung nie auf einem unsichtbaren rechten Pane „hängen bleibt".
  // Vollbild-Zustand ebenfalls lösen (gehört zur Zwei-Bild-Ansicht).
  setSplitView: (v) =>
    set(
      v
        ? { splitView: true }
        : { splitView: false, activePane: 'left', maximizedPane: null },
    ),
  toggleSplitView: () =>
    set((s) =>
      s.splitView
        ? { splitView: false, activePane: 'left', maximizedPane: null }
        : { splitView: true },
    ),
  setActivePane: (p) => set({ activePane: p }),
  setCalibrationTarget: (p) => set({ calibrationTarget: p }),
  setSlopeActive: (v) => set({ slopeActive: v }),
  setMaximizedPane: (p) => set({ maximizedPane: p }),
  setRightHasImage: (v) => set({ rightHasImage: v }),
  setRightImageMeta: (m) => set({ rightImageMeta: m }),
  setRightCalibration: (c) => set({ rightCalibration: c }),
  setRightPatientInfo: (p) => set({ rightPatientInfo: p }),
  setRightStatus: (s) => set({ rightStatus: s }),
  setRightMeasurements: (m) => set({ rightMeasurements: m }),
  setRightImageSelection: (s) => set({ rightImageSelection: s }),
  resetRight: () =>
    set({
      rightHasImage: false,
      rightImageMeta: null,
      rightCalibration: null,
      rightPatientInfo: null,
      rightStatus: 'Kein Bild',
      rightMeasurements: [],
      rightImageSelection: null,
    }),
}))
