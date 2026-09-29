/**
 * Gemeinsame Bausteine der rechten Spalte — damit alle Module (Hüfte,
 * Knie, Schulter, Prothesen- und Osteotomieplanung) gleich aussehen
 * (Realtest 29.09.2026: „sehr voll und uneinheitlich").
 *
 * Gestaltungsregeln, hier an EINER Stelle festgelegt:
 *  - Karte: Titel links (normal geschrieben — Versalien bleiben den
 *    Abschnitten der Spalte vorbehalten und wären für „Morphologie &
 *    Fixation" neben der Kennung zu breit), Kennung (Klasse, Typ) rechts;
 *    der Titel kürzt sich, die Kennung bricht nie um — beide überlappen nie.
 *  - Kennwerte: Tabelle „Bezeichnung | Wert(e)", Werte rechtsbündig in
 *    Tabellenziffern. Erste Wertspalte = gemessen (hell), weitere =
 *    geplant (grün — dieselbe Farbe wie der geplante Punkt der Matrizen).
 *    Fehlender Wert = gedämpfter Strich, nie „0".
 *  - Ampel nur als Punkt vor der Bezeichnung: grün = im Normbereich,
 *    amber = außerhalb; der Normbereich steht klein daneben.
 *  - Zahlen kommen ausschließlich aus lib/zahlFormat.ts.
 */
import type { ReactNode } from 'react'

export function Karte({
  titel,
  kennung,
  children,
  fuss,
}: {
  titel: string
  /** Rechts im Kopf: Klasse/Typ. Bricht nie um. */
  kennung?: ReactNode
  children: ReactNode
  /** Klein unter einer Trennlinie: Quelle, Einschränkung, Planungshinweis. */
  fuss?: ReactNode
}) {
  return (
    <section className="rounded border border-neutral-800 bg-neutral-950 p-2">
      <header className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3
          className="min-w-0 truncate text-xs font-semibold text-neutral-200"
          title={titel}
        >
          {titel}
        </h3>
        {kennung != null && (
          <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-violet-300">
            {kennung}
          </span>
        )}
      </header>
      {children}
      {fuss != null && (
        <div className="mt-1.5 border-t border-neutral-800 pt-1 text-[9px] leading-snug text-neutral-500">
          {fuss}
        </div>
      )}
    </section>
  )
}

export interface KennwertZeile {
  label: ReactNode
  /** Werte je Spalte; `null` = nicht bestimmbar/nicht geplant → „—". */
  werte: (string | null)[]
  /** Optional je Spalte eine kleine Zeile UNTER dem Wert (z. B. die
   *  Richtung „5,1° Varus" unter dem mHKA) — spart eine eigene Zeile, die
   *  dieselbe Größe nur anders ausdrückt. */
  unter?: (string | null)[]
  /** Ampel vor der Bezeichnung. */
  status?: 'normal' | 'auffaellig'
  /** Klein hinter der Bezeichnung: Normbereich („85–90°"), abgeleitete
   *  Klasse („coxa norma") oder Vorzeichen-Legende („+ länger"). */
  norm?: ReactNode
  /** Tooltip der Zeile (Definition, Normquelle). */
  titel?: string
  /** Wert hervorheben (z. B. Ergebniszeile einer Bilanz). */
  betont?: boolean
}

export function Kennwerte({
  spalten,
  zeilen,
}: {
  /** Spaltenköpfe über den Werten (z. B. „gemessen", „geplant"). */
  spalten?: string[]
  zeilen: KennwertZeile[]
}) {
  const n = Math.max(1, spalten?.length ?? 0, ...zeilen.map((z) => z.werte.length))
  const mitAmpel = zeilen.some((z) => z.status != null)
  return (
    <div
      className="grid items-baseline gap-x-2 gap-y-0.5 tabular-nums"
      style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${n}, auto)` }}
    >
      {spalten && (
        <>
          <span />
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className="text-right text-[9px] uppercase tracking-wider text-neutral-500">
              {spalten[i] ?? ''}
            </span>
          ))}
        </>
      )}
      {zeilen.map((z, zi) => (
        <div key={zi} className="contents" title={z.titel}>
          <span className="flex min-w-0 items-baseline gap-1 text-[11px] text-neutral-400">
            {mitAmpel && (
              <span
                className={[
                  'inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full',
                  z.status === 'normal'
                    ? 'bg-emerald-500'
                    : z.status === 'auffaellig'
                      ? 'bg-amber-500'
                      : 'bg-transparent',
                ].join(' ')}
              />
            )}
            {/* Wird es eng (zweite Wertspalte), bricht der Zusatz unter die
                Bezeichnung um, statt sie abzuschneiden. */}
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-1">
              <span className="min-w-0 max-w-full truncate">{z.label}</span>
              {z.norm && (
                <span className="shrink-0 text-[9px] leading-tight text-neutral-600">{z.norm}</span>
              )}
            </span>
          </span>
          {Array.from({ length: n }, (_, i) => {
            const w = z.werte[i]
            const farbe =
              w == null
                ? 'text-neutral-600'
                : i === 0
                  ? z.status === 'auffaellig'
                    ? 'text-amber-200'
                    : 'text-neutral-100'
                  : 'text-emerald-300'
            const u = z.unter?.[i]
            return (
              <span
                key={i}
                className={[
                  'whitespace-nowrap text-right text-xs',
                  farbe,
                  z.betont ? 'font-semibold' : '',
                ].join(' ')}
              >
                {w ?? '—'}
                {u != null && (
                  <span className="block text-[9px] leading-tight opacity-70">{u}</span>
                )}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Hinweis-Kasten: warning = rot, caution = amber, info = neutral. */
export function Hinweis({
  stufe,
  children,
  belege,
}: {
  stufe: 'warning' | 'caution' | 'info'
  children: ReactNode
  /** Kleine Belegzeile (Messwerte, Quelle). */
  belege?: ReactNode
}) {
  return (
    <div
      className={[
        'mt-1.5 rounded border p-1.5 text-[10px] leading-relaxed',
        stufe === 'warning'
          ? 'border-red-900/60 bg-red-950/30 text-red-200'
          : stufe === 'caution'
            ? 'border-amber-900/60 bg-amber-950/30 text-amber-200'
            : 'border-neutral-800 bg-neutral-900/60 text-neutral-300',
      ].join(' ')}
    >
      {children}
      {belege != null && <div className="mt-0.5 text-[9px] opacity-70">{belege}</div>}
    </div>
  )
}

/** Trennlinie + Abstand zwischen Abschnitten innerhalb einer Karte. */
export function Abschnitt({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 border-t border-neutral-800 pt-1.5">{children}</div>
}
