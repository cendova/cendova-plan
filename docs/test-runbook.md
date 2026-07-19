# Test-Runbook — CendovaPlan

Kurzanleitung zum **Testen der App** in zwei Umgebungen: (A) automatisiert im
Cloud-Container (Claude Code on the web) und (B) **interaktiv lokal** auf dem
eigenen Rechner mit echtem DICOM. Ziel: nächster Teststart ohne Herleitung.

> **Kernfakt vorweg:** Seit R0 (Architektur-Audit) gibt es eine
> **Vitest-Suite für die Rechenkerne** (`npm test` — Winkel, CPAK, LLD,
> Resektion; Charakterisierungs-Tests). Der **primäre** End-to-End-Test
> bleibt der interaktive Lauf mit DICOM — und der passiert **lokal beim
> Nutzer** (Datenschutz + Technik, siehe B). Im Container: Typecheck,
> Unit-Tests, Build und ein optionaler Headless-Render-Smoke-Test.

---

## A) Verifizierung im Container (für die Agenten-Session)

Abhängigkeiten installiert der **SessionStart-Hook** automatisch (async:
`.claude/hooks/session-start.sh` → `npm install`; läuft im Hintergrund, daher
direkt nach Sessionstart ggf. kurz warten, bis `node_modules` fertig ist).
Falls nötig manuell:

```bash
npm install
```

**Statische Checks** (das dokumentierte Abnahmekriterium ist `tsc --noEmit`):

```bash
npm run typecheck      # tsc --noEmit  -> muss exit 0 sein
npm run build          # tsc -b && vite build -> muss exit 0 sein
npm run verify         # beides nacheinander
```

**Optional: Laufzeit-Smoke-Test + Screenshots** (startet den Dev-Server bei
Bedarf selbst). Nur nötig, um im Container die *Laufzeit* zu prüfen — der Nutzer
testet stattdessen lokal (B):

```bash
npm run shot
```

Erzeugt `.test-artifacts/01-initial.png`, `02-knee.png`, `report.txt`. Exit 0 =
App gemountet **und** 0 Laufzeitfehler. Die Screenshots kann der Agent dem
Nutzer schicken.

**Optional: PDF-Fußzeilen-Render-Test** (Personalisierung/Neutralität). Rendert
das PDF headless ohne DICOM und prüft die Vorrang-Kette des Planer-Namens
(Dialog → Profil-Default → weglassen):

```bash
node scripts/test-pdf-footer.mjs
```

Erzeugt `.test-artifacts/footer-A/B/C.pdf`. Exit 0 = alle drei Fußzeilen korrekt.
Sichert ab, dass im öffentlichen (neutralen) Stand kein Klarname im PDF steht.

**Optional: Lokale-Sicherungs-Test** (Klinik-Wipe-Szenario). Simuliert per
frischem Browser-Kontext das Richtlinien-Löschen des Browser-Speichers und
prüft die automatische Wiederherstellung von Paket + Profil aus
`.cendova-daten/` (sowie: bewusstes Entfernen löscht auch die Sicherung):

```bash
node scripts/test-lokale-sicherung.mjs
```

### Warum das Screenshot-Skript so gebaut ist (Umgebungs-Eigenheiten)
- **Browser-Download ist geblockt.** Die Netzwerk-Policy lässt npm-Registry zu,
  aber **nicht** die Playwright-Browser-CDN. Darum:
  - Dependency = **`playwright-core`** (lädt KEINEN Browser herunter).
  - Es wird ein **vorinstalliertes** Chromium genutzt:
    `/opt/pw-browsers/chromium-*/chrome-linux/chrome` (das Skript findet es
    selbst; sonst `PW_CHROMIUM=/pfad/chrome` setzen).
- **WebGL/Cornerstone headless** läuft über SwiftShader
  (`--use-angle=swiftshader`). Konsole zeigt dann `CornerstoneRender: using GPU
  rendering` — das ist erwartet/gut.
- Ein **404 auf `/favicon.ico`** ist kosmetisch (kein `<link rel=icon>` in
  `index.html`) und wird im Report ignoriert.

---

## B) Interaktiver Test mit echtem DICOM — LOKAL auf dem eigenen Rechner

**Warum nicht im Container?** Zwei Gründe:
1. **Zwei getrennte Maschinen.** Der Agent/Dev-Server läuft im Cloud-Container,
   nicht auf dem PC des Nutzers. Der Container-Port **5173 ist vom Browser des
   Nutzers nicht erreichbar**, und diese Umgebung bietet **keine Port-Vorschau**.
   Ein SessionStart-Hook (läuft im Container) kann den lokalen Browser-Test
   daher **nicht** starten.
2. **Datenschutz.** Patienten-DICOMs sollen **lokal** bleiben (Projektgrundsatz:
   keine externe Übertragung). Also nicht in den Container hochladen.

### Einmalig: lokal klonen (PowerShell/Terminal des Nutzers)

```powershell
cd $HOME
git clone https://github.com/cendova/cendova-plan.git cendova-plan-test
cd cendova-plan-test
git switch <branch>                        # nur falls nicht main
```

### Danach jedes Mal: nahtloser Ein-Klick-Start

Im Projektordner liegt ein Launcher, der **Stand holt → installiert →
Dev-Server startet → Browser öffnet**:

- **Doppelklick** auf `scripts\start-local.cmd` (umgeht die PowerShell-
  Skript-Sperre automatisch), **oder**
- `pwsh -File scripts\start-local.ps1`, **oder** (wenn schon alles aktuell ist)
  einfach `npm run dev:open`.

**Desktop-Verknüpfung** (einmalig): Doppelklick auf
`scripts\create-desktop-shortcut.cmd` legt eine Verknüpfung „CendovaPlan" auf
dem Desktop an, die direkt den Launcher startet.

Es öffnet sich **http://localhost:5173** — **lokal ist `localhost` korrekt**
(Server läuft auf der eigenen Maschine). DICOM per Drag&Drop ins Bildfeld ziehen.
`Strg+C` im Fenster beendet den Server.

> Stolperstein: Befehle laufen nur **im Projektordner** (mit `.git` +
> `package.json`). Kontrolle: `git rev-parse --show-toplevel`. Der `git pull` im
> Launcher betrifft den **aktuell ausgecheckten** Branch — für einen anderen
> vorher `git switch <branch>`.

### Fahrplan Knie-Schablonen (Fork „knie-schablonen-optimierung")
1. Knie-/Ganzbein-AP-DICOM laden.
2. Tab **„Knie"**.
3. **Kalibrieren** → neuer Kalibrier-Hinweis im Schablonen-Panel, pane-korrekt.
4. **Schablone** setzen (z. B. Femur Legion PS / Tibia GMK Sphere) → Extraktion
   sauber & katalog-exakt (Größe, Kontur)?
5. **Plan speichern** → erneut laden: Knie-Schablonen drin, keine ID-Kollision.
6. Optional **PDF-Export**.

---

## Gotchas / FAQ
- **`npm audit`-Warnungen** („N vulnerabilities") beim Install sind Standard­rauschen
  der Transitiv-Deps. Fürs Testen nichts tun — **nicht** `npm audit fix --force`
  (bricht Versionen).
- **`vite.config.ts` → `server.allowedHosts: true`** ist gesetzt, damit eine
  Remote-/Proxy-Vorschau nicht mit „Blocked request" abgewiesen wird. Lokal
  irrelevant.
- Der **Vite-Cache** liegt bewusst in `os.tmpdir()` (nicht im Drive-gespiegelten
  `node_modules/.vite`) — siehe Kommentar in `vite.config.ts`.
