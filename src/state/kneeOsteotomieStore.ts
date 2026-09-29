import { create } from 'zustand'
import type { Types } from '@cornerstonejs/core'
import {
  klemme,
  OSTEOTOMIE_GRENZEN,
  osteotomieTyp,
  type Knochen,
  type OsteotomieTyp,
} from '../lib/knee/osteotomie'

type P = Types.Point3

/**
 * Planungsdaten der Umstellungsosteotomie (Knie, Abschnitt 6).
 *
 * Gespeichert werden NUR die Eingaben (Typ, Ziel, Scharnier-/Startpunkte,
 * Optionen) — alle Ergebnisse rechnet `planeOsteotomie` bei jedem Bild
 * neu aus der aktuellen Vollvermessung. So bleiben Plan und Messung nie
 * gegeneinander veraltet, wenn ein Landmarkenpunkt verschoben wird.
 */
export interface OsteotomiePlan {
  typ: OsteotomieTyp
  zielWblProzent: number
  /** DLO: Ziel-mLDFA des femoralen Anteils (Paley-Mittelwert 88°). */
  dloZielLdfa: number
  /** ΔJLCA (Valgusstress − Stand) für die Laxitätskorrektur; null = aus. */
  deltaJlca: number | null
  bildSimulation: boolean
  sichtbar: boolean
  femurScharnier: P | null
  femurStart: P | null
  tibiaScharnier: P | null
  tibiaStart: P | null
}

export type PunktSlot = 'femurScharnier' | 'femurStart' | 'tibiaScharnier' | 'tibiaStart'

/** Klick-Reihenfolge je Typ: Femur vor Tibia, je Scharnier vor Start. */
export function benoetigteSlots(typ: OsteotomieTyp): PunktSlot[] {
  const slots: PunktSlot[] = []
  for (const k of osteotomieTyp(typ).knochen) {
    slots.push(k === 'Femur' ? 'femurScharnier' : 'tibiaScharnier')
    slots.push(k === 'Femur' ? 'femurStart' : 'tibiaStart')
  }
  return slots
}

export const SLOT_TEXT: Record<PunktSlot, string> = {
  femurScharnier: 'Femur — Scharnierpunkt',
  femurStart: 'Femur — Startpunkt der Osteotomie (Gegenkortikalis)',
  tibiaScharnier: 'Tibia — Scharnierpunkt',
  tibiaStart: 'Tibia — Startpunkt der Osteotomie (Gegenkortikalis)',
}

export function slotKnochen(slot: PunktSlot): Knochen {
  return slot.startsWith('femur') ? 'Femur' : 'Tibia'
}

interface KneeOsteotomieState {
  plan: OsteotomiePlan | null
  /** Aktuell zu setzender Punkt; null = kein Setz-Modus. */
  setzen: PunktSlot | null

  /** Legt einen Plan an (Typ + Ziel aus der Vorauswahl) und startet das Setzen. */
  starte: (typ: OsteotomieTyp, zielWblProzent: number) => void
  setTyp: (typ: OsteotomieTyp) => void
  setZiel: (prozent: number) => void
  setDloZielLdfa: (grad: number) => void
  setDeltaJlca: (grad: number | null) => void
  setBildSimulation: (v: boolean) => void
  setSichtbar: (v: boolean) => void
  /** Setzt den aktuellen Slot und springt zum nächsten fehlenden. */
  setzePunkt: (p: P) => void
  /** Verschiebt einen bereits gesetzten Punkt (Ziehen). */
  verschiebePunkt: (slot: PunktSlot, p: P) => void
  /** Letzten gesetzten Punkt zurücknehmen (← Zurück im Schritt-Banner). */
  zurueck: () => void
  /** Alle Punkte des aktuellen Typs neu setzen. */
  punkteNeu: () => void
  /** Nur die noch fehlenden Punkte setzen (z. B. nach Typwechsel auf DLO). */
  setzeFehlende: () => void
  /** Setz-Modus abbrechen, Plan behalten. */
  abbrechenSetzen: () => void
  verwerfen: () => void
  reset: () => void
}

