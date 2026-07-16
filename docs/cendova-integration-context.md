# CendovaPlan — Kontext & Integrations-Schnittstellen

> Zweck dieses Dokuments: als Kontext in eine andere Session einfügbar.
> Schwerpunkt: **Wie lässt sich CendovaPlan in einen selbst-codierten
> DICOM-Viewer einbauen?** — welche Schnittstellen es heute gibt, welche
> Umbauten nötig wären, und welcher Weg sich empfiehlt.
>
> Stand: 2026-05-30. Alle Signaturen gegen den realen Code geprüft; wo
> „ca." steht, bitte vor Nutzung gegen die Datei verifizieren.

---

## 1. Was CendovaPlan ist

Browser-basiertes Planungstool für **Hüft- und Knie-Endoprothetik** (TEP),
orientiert an etablierten digitalen Planungs-Workflows. **Lern-/Eigenprojekt, NICHT CE-zertifiziert** — trägt
überall den Disclaimer „ohne CE-Kennzeichnung, keine alleinige Grundlage für
klinische Entscheidungen".

Kann heute:
- DICOM-Röntgen laden, anzeigen, fenstern/zoomen/pannen
- **Hüfte:** Kalibrierung, Messungen (LLD, globales Offset, CE-Winkel,
  4-Punkt-Winkel, CCD), Pfannen-/Schaft-Templating (Medacta-Katalog),
  Osteotomie-Planer, Osteophyten-Marker, LLD-Bilanz prä/post
- **Knie:** 17-Punkt-Vollvermessung (mHKA, mLDFA, mMPTA, JLCA, β-Winkel),
  CPAK-Klassifikation, Schablonen-Templating (Smith&Nephew Legion PS /
  Genesis II / Journey UK II, Medacta GMK Sphere) via Browser-Tracer,
  Zwei-Bild-Ansicht AP + seitlich nebeneinander (in Arbeit)
- Plan speichern/laden (JSON, mit eingebettetem Bild), PDF-Export

**Datenschutz-Grundsatz (hart):** Patientendaten bleiben rein lokal —
Anzeige + lokale Plan-/PDF-Dateien, KEINE externe Übertragung.

---

## 2. Tech-Stack (exakte Versionen aus package.json)

- **React 19.2** + **TypeScript** + **Vite 6.4.2** + **Tailwind CSS v4**
- **Cornerstone3D 4.22** (`@cornerstonejs/core`, `/tools`,
  `/dicom-image-loader`) — WebGL-StackViewport-Rendering
- **dicom-parser 1.8.21** (Tag-Auslesen)
- **Zustand 5.0.8** (State)
- **jspdf 3** + **html2canvas-pro** (PDF-Export)
- Projektname `cendova-plan`, reines Frontend (kein Backend, kein Server-State)

Wichtige Cornerstone-Eigenheit: GPU-Texturen oft auf **2048 px** begrenzt →
größere Bilder vorher downscalen. Welt-Koordinaten sind **mm**, wenn das
DICOM `PixelSpacing` hat (dann greift Auto-Kalibrierung).

---

## 3. Architektur (das, was für Integration zählt)

```
src/
  lib/
    cornerstone/   ← Rendering-Schicht (Cornerstone-gekoppelt)
      init.ts         initCornerstone() — SINGLETON-Init
      viewer.ts       Haupt-Viewport: 1 RenderingEngine, 1 StackViewport
      viewer2.ts      2. isolierter Viewport (Knie Zwei-Bild)
      dicomMeta.ts    extractPatientInfo() — reine DICOM-Tag-Extraktion
      useViewportSync.ts  rAF-Kamera-Sync für Overlays
    hip/            ← FAST REINE LOGIK (kaum Cornerstone)
      recipes.ts, geometry.ts, templates.ts, medactaCatalog.ts, stemImages.ts
    knee/           ← FAST REINE LOGIK
      recipes.ts, geometry.ts, templates.ts, cpak.ts,
      smithNephewCatalog.ts, templateBackgrounds.ts
    plan/
      serialize.ts    Plan ↔ JSON (mit eingebettetem DICOM als base64)
      pdfExport.ts    DOM→Canvas→PDF
  state/            ← 11 Zustand-Stores (Modul-Singletons):
      viewerStore, hipStore, kneeStore, templateStore, kneeTemplateStore,
      templateTracerStore, noteStore, osteophyteStore, historyStore,
      planningStore, kneePanesStore
  components/       ← React-UI (Toolbar, Viewport, *Overlay, Dialoge …)
```

**Schichtung, die Integration ermöglicht:**
- `lib/hip` + `lib/knee` sind weitgehend **pure TypeScript-Berechnung**
  (Winkel, Skalierung, Katalog-Maße, Schablonen-Geometrie) — hängen NICHT
  fest am Viewport. Gut isoliert wiederverwendbar.
- `lib/cornerstone` ist die **einzige** Schicht, die WebGL/Cornerstone
  besitzt. Hier sitzt die ganze Render-Kopplung.
- Stores sind **Modul-Singletons** (Zustand `create(...)`): funktionieren
  nur dann geteilt, wenn Host + CendovaPlan im **selben JS-Bundle** laufen.

