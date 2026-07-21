/**
 * Universelle Bildbearbeitungs-Tools in der oberen Header-Leiste.
 * Enthält: Bild laden (Datei/Ordner), Pan/Zoom/WindowLevel,
 * Kalibrierung, Length/Angle, Notiz.
 *
 * Die fachliche Werkzeug-Auswahl (Hüft-/Knie-Messungen, Templating)
 * lebt weiterhin in der linken Sidebar (`Toolbar.tsx`), die jetzt nur
 * noch die domänenspezifischen Tools zeigt.
 */
import { useEffect, useRef, useState } from 'react'
import { useViewerStore } from '../state/viewerStore'
import { useHipStore } from '../state/hipStore'
import { useKneeStore } from '../state/kneeStore'
import { useNoteStore } from '../state/noteStore'
import { loadFiles } from '../lib/cornerstone/viewer'
import { useUiStore } from '../state/uiStore'
import { loadFilesToPane2 } from '../lib/cornerstone/viewer2'
import { expandZips, pickDicomImageFiles } from '../lib/cornerstone/dicomFolder'
import { useKneePanesStore } from '../state/kneePanesStore'
import { pickLeftTool, toggleNoteTool } from '../lib/toolControls'
import {
  IconAngle,
  IconClipboard,
  IconHelp,
  IconLength,
  IconNote,
  IconOpen,
  IconOpenPlan,
  IconPackage,
  IconPan,
  IconPdf,
  IconSave,
  IconSettings,
  IconWindowLevel,
  IconZoom,
  ToolIconButton,
} from './ToolIcon'
import { useOrgProfileStore } from '../state/orgProfileStore'
import { downloadPlan, loadPlanFromFile, findPlanFile } from '../lib/plan/serialize'
import { isEmbedded } from '../lib/embedded'
import { usePlanningStore, isPlanningEmpty } from '../state/planningStore'
import {
  exportTemplatePackage,
  importTemplatePackage,
  removeTemplatePackage,
} from '../lib/templates/registry'
import { useTemplatePackageStore } from '../state/templatePackageStore'

