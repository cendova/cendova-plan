/**
 * Zentrale ID-Vergabe für alle Stores (`cup-3`, `kneeT-7`, …).
 *
 * Warum zentral: Die Stores hielten je einen privaten Modul-Zähler. Beim
 * Plan-LADEN wurden Items mit ihren gespeicherten IDs restauriert, der
 * Zähler blieb aber bei 0 — neu angelegte Items kollidierten dann mit
 * geladenen (`cup-1` doppelt → React-Key-Konflikt, Löschen trifft beide).
 * `ensureIdsAbove` hebt die Zähler nach jedem Plan-Load über alle
 * restaurierten IDs.
 */
const counters = new Map<string, number>()

/** Nächste eindeutige ID mit Präfix, z. B. nextId('cup') → 'cup-4'. */
export function nextId(prefix: string): string {
  const n = (counters.get(prefix) ?? 0) + 1
  counters.set(prefix, n)
  return `${prefix}-${n}`
}

/** Zähler so anheben, dass keine künftige nextId mit den übergebenen
 *  (z. B. aus einem Plan geladenen) IDs kollidiert. Fremdformatige IDs
 *  werden ignoriert. */
export function ensureIdsAbove(
  items: ReadonlyArray<{ id: string }> | undefined | null,
): void {
  if (!items) return
  for (const { id } of items) {
    const m = /^(.+)-(\d+)$/.exec(id)
    if (!m) continue
    const cur = counters.get(m[1]) ?? 0
    const num = Number(m[2])
    if (num > cur) counters.set(m[1], num)
  }
}
