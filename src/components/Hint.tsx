import type { ReactNode } from 'react'
import { useUiStore } from '../state/uiStore'

/**
 * Hüllt Erklär-/Tutorial-Texte: gerendert nur, wenn „Hilfetexte" aktiv
 * sind („?"-Button in der Kopfzeile). Status-/Warnhinweise (unkalibriert,
 * Fehler, Paket fehlt) gehören NICHT hier hinein — die müssen immer
 * sichtbar bleiben.
 */
export function Hint({ children }: { children: ReactNode }) {
  const show = useUiStore((s) => s.showHints)
  if (!show) return null
  return <>{children}</>
}
