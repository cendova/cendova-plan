/**
 * Speichert die im Browser-Tracer erfassten Konturen pro Implantat-
 * Kombination (kind + view). Persistiert in localStorage.
 *
 * Datenformat (v2): pro (kind, view) eine Liste von SUB-PFADEN. Jeder
 * Sub-Pfad hat einen Stil (fill = Außenkontur mit Füllung, line = nur
 * Linie für Features wie PS-Box oder Resektionsschnitte), einen
 * Closed-Flag (Polygon vs. Polyline) und seine Punkte.
 *
 * Migration: alte Einträge im v1-Format (TracedPoint[]) werden beim
 * Laden in einen einzigen Outline-Subpath gewrappt. Damit funktioniert
 * der Tracer ohne explizite User-Migration weiter.
 */
import { create } from 'zustand'
import type { KneeImplantKind } from '../lib/knee/smithNephewCatalog'
import type { KneeView } from './kneeTemplateStore'

export interface TracedPoint {
  x: number
  y: number
}

/**
 * Ein Sub-Pfad einer Implantat-Kontur. Mehrere Sub-Pfade pro Trace
 * erlauben es, neben der Außenkontur auch Innen-Strukturen wie die
 * PS-Box oder Resektionslinien einzufügen — wichtig für die klinische
 * Planung der Femur-Resektion.
 */
export interface TracedSubpath {
  /** Anzeige-Label im Tracer-UI (z. B. „Außenkontur", „PS-Box"). */
  label: string
  /** 'fill' = mit Füllung (typisch für die Außenkontur),
   *  'line' = nur Stroke (typisch für Features und Schnittlinien). */
  style: 'fill' | 'line'
  /** Geschlossen (Polygon) oder offen (Polyline)?  */
  closed: boolean
  /** Punkte in normalisierten Koordinaten ∈ [-1..+1]. */
  points: TracedPoint[]
}

/**
 * Trace-Aliase: manche Implantat-Varianten teilen sich EINE Kontur, weil
 * sie in der Aufsichts-/Profilform identisch sind und sich nur in nicht
 * gezeichneten Details unterscheiden. Beispiel: Genesis II Tibia Female
 * vs. Male-tapered — identische Aufsichts-Maße, nur anderes Konus-Profil
 * unten. Damit eine einzige Trace beide Varianten bedient, normalisieren
 * wir das `kind` auf einen kanonischen Schlüssel.
 */
const TRACE_ALIASES: Partial<Record<KneeImplantKind, KneeImplantKind>> = {
  'genesis-tibia-male': 'genesis-tibia-female',
}

function canonicalKind(kind: KneeImplantKind): KneeImplantKind {
  return TRACE_ALIASES[kind] ?? kind
}

/** Schlüssel pro Kombination (kind+view[+band]) — über den Alias
 *  kanonisiert. Das optionale `band` unterscheidet mehrere Konturen
 *  derselben (kind,view)-Kombination (z. B. Journey Femur lateral, dessen
 *  Zapfen-Position je Größenband springt). Ohne `band` bleibt der
 *  Schlüssel exakt wie zuvor → keine Migration bestehender Traces. */
function key(kind: KneeImplantKind, view: KneeView, band?: string): string {
  const base = `${canonicalKind(kind)}|${view}`
  return band ? `${base}|${band}` : base
}

const STORAGE_KEY = 'cendova.templateTracer.v1'
/** Vor dem Rename verwendeter Schlüssel (Alt-Arbeitsname) — Einmal-
 *  Migration in loadFromStorage, damit gespeicherte Traces erhalten bleiben. */
const STORAGE_KEY_ALT = 'endomicad.templateTracer.v1'

/**
 * Lädt die gespeicherten Traces. Erkennt das alte v1-Format
 * (TracedPoint[]) und migriert es zu einem einzigen Outline-Subpath.
 * Schreibt die migrierten Daten NICHT automatisch zurück — erst beim
 * nächsten `setTrace`-Aufruf landet das neue Format in localStorage.
 */
