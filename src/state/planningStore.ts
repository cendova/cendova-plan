import { create } from 'zustand'
import { getOrgProfile } from './orgProfileStore'

/**
 * Organisatorische/klinische Planungsdaten rund um die OP — getrennt vom
 * reinen Bild-/Mess-State (viewerStore), weil sie eine andere Lebensdauer
 * haben: Sie gelten für den PATIENTEN und sollen über mehrere Export-
 * Vorgänge (z. B. mehrere Schaft-Varianten als je ein PDF) hinweg erhalten
 * bleiben, ohne jedes Mal neu abgefragt zu werden.
 *
 * Datenschutz: bleibt rein lokal (Anzeige im PDF/Plan, beides auf dem
 * Rechner des Nutzers).
 */

/**
 * Standort/Krankenhaus: frei konfigurierbar über das Einrichtungs-Profil
 * (orgProfileStore) — daher schlicht `string`. Sonderwerte: '' = nicht
 * gewählt, 'unklar' = „noch unklar" (immer verfügbare generische Option).
 * Die Auswahlliste liefert das Profil, nicht mehr eine feste Konstante hier
 * (Personalisierung/Neutralität für den öffentlichen Zugang).
 */
export type Hospital = string

export type Insurance = '' | 'GKV' | 'GKV+Zusatz' | 'PKV' | 'Selbstzahler'

export type RehaKind = '' | 'Physio' | 'AHB ambulant' | 'AHB stationär'

/** Auswahllisten für die Dropdowns (Reihenfolge = Anzeige-Reihenfolge). */
export const INSURANCES: Exclude<Insurance, ''>[] = [
  'GKV',
  'GKV+Zusatz',
  'PKV',
  'Selbstzahler',
]
export const REHA_KINDS: Exclude<RehaKind, ''>[] = [
  'Physio',
  'AHB ambulant',
  'AHB stationär',
]

/** Reine Datenfelder (das, was persistiert + ins PDF geht). */
export interface PlanningData {
  /** OP-Termin als ISO-Datum 'YYYY-MM-DD' oder '' (nicht gesetzt). */
  surgeryDate: string
  /** Explizit „noch unklar" gewählt (überschreibt surgeryDate in der Anzeige). */
  surgeryDateUnknown: boolean
  hospital: Hospital
  insurance: Insurance
  /** Körpergröße in cm (editierbar; aus DICOM vorbelegt). */
  heightCm: string
  /** Gewicht in kg (editierbar; aus DICOM vorbelegt). */
  weightKg: string
  reha: RehaKind
  /** „ab dem"-Datum für AHB (ISO 'YYYY-MM-DD' oder ''). */
  rehaDate: string
  allergies: string
  anticoagulation: string
  /** Freitext „Sonstiges" (z. B. „Hüftkopf erhalten", Wunsch-Implantat …). */
  other: string
  /** Wer die Planung durchgeführt hat (für die PDF-Fußzeile). */
  planner: string
}

interface PlanningState extends PlanningData {
  /** Eingabedialog offen. */
  dialogOpen: boolean
  /** Vor-Export-Hinweis offen (es wurde noch gar nichts erfasst). */
  warnOpen: boolean
  setField: <K extends keyof PlanningData>(key: K, value: PlanningData[K]) => void
  setMany: (patch: Partial<PlanningData>) => void
  setDialogOpen: (v: boolean) => void
  setWarnOpen: (v: boolean) => void
  /** Auf Leerwerte zurücksetzen (Planer wieder auf Default). */
  reset: () => void
  /** Aus einem geladenen Plan befüllen. */
  hydrate: (d: Partial<PlanningData>) => void
}

/** Leerzustand — der Planer-Name kommt aus dem Einrichtungs-Profil (leer =
 *  neutral). Funktion statt Konstante, damit ein nachträglich geändertes
 *  Profil beim nächsten reset()/hydrate() greift. */
function makeEmpty(): PlanningData {
  return {
    surgeryDate: '',
    surgeryDateUnknown: false,
    hospital: '',
    insurance: '',
    heightCm: '',
    weightKg: '',
    reha: '',
    rehaDate: '',
    allergies: '',
    anticoagulation: '',
    other: '',
    planner: getOrgProfile().defaultPlanner,
  }
}

export const usePlanningStore = create<PlanningState>((set) => ({
  ...makeEmpty(),
  dialogOpen: false,
  warnOpen: false,
  setField: (key, value) => set({ [key]: value } as Partial<PlanningState>),
  setMany: (patch) => set(patch as Partial<PlanningState>),
  setDialogOpen: (v) => set({ dialogOpen: v }),
  setWarnOpen: (v) => set({ warnOpen: v }),
  reset: () => set({ ...makeEmpty() }),
  hydrate: (d) => set({ ...makeEmpty(), ...d }),
}))

/** BMI aus cm + kg. null, wenn unvollständig/ungültig. Akzeptiert auch
 *  Komma als Dezimaltrenner (deutsche Eingabe). */
export function computeBmi(heightCm: string, weightKg: string): number | null {
  const h = parseFloat(heightCm.replace(',', '.'))
  const w = parseFloat(weightKg.replace(',', '.'))
  if (!isFinite(h) || !isFinite(w) || h <= 0 || w <= 0) return null
  const m = h / 100
  return w / (m * m)
}

/**
 * „Nichts erfasst" = keines der klinisch/organisatorischen Felder gesetzt.
 *
 * Bewusst NICHT berücksichtigt: Größe/Gewicht (oft automatisch aus dem
 * DICOM vorbelegt) und der Default-Planer-Name — sonst gälte der State
 * sofort als „befüllt" und die Erinnerung erschiene nie. So greift die
 * Erinnerung nur, wenn der Nutzer wirklich noch gar nichts eingegeben hat,
 * und entfällt bei jedem weiteren Export, sobald irgendetwas erfasst wurde.
 */
export function isPlanningEmpty(d: PlanningData): boolean {
  return (
    !d.surgeryDate &&
    !d.surgeryDateUnknown &&
    !d.hospital &&
    !d.insurance &&
    !d.reha &&
    !d.allergies.trim() &&
    !d.anticoagulation.trim() &&
    !d.other.trim()
  )
}
