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
`dist/` auffrischt → Dev-Server startet → Browser öffnet**:

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

**Der „Planen"-Knopf in CendovaView** liefert nicht den Dev-Server aus, sondern
den **gebauten** Stand aus `dist/`. Der Launcher frischt ihn deshalb mit auf —
sonst wäre CendovaPlan auf Port 5173 aktuell und unter `/plan` trotzdem alt
(Realtest 05.08.). Entschieden wird das in `scripts/plan-dist.mjs`; direkt
aufrufbar:

```powershell
node scripts\plan-dist.mjs --nur-pruefen   # nur melden (Exit 1 = veraltet)
node scripts\plan-dist.mjs                 # bei Bedarf bauen
```

Geprüft wird nicht bloß der Commit, sondern auch die **Embedded-Vertrags-
version** aus `dist/.build-info.json` und ob Quelldateien neuer sind als der
Build. Läuft CendovaView daneben und bedient es einen **anderen**
CendovaPlan-Ordner, sagt das Skript das beim Start.

### Fahrplan Knie-Schablonen (Fork „knie-schablonen-optimierung")
1. Knie-/Ganzbein-AP-DICOM laden.
2. Tab **„Knie"**.
3. **Kalibrieren** → neuer Kalibrier-Hinweis im Schablonen-Panel, pane-korrekt.
4. **Schablone** setzen (z. B. Femur Legion PS / Tibia GMK Sphere) → Extraktion
   sauber & katalog-exakt (Größe, Kontur)?
5. **Plan speichern** → erneut laden: Knie-Schablonen drin, keine ID-Kollision.
6. Optional **PDF-Export**.

### Fahrplan Schulter
1. Schulter-AP-DICOM laden (oder `?beispiel=schulter` für das CC0-Bild).
2. Tab **„Schulter"** → Seite (rechts/links) und Prothesentyp
   (anatomisch/invers) setzen.
3. **Messungen**: CSA und Akromion-Index brauchen keinen Maßstab. Für AHD,
   Humeruskopf und DTI vorher **kalibrieren** — ohne Kalibrierung zeigt die
   Oberfläche den Wert, aber ausdrücklich **keine** Beurteilung.
   Beim DTI die Messebene beachten: Höhe des proximalen Endes der
   Tuberositas deltoidea, dort wo die laterale Kortikalis erstmals parallel
   verläuft (der erste Schritt-Text nennt es).
4. **Schablonen** (nur mit importiertem Paket, sonst steht dort der
   Paket-Hinweis): Prothesentyp umschalten → anatomisch zeigt die
   anatomischen Familien, invers die inversen. Humerus- bzw.
   Glenoid-Komponente wählen, platzieren, per Drag/Griff/Pfeiltasten
   ausrichten, mit Entf löschen.
   **Seiten-Konvention prüfen:** Schablone auf eine RECHTE Schulter legen —
   passt der Umriss ohne Spiegelung? Falls nicht, ist
   `SHOULDER_KANONISCHE_SEITE` in `src/lib/shoulder/shoulderPlacement.ts`
   umzustellen (einzige Stelle, mit Tests abgesichert).
5. **Sperre prüfen:** Bei aktiver Schulter-Messung dürfen Schablonen keine
   Klicks abfangen (und umgekehrt).
6. **Schaft-Crop** (Sektion 5, optional): Schaft mit Klicks
   umfahren, Enter schließt den Schnitt. Das Stück ziehen und am Griff
   über ihm drehen (± = fein) — an der Ausgangsstelle bleibt eine schwarze Lücke (gestrichelt
   umrandet), das Stück selbst liegt an der neuen Position. Beim
   Hineinzoomen muss es so scharf bleiben wie das Bild darunter, und
   Schablonen müssen DARÜBER sichtbar bleiben. Undo/Redo muss
   Verschiebung und Drehung zurücknehmen.
7. **Plan speichern** → erneut laden: Schulter-Messungen, -Schablonen und
   Schaft-Fragmente sind wieder da, keine ID-Kollision (Format v9).
8. **PDF-Export** → Abschnitte „Schulter-Messungen",
   „Schulter-Schablonen" und ggf. „Schaft-Crop" vorhanden;
   Schablonen und verschobenes Fragment im Ausdruck sichtbar.

### Fahrplan Femurprofil (Hüfte, Dorr/CPAH)
Der Workflow ist **optional** und steht als Sektion **„3 · Femurprofil"**
zwischen Messungen und Schablonen. Patienten-DICOMs bleiben lokal.

1. Hüft-AP-DICOM laden (oder `?beispiel=huefte` für die Lehraufnahme).
2. **Kalibrieren.** Ohne Kalibrierung ist der Start gesperrt und sagt auch,
   warum — das ist Absicht: unkalibriert wären die mm-Zahlen keine mm, und
   die 10-cm-Hilfslinie läge willkürlich. Das Beispielbild kalibriert sich
   **nicht** von selbst, obwohl es einen Pixelabstand mitbringt.