function naechsterFehlender(plan: OsteotomiePlan): PunktSlot | null {
  return benoetigteSlots(plan.typ).find((s) => plan[s] == null) ?? null
}

export const useKneeOsteotomieStore = create<KneeOsteotomieState>((set, get) => ({
  plan: null,
  setzen: null,

  starte: (typ, zielWblProzent) => {
    const plan: OsteotomiePlan = {
      typ,
      zielWblProzent,
      dloZielLdfa: 88,
      deltaJlca: null,
      bildSimulation: true,
      sichtbar: true,
      femurScharnier: null,
      femurStart: null,
      tibiaScharnier: null,
      tibiaStart: null,
    }
    set({ plan, setzen: naechsterFehlender(plan) })
  },

  setTyp: (typ) => {
    const alt = get().plan
    if (!alt) return
    const plan = { ...alt, typ }
    // Nicht automatisch in den Setz-Modus springen: Der Typwechsel ist oft
    // nur ein Vergleich — fehlende Punkte meldet das Panel.
    set({ plan, setzen: get().setzen ? naechsterFehlender(plan) : null })
  },
  // Geklemmt auf die Import-Grenzen: Was die App speichert, lädt sie auch
  // wieder. Nicht-endliche Werte (leeres Feld, Tippfehler) ändern nichts.
  setZiel: (ziel) =>
    set((s) =>
      s.plan && Number.isFinite(ziel)
        ? { plan: { ...s.plan, zielWblProzent: klemme(ziel, OSTEOTOMIE_GRENZEN.zielWblProzent) } }
        : s,
    ),
  setDloZielLdfa: (ldfa) =>
    set((s) =>
      s.plan && Number.isFinite(ldfa)
        ? { plan: { ...s.plan, dloZielLdfa: klemme(ldfa, OSTEOTOMIE_GRENZEN.dloZielLdfa) } }
        : s,
    ),
  setDeltaJlca: (delta) =>
    set((s) =>
      s.plan && (delta === null || Number.isFinite(delta))
        ? {
            plan: {
              ...s.plan,
              deltaJlca: delta === null ? null : klemme(delta, OSTEOTOMIE_GRENZEN.deltaJlca),
            },
          }
        : s,
    ),
  setBildSimulation: (bildSimulation) =>
    set((s) => (s.plan ? { plan: { ...s.plan, bildSimulation } } : s)),
  setSichtbar: (sichtbar) =>
    set((s) => (s.plan ? { plan: { ...s.plan, sichtbar } } : s)),

  setzePunkt: (p) => {
    const { plan, setzen } = get()
    if (!plan || !setzen) return
    const neu = { ...plan, [setzen]: p }
    set({ plan: neu, setzen: naechsterFehlender(neu) })
  },
  verschiebePunkt: (slot, p) =>
    set((s) => (s.plan ? { plan: { ...s.plan, [slot]: p } } : s)),
  zurueck: () => {
    const { plan, setzen } = get()
    if (!plan) return
    const slots = benoetigteSlots(plan.typ)
    const idx = setzen ? slots.indexOf(setzen) : slots.length
    if (idx <= 0) return
    const vorher = slots[idx - 1]
    set({ plan: { ...plan, [vorher]: null }, setzen: vorher })
  },
  punkteNeu: () => {
    const plan = get().plan
    if (!plan) return
    const leer = {
      ...plan,
      femurScharnier: null,
      femurStart: null,
      tibiaScharnier: null,
      tibiaStart: null,
    }
    set({ plan: leer, setzen: naechsterFehlender(leer) })
  },
  setzeFehlende: () => {
    const plan = get().plan
    if (plan) set({ setzen: naechsterFehlender(plan) })
  },
  abbrechenSetzen: () => set({ setzen: null }),
  verwerfen: () => set({ plan: null, setzen: null }),
  reset: () => set({ plan: null, setzen: null }),
}))