---

## 4. Integrations-Schnittstellen (heutiger Stand)

### 4a. Bild HINEIN — der sauberste Seam
```ts
// src/lib/cornerstone/viewer.ts
loadDicomFromBytes(bytes: ArrayBuffer, fileName: string): Promise<void>
loadFiles(files: File[]): Promise<void>
```
`loadDicomFromBytes` existiert bereits (wird vom Plan-Laden genutzt) und ist
**der natürliche Übergabepunkt**: Der Host-Viewer hat die DICOM-Bytes →
reicht sie rein. Intern baut Cornerstone daraus ein Stack-Image.

### 4b. Rendering — Cornerstone gehört aktuell CendovaPlan
```ts
setupViewport(element: HTMLDivElement): Promise<void>   // mountet Engine in DIV
getViewport(): Types.IStackViewport | null
teardownViewport(); resizeViewport(); recoverViewport()
VIEWPORT_ID   // exportiert
// intern: RENDERING_ENGINE_ID = 'cendova-engine' (hardcodiert)
```
CendovaPlan erzeugt seine **eigene** `RenderingEngine` und ruft
`initCornerstone()` (Singleton). **Das ist der zentrale Integrationspunkt
und der größte Reibungspunkt** — siehe §5/§6.

### 4c. Ergebnisse HERAUS
```ts
// src/lib/plan/serialize.ts
buildPlan(): PlanFile          // kompletter Plan als JS-Objekt
downloadPlan(filename?): void  // Browser-Download JSON
applyPlan(plan: PlanFile)      // Plan in die Stores laden
loadPlanFromFile(file: File)
// PlanFile v3: { version, savedAt, appName, embeddedImage?{base64},
//   calibration, hipMeasurements, kneeMeasurements, templates{cups,stems,
//   referenceLine}, notes, clinicalBld?, clinicalCave?, osteophytes?,
//   planning? }  ← stabiles, dokumentiertes JSON-Schema

// src/lib/plan/pdfExport.ts
exportPlanPdf(viewportEl: HTMLElement): Promise<void>
triggerPdfExport(): Promise<void>
```
`buildPlan()` ist der **Daten-Export-Seam**: liefert alle Planungsdaten als
serialisierbares Objekt. Der Host kann das speichern/weiterreichen.

### 4d. Patient/DICOM-Meta
```ts
// src/lib/cornerstone/dicomMeta.ts  (bewusst abhängigkeitsarm)
extractPatientInfo(bytes: ArrayBuffer): PatientInfo | null
// → { lastName, firstName, birthDate, ageYears, heightCm, weightKg }
```

### 4e. Reine Planungs-Logik (ohne Rendering nutzbar)
`lib/hip/recipes.ts`, `lib/knee/recipes.ts`, `*/templates.ts`, `cpak.ts`,
die Kataloge — geben zu Eingabe-Punkten Messwerte/Geometrie zurück. Der Host
könnte sie als **reine Bibliothek** nutzen und selbst zeichnen.

---

## 5. Vier Integrationswege (mit ehrlichen Tradeoffs)

> Entscheidend: **Nutzt dein DICOM-Viewer ebenfalls Cornerstone3D oder
> nicht?** Das verzweigt die Empfehlung. Beide Fälle unten.

### Weg A — Als React-Komponenten-Bibliothek einbetten (engste Kopplung)
Host (muss React sein) importiert CendovaPlans Komponenten/Stores direkt; alles
in EINEM Bundle. Stores werden geteilt (Singletons), `setupViewport` mountet
in einen Host-DIV.
- ➕ Voller Funktionsumfang, direkte Datenflüsse, kein Serialisierungs-Overhead
- ➖ Host MUSS React; Bundle-/Dependency-Kollisionen möglich (zwei
  Cornerstone-Versionen!); CendovaPlan ist noch keine paketierte Lib

### Weg B — iframe / Web Component + postMessage (lose Kopplung)
CendovaPlan läuft als eigene App in iframe; Host kommuniziert über
`postMessage`: Bild rein (ArrayBuffer transferieren), Plan/PDF raus (PlanFile
JSON).
- ➕ Host-Framework-AGNOSTISCH; saubere Isolation (eigener Cornerstone-Kontext,
  kein Versionskonflikt); Datenschutz-Grenze klar
- ➖ Handoff über Message-API muss gebaut werden (existiert noch nicht);
  Bild-Bytes kopieren/transferieren; UI-Integration weniger nahtlos
- **Oft der pragmatischste Weg**, wenn der Host NICHT React/Cornerstone ist

### Weg C — Geteilte Cornerstone-RenderingEngine (elegant, wenn Host = Cornerstone3D)
Wenn der Host bereits Cornerstone3D nutzt: CendovaPlan bekommt den
Viewport/die Engine des Hosts INJIZIERT, statt selbst eine zu erzeugen.
- ➕ Ein Bild, ein WebGL-Kontext, kein doppeltes Rendering; native Performance
- ➖ Erfordert Refactoring von `viewer.ts` (heute: eigene Engine, hardcodierte
  IDs, `getViewport()` in ~9 Dateien direkt aufgerufen) hin zu „Engine/Viewport
  wird übergeben". Mittlerer bis großer Umbau, aber sauberste End-Lösung.

