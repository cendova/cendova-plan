import type { ReactNode } from 'react'

/**
 * Roter Bestätigungs-Dialog für destruktive Aktionen (Planung zurücksetzen,
 * „Alle löschen" …) — EIN Muster für alle Stellen (UX-Befund P1-5: Löschen
 * war teils ohne Rückfrage, während der mildere Gesamt-Reset eine hatte).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm(): void
  onCancel(): void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[26rem] max-w-[90vw] rounded-lg border border-red-800 bg-neutral-950 p-4 shadow-xl"
      >
        <div className="mb-2 text-sm font-semibold text-red-300">{title}</div>
        <div className="mb-4 text-xs leading-relaxed text-neutral-300">
          {children}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-800"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
