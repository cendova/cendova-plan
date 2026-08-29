# Schablonen-Pakete — Format & eigene Pakete bauen

CendovaPlan wird **ohne Hersteller-Schablonendaten** ausgeliefert (siehe
`NOTICE`/`DISCLAIMER.md`): keine Implantat-Bilder, -Konturen, -Kataloge
oder -Größendaten im Repo. Messungen funktionieren immer; **Templating
wird erst durch ein importiertes Schablonen-Paket aktiv**. Jede Nutzerin/
jeder Nutzer erstellt das eigene Paket aus **selbst beschafften**
Herstellerunterlagen (Schablonen-PDFs, DXF-Blätter, Kataloge) und ist für
deren lizenzkonforme Verwendung selbst verantwortlich. Pakete sind privat
zu halten und nicht weiterzugeben.

## Import & Speicherung

Paket-Symbol in der Kopfzeile → „Paket importieren (.zip)". Das Paket
landet dauerhaft in der IndexedDB des Browsers (übersteht Updates und
Neustarts); „Paket entfernen" stellt den Auslieferungszustand wieder her.
Die Registry (`src/lib/templates/registry.ts`) ersetzt beim Laden die
eingebauten (leeren) Datentabellen in-place — der restliche Code merkt
davon nichts.

**Export/Umzug:** „Paket exportieren (.zip)" (gleiches Menü) lädt den
aktuell aktiven, GEMERGTEN Gesamtstand (Basis + alle Addons) als EIN
Komplett-ZIP herunter. Damit lassen sich mehrere Einzel-ZIPs zu einem
Paket zusammenfassen, weitere Rechner in einem Schritt bestücken und
Backups anlegen — der Import des Komplett-ZIPs ersetzt den Bestand
vollständig (kein `merge`-Flag).

**Lokale Sicherung (automatisch):** Beim lokalen Betrieb über den
Dev-/Preview-Server (nur `localhost` — auf öffentlichem Hosting wie der
Pages-Demo wird kein Sicherungs-Request versucht) sichert die App Paket
und Einrichtungs-Profil
zusätzlich als Dateien im Projektordner (`.cendova-daten/`, gitignored)
und stellt beides nach einem Browser-Speicher-Verlust selbst wieder her —
z. B. wenn eine Klinik-Richtlinie „Websitedaten beim Schließen löschen"
IndexedDB/localStorage leert. „Paket entfernen"/„Zurücksetzen (neutral)"
löschen auch die Sicherung (bewusste Entscheidungen bleiben bewusst).

