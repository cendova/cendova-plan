/**
 * Hinweis „Kein Schablonen-Paket geladen" — EINE Quelle für beide Leisten.
 *
 * Er stand als wortgleiches Literal in der Toolbar UND im TemplatesPanel;
 * der Toolbar-Kommentar versprach sogar „Formulierung wie im rechten
 * TemplatesPanel". Genau solche Doppelungen sind in der Konsistenz-Runde
 * mehrfach auseinandergelaufen — deshalb jetzt eine Komponente, der
 * Abstand kommt von der Einbaustelle.
 */
export function KeinPaketHinweis({ className = 'mb-1' }: { className?: string }) {
  return (
    <p
      className={`mx-1 rounded border border-amber-800/60 bg-amber-950/40 px-2 py-1.5 text-[11px] leading-snug text-amber-300 ${className}`}
    >
      Kein Schablonen-Paket geladen — Schablonen sind erst nach dem Import
      verfügbar (Paket-Symbol oben in der Kopfzeile). Messen geht auch ohne.
    </p>
  )
}
