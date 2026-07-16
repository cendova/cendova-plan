import { create } from 'zustand'

/**
 * UI-Einstellungen (kein Planungsinhalt!): Hilfetexte, eingeklappte
 * Toolbar-Sektionen. localStorage-persistiert (Muster wie planningMode im
 * viewerStore) — bewusst NICHT in der Plan-JSON (serialize.ts schließt
 * UI-State aus).
 */

const HINTS_KEY = 'cendova.showHints'
const SECTIONS_KEY = 'cendova.toolbarSections'

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function saveBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* Privat-Modus o. ä. — Einstellung gilt dann nur für die Sitzung. */
  }
}

function loadSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, boolean>)
      : {}
  } catch {
    return {}
  }
}

interface UiState {
  /** Erklär-/Tutorial-Texte anzeigen (für erfahrene Nutzer abschaltbar). */
  showHints: boolean
  toggleHints(): void
  /** Toolbar-Sektionen: nur EXPLIZITE Nutzer-Entscheidungen (true =
   *  zugeklappt); fehlt der Eintrag, gilt der dynamische Default der
   *  Sektion (z. B. „Einzel-Messungen zu, sobald Vollvermessung da"). */
  collapsedSections: Record<string, boolean>
  setSectionCollapsed(id: string, collapsed: boolean): void
  /** Verwirft die gespeicherte manuelle Wahl einer Sektion — der
   *  dynamische Default gilt wieder. Wird beim „Erledigt"-Übergang
   *  aufgerufen (Auto-Einklappen), damit eine alte manuelle Wahl die
   *  Sektion nicht für immer offen hält (Debug-Runde 3). */
  clearSectionChoice(id: string): void
}

export const useUiStore = create<UiState>((set) => ({
  showHints: loadBool(HINTS_KEY, true),
  toggleHints: () =>
    set((s) => {
      const next = !s.showHints
      saveBool(HINTS_KEY, next)
      return { showHints: next }
    }),
  collapsedSections: loadSections(),
  setSectionCollapsed: (id, collapsed) =>
    set((s) => {
      const next = { ...s.collapsedSections, [id]: collapsed }
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next))
      } catch {
        /* s. o. */
      }
      return { collapsedSections: next }
    }),
  clearSectionChoice: (id) =>
    set((s) => {
      if (!(id in s.collapsedSections)) return s
      const next = { ...s.collapsedSections }
      delete next[id]
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next))
      } catch {
        /* s. o. */
      }
      return { collapsedSections: next }
    }),
}))
