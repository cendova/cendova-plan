/**
 * Wiederverwendbarer Icon-Button für die Header-Werkzeugleiste.
 *
 * Designentscheidung: Alle Icons werden als handgepflegte SVG-Pfade in
 * EINER Datei gehalten (statt eines Icon-Pakets als Dependency). Drei
 * Gründe:
 *  1) Wir brauchen nur eine Handvoll — Bundle-Größe und Versions-Pflege
 *     einer externen Lib wären überproportional.
 *  2) Die Stile (Strichstärke, Eck-Rundung) sollen über alle Icons
 *     KONSISTENT bleiben — am einfachsten, wenn sie in einer Datei stehen.
 *  3) Medical-UI: Icons sollten neutral und ablesbar sein, keine
 *     stilistischen Spielereien — also bewusst simple line-icons.
 *
 * Konvention: Alle Icons im 16×16-Viewbox, `stroke="currentColor"`,
 * `strokeWidth={1.5}` — so erbt die Farbe vom umgebenden Button.
 */
import type { ComponentProps } from 'react'

type SvgProps = ComponentProps<'svg'>

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconOpen(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Ordner-Symbol mit Pfeil nach oben (Upload/Datei wählen). */}
      <path d="M2 5h4l1 1.5h7v6.5H2z" />
      <path d="M8 10v-3M6 8.5l2-2 2 2" />
    </svg>
  )
}

export function IconPan(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Stilisierte Hand. */}
      <path d="M5 9V5.5a1 1 0 011-1 1 1 0 011 1V9" />
      <path d="M7 9V4.5a1 1 0 011-1 1 1 0 011 1V9" />
      <path d="M9 9V5a1 1 0 011-1 1 1 0 011 1v4" />
      <path d="M5 9V7a1 1 0 00-1-1 1 1 0 00-1 1v3.5c0 2 1.5 3.5 4 3.5h.5c2 0 3.5-1.5 3.5-3.5V9" />
    </svg>
  )
}

export function IconZoom(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Lupe mit Plus innen. */}
      <circle cx="6.5" cy="6.5" r="4" />
      <line x1="9.5" y1="9.5" x2="13.5" y2="13.5" />
      <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" />
      <line x1="6.5" y1="4.5" x2="6.5" y2="8.5" />
    </svg>
  )
}

export function IconWindowLevel(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Halbgefüllter Kreis (Kontrast/Helligkeit). */}
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5 A5.5 5.5 0 0 1 8 13.5 Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconCalibration(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Lineal mit Skalenstrichen. */}
      <rect x="2" y="6" width="12" height="4" rx="0.5" />
      <line x1="4" y1="6" x2="4" y2="8" />
      <line x1="6" y1="6" x2="6" y2="9" />
      <line x1="8" y1="6" x2="8" y2="8" />
      <line x1="10" y1="6" x2="10" y2="9" />
      <line x1="12" y1="6" x2="12" y2="8" />
    </svg>
  )
}

export function IconLength(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Strecke mit zwei Endpunkten. */}
      <line x1="3" y1="13" x2="13" y2="3" />
      <circle cx="3" cy="13" r="1.5" />
      <circle cx="13" cy="3" r="1.5" />
    </svg>
  )
}

export function IconAngle(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Winkel mit kleinem Bogen am Scheitel. */}
      <path d="M3 13 L13 13 L3 3" />
      <path d="M9 13 A5 5 0 0 0 5 9" />
    </svg>
  )
}

export function IconNote(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Sprechblase / Notizzettel. */}
      <path d="M3 4h10v6H7l-3 2.5V10H3z" />
      <line x1="5.5" y1="6.5" x2="10.5" y2="6.5" />
      <line x1="5.5" y1="8" x2="9" y2="8" />
    </svg>
  )
}

export function IconSave(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Stilisierte Diskette mit Pfeil nach unten. */}
      <path d="M3 3h7l3 3v7H3z" />
      <path d="M5 3v3h5V3" />
      <path d="M8 8.5v3.5M6.5 10.5l1.5 1.5 1.5-1.5" />
    </svg>
  )
}

export function IconOpenPlan(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Ordner mit Pfeil-nach-unten (Plan laden). */}
      <path d="M2 5h4l1 1.5h7v6.5H2z" />
      <path d="M8 7v3.5M6.5 9l1.5 1.5 1.5-1.5" />
    </svg>
  )
}

export function IconPdf(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Dokument mit „PDF"-Text. */}
      <path d="M3.5 2h6L13 5.5v8.5H3.5z" />
      <path d="M9.5 2v3.5H13" />
      <text
        x="8"
        y="11.5"
        textAnchor="middle"
        fontSize="3.6"
        fontWeight="bold"
        fontFamily="sans-serif"
        fill="currentColor"
        stroke="none"
      >
        PDF
      </text>
    </svg>
  )
}

export function IconHelp(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Fragezeichen im Kreis: Hilfetexte ein/aus. */}
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.2a1.8 1.8 0 1 1 2.6 1.6c-.5.3-.8.6-.8 1.2v.3" />
      <circle cx="8" cy="11.4" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconReset(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Kreispfeil: Planung zurücksetzen. */}
      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
      <path d="M13 2.8v2.4h-2.4" />
    </svg>
  )
}

export function IconPackage(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Schablonen-Paket: Box mit Deckelkante. */}
      <path d="M2.5 5.2L8 2.5l5.5 2.7v5.6L8 13.5l-5.5-2.7z" />
      <path d="M2.5 5.2L8 7.9l5.5-2.7" />
      <line x1="8" y1="7.9" x2="8" y2="13.5" />
    </svg>
  )
}

export function IconClipboard(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Klemmbrett mit Zeilen (Planungs-/OP-Daten). */}
      <path d="M4.5 3.5h7v10h-7z" />
      <rect x="6" y="2.3" width="4" height="2.2" rx="0.6" />
      <line x1="6" y1="7" x2="10" y2="7" />
      <line x1="6" y1="9.3" x2="10" y2="9.3" />
      <line x1="6" y1="11.6" x2="8.5" y2="11.6" />
    </svg>
  )
}

export function IconSettings(props: SvgProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} {...props}>
      {/* Zahnrad (Einrichtung/Personalisierung). */}
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
    </svg>
  )
}

// ----------------------------------------------------------------------
// Einheitlicher Icon-Button.
//
// `statusDot` setzt einen kleinen farbigen Punkt rechts oben (für
// „Kalibriert ✓"). `active` hebt den Button visuell hervor.
// ----------------------------------------------------------------------
export interface ToolIconButtonProps {
  icon: React.ReactNode
  title: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  /** Farbe des Status-Punkts (Tailwind text-/bg-Klasse), z. B. 'bg-emerald-500'. */
  statusDot?: string
}

export function ToolIconButton({
  icon,
  title,
  active,
  disabled,
  onClick,
  statusDot,
}: ToolIconButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={[
        'relative flex h-7 w-7 items-center justify-center rounded transition',
        active
          ? 'bg-sky-700/40 text-sky-200 ring-1 ring-sky-600'
          : 'text-neutral-400 hover:bg-neutral-800 hover:text-sky-300',
        disabled ? 'cursor-not-allowed text-neutral-700 hover:bg-transparent hover:text-neutral-700' : '',
      ].join(' ')}
    >
      {icon}
      {statusDot && (
        <span
          className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${statusDot}`}
        />
      )}
    </button>
  )
}
