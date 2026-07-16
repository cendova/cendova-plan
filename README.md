# CendovaPlan

Browser-basiertes Planungstool für **Hüft- und Knie-Endoprothetik** (DICOM) —
Teil der **Cendova**-Suite (geplant: CendovaView · CendovaCare).

> ⚠️ **Kein Medizinprodukt.** Lern-/Forschungsprojekt, nicht CE-zertifiziert,
> **nicht für die klinische Anwendung** bestimmt. Details: [DISCLAIMER.md](DISCLAIMER.md).

## Funktionen

- DICOM-Röntgen laden, anzeigen, kalibrieren — rein lokal im Browser
- **Hüfte:** Messungen (LLD, globales Offset, CE-/CCD-Winkel), Pfannen-/
  Schaft-Templating, Osteotomie-Planer, LLD-Bilanz prä/post
- **Knie:** 17-Punkt-Vollvermessung (mHKA, mLDFA, mMPTA, JLCA),
  CPAK-Klassifikation, Implantat-Positionierung mit Live-CPAK,
  Zwei-Bild-Ansicht AP + seitlich
- Plan speichern/laden (JSON mit eingebettetem Bild), PDF-Export

## Datenschutz

Patientenbezogene Bilddaten werden **ausschließlich lokal** im Browser
verarbeitet — kein Server, keine Übertragung. Siehe [DISCLAIMER.md](DISCLAIMER.md).

## Entwicklung

Voraussetzung: Node.js ≥ 20.

```bash
npm install
npm run dev       # Dev-Server + Browser: http://localhost:5173
npm run verify    # Typecheck + Build (Abnahmekriterium)
```

Testen: [docs/test-runbook.md](docs/test-runbook.md) ·
Klinik-Installation: [docs/klinik-installation.md](docs/klinik-installation.md)

## Stack

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Cornerstone3D (WebGL) —
reines Frontend, kein Backend.

## Lizenz

[Apache-2.0](LICENSE) · Copyright 2026 Philipp A. Michel — siehe [NOTICE](NOTICE)
und [DISCLAIMER.md](DISCLAIMER.md).
