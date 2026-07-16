# Knie-Modul: Zwei-Bild-Ansicht (AP + seitlich) — Umsetzungsplan

Stand: v1 „gestaffelt". Ziel dieses Dokuments: nachvollziehbarer Bauplan,
der auch in einer neuen Session als Referenz dient.

## Entscheidungen (vom Nutzer bestätigt)

1. **Umfang v1 = gestaffelt:** Zwei Bilder nebeneinander, je eigene
   Kalibrierung + Pan/Zoom/Fenstern. Aktive Seite bekommt die Werkzeuge.
   Messungen + Schablonen *auf beiden* Seiten = Schritt 2.
2. **Aktivierung:** Umschalt-Button „Einzel / Zwei Bilder" im Knie-Modus.
   Standard bleibt Einzelbild.
3. **Seiten-Rolle:** AP links / seitlich rechts, per Button **vertauschbar**.
4. **Bild laden:** pro Seite einzeln (Drag&Drop aufs Pane + kleiner Button).
5. **Hüft-Modus:** bleibt unverändert Single-View.

## Architektur-Leitplanken (aus dem Code abgeleitet)

- **Eigene RenderingEngine je Pane.** `teardownViewport()` zerstört die
  ganze Engine; bei geteilter Engine würde ein WebGL-Recovery des linken
  Panes das rechte mitreißen. → rechtes Pane = eigene Engine + ToolGroup.
- **Linkes Pane = bestehendes Viewport, unberührt.** Damit bleibt die
  gesamte heutige Funktionalität (17-Punkt-Workflow, CPAK, alle Recipes,
  Auto-Recovery) bit-identisch erhalten. Kein Anfassen von `viewerStore`.
- **Kalibrierung ist pro Bild.** AP- und seitliche Aufnahme haben
  unterschiedliche Vergrößerung/PixelSpacing. Das rechte Pane braucht eine
  eigene Kalibrierung — liegt im neuen Store, nicht im viewerStore.
- **`getViewport()` wird in 9 Dateien direkt aufgerufen.** In v1 NICHT
  generalisieren (nur das rechte Pane ist „neu"). Die Generalisierung zu
  `getViewport(paneId)` ist explizit Schritt 2.

## v1 — Bauschritte

### 1. Neuer Store: `src/state/kneePanesStore.ts`
Hält ausschließlich den Zustand des ZWEITEN (rechten) Panes + den
Split-Schalter. Das linke Pane bleibt im bestehenden `viewerStore`.

```
interface KneePanesState {
  splitView: boolean            // Zwei-Bild-Modus an/aus
  swapped: boolean              // false = AP links, true = vertauscht
  rightHasImage: boolean
  rightImageMeta: ImageMeta | null
  rightCalibration: Calibration | null
  rightPatientInfo: PatientInfo | null
  rightRole: 'AP' | 'lateral'   // abgeleitet aus swapped, für Labels
  // Setter ...
}
```
- `Calibration`, `ImageMeta`, `PatientInfo` aus `viewerStore` re-exporten
  (Typen wiederverwenden, nicht duplizieren).
- Reset des rechten Panes beim Verlassen des Knie-Modus NICHT nötig —
  Daten dürfen erhalten bleiben (Modus-Wechsel ist kein neuer Patient).

### 2. Viewer-API für das zweite Pane: `src/lib/cornerstone/viewer2.ts`
Bewusst SEPARATE Datei statt `viewer.ts` umbauen — hält das Risiko vom
erprobten Single-View-Pfad fern.
- Eigene Konstanten: `RENDERING_ENGINE_ID_2 = 'cendova-engine-2'`,
  `VIEWPORT_ID_2`, `TOOL_GROUP_ID_2`.
- `setupViewport2(el)`, `teardownViewport2()`, `resizeViewport2()`,
  `getViewport2()`, `loadFilesToPane2(files)`,
  `loadDicomBytesToPane2(bytes, name)`.
- Pan/Zoom/Window-Level fest verdrahtet (kein Mess-/Annotation-Tooling in
  v1). Patienteninfo + PixelSpacing-Auto-Kalibrierung analog
  `updateStoreForLoadedImage`, aber in `kneePanesStore` schreiben.
- Eigener (optionaler) Context-Loss-Listener mit `recoverViewport2()` —
  isoliert vom linken Pane.

### 3. UI: `src/components/KneePane2.tsx`
Das rechte Pane als eigenständige Komponente:
- `<div ref>` für Cornerstone, `setupViewport2` im useEffect, ResizeObserver.
- Mini-Kopfzeile: Rollen-Label (AP/seitlich), Kalibrier-Badge, Lade-Button.
- Drag&Drop direkt aufs Pane (`loadFilesToPane2`).
- Klick setzt „aktives Pane" (für Kalibrier-Routing).

### 4. Viewport-Layout umbauen: `src/components/Viewport.tsx`
- Wenn `planningMode === 'knee' && splitView`: zwei Panes nebeneinander
  (flex, je 50 %), Trenner dazwischen, je ein sky-Rahmen für „aktiv".
- Sonst: heutiges Single-Layout unverändert.
- **Wichtig:** Bei Layout-Wechsel `resizeViewport()` + `resizeViewport2()`
  triggern (Cornerstone muss auf die neue Element-Größe reagieren).

### 5. Umschalt-Button: `src/components/Toolbar.tsx` (KneeSection)
- Oben in der KneeSection: Toggle „Einzelbild / Zwei Bilder" +
  „Seiten tauschen" (nur sichtbar, wenn splitView an).

### 6. Aktives-Pane-Konzept (nur Kalibrierung in v1)
- `kneePanesStore.activePane: 'left' | 'right'`.
- Der Kalibrier-Flow prüft activePane → kalibriert links (viewerStore) oder
  rechts (kneePanesStore). In v1 reicht: rechtes Pane bekommt einen eigenen
  kleinen Kalibrier-Button im Pane-Kopf (vermeidet Umbau des bestehenden
  Kalibrier-Dialogs).

## Schritt 2 (NICHT in v1)
- `getViewport()` → `getViewport(paneId)` generalisieren; `paneId` an
  KneeMeasurement + KneeTemplate hängen; Overlays je Pane rendern.
- Mess-/Schablonen-Tooling auf dem rechten Pane (Tibial Slope, Femur-
  Flexion/Sizing in der Seitansicht).
- PDF-Export beider Bilder nebeneinander.
- Plan-Serialisierung: zweites Bild + dessen Kalibrierung bundlen (v4).

## Testkriterien v1
- [ ] Knie-Modus, Split AUS → exakt wie heute (keine Regression).
- [ ] Split AN → zwei Panes, links Ganzbein-AP-Beispielbild unverändert
      beplanbar.
- [ ] Rechtes Pane: seitliches DICOM per Drag&Drop laden, Pan/Zoom/Fenstern.
- [ ] Rechtes Pane eigene Kalibrierung (DICOM-PixelSpacing automatisch).
- [ ] Seiten tauschen kehrt die Rollen-Labels + Inhalte korrekt um.
- [ ] WebGL-Recovery links lässt rechtes Pane unberührt und umgekehrt.
- [ ] Hüft-Modus unverändert Single-View.
- [ ] `npx tsc --noEmit` → exit 0.
```
