# Mitwirken an CendovaPlan

Danke für dein Interesse! CendovaPlan ist ein Lern-/Forschungsprojekt —
**kein Medizinprodukt**, nicht CE-zertifiziert, nicht für die klinische
Anwendung bestimmt (siehe [DISCLAIMER.md](DISCLAIMER.md)).

## Entwicklung

Voraussetzung: Node.js ≥ 20.

```bash
npm install
npm run dev       # Dev-Server: http://localhost:5173
npm run verify    # Typecheck + Unit-Tests + Build — muss vor jedem PR grün sein
```

Details zum Testen: [docs/test-runbook.md](docs/test-runbook.md).

## Harte Regeln

- **Keine Hersteller-Daten:** Implantat-Bilder, -Konturen, -Kataloge oder
  -Maßtabellen sind urheberrechtlich geschützt und dürfen **niemals** ins
  Repository — auch nicht in Issues, PRs oder Screenshots. Schablonen kommen
  ausschließlich über private, lokal importierte Pakete
  ([docs/schablonen-pakete.md](docs/schablonen-pakete.md)).
- **Keine Patientendaten:** DICOM-Dateien und alles mit Patientenbezug
  bleiben lokal. Für Screenshots synthetische Bilder verwenden
  (`scripts/generate-sample-dicom.mjs`).
- **Messlogik nie ohne grüne Tests ändern:** Die Rechenkerne
  (`src/lib/**/*.test.ts`) sind durch Charakterisierungs-Tests abgesichert.
  Gewollte Verhaltensänderungen brauchen die zugehörige Test-Anpassung
  **im selben Commit**.

## Konventionen

- Commit-Nachrichten und Code-Kommentare auf **Deutsch** (siehe History).
- Helfer-Skripte als `.mjs` in `scripts/`.
- Kein `npm audit fix --force` (bricht Versionsstände).
