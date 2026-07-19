import { create } from 'zustand'
import {
  sicherungLaden,
  sicherungLoeschen,
  sicherungSchreiben,
} from '../lib/lokaleSicherung'

/**
 * Einrichtungs-Profil (Personalisierung): Kopfzeilen-Untertitel,
 * Standort-/Krankenhaus-Liste und vorbelegter Planer-Name.
 *
 * Trennt die INSTALLATIONS-spezifische Identität (Praxis/Klinik/Person des
 * Nutzers) vom Code: Der öffentliche Auslieferungs-Stand ist NEUTRAL (leere
 * Defaults), jede Installation personalisiert sich lokal. So enthält das
 * öffentliche Repo keinen Klinik- oder Personennamen, während unsere eigenen
 * Rechner weiter personalisiert bleiben.
 *
 * Persistenz: localStorage (Muster wie uiStore/planningMode). Bleibt damit
 * über Launcher-Updates (git reset --hard) erhalten, weil browserseitig
 * gespeichert — und liegt bewusst NICHT in der Plan-JSON. Über Export/Import
 * lässt sich ein einmal erfasstes Profil auf weitere Rechner übertragen.
 */

const KEY = 'cendova.orgProfile'

export interface OrgProfile {
  /** Untertitel neben „CendovaPlan" (Kopfzeile + PDF). Leer = nur der Name. */
  headerSubtitle: string
  /** Auswahlliste „Krankenhaus/Standort" im Planungsdialog (eine pro Zeile). */
  hospitals: string[]
  /** Vorbelegter Planer-Name (Planungsdialog + PDF-Fußzeile). */
  defaultPlanner: string
}

/** NEUTRALER Auslieferungs-Stand (öffentliches Repo) — keine Identität. */
export const NEUTRAL_PROFILE: OrgProfile = {
  headerSubtitle: '',
  hospitals: [],
  defaultPlanner: '',
}

/**
 * Fremde/gespeicherte Daten auf die erwartete Form bringen (Typwächter).
 * Bewusst OHNE Leerzeilen-Filter bei den Standorten — sonst würde beim
 * Live-Tippen im Einstellungsdialog eine gerade begonnene neue Zeile sofort
 * wieder verschwinden. Leere Einträge filtern die Anzeige-Konsumenten
 * (`cleanHospitals`) und der Export.
 */
function coerce(raw: unknown): OrgProfile {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >
  return {
    headerSubtitle:
      typeof p.headerSubtitle === 'string' ? p.headerSubtitle : '',
    hospitals: Array.isArray(p.hospitals)
      ? p.hospitals.map((h) => (typeof h === 'string' ? h : ''))
      : [],
    defaultPlanner:
      typeof p.defaultPlanner === 'string' ? p.defaultPlanner : '',
  }
}

function load(): OrgProfile {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? coerce(JSON.parse(raw)) : { ...NEUTRAL_PROFILE }
  } catch {
    return { ...NEUTRAL_PROFILE }
  }
}

/** Neutral = keine Personalisierung hinterlegt (Auslieferungszustand). */
function istNeutral(p: OrgProfile): boolean {
  return (
    !p.headerSubtitle.trim() &&
    cleanHospitals(p.hospitals).length === 0 &&
    !p.defaultPlanner.trim()
  )
}

function persist(p: OrgProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* Privat-Modus o. ä. — Profil gilt dann nur für die Sitzung. */
  }
  // Zusätzlich als Datei sichern (übersteht Browser-Speicher-Löschungen,
  // s. lib/lokaleSicherung). Neutral wird nicht gesichert — sonst legte
  // jede unpersonalisierte Sitzung eine leere Sicherung an.
  if (!istNeutral(p)) sicherungSchreiben('profil', JSON.stringify(p))
}

/** Nur die reinen Datenfelder (ohne UI-Flags/Setter). */
function profileData(p: OrgProfile): OrgProfile {
  return {
    headerSubtitle: p.headerSubtitle,
    hospitals: p.hospitals,
    defaultPlanner: p.defaultPlanner,
  }
}

/** Standorte ohne Leerzeilen (fürs Dropdown und den Export). */
export function cleanHospitals(list: string[]): string[] {
  return list.map((h) => h.trim()).filter((h) => h !== '')
}

interface OrgProfileState extends OrgProfile {
  /** Einstellungsdialog offen. */
  dialogOpen: boolean
  setDialogOpen(v: boolean): void
  setProfile(patch: Partial<OrgProfile>): void
  /** Aus importiertem JSON übernehmen (unbekannte Felder werden verworfen). */
  importProfile(raw: unknown): void
  /** Auf den neutralen Auslieferungs-Stand zurücksetzen. */
  resetProfile(): void
}

export const useOrgProfileStore = create<OrgProfileState>((set) => ({
  ...load(),
  dialogOpen: false,
  setDialogOpen: (v) => set({ dialogOpen: v }),
  setProfile: (patch) =>
    set((s) => {
      const next = coerce({ ...profileData(s), ...patch })
      persist(next)
      return next
    }),
  importProfile: (raw) =>
    set(() => {
      const next = coerce(raw)
      persist(next)
      return next
    }),
  resetProfile: () =>
    set(() => {
      persist(NEUTRAL_PROFILE)
      // Bewusst zurückgesetzt = Datei-Sicherung löschen (sonst käme das
      // Profil beim nächsten Start von selbst wieder).
      sicherungLoeschen('profil')
      return { ...NEUTRAL_PROFILE }
    }),
}))

/** Nicht-reaktiver Zugriff (pdfExport, Store-Initialisierung). */
export function getOrgProfile(): OrgProfile {
  return profileData(useOrgProfileStore.getState())
}

/**
 * Beim App-Start: Ist das Profil neutral (z. B. weil eine Klinik-Richtlinie
 * den Browser-Speicher beim Schließen geleert hat), aus der lokalen
 * Datei-Sicherung wiederherstellen. Personalisierte Zustände bleiben
 * unangetastet (die Sicherung überschreibt nie vorhandene Eingaben).
 */
export async function initOrgProfileSicherung(): Promise<void> {
  if (!istNeutral(getOrgProfile())) return
  const bytes = await sicherungLaden('profil')
  if (!bytes) return
  try {
    const raw: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const p = coerce(raw)
    if (!istNeutral(p)) useOrgProfileStore.getState().importProfile(p)
  } catch {
    /* defekte Sicherungsdatei — ignorieren, App läuft neutral weiter */
  }
}
