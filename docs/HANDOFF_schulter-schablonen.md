# HAND-OFF — Schultermodul, Schritt 7: Schablonen-Schnittstelle

**Zweck:** Einstieg für die lokale Session, die mit dem Schablonen-Material
des Autors die Schulter-Schablonen baut. Dieses Dokument zuerst lesen,
dann `docs/schulter-modul-plan.md` (Abschnitte B.7 und B.8).
**Stand:** 2026-08-01, Cloud-Session auf Branch
`claude/repos-context-sync-j97vb9`, letzter Commit `4fab39c`.

## ⚠️ Zuerst verifizieren

- `git branch --show-current` muss `claude/repos-context-sync-j97vb9`
  zeigen und `git log --oneline -1` mindestens `4fab39c` — der lokale
  Launcher zieht den Branch bei jedem Start selbst.
- **Drei Sichtprüfungen aus der letzten Runde stehen noch aus** (alle nur
  mit importiertem Schablonen-Paket möglich):
  1. Tibia-Dropdown zeigt genau **einen** Genesis-II-Eintrag, ohne
     female/male-Zusatz (Fix `4fab39c` — auf dem Heim-Rechner tauchten
     wieder beide auf, Ursache waren platzierbare Male-Konturen bzw.
     alte localStorage-Traces).
  2. Rechte Schablonen-Liste: platzierte Femur-/Tibiakomponente = je
     **eine** Zeile mit echtem Familiennamen und Größe (ohne Paket zeigt
     der Rückfallpfad „Schablone · Gr. ?"); Augen-Symbol blendet AP +
     seitlich gemeinsam aus.
  3. Schablonen-Sperre: Pfanne im Hüft-Tab platzieren → Schulter-Tab →
     Messpunkt **über** der Pfanne setzen. Punkt muss erscheinen, Pfanne
     darf sich nicht bewegen (`TemplateOverlay.tsx`, `locked` enthält
     `shoulderActive`; im Container mangels Paket nie E2E geprüft).

## Kontext

CendovaPlan (Browser-Planungstool Hüfte/Knie/Schulter, reines Frontend,
Lern-/Eigenprojekt, nicht CE). Das Schultermodul ist **komplett** (Schritte
0–7): 9 Messungen (CSA, Akromion-Index, Glenoid-Inklination,
Hals-Schaft-Winkel, AHD, Humeruskopf, DSA, LSA, DTI), Seiten-/Prothesen-
Schalter, Plan-Format v7, Undo/Redo, PDF, Beispielbild
(`?beispiel=schulter`, CC0-Grashey, Pixelabstand 0,1 mm/px ist eine
dokumentierte **Annahme**, s. `public/sample/LIESMICH.txt`).

Schritt 7 = Schablonen. Das Material (Hersteller-PDFs/DXF) bringt der
Autor in die lokale Session mit. **Hersteller-Material gehört NIE ins
Repo** — es lebt ausschließlich im Schablonen-Paket (ZIP → IndexedDB →
lokale Sicherung `.cendova-daten/`, gitignored).

## Eckdaten

- Branch: `claude/repos-context-sync-j97vb9` (alle Schulter-Arbeit,
  27+ Commits seit `main`; `main` = Release v0.1.2 ohne Schulter)
- Tests: `npm test` → 228 grün · Statisch: `npm run verify`
- Schulter-Commits in Reihenfolge: `9448e12` (Schritt 0) … `4857437`
  (Schritt 5 + Beispielbild), danach UI-Konsistenz `80c00d6`, `f9ae8c7`,
  `be00dfc`, `2ff59c7`, `4fab39c`
- Doku: `docs/schulter-modul-plan.md` (Plan + Entscheidungen),
  `docs/schablonen-pakete.md` (Paket-Format), `docs/test-runbook.md`

## Architektur-Wegweiser für Schritt 7

**Die Paket-Pipeline steht bereits** — für die Schulter ist laut Plan B.7
„nichts zu tun außer der Typ-Definition", der Rest ist Fleißarbeit entlang
der bestehenden Muster:

- `src/lib/templates/packageFormat.ts` — Manifest-Typen +
  `validateManifest`. Alle Katalogfelder sind optional; Schulter-Felder
  analog `kneeCatalog`/`kneeImages`/`kneeContours` ergänzen
  (`shoulderCatalog`, …). `merge: true`-Addons beachten: Felder werden
  schlüsselweise über den Bestand gelegt.
- `src/lib/templates/registry.ts` — ersetzt beim Paket-Load die
  eingebauten (leeren) Tabellen **in-place** (`replaceArray`); neue
  Schulter-Tabellen dort mit registrieren, ebenso im Export
  („Paket exportieren" = gemergter Gesamtstand).
- Dreiteilung wie Hüfte/Knie: **Katalog** (Größen) / **Geometrie**
  (Kontur) / **Bild** (PNG). Muster: `src/lib/hip/templates.ts`,
  `src/lib/knee/kneeContours.ts` + `kneePlaceable.ts`.
- **Slots je Prothesentyp** (Plan B.8): anatomisch = Humeruskopf +
  Glenoid-Komponente; revers = Glenosphäre + Inlay/Humerus-Schaft.
  Der Typ (`useShoulderStore.prosthesis`) filtert nur das **Angebot**,
  nie Rechenlogik — dasselbe Muster wie `recipesForProsthesis` und
  `kneeKindPlaceable`.
- Werkzeug-Skripte für die Material-Aufbereitung:
  `scripts/extract-pdf-page.mjs`, `extract-pdf-text.mjs`,
  `rasterize-medacta-templates.mjs` (Hüfte), `build-knee-contours.mjs` +
  `sn-dxf/` (Knie-DXF), `export-template-package.mjs` /
  `export-knee-contours-addon.mjs` (Verpacken).

**Beim Einbau anfassen (Checkliste):**

1. Kinds/Katalog + Typ-Definition (s. o.) — Lehre aus Genesis II: keine
   redundanten Varianten-Kinds anlegen; falls unvermeidbar, Entdopplung
   zentral im Katalog-Modul (Muster `entdoppleGenesisTibia` in
   `smithNephewCatalog.ts`).
2. Store (`shoulderTemplateStore` neu, Muster `kneeTemplateStore` mit
   `groupId`-Semantik, `setGroupVisible`, `gruppiereNachImplantat`) +
   Overlay (Muster `KneeTemplateOverlay`/`TemplateOverlay`; die
   Sperr-Logik `locked` in `TemplateOverlay.tsx:~78` gegenprüfen).
3. Toolbar `ShoulderSection`, Sektion „5 · Schablonen": ist heute
   **Platzhalter** (Doktrin-Kommentar an `CollapsibleSection` lesen!) —
   auf das amber/emerald-Muster von Hüfte/Knie heben; amber nur, wenn
   der Schulter-Katalog nicht leer ist (Muster `hipKatalogLeer`).
4. Rechte Liste `TemplatesPanel.tsx`: Schulter-Zeilen ergänzen (Muster
   `kneeZeilen`), „Alle löschen" + Bestätigungstext, und die beiden
   „Schulter-Schablonen sind noch nicht verfügbar"-Hinweise entfernen
   (TemplatesPanel + Toolbar Sektion 5).
5. Plan-Format: `serialize.ts` (v7 → v8, Felder optional halten —
   ältere Pläne laden unverändert), `planGrenzen.ts` (Array-Limits),
   `historyStore.ts` (Undo/Redo), `pdfExport.ts`, Reset-Stellen
   (`serialize.removeAll`, `viewerImpl` ×2 — dort wurden die
   Schulter-MESSUNGEN schon nachgezogen, Muster suchen nach
   `useShoulderStore`).
6. **RSA-Bilanz Soll/Ist**: DSA/LSA messen heute nur den Ist-Wert. Der
   „geplante" Wert entsteht aus der platzierten Schablone — Begründung
   und Abgrenzung (kein Vergleich über verschiedene Aufnahmen!) steht im
   Plan direkt unter der B.5-Tabelle.

## Leitplanken (nicht verhandelbar)

- Kommentare/Commits **deutsch**; Helfer-Skripte als `.mjs` in `scripts/`.
- Messlogik **nie** ohne grüne Tests ändern; Verhaltensänderung = Test-
  Anpassung im selben Commit (Charakterisierungs-Tests).
- Keine erfundenen Schwellen/Zielbereiche — nur belegte Aussagen mit
  DOI-Quelle (Muster: DSA/LSA-Referenzzeile, `rsaBilanz.test.ts` prüft
  sogar, dass dort keine Zahl steht).
- Patienten-DICOMs und Hersteller-Material bleiben lokal, nie committen.
- `npm audit fix --force` niemals ausführen.
- Primärer Test ist der lokale Klick-Test; `npm run verify` vor jedem
  Commit; nach UI-Änderungen kurze Browser-Prüfung.

## Dateien (Einstieg → Detail)

- `docs/HANDOFF_schulter-schablonen.md` — dieses Dokument (Einstieg)
- `docs/schulter-modul-plan.md` — Recherche, Entscheidungen, B.5-Tabelle
  mit Status je Schritt, B.7/B.8 zur Schnittstelle
- `docs/schablonen-pakete.md` — Paket-Format, Import/Export, Sicherung
- `src/lib/shoulder/` — Rezepte + Einordnungen (csa/ahd/acromionIndex/
  rsaBilanz) samt Tests
- `src/state/shoulderStore.ts` — Seite (pro Messung eingefroren!) +
  Prothesentyp
- `src/lib/templates/{packageFormat,registry}.ts` — die zu erweiternde
  Paket-Pipeline
