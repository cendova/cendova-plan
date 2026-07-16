import { create } from 'zustand'
import type { Types } from '@cornerstonejs/core'
import { nextId } from '../lib/ids'


/** Eine frei platzierte Textnotiz auf dem Bild. */
export interface TextNote {
  id: string
  /** Position (oben-links) in Weltkoordinaten. */
  world: Types.Point3
  text: string
  fontSize: number
  color: string
  bold: boolean
  underline: boolean
}

/** Stilattribute einer Notiz, die geändert werden können. */
export type NoteStyle = Pick<
  TextNote,
  'fontSize' | 'color' | 'bold' | 'underline'
>

/** Auswählbare Standardfarben für Notizen. */
export const NOTE_COLORS = [
  '#fde047', // gelb
  '#f87171', // rot
  '#4ade80', // grün
  '#38bdf8', // blau
  '#ffffff', // weiß
]

interface NoteState {
  notes: TextNote[]
  /** Ob das Notiz-Werkzeug zum Platzieren scharf ist. */
  placing: boolean
  /** Aktuell ausgewählte Notiz. */
  selectedId: string | null

  setPlacing: (v: boolean) => void
  /** Legt eine Notiz an, wählt sie aus und schaltet das Werkzeug ab. */
  addNote: (world: Types.Point3) => void
  updateText: (id: string, text: string) => void
  updatePosition: (id: string, world: Types.Point3) => void
  updateStyle: (id: string, style: Partial<NoteStyle>) => void
  select: (id: string | null) => void
  remove: (id: string) => void
  reset: () => void
}

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  placing: false,
  selectedId: null,

  setPlacing: (v) => set({ placing: v }),

  addNote: (world) =>
    set((s) => {
      const note: TextNote = {
        id: nextId('note'),
        world,
        text: 'Notiz',
        fontSize: 16,
        color: '#fde047',
        bold: false,
        underline: false,
      }
      return {
        notes: [...s.notes, note],
        selectedId: note.id,
        placing: false,
      }
    }),

  updateText: (id, text) =>
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, text } : n)),
    })),

  updatePosition: (id, world) =>
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, world } : n)),
    })),

  updateStyle: (id, style) =>
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...style } : n)),
    })),

  select: (id) => set({ selectedId: id }),

  remove: (id) =>
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  reset: () => set({ notes: [], placing: false, selectedId: null }),
}))