export function HeaderTools() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const planInputRef = useRef<HTMLInputElement>(null)
  const pkgInputRef = useRef<HTMLInputElement>(null)
  const [openMenu, setOpenMenu] = useState(false)
  const [openPkgMenu, setOpenPkgMenu] = useState(false)
  const pkgInfo = useTemplatePackageStore((s) => s.info)
  const showHints = useUiStore((s) => s.showHints)
  const toggleHints = useUiStore((s) => s.toggleHints)

  // `webkitdirectory` ist non-standard (in React/TS nicht typisiert) → per Ref
  // setzen. Damit wählt der Picker einen ganzen ORDNER (inkl. Unterordner)
  // statt einer Einzeldatei.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '')
  }, [])
  const leftTool = useViewerStore((s) => s.leftTool)
  const hasImage = useViewerStore((s) => s.hasImage)
  const setStatus = useViewerStore((s) => s.setStatus)
  const hipActive = useHipStore((s) => s.activeKind != null)
  const kneeActive = useKneeStore((s) => s.activeKind != null)
  const notePlacing = useNoteStore((s) => s.placing)

  /** Plan-Datei vom Nutzer einlesen und anwenden. */
  async function handlePlanFile(fl: FileList | null) {
    if (!fl || fl.length === 0) return
    const result = await loadPlanFromFile(fl[0])
    if (result.ok) {
      setStatus(result.summary)
    } else {
      setStatus(`Plan-Fehler: ${result.error}`)
    }
  }

  /** Schablonen-Paket (ZIP) importieren — landet dauerhaft in der IndexedDB. */
  async function handlePackageFile(fl: FileList | null) {
    if (!fl || fl.length === 0) return
    setStatus('Schablonen-Paket wird importiert …')
    const result = await importTemplatePackage(fl[0])
    setStatus(
      result.ok
        ? `Schablonen-Paket „${result.name}" geladen (${result.imageCount} Bilder) — bleibt dauerhaft gespeichert.`
        : `Paket-Fehler: ${result.error}`,
    )
  }

  function handlePlanSave() {
    try {
      downloadPlan()
      // Embedded-Modus (CendovaView-iframe): downloadPlan übergibt den Plan
      // an den Host statt einen Download zu starten — die Meldung muss das
      // sagen, sonst sucht der Nutzer eine JSON-Datei, die es nicht gibt.
      if (isEmbedded()) {
        setStatus('Planung an CendovaView übergeben — dort am Study gespeichert.')
        return
      }
      // Defensiv: Bilder kommen seit dem Entfall der Beispiel-URLs immer
      // als Datei-Bytes — der Else-Zweig bleibt als Absicherung.
      const cur = useViewerStore.getState().currentImageId
      const bundled =
        cur && !cur.startsWith('wadouri:http')
          ? ' (Bild eingebettet — Plan ist self-contained)'
          : ' (ohne eingebettetes Bild)'
      setStatus(`Plan als JSON gespeichert${bundled}.`)
    } catch (err) {
      setStatus(
        `Plan-Speichern fehlgeschlagen: ${
          err instanceof Error ? err.message : 'Unbekannt'
        }`,
      )
    }
  }

  async function handlePdfExport() {
    // Vor dem Export prüfen, ob überhaupt Planungsdaten erfasst wurden.
    // Wenn GAR NICHTS hinterlegt ist → erst Hinweis (öffnet auf Wunsch den
    // Dialog). Sobald irgendetwas erfasst wurde, exportiert der Button ohne
    // erneute Erinnerung — wichtig, wenn man mehrere Pläne (z. B. für
    // mehrere Schäfte) hintereinander als PDF speichert.
    if (isPlanningEmpty(usePlanningStore.getState())) {
      usePlanningStore.getState().setWarnOpen(true)
      return
    }
    try {
      // Lazy: jspdf + html2canvas (~400 kB) erst beim ersten Export laden.
      const { triggerPdfExport } = await import('../lib/plan/pdfExport')
      await triggerPdfExport()
    } catch (err) {
      // Ohne dieses Netz stürbe z. B. ein fehlgeschlagener Chunk-Load
      // lautlos — der Button wirkte dann „tot" (Bug-Report PDF-Export).
      console.error('PDF-Export:', err)
      setStatus(
        `PDF-Export fehlgeschlagen: ${
          err instanceof Error ? err.message : 'Unbekannt'
        }`,
      )
    }
  }

  // Ein Left-Tool gilt nur als „aktiv", wenn KEIN Mess- oder Notiz-Tool
  // den Klick stiehlt — sonst wäre die Icon-Hervorhebung irreführend.
  const leftToolIsLive = !hipActive && !kneeActive && !notePlacing

  async function handleFiles(fl: FileList | null) {
    if (!fl || fl.length === 0) return
    const files = Array.from(fl)
    // Versehentlich eine Plan-JSON über „Bild laden" gewählt? → als Plan laden.
    const planFile = findPlanFile(files)
    if (planFile) {
      const result = await loadPlanFromFile(planFile)
      setStatus(result.ok ? result.summary : `Fehler: ${result.error}`)
      return
    }
    // .zip-Auswahl auspacken; dann auf die wahrscheinlichen DICOM-Bilddateien
    // filtern (DICOMDIR/Beilagen raus, größte zuerst = die relevante Aufnahme).
    const picked = pickDicomImageFiles(await expandZips(files))
    if (picked.length === 0) {
      setStatus('Kein DICOM-Bild gefunden (DICOMDIR/Beilagen übersprungen).')
      return
    }
    try {
      // Lädt ins AKTIVE Pane: in der Zwei-Bild-Ansicht mit aktivem rechten
      // Pane in die seitliche Aufnahme, sonst ins Haupt-(AP-)Pane.
      const panes = useKneePanesStore.getState()
      if (panes.splitView && panes.activePane === 'right') {
        await loadFilesToPane2(picked)
      } else {
        await loadFiles(picked)
      }
    } catch (err) {
      setStatus(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Bild-Lade-Menü (Datei oder Ordner wählen). */}
      <div className="relative">
        <ToolIconButton
          icon={<IconOpen />}
          title="Bild laden …"
          onClick={() => setOpenMenu((v) => !v)}
        />
        {openMenu && (
          <>
            {/* Klick außerhalb schließt das Menü. */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpenMenu(false)}
            />
            <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded border border-neutral-700 bg-neutral-950 py-1 shadow-lg">
              <MenuItem
                onClick={() => {
                  fileInputRef.current?.click()
                  setOpenMenu(false)
                }}
                label="DICOM-Datei wählen …"
              />
              <MenuItem
                onClick={() => {
                  folderInputRef.current?.click()
                  setOpenMenu(false)
                }}
                label="DICOM-Ordner wählen …"
              />
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".dcm,.dicom,.ima,.zip"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {/* Ordner-Picker: `webkitdirectory` wird per Ref gesetzt (s. useEffect).
            Liefert ALLE Dateien des Ordners (inkl. Unterordner) → handleFiles
            filtert auf die DICOM-Bilddatei(en). */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <Separator />

      {/* Plan speichern und laden (Messungen + Schablonen + Kalibrierung
          als JSON). Bild bleibt davon unberührt — also separat von oben. */}
      <ToolIconButton
        icon={<IconSave />}
        title="Plan speichern (JSON)"
        disabled={!hasImage}
        onClick={handlePlanSave}
      />
      <ToolIconButton
        icon={<IconOpenPlan />}
        title="Plan laden (JSON)"
        onClick={() => planInputRef.current?.click()}
      />
      {/* Planungsdaten sind reine Texteingaben — auch OHNE geladenes Bild
          sinnvoll (z. B. Termin/Klinik vorab erfassen, UX-Befund P2-10). */}
      <ToolIconButton
        icon={<IconClipboard />}
        title="Planungsdaten (OP-Termin, Klinik, Versicherung, Reha …)"
        onClick={() => usePlanningStore.getState().setDialogOpen(true)}
      />
      <ToolIconButton
        icon={<IconPdf />}
        title="Plan als PDF exportieren"
        disabled={!hasImage}
        onClick={handlePdfExport}
      />
      <input
        ref={planInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          handlePlanFile(e.target.files)
          e.target.value = ''
        }}
      />

      {/* Schablonen-Paket (Import/Entfernen) — eigene Schablonen-Bibliothek
          statt der eingebauten Daten (siehe docs/schablonen-pakete.md). */}
      <div className="relative">
        <ToolIconButton
          icon={<IconPackage />}
          title={
            pkgInfo
              ? `Schablonen-Paket: ${pkgInfo.name} (${pkgInfo.imageCount} Bilder)`
              : 'Schablonen-Paket importieren …'
          }
          active={openPkgMenu}
          statusDot={pkgInfo ? 'bg-emerald-400' : undefined}
          onClick={() => setOpenPkgMenu((v) => !v)}
        />
        {openPkgMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpenPkgMenu(false)}
            />
            <div className="absolute left-0 top-full z-20 mt-1 w-60 rounded border border-neutral-700 bg-neutral-950 py-1 shadow-lg">
              <div className="px-3 py-1.5 text-[11px] leading-snug text-neutral-500">
                {pkgInfo
                  ? `Aktiv: ${pkgInfo.name} (${pkgInfo.imageCount} Bilder)`
                  : 'Kein Paket geladen — eingebaute Schablonen aktiv.'}
              </div>
              <MenuItem
                onClick={() => {
                  pkgInputRef.current?.click()
                  setOpenPkgMenu(false)
                }}
                label="Paket importieren (.zip) …"
              />
              {pkgInfo && (
                <>
                  {/* Gemergten Gesamtstand (Basis + Addons) als EIN ZIP
                      sichern — für Umzug auf weitere Rechner & Backup. */}
                  <MenuItem
                    onClick={async () => {
                      setOpenPkgMenu(false)
                      const r = await exportTemplatePackage()
                      setStatus(
                        r.ok
                          ? `Paket exportiert: ${r.fileName} (${r.imageCount} Bilder) — auf anderen Rechnern einfach importieren.`
                          : `Export-Fehler: ${r.error}`,
                      )
                    }}
                    label="Paket exportieren (.zip) …"
                  />
                  <MenuItem
                    onClick={async () => {
                      setOpenPkgMenu(false)
                      await removeTemplatePackage()
                      setStatus(
                        'Schablonen-Paket entfernt — eingebaute Schablonen aktiv.',
                      )
                    }}
                    label="Paket entfernen"
                  />
                </>
              )}
            </div>
          </>
        )}
        <input
          ref={pkgInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          data-testid="template-package-input"
          onChange={(e) => {
            handlePackageFile(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <Separator />

      <ToolIconButton
        icon={<IconWindowLevel />}
        title="Fenstereinstellung (Helligkeit/Kontrast)"
        active={leftToolIsLive && leftTool === 'WindowLevel'}
        disabled={!hasImage}
        onClick={() => pickLeftTool('WindowLevel')}
      />
      <ToolIconButton
        icon={<IconPan />}
        title="Verschieben"
        active={leftToolIsLive && leftTool === 'Pan'}
        disabled={!hasImage}
        onClick={() => pickLeftTool('Pan')}
      />
      <ToolIconButton
        icon={<IconZoom />}
        title="Zoom"
        active={leftToolIsLive && leftTool === 'Zoom'}
        disabled={!hasImage}
        onClick={() => pickLeftTool('Zoom')}
      />

      <Separator />

      {/* Kalibrierung lebt jetzt in der linken Spalte als Workflow-
          Schritt 1 (siehe Toolbar → CalibrationButton). */}
      <ToolIconButton
        icon={<IconLength />}
        title="Länge messen"
        active={leftToolIsLive && leftTool === 'Length'}
        disabled={!hasImage}
        onClick={() => pickLeftTool('Length')}
      />
      <ToolIconButton
        icon={<IconAngle />}
        title="Winkel messen"
        active={leftToolIsLive && leftTool === 'Angle'}
        disabled={!hasImage}
        onClick={() => pickLeftTool('Angle')}
      />

      <Separator />

      <ToolIconButton
        icon={<IconNote />}
        title="Textnotiz platzieren"
        active={notePlacing}
        disabled={!hasImage}
        onClick={toggleNoteTool}
      />

      <Separator />

      {/* Hilfetexte (Tutorial-Hinweise) ein-/ausschalten — für erfahrene
          Nutzer; Einstellung bleibt gespeichert (Debug-Befund G1). */}
      <ToolIconButton
        icon={<IconHelp />}
        title={showHints ? 'Hilfetexte ausblenden' : 'Hilfetexte einblenden'}
        active={showHints}
        onClick={toggleHints}
      />

      <Separator />

      {/* Einrichtung/Personalisierung (Kopfzeile, Standorte, Planer).
          Neutraler öffentlicher Stand, lokal personalisierbar. */}
      <ToolIconButton
        icon={<IconSettings />}
        title="Einrichtung personalisieren (Kopfzeile, Standorte, Planer)"
        onClick={() => useOrgProfileStore.getState().setDialogOpen(true)}
      />

    </div>
  )
}

function Separator() {
  return <div className="mx-0.5 h-5 w-px bg-neutral-800" />
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-sky-300"
    >
      {label}
    </button>
  )
}
