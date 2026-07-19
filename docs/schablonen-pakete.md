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
Dev-/Preview-Server sichert die App Paket und Einrichtungs-Profil
zusätzlich als Dateien im Projektordner (`.cendova-daten/`, gitignored)
und stellt beides nach einem Browser-Speicher-Verlust selbst wieder her —
z. B. wenn eine Klinik-Richtlinie „Websitedaten beim Schließen löschen"
IndexedDB/localStorage leert. „Paket entfernen"/„Zurücksetzen (neutral)"
löschen auch die Sicherung (bewusste Entscheidungen bleiben bewusst).
Details: `vite-lokale-sicherung.ts` + `src/lib/lokaleSicherung.ts`;
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
| `medactaImages` / `medactaCatalog` | Hüft-Schablonen: Bilder `[folder][refNo]` + Katalog (Größen, Bezugspunkte, Kopfpositionen) |
| `headOffsetsMm` | genau 5 Halslängen-Stufen (UI-Vertrag) |
| `stemCcdByFolder` | CCD-Winkel (Grad) je Schaft-Ordnername; schlüsselweise Vereinigung, Plausibilitätsfenster 100–160° |
| `backgrounds` | Tracer-Hintergründe, Schlüssel `kind\|view` bzw. `kind\|view\|band` |

Addons (`merge:true`) dürfen beliebige Teilmengen liefern — z. B. nur
`kneeContours` oder nur `stemCcdByFolder`; `kneeContours` und
`stemCcdByFolder` werden schlüsselweise vereinigt (Addon gewinnt), alle
anderen definierten Felder ersetzen die Basis.

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
- `scripts/export-knee-contours-addon.mjs` — Konturen (+ CCD-Winkel) →
  Nachzug-Addon für Bestandspakete.

Paket-ZIPs (`cendova-*.zip`) sind per `.gitignore` geblockt — sie
enthalten Hersteller-Material und gehören nicht ins Repository.
