/**
 * Datenschutz-sichere Laufzeit-Diagnose zum „Monitoren" von Bugs.
 *
 * Erfasst einen Schnappschuss des Programmzustands (Geometrie, Flags, Kamera,
 * letzte Fehler) — KEINE Patientennamen, KEINE Bildpixel, kein DICOM. Der
 * Nutzer kopiert den Bericht per Knopf in die Zwischenablage und schickt ihn;
 * damit lassen sich sonst schwer reproduzierbare Zustände (z. B. „Schaft
 * plötzlich unsichtbar") nachträglich einkreisen.
 */
import { useViewerStore } from '../state/viewerStore'
import { useTemplateStore } from '../state/templateStore'
import { useKneeTemplateStore } from '../state/kneeTemplateStore'
import { useHipStore } from '../state/hipStore'
import { useKneeStore } from '../state/kneeStore'
import { useTemplatePackageStore } from '../state/templatePackageStore'
import { getViewport } from './cornerstone/viewer'

const LOG_MAX = 40
const errorLog: string[] = []

function pushLog(line: string): void {
  errorLog.push(line.slice(0, 300))
  if (errorLog.length > LOG_MAX) errorLog.shift()
}

/**
 * Globale Fehler-Erfassung (einmal beim Start aufrufen). Sammelt unbehandelte
 * Fehler, Promise-Rejections und `console.error` in einen Ringpuffer.
 */
export function installErrorCapture(): void {
  window.addEventListener('error', (e) => {
    pushLog(
      `[error] ${e.message}${e.filename ? ` @ ${shortPath(e.filename)}:${e.lineno}` : ''}`,
    )
  })
  window.addEventListener('unhandledrejection', (e) => {
    pushLog(`[promise] ${String((e as PromiseRejectionEvent).reason)}`)
  })
  const orig = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    try {
      pushLog(`[console.error] ${args.map((a) => safeStr(a)).join(' ')}`)
    } catch {
      /* Diagnose darf nie selbst werfen. */
    }
    orig(...args)
  }
}

/** Manueller Diagnose-Eintrag aus dem UI (z. B. Bild-Ladefehler im Overlay),
 *  der sonst nicht über window.onerror käme. Landet im Fehler-Log der Diagnose. */
export function logDiagnostic(msg: string): void {
  pushLog(`[render] ${msg}`)
}

function safeStr(a: unknown): string {
  if (a instanceof Error) return a.message
  if (typeof a === 'string') return a
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}
const shortPath = (s: string): string => s.replace(/^.*\//, '')
const p3 = (p?: ArrayLike<number> | null): string =>
  p ? `[${Array.from(p).map((n) => Math.round(n)).join(',')}]` : 'null'

/**
 * Baut einen Diagnose-Bericht (Geometrie/Flags, keine Patientendaten).
 */
export function buildDiagnostics(nowIso: string): string {
  const v = useViewerStore.getState()
  const tpl = useTemplateStore.getState()
  const kt = useKneeTemplateStore.getState()
  const hip = useHipStore.getState()
  const knee = useKneeStore.getState()
  const vp = getViewport()
  let cam: ReturnType<NonNullable<typeof vp>['getCamera']> | null = null
  try {
    cam = vp?.getCamera() ?? null
  } catch {
    cam = null
  }

  const L: string[] = []
  L.push('=== CendovaPlan Diagnose ===')
  L.push(`Zeit: ${nowIso}`)
  L.push(`Modus: ${v.planningMode} · Bild geladen: ${v.hasImage ? 'ja' : 'nein'}`)
  if (v.imageMeta) {
    L.push(
      `Bild: ${v.imageMeta.columns}x${v.imageMeta.rows} px · PixelSpacing: ${v.imageMeta.pixelSpacing ?? '–'}`,
    )
  }
  L.push(
    `Kalibrierung: ${
      v.calibration
        ? `${v.calibration.mmPerWorldUnit} mm/WE, Ref ${v.calibration.referenceMm} mm`
        : 'nicht gesetzt'
    }`,
  )
  L.push(`Viewport: ${vp ? 'ok' : 'NULL (verloren?)'}`)
  if (cam) {
    L.push(
      `Kamera: scale ${num(cam.parallelScale)} · pos ${p3(cam.position)} · focal ${p3(cam.focalPoint)}`,
    )
  }

  // Schäfte zuerst — der gemeldete „unsichtbar"-Fall.
  L.push(`Schäfte (${tpl.stems.length}):`)
  for (const s of tpl.stems) {
    L.push(
      `  ${s.id} ${s.side} sichtbar=${s.visible} rot=${num(s.rotationDeg)} kat=${s.catalogIndex}/gr${s.sizeIndex}/hals${s.headOffsetIndex} head=${p3(s.headCenter)} femurAxis=${s.femurAxis ? 'ja' : 'null'}`,
    )
  }
  L.push(`Pfannen (${tpl.templates.length}):`)
  for (const c of tpl.templates) {
    L.push(
      `  ${c.id} ${c.side} sichtbar=${c.visible} rot=${num(c.rotationDeg)} kat=${c.catalogIndex}/gr${c.sizeIndex} center=${p3(c.center)}`,
    )
  }
  L.push(
    `Knie-Schablonen: ${kt.templates.length} · Hüft-Messungen: ${hip.measurements.length} · Knie-Messungen: ${knee.measurements.length}`,
  )
  const pkg = useTemplatePackageStore.getState().info
  L.push(
    `Schablonen-Paket: ${pkg ? `${pkg.name} (${pkg.imageCount} Bilder)` : 'keins (eingebaute Daten)'}`,
  )

  L.push(`Fehler-Log (${errorLog.length}, letzte 15):`)
  const tail = errorLog.slice(-15)
  if (tail.length === 0) L.push('  (keine erfasst)')
  for (const e of tail) L.push(`  ${e}`)
  return L.join('\n')
}

const num = (n?: number): string => (typeof n === 'number' ? n.toFixed(1) : '–')

/** Baut die Diagnose und sichert sie MEHRFACH ab, damit sie zuverlässig
 *  beim Nutzer ankommt: (1) Datei-Download in „Downloads" (klar auffindbar),
 *  (2) Zwischenablage (zum direkten Einfügen), (3) Konsole (F12-Fallback).
 *  Gibt den Text zurück. */
export async function captureDiagnostics(nowIso: string): Promise<string> {
  const text = buildDiagnostics(nowIso)
  // 1) Konsole — immer abrufbar (F12 → Konsole), selbst wenn alles andere blockt.
  // eslint-disable-next-line no-console
  console.log('[CendovaPlan Diagnose]\n' + text)
  // 2) Datei-Download — landet sichtbar im Download-Ordner.
  try {
    const safe = nowIso.replace(/[:.]/g, '-')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CendovaPlan-Diagnose-${safe}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    /* Download evtl. blockiert — Zwischenablage/Konsole bleiben. */
  }
  // 3) Zwischenablage — zum direkten Einfügen in eine Nachricht.
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* Zwischenablage evtl. blockiert. */
  }
  return text
}
