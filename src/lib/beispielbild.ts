/**
 * Beispielbilder für die Demo: lädt bei `?beispiel=huefte|knie` ein
 * mitgeliefertes Demo-DICOM (frei lizenzierte, anonymisierte Lehraufnahme —
 * Quellen/Lizenz: public/sample/LIESMICH.txt) und schaltet den passenden
 * Planungsmodus. So startet die Demo von cendova.de direkt mit einem Bild,
 * statt mit leerem Viewport.
 *
 * Fehler bleiben bewusst still — das Beispiel ist reiner Komfort, die App
 * funktioniert ohne genauso (dann greift der normale Leerzustand).
 */
import { loadFiles } from './cornerstone/viewer'
import { useViewerStore } from '../state/viewerStore'

const BEISPIELE = {
  huefte: { datei: 'beispiel-huefte.dcm', modus: 'hip' },
  knie: { datei: 'beispiel-knie.dcm', modus: 'knee' },
} as const

export async function beispielAusUrlLaden(): Promise<void> {
  const wunsch = new URLSearchParams(window.location.search).get('beispiel')
  const eintrag =
    wunsch && wunsch in BEISPIELE
      ? BEISPIELE[wunsch as keyof typeof BEISPIELE]
      : null
  if (!eintrag) return
  try {
    const antwort = await fetch(
      `${import.meta.env.BASE_URL}sample/${eintrag.datei}`,
    )
    if (!antwort.ok) return
    const blob = await antwort.blob()
    const datei = new File([blob], eintrag.datei, {
      type: 'application/dicom',
    })
    useViewerStore.getState().setPlanningMode(eintrag.modus)
    // Der Viewport braucht bis zum React-Mount einen Moment — kurz
    // wiederholen statt am Wettlauf mit dem App-Start zu scheitern.
    for (let versuch = 0; versuch < 10; versuch++) {
      try {
        await loadFiles([datei])
        useViewerStore
          .getState()
          .setStatus(
            `Beispielbild geladen (${eintrag.datei}) — anonymisierte Lehraufnahme, keine Patientendaten.`,
          )
        return
      } catch {
        await new Promise((r) => setTimeout(r, 300))
      }
    }
  } catch {
    /* still — siehe Kopfkommentar */
  }
}
