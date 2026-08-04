# CLAUDE.md — CendovaPlan

Browser-basiertes Planungstool für **Hüft-, Knie- und Schulter-
Endoprothetik** (DICOM).
Lern-/Eigenprojekt, **nicht CE-zertifiziert**. Stack: React 19 + TypeScript +
Vite 8 + Tailwind 4 + **Cornerstone3D** (WebGL). Reines Frontend, kein Backend.

**Datenschutz (hart):** Patienten-DICOMs bleiben **lokal** — keine externe
Übertragung, nicht in den Cloud-Container hochladen. DICOM-Dateien sind in
`.gitignore` geblockt.

## Architektur (Kurz)
- `src/lib/cornerstone/` — Render-/WebGL-Schicht (Viewport, DICOM-Load).
- `src/lib/{hip,knee,shoulder}/` — fast reine Berechnungslogik (Winkel, Kataloge,
  Schablonen-Geometrie).
- `src/lib/plan/` — Plan ↔ JSON (`serialize.ts`) + PDF (`pdfExport.ts`).
- `src/state/` — Zustand-Stores (Modul-Singletons).
- `src/components/` — React-UI. Details: `docs/cendova-integration-context.md`.

## Testen → siehe `docs/test-runbook.md`
- **Unit-Tests (Vitest):** `npm test` — Charakterisierungs-Tests der
  Rechenkerne (`src/lib/**/*.test.ts`, Winkel/CPAK/LLD/Resektion).
  Messlogik NIE ohne grüne Tests ändern; Verhaltensänderungen brauchen
  bewusste Test-Anpassung im selben Commit.

- **Interaktiv (Nutzer, lokal, mit DICOM) — der primäre Test.** Ein Klick auf
  `scripts/start-local.cmd` (bzw. `start-local.ps1`): holt den Stand,
  `npm install`, startet den Dev-Server und **öffnet den Browser** (`vite --open`).
  **Container ≠ Nutzer-PC:** der Dev-Server im Container ist vom Browser des
  Nutzers **nicht** erreichbar (keine Port-Vorschau) — darum läuft der echte Test
  lokal, dort ist `localhost:5173` korrekt.
- **Statisch (Cloud/Agent):** `npm run verify` → typecheck (`tsc --noEmit`) +
  build, beide exit 0.
- **Optional (Cloud/Agent):** `npm run shot` → Headless-Render-Smoke-Test
  über **`playwright-core`** + **vorinstalliertes** Chromium (`/opt/pw-browsers/...`,
  da Browser-**Download geblockt**). Nur nötig, um die Laufzeit im Container zu
  prüfen — der Nutzer braucht es nicht.
- **Decode-Smoke (CI + lokal):** `node scripts/decode-smoke.mjs` gegen einen
  laufenden `vite preview` — lädt alle Beispielbilder + zwei synthetische
  Ganzbein-Großformate headless in echtem Chrome und verlangt die
  „Bild geladen"-Zeile. Läuft in der CI auf ubuntu **und macOS**
  (`.github/workflows/decode-smoke.yml`).
- Abhängigkeiten installiert der **async** SessionStart-Hook automatisch
  (`.claude/hooks/session-start.sh`, nur im Container).

## Freigabe-Prozess (hart, seit der Cornerstone-5-Regression 08/2026)
Das Programm wird von mehreren Anwendern **klinisch aktiv** genutzt.
Deren Installationen (Launcher + Installer + öffentliche Pages-Demo)
folgen dem Branch **`stable`** — NICHT main.
- **`main` = Test-Kanal**: dorthin wird gemergt und vom Nutzer (Philipp)
  lokal getestet; Tester-Installationen bleiben per `.cendova-branch-pin`
  auf main.
- **Freigabe** erst nach bestätigtem Test: `git push origin main:stable`.
  Änderungen am Render-/Decode-Stack (`@cornerstonejs/*`, `dicom-parser`,
  Worker-/Vite-Konfiguration) brauchen vor der Freigabe zusätzlich einen
  Test auf einem **echten Mac**.
- Grund: Die v5-Regression brach das DICOM-Laden nur auf Anwender-Macs
  und war **weder** in `npm run verify` **noch** im Decode-Smoke auf
  macos-latest sichtbar (validiert 04.08.2026 via Probe-PR #30, auch mit
  8100-px-Großformaten) — CI-Runner (headless/SwiftShader) reproduzieren
  diese Fehlerklasse nicht. Automatik reicht hier prinzipiell nicht.
- Dependabot bietet Cornerstone-Majors bewusst nicht mehr an
  (`.github/dependabot.yml` ignore) — erst nach Mac-Test wieder freigeben.
- Bei Decode-Fehlern zeigt die rote Meldung „Technische Ursache: …"
  (echter Loader-Fehler via `assertImageUsableMitUrsache`) — diese Zeile
  beim Anwender erfragen statt zu raten.

## Konventionen
- Kommentare/Commits auf **Deutsch** (siehe bestehende History).
- Helfer-Skripte als `.mjs` in `scripts/`.
- **Nicht** `npm audit fix --force` laufen lassen (bricht Versionen).
