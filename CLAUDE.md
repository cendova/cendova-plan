# CLAUDE.md — CendovaPlan

Browser-basiertes Planungstool für **Hüft-/Knie-Endoprothetik** (DICOM).
Lern-/Eigenprojekt, **nicht CE-zertifiziert**. Stack: React 19 + TypeScript +
Vite 6 + Tailwind 4 + **Cornerstone3D** (WebGL). Reines Frontend, kein Backend.

**Datenschutz (hart):** Patienten-DICOMs bleiben **lokal** — keine externe
Übertragung, nicht in den Cloud-Container hochladen. DICOM-Dateien sind in
`.gitignore` geblockt.

## Architektur (Kurz)
- `src/lib/cornerstone/` — Render-/WebGL-Schicht (Viewport, DICOM-Load).
- `src/lib/{hip,knee}/` — fast reine Berechnungslogik (Winkel, Kataloge,
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
- Abhängigkeiten installiert der **async** SessionStart-Hook automatisch
  (`.claude/hooks/session-start.sh`, nur im Container).

## Konventionen
- Kommentare/Commits auf **Deutsch** (siehe bestehende History).
- Helfer-Skripte als `.mjs` in `scripts/`.
- **Nicht** `npm audit fix --force` laufen lassen (bricht Versionen).
