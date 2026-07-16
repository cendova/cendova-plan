import { useEffect, useReducer } from 'react'
import type { Types } from '@cornerstonejs/core'
import { getViewport } from './viewer'

/**
 * Hält Overlay-Komponenten mit der Cornerstone-Kamera synchron.
 *
 * Statt auf Cornerstone-Events zu vertrauen (die nicht bubbeln und am
 * exakten Viewport-Element hängen müssen), wird die Kamera pro Frame
 * geprüft. Nur bei echter Änderung — Zoom, Pan oder Größenänderung —
 * werden die Abonnenten re-rendert.
 *
 * EIN geteilter rAF-Loop für alle Overlays: Früher startete jede der
 * ~5 Overlay-Komponenten ihren eigenen Loop und fragte dieselbe Kamera
 * 60×/s separat ab. Jetzt gibt es pro Viewport-Getter genau eine
 * Abfrage pro Frame; der Loop läuft nur, solange Abonnenten existieren.
 *
 * `getVp`: welcher Viewport beobachtet wird. Default = Haupt-Pane
 * (`getViewport`). Für das zweite Knie-Pane wird `getViewport2` übergeben.
 * Beide sind stabile Modul-Funktionen, daher keine Re-Subscribe-Probleme.
 */
type VpGetter = () => Types.IStackViewport | null

interface Watcher {
  lastKey: string
  listeners: Set<() => void>
}

const watchers = new Map<VpGetter, Watcher>()
let rafId = 0

function cameraKey(vp: Types.IStackViewport): string {
  const cam = vp.getCamera()
  return [
    cam.parallelScale,
    cam.position?.join(','),
    cam.focalPoint?.join(','),
    vp.canvas.clientWidth,
    vp.canvas.clientHeight,
  ].join('|')
}

function loop() {
  for (const [getVp, watcher] of watchers) {
    const vp = getVp()
    if (!vp) continue
    try {
      const key = cameraKey(vp)
      if (key !== watcher.lastKey) {
        watcher.lastKey = key
        for (const notify of watcher.listeners) notify()
      }
    } catch {
      /* Viewport noch nicht bereit — nächster Frame versucht es erneut. */
    }
  }
  rafId = requestAnimationFrame(loop)
}

function subscribe(getVp: VpGetter, notify: () => void): () => void {
  let watcher = watchers.get(getVp)
  if (!watcher) {
    watcher = { lastKey: '', listeners: new Set() }
    watchers.set(getVp, watcher)
  }
  watcher.listeners.add(notify)
  if (!rafId) rafId = requestAnimationFrame(loop)
  return () => {
    watcher.listeners.delete(notify)
    if (watcher.listeners.size === 0) watchers.delete(getVp)
    if (watchers.size === 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }
}

export function useViewportSync(getVp: VpGetter = getViewport): number {
  const [tick, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribe(getVp, bump), [getVp])
  return tick
}