function loadFromStorage(): Record<string, TracedSubpath[]> {
  try {
    let raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // Einmal-Migration vom alten Schlüssel (Alt-Arbeitsname).
      raw = localStorage.getItem(STORAGE_KEY_ALT)
      if (raw !== null) {
        localStorage.setItem(STORAGE_KEY, raw)
        localStorage.removeItem(STORAGE_KEY_ALT)
      }
    }
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: Record<string, TracedSubpath[]> = {}
    for (const [k, v] of Object.entries(parsed)) {
      // Alte Keys auf den kanonischen Alias umziehen (z. B. eine unter
      // `genesis-tibia-male|…` gespeicherte Trace wandert auf
      // `genesis-tibia-female|…`). Verhindert verwaiste Einträge nach der
      // Alias-Einführung. Bei Kollision gewinnt der bereits kanonische Key.
      const canonKey = canonicalizeStorageKey(k)
      if (out[canonKey] && out[canonKey].length > 0) continue
      out[canonKey] = migrateValue(v)
    }
    return out
  } catch {
    return {}
  }
}

/** Wendet die Trace-Aliase auf einen gespeicherten `${kind}|${view}`-Key
 *  an, ohne die View zu verändern. */
function canonicalizeStorageKey(k: string): string {
  const sep = k.lastIndexOf('|')
  if (sep < 0) return k
  const kindPart = k.slice(0, sep) as KneeImplantKind
  const viewPart = k.slice(sep + 1)
  return `${canonicalKind(kindPart)}|${viewPart}`
}

/** Migriert einen einzelnen gespeicherten Wert auf das neue Format. */
function migrateValue(v: unknown): TracedSubpath[] {
  if (Array.isArray(v)) {
    if (v.length === 0) return []
    // Sub-Pfad-Array (neues Format) erkennen: jedes Element hat `points`.
    if (
      typeof v[0] === 'object' &&
      v[0] !== null &&
      'points' in (v[0] as object) &&
      Array.isArray((v[0] as { points: unknown }).points)
    ) {
      return v as TracedSubpath[]
    }
    // Altes Format (TracedPoint[]) → in Outline-Subpath wrappen.
    if (
      typeof v[0] === 'object' &&
      v[0] !== null &&
      'x' in (v[0] as object) &&
      'y' in (v[0] as object)
    ) {
      return [
        {
          label: 'Außenkontur',
          style: 'fill',
          closed: true,
          points: v as TracedPoint[],
        },
      ]
    }
  }
  return []
}

function saveToStorage(traces: Record<string, TracedSubpath[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(traces))
  } catch {
    // Quota voll oder Privatmodus — Daten gehen bei Reload verloren,
    // App funktioniert aber weiter.
  }
}

interface TracerState {
  /** Alle gespeicherten Konturen, gekeyt nach `${kind}|${view}[|band]`. */
  traces: Record<string, TracedSubpath[]>
  /** Modal-Open-State: null = zu, sonst aktuell zu tracendes Paar (+Band). */
  open: { kind: KneeImplantKind; view: KneeView; band?: string } | null

  /** Gibt die Sub-Pfade für eine Kombination (+Band) zurück (oder null). */
  getTrace: (
    kind: KneeImplantKind,
    view: KneeView,
    band?: string,
  ) => TracedSubpath[] | null
  /** Schreibt eine komplette Liste von Sub-Pfaden für eine Kombination. */
  setTrace: (
    kind: KneeImplantKind,
    view: KneeView,
    subpaths: TracedSubpath[],
    band?: string,
  ) => void
  deleteTrace: (kind: KneeImplantKind, view: KneeView, band?: string) => void
  /** Hat die Kombination (+Band) MINDESTENS einen Sub-Pfad mit >=3 Punkten? */
  hasTrace: (kind: KneeImplantKind, view: KneeView, band?: string) => boolean
  openTracer: (kind: KneeImplantKind, view: KneeView, band?: string) => void
  closeTracer: () => void
}

export const useTemplateTracerStore = create<TracerState>((set, get) => ({
  traces: loadFromStorage(),
  open: null,

  getTrace: (kind, view, band) => {
    const t = get().traces[key(kind, view, band)]
    return t && t.length > 0 ? t : null
  },

  setTrace: (kind, view, subpaths, band) =>
    set((s) => {
      const next = { ...s.traces, [key(kind, view, band)]: subpaths }
      saveToStorage(next)
      return { traces: next }
    }),

  deleteTrace: (kind, view, band) =>
    set((s) => {
      const next = { ...s.traces }
      delete next[key(kind, view, band)]
      saveToStorage(next)
      return { traces: next }
    }),

  hasTrace: (kind, view, band) => {
    const t = get().traces[key(kind, view, band)]
    return !!t && t.some((sp) => sp.points.length >= 3)
  },

  openTracer: (kind, view, band) => set({ open: { kind, view, band } }),
  closeTracer: () => set({ open: null }),
}))