Gesichert werden DREI Dinge: das Paket (`schablonen-paket.zip`), das
Einrichtungs-Profil (`profil.json`) und die selbst gezeichneten
Tracer-Konturen (`schablonen-traces.json`). Letzteres, weil Traces
Familien PLATZIERBAR machen, wenn das Paket keine Konturen mitbringt —
ohne Sicherung blieben sie in der localStorage EINER Browser-Herkunft
gefangen (Realtest 24.08.2026: eingebettet „9 Familien, keine
platzierbar", allein lief alles).

Dieselbe Datei ist zugleich der **Abgleich zwischen Browser-Herkünften**:
CendovaPlan läuft allein auf `localhost:5173` UND eingebettet unter der
CendovaView-Herkunft (`/plan`) — IndexedDB ist je Herkunft getrennt, das
Paket wäre sonst nur dort vorhanden, wo es importiert wurde (Realtest
23.08.2026: eingebettet keinerlei Knie-Templates). Der CendovaView-Server
beantwortet dafür dieselben `/__cendova/sicherung/*`-Endpunkte aus
derselben Ablage. Beim Start vergleicht die App den Datei-Stand (SHA-256,
gemerkt in der IndexedDB) mit dem eigenen: Hat eine ANDERE Herkunft
importiert, wird die Datei übernommen — ohne sie zurückzuschreiben, denn
jedes neu gebaute ZIP fällt byteweise anders aus und die Herkünfte
schaukelten sich sonst bei jedem Start gegenseitig zu Neu-Importen auf.
Fehlt die Datei und wurde noch nie abgeglichen (Alt-Installation: der
Import liegt vor der Datei-Sicherung), wird sie aus dem eigenen Stand
angelegt; fehlt sie NACH einem Abgleich, wurde das Paket woanders bewusst
entfernt — der eigene Stand bleibt dann unangetastet, die Datei wird
nicht wiederbelebt.
Details: `vite-lokale-sicherung.ts` + `src/lib/lokaleSicherung.ts` +
`gleicheMitDateiSicherungAb` in `src/lib/templates/registry.ts`;
Test: `node scripts/test-lokale-sicherung.mjs`.

## ZIP-Aufbau

```
mein-paket.zip
├── manifest.json          (Pflicht)
└── images/…               (alle im Manifest referenzierten PNGs)
```

## manifest.json — Felder

Maßgeblich ist `src/lib/templates/packageFormat.ts` (Typen +
`validateManifest`); Kurzübersicht:

| Feld | Inhalt |
| --- | --- |
| `format` | fest `"cendova-templates"` |
| `formatVersion` | fest `1` |
| `name` | Anzeigename (Statuszeile) |
| `merge` | `true` = additives Addon: wird beim Import mit dem BESTEHENDEN Paket vereinigt statt es zu ersetzen |
| `kneeImages` | Knie-Bild-Index, Schlüssel `kind\|view\|sizeIndex` → PNG-Pfad + Maße |
| `kneeContours` | Pro-Größe-Konturen (normierte Polygone, optional Resektions-/Achsen-/Feature-Daten); werden schlüsselweise über den Bestand gelegt |
| `kneeCatalog` | Größentabellen der Knie-Familien (`legionPsFemur`, `genesisTibia`, …, `implantFamilies`) |
| `shoulderImages` | Schulter-Bild-Index, Schlüssel `kind\|AP\|sizeIndex` → PNG-Pfad + Maße; das Bild hat im Renderer Vorrang vor der Kontur |
| `shoulderContours` | Pro-Größe-Konturen der Schulter (normierte Polygone); werden schlüsselweise über den Bestand gelegt |
| `shoulderCatalog` | Schulter-Familien (`families` mit Hersteller/Prothesentyp/Knochen) + Größen-Labels je `kind` |
| `medactaImages` / `medactaCatalog` | Hüft-Schablonen: Bilder `[folder][refNo]` + Katalog (Größen, Bezugspunkte, Kopfpositionen) |
| `headOffsetsMm` | genau 5 Halslängen-Stufen (UI-Vertrag) |
| `stemCcdByFolder` | CCD-Winkel (Grad) je Schaft-Ordnername; schlüsselweise Vereinigung, Plausibilitätsfenster 100–160° |
| `stemProfileByFolder` | Schaft-Planungsprofil je Ordnername: `fixation` (cementless/cemented), `radaelliClass` (A/B1–B3/C1–C3/D/E/F, NUR zementfrei), `collar`, `primaryFixation`, optional `neckVariant`/`offsetVariant`, `intendedUse`; schlüsselweise Vereinigung. Grundlage der Schaft-Planungshinweise — Regeln lesen nie Ordnernamen |
| `backgrounds` | Tracer-Hintergründe, Schlüssel `kind\|view` bzw. `kind\|view\|band` |

Addons (`merge:true`) dürfen beliebige Teilmengen liefern — z. B. nur
`kneeContours` oder nur `stemCcdByFolder`; `kneeContours`,
`shoulderContours`, `stemCcdByFolder` und `stemProfileByFolder` werden
schlüsselweise vereinigt (Addon gewinnt), alle anderen definierten Felder
ersetzen die Basis.

## Eigene Pakete erzeugen (Generator-Skripte)

Alle Generatoren erwarten die Quelldaten **lokal** (gitignored) und lesen
Hersteller-Sollmaße aus `scripts/katalog-solldaten.local.json` (Struktur:
`scripts/katalog-solldaten.beispiel.json` kopieren und mit Werten aus den
eigenen Herstellerunterlagen befüllen):

- `scripts/rasterize-medacta-templates.mjs` — Hüft-Schablonen-PDFs →
  zugeschnittene PNGs + Katalog-Bezugspunkte.
- `scripts/build-knee-images.mjs` / `build-knee-contours.mjs` — Knie-
  Referenzbilder (mit 25-mm-Kugel) → Bild-Index bzw. normierte Konturen.
- `scripts/sn-dxf/convert-sn-templates.mjs` — Hersteller-DXF-Blätter →
  maßverifizierte Konturen (`--src <Ordner> --out <Ordner>`); Details und
  Rezepte im Skript-Kopf.
- `scripts/sn-dxf/build-addon-package.mjs` — Konverter-Ausgabe →
  merge-Addon-ZIP.
- `scripts/export-template-package.mjs` — befüllte Datentabellen +
  `public/templates/**` → Voll-Paket-ZIP.
- `scripts/build-schulter-zuordnung.mjs` — ordnet die Schulter-Screenshots
  den Größen zu; die Serien-Tabelle (Quellordner, Zeitbereiche,
  Hersteller-Größenlabels) liegt lokal in
  `scripts/schulter-serien.local.json`, Aufbau im Skript-Kopf.
- `scripts/build-shoulder-contours.mjs` — Schulter-Screenshots (mit
  25-mm-Kugel) → normierte Konturen **und** veredelte Bild-Overlays
  (`lib/schablonen-veredelung.mjs`; Qualitäts-Gate ≥ 6 px/mm).
- `scripts/export-shoulder-package.mjs` — Schulter-Konturen + Bilder →
  merge-Addon-ZIP (gegen die App-Validierung geprüft).
- `scripts/export-knee-contours-addon.mjs` — Konturen (+ CCD-Winkel) →
  Nachzug-Addon für Bestandspakete.

Paket-ZIPs (`cendova-*.zip`) sind per `.gitignore` geblockt — sie
enthalten Hersteller-Material und gehören nicht ins Repository.