3. **Toolbar-Smoke** (es gibt kein UI-Testmuster, deshalb hier von Hand):
   Sektion ist eingeklappt, trägt vor dem Start **keinen** amberfarbenen
   Punkt, steht **vor** den Schablonen; das Femurprofil taucht **nicht**
   als Werkzeug in „2 · Messungen" auf. Die übrigen Sektionen behalten
   ihre gemerkten Einklapp-Zustände.
4. **„Femurprofil starten"** → zuerst erscheint die **Bildqualitäts-
   Checkliste**. Sie misst nichts, sie fragt; nur die Kalibrier-Zeile kommt
   aus dem Viewer und ist nicht abwählbar.
5. **Gate bewusst NICHT bestehen** (eine Zeile offen lassen): Der Knopf
   heißt dann ehrlich „Ohne Klassifikation messen". Messen bleibt möglich,
   aber Dorr/CPAH stehen als `nicht zuverlässig bestimmbar` da — samt
   Grund —, und die CPAH-Matrix wird **nicht** gezeichnet. Die Rohwerte
   erscheinen trotzdem.
   ⚠ Achtung auf die Zeile **„Ausgeprägte Deformität verfälscht die
   Geometrie"**: Sie ist die einzige mit umgekehrter Bedeutung —
   *anhaken = Ausschlussgrund*.
6. Messung abbrechen (Esc) und neu starten: Die Checkliste erscheint
   **wieder leer**. Eine Bestätigung gilt nur für den Anlauf, für den sie
   abgegeben wurde.
7. Gate bestehen, dann die **13 Punkte** setzen. Ab Punkt 7 (Trochanter
   minor) erscheint die gestrichelte **10-cm-Linie** — die vier
   Kortikalis-Punkte gehören genau darauf. Für die letzten beiden Punkte
   (Kanalränder) erscheint zusätzlich die zweite gestrichelte Linie **auf
   Höhe des Trochanter minor** — beide Kanalrand-Punkte darauf anklicken
   (Realtest-Wunsch 29.08.2026).
8. Ergebnisse in der Karte **„Morphologie & Fixation"** plausibilisieren
   (CI, CCR, NSA, FO, FOR, CPAH). Die Messzeile darüber trägt bewusst
   keine Werte mehr, nur den Verweis auf die Karte.
9. **CPAH-Matrix sichtprüfen:** aktive Zelle passt zu Dorr-Typ und
   NSA-Klasse, der Punkt sitzt an der erwarteten Stelle, die FOR-Leiste
   zeigt N bzw. H.
10. **Messpunkte verschieben** → Werte, Matrix und Warnungen aktualisieren
    live.
11. **Dorr bestätigen**; danach abweichend überschreiben — ohne Grund
    bleibt „Speichern" gesperrt. **Undo** muss die Bestätigung zurücknehmen.
12. Nach der Bestätigung einen Punkt so verschieben, dass sich der
    Vorschlag ändert → die Karte muss die Bestätigung als **veraltet**
    melden.
13. **Plan speichern** → erneut laden: Punkte, Bildqualität, Vorschlag,
    ärztliche Entscheidung und Grund sind wieder da (Format v10), keine
    ID-Kollision.
14. **PDF-Export** → Abschnitt **„Femurprofil"** vorhanden, mit
    Planungshinweis; bei ungeeigneter Aufnahme ohne Klasse.
15. **Zweiter Durchlauf mit vorhandener CCD-Messung:** Der Dialog kündigt
    an, dass sechs Punkte übernommen werden, die Messung startet bei
    Schritt 7/13. ⚠ Prüfen, ob die übernommenen Punkte am **gewünschten
    Femur** liegen — Hüft-Messungen tragen keine Seiten-Information, eine
    CCD-Messung der Gegenseite ist für das Programm nicht erkennbar.
16. **Grenzfälle** A/B und B/C mit synthetischer Geometrie oder
    nichtpatientenbezogenen Testbildern: Der Punkt muss sichtbar im amber
    **Grenzband** liegen, und die Karte nennt den Grenzbereich.
17. **Schaft-Platzierung nach Femurprofil:** Schaft anlegen → nach der
    Seitenwahl wird die **Schaftachse aus der Femurprofil-Messung
    übernommen** und der Schaft sofort entlang dieser Achse platziert —
    die zwei Achsen-Klicks entfallen. Ohne Femurprofil-Messung (CCD
    genügt bewusst nicht) bleibt der bisherige Zwei-Klick-Ablauf.
    ⚠ Gleiche Seitenfalle wie beim CCD-Prefill: Messungen tragen keine
    Seiten-Information — bei bilateraler Planung prüfen, dass die
    übernommene Achse zum gewählten Femur gehört (sonst Schaft löschen
    und ohne Femurprofil neu anlegen oder Rotation per Alt+Pfeil richten).

> **Vorab automatisiert prüfbar:** Die Schritte 3–15 sind als
> Playwright-Skripte hinterlegt (`scripts/abnahme-femurprofil/`, 117
> Prüfungen gegen einen laufenden `npm run dev`). Sie ersetzen den Test
> mit echtem DICOM nicht — sie fahren nur synthetische Geometrie —,
> nehmen ihm aber die stumpfe Arbeit ab. Details im README dort.

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
