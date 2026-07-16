import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { installErrorCapture } from './lib/diagnostics'
import * as templateRegistry from './lib/templates/registry'

// Fehler-/Diagnose-Erfassung so früh wie möglich starten (Ringpuffer für den
// „Diagnose"-Knopf in der Fußzeile).
installErrorCapture()

// Schablonen-Paket (falls eins importiert wurde) aus der IndexedDB laden —
// asynchron, blockiert den App-Start nicht. Bis dahin (und ohne Paket)
// gelten die eingebauten Schablonen-Daten.
void templateRegistry.initTemplateRegistry()

// Dev-Helper: Stores aufs window legen, damit man sie in der Browser-
// Konsole inspizieren/manipulieren kann (z. B. für E2E-Tests oder
// schnelles Debugging). Nur in DEV aktiv.
if (import.meta.env.DEV) {
  // Registry für den Headless-Import-Test (scripts/test-template-import.mjs).
  ;(window as unknown as Record<string, unknown>).__templateRegistry =
    templateRegistry
  Promise.all([
    import('./state/viewerStore'),
    import('./state/hipStore'),
    import('./state/kneeStore'),
    import('./state/kneeTemplateStore'),
    import('./state/templateStore'),
    import('./state/noteStore'),
  ]).then(([viewer, hip, knee, kneeTpl, template, note]) => {
    ;(window as unknown as Record<string, unknown>).__stores = {
      viewer: viewer.useViewerStore,
      hip: hip.useHipStore,
      knee: knee.useKneeStore,
      kneeTpl: kneeTpl.useKneeTemplateStore,
      template: template.useTemplateStore,
      note: note.useNoteStore,
    }
  })
}

createRoot(document.getElementById('root')!).render(<App />)