### Weg D — Headless: nur die Planungs-Logik als Lib
Host macht das gesamte Rendering selbst; nutzt nur `lib/hip` + `lib/knee`
(reine Berechnung) + die Kataloge.
- ➕ Minimale Kopplung, kein Cornerstone-Konflikt, Host behält volle UI-Hoheit
- ➖ Host muss Overlays/Interaktion (Punkte setzen, Schablonen ziehen) selbst
  bauen — die halbe App. Nur sinnvoll, wenn der Host eine eigene starke
  Annotations-Engine hat.

---

## 6. Aktuelle Blocker für tiefe Integration (ehrlich)

1. **`viewer.ts` besitzt seine Engine selbst** — Modul-State `renderingEngine`,
   hardcodierte `RENDERING_ENGINE_ID = 'cendova-engine'` / `VIEWPORT_ID`.
   Nicht parametrisiert. Für Weg C müsste das injizierbar werden.
2. **`getViewport()` wird in ~9 Dateien direkt aufgerufen** (alle Overlays,
   PDF, MeasurementPanel, Kamera-Sync). Tight coupling an EINEN globalen
   Viewport. (Die Zwei-Bild-Arbeit führt gerade `getViewport2()` + ein
   `paneId`-Muster ein — das ist die Blaupause für eine
   `getViewport(id)`-Generalisierung.)
3. **`initCornerstone()` ist ein Singleton** — kann mit der Cornerstone-Init
   eines Host-Viewers kollidieren (doppelte Initialisierung, Versions-Mismatch).
4. **Zustand-Stores sind Modul-Singletons** — geteilt nur im selben Bundle;
   über iframe-Grenzen braucht es Message-Passing (Weg B).
5. **Noch kein Paket-Build/Public-API-Barrel** — es gibt keinen `index.ts`,
   der eine stabile Lib-Oberfläche exportiert. Müsste für Weg A/C definiert
   werden.

---

## 7. Empfohlener Weg (Vorschlag zum Diskutieren)

- **Host nutzt Cornerstone3D** → **Weg C** anpeilen, in Etappen:
  1. `index.ts`-Barrel mit klarer Public API definieren.
  2. `viewer.ts` so umbauen, dass Engine/Viewport optional INJIZIERT werden
     (Fallback = heutiges Eigen-Erzeugen). `getViewport()` →
     `getViewport(paneId)` generalisieren (Muster aus der Knie-Zwei-Bild-
     Arbeit übernehmen).
  3. `initCornerstone()` idempotent gegen eine bereits initialisierte
     Host-Instanz machen (prüfen, ob Core schon init ist).
- **Host nutzt NICHT Cornerstone3D / nicht React** → **Weg B** (iframe +
  postMessage): schnellster sicherer Einstieg. Message-Contract:
  `{type:'loadImage', bytes}` rein, `{type:'planExported', plan}` /
  PDF-Blob raus. Datenschutz-Grenze bleibt sauber.
- **Übergang/Prototyp** → mit **Weg B** starten (geringes Risiko, kein
  Refactor), parallel `lib/hip`+`lib/knee` als Lib evaluieren (Weg D), und
  Weg C als Endziel, sobald sich die Cornerstone-Frage geklärt hat.

---

## 8. Offene Fragen für die andere Session

1. **Nutzt der selbst-codierte Viewer Cornerstone3D** (welche Version?), eine
   andere Lib (OHIF, dwv, eigenes WebGL), oder Canvas2D? → bestimmt Weg C vs. B.
2. **Welches Framework** hat der Host (React? anderes? Vanilla?)? → bestimmt
   Weg A vs. B.
3. **Wer besitzt das Bild-Laden** — Host lädt und reicht Bytes durch, oder
   CendovaPlan lädt selbst? (Empfehlung: Host lädt, übergibt `ArrayBuffer`.)
4. **Wie sollen Pläne zurückfließen** — JSON (`buildPlan()` PlanFile),
   PDF, oder strukturierte Messwerte einzeln?
5. **Soll CendovaPlan-UI sichtbar eingebettet** sein (Toolbar/Panels) oder nur
   die Render-/Planungs-Engine, mit Host-eigener UI?
6. **Datenschutz/Deployment:** alles lokal im selben Browser-Bundle? Dann ist
   die lokale-Daten-Garantie trivial erfüllt. Bei Server-Komponente: hart
   prüfen (Projektgrundsatz: keine externe Übertragung von Patientendaten).

---

## 9. Verweise im Repo
- `docs/knee-dual-view-plan.md` — Zwei-Bild-Architektur (zeigt das
  `getViewport2()`/`paneId`-Muster, Blaupause für die Viewport-
  Generalisierung in Weg C)
- `src/lib/cornerstone/viewer.ts` / `viewer2.ts` — Render-Kopplung
- `src/lib/plan/serialize.ts` — PlanFile-Schema (Datenaustausch-Format)
- `src/lib/{hip,knee}/` — wiederverwendbare Planungs-Logik
