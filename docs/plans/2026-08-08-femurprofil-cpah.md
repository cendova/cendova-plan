# Femurprofil, Dorr/CPAH und optionale Schaftstrategie – Implementierungsplan

> **Für Claude/Hermes:** Diesen Plan taskweise und testgetrieben umsetzen. Vor Beginn `CLAUDE.md`, `docs/test-runbook.md` und `docs/HANDOFF_femurprofil-cpah.md` lesen.

**Ziel:** Eine optionale Hüft-„Vollvermessung“ namens **Femurprofil** implementieren, die aus nachvollziehbaren Landmarken CI, CCR, FOR, einen bestätigbaren Dorr-Vorschlag und CPAH berechnet und später schaftspezifische Planungshinweise ermöglicht.

**Architektur:** Der mathematische Kern liegt als reine, UI-unabhängige Rechen-Engine in `src/lib/hip/`. Eine einzelne neue Hip-Recipe orchestriert die geführte Punktsetzung. Toolbar, Overlay, Ergebnisdarstellung, Persistenz und PDF verwenden ausschließlich dieselben berechneten Rohwerte. Klinische Klassen werden als Vorschlag mit sichtbaren Rohwerten und manueller Bestätigung gespeichert.

**Tech Stack:** React 19, TypeScript, Zustand, Cornerstone3D, SVG-Overlay, Vitest, Vite.

---

## Umfang und PR-Strategie

Die Arbeit sollte in zwei PRs beziehungsweise zwei klaren Phasen bleiben:

### Phase A – Femurprofil

- quantitative Messung,
- Dorr-Vorschlag,
- CPAH,
- Qualitäts-/Grenzbereichsanzeige,
- manuelle Bestätigung/Override,
- Plan-JSON und PDF,
- keine implantatspezifische Therapieempfehlung.

### Phase B – schaftspezifische Planung

- generisches Schaftprofil im Schablonenpaket,
- Quadra-/Quadra-P-Metadaten,
- regelbasierter Variantenvergleich,
- Delta-FO/LLD und Fixationshinweise.

Phase B erst beginnen, wenn die lokal verwendeten Schaftvarianten und klinischen Regeln mit Philipp bestätigt sind. Der Branch darf beide Phasen tragen; ein erster Draft-PR nach Phase A ist vorzuziehen.

---

# Phase A – Femurprofil

## Task 0: Ausgangszustand und Branch prüfen

**Ziel:** Sicherstellen, dass die Implementierung auf dem vorgesehenen Branch und einem grünen Ausgangszustand beginnt.

**Dateien:** keine Änderung.

**Schritte:**

1. Branch prüfen:

```bash
git branch --show-current
```

Erwartet: `feat/hip-femurprofil-cpah`.

2. Arbeitsbaum prüfen:

```bash
git status --short
```

Erwartet: nur die beiden Dokumentationsdateien, falls deren Commit noch nicht vorhanden ist; sonst leer.

3. Baseline verifizieren:

```bash
npm run verify
```

Erwartet: Typecheck, Tests und Build jeweils Exit 0.

4. Bei Baseline-Fehlern nicht mit Feature-Code beginnen; Ursache dokumentieren.

---

## Task 1: Reine Klassifikationslogik für Dorr und CPAH

**Ziel:** Grenzwerte und Klassifikation unabhängig von UI und Punktgeometrie testbar machen.

**Dateien:**

- Create: `src/lib/hip/femurProfile.ts`
- Create: `src/lib/hip/femurProfile.test.ts`

**Schritt 1: Failing Tests schreiben**

Mindestens folgende Fälle:

```ts
import { describe, expect, it } from 'vitest'
import {
  classifyDorr,
  classifyNsa,
  classifyOffsetSubtype,
  computeCpah,
} from './femurProfile'

describe('Dorr-Klassifikation', () => {
  it('klassifiziert klare A-, B- und C-Werte', () => {
    expect(classifyDorr(0.63).suggested).toBe('A')
    expect(classifyDorr(0.55).suggested).toBe('B')
    expect(classifyDorr(0.45).suggested).toBe('C')
  })

  it('markiert A/B- und B/C-Grenzbereiche', () => {
    expect(classifyDorr(0.60).borderline).toBe('A/B')
    expect(classifyDorr(0.50).borderline).toBe('B/C')
  })
})

describe('CPAH', () => {
  it('bildet Dorr B + norma + High-offset auf 5H ab', () => {
    expect(computeCpah('B', 'norma', 'H').code).toBe('5H')
  })
})
```

Weitere Grenztests exakt bei 0,48; 0,50; 0,52; 0,58; 0,60; 0,62; NSA 120/140 und FOR 1,60.

**Schritt 2: Test ausführen und erwartetes Fehlschlagen bestätigen**

```bash
npm test -- src/lib/hip/femurProfile.test.ts
```

Erwartet: FAIL, Modul/Funktionen fehlen.

**Schritt 3: Minimale reine Typen und Funktionen implementieren**

Benötigte Typen:

```ts
export type DorrType = 'A' | 'B' | 'C'
export type DorrBorderline = 'A/B' | 'B/C' | null
export type NsaClass = 'vara' | 'norma' | 'valga'
export type OffsetSubtype = 'N' | 'H'

export interface DorrSuggestion {
  suggested: DorrType
  borderline: DorrBorderline
  confidence: 'hoch' | 'grenzwertig'
}

export interface CpahResult {
  type: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  offsetSubtype: OffsetSubtype
  code: string
}
```

Regeln ausschließlich als benannte Konstanten an einer Stelle definieren. Im Kommentar Quelle und Unterschied zum ISCD-DXA-Trigger dokumentieren.

**Schritt 4: Test erneut ausführen**

```bash
npm test -- src/lib/hip/femurProfile.test.ts
```

Erwartet: PASS.

**Schritt 5: Commit**

```bash
git add src/lib/hip/femurProfile.ts src/lib/hip/femurProfile.test.ts
git commit -m "feat(hip): Dorr- und CPAH-Klassifikation ergänzen"
```

---

## Task 2: Geometrische Rechen-Engine aus 13 Landmarken

**Ziel:** Alle Rohwerte aus einer definierten Punktreihenfolge berechnen.

**Dateien:**

- Modify: `src/lib/hip/femurProfile.ts`
- Modify: `src/lib/hip/femurProfile.test.ts`
- Reuse helpers from: `src/lib/hip/geometry.ts`

**Definierte Punktreihenfolge:**

```text
0–2   Hüftkopfkontur
3     Schenkelhals-Mittelpunkt
4–5   Femurschaftachse proximal/distal
6     Mitte Trochanter minor
7     äußere Kortikalis medial bei 10 cm
8     innere Kortikalis medial bei 10 cm
9     innere Kortikalis lateral bei 10 cm
10    äußere Kortikalis lateral bei 10 cm
11    innerer Kanalrand medial am Calcaristhmus
12    innerer Kanalrand lateral am Calcaristhmus
```

**Schritt 1: Failing Tests mit synthetischer Geometrie**

Testfälle müssen bekannte Werte erzeugen, zum Beispiel:

- äußerer Durchmesser 40 mm,
- innerer Durchmesser 20 mm,
- `CI = 0,50`,
- Calcaristhmus 40 mm,
- `CCR = 0,50`,
- FO 64 mm und Z 40 mm,
- `FOR = 1,60`.

Zusätzlich testen:

- vertauschte Klickrichtung medial/lateral liefert positive identische Distanzen,
- ungültige Geometrie bei Z <= 0 oder X > Z,
- nahezu kollineare Hüftkopfpunkte erzeugen Warnung statt Absturz,
- fehlende/zu wenige Punkte liefern `null`.

**Schritt 2: Erwartetes Fehlschlagen bestätigen**

```bash
npm test -- src/lib/hip/femurProfile.test.ts
```

**Schritt 3: `computeFemurProfileRaw` implementieren**

Ergebnisinterface mindestens:

```ts
export interface FemurProfileRaw {
  headCenter: Types.Point3
  headRadiusWorld: number
  shaftAxis: [Types.Point3, Types.Point3]
  nsaDeg: number
  femoralOffsetMm: number
  outerDiameter10cmMm: number
  canalDiameter10cmMm: number
  medialCortexMm: number
  lateralCortexMm: number
  corticalIndex: number
  calcarIsthmusMm: number
  canalCalcarRatio: number
  femoralOffsetRatio: number
  dorr: DorrSuggestion
  nsaClass: NsaClass
  cpah: CpahResult
  warnings: string[]
}
```

`mmPerWorldUnit` explizit übergeben. Keine Rundung im Rechenkern; Rundung nur in der Anzeige.

**Schritt 4: Tests grün machen**

```bash
npm test -- src/lib/hip/femurProfile.test.ts
```

**Schritt 5: Gesamte Hip-Rechenkerne prüfen**

```bash
npm test -- src/lib/hip
```

**Schritt 6: Commit**

```bash
git add src/lib/hip/femurProfile.ts src/lib/hip/femurProfile.test.ts
git commit -m "feat(hip): Femurprofil aus Landmarken berechnen"
```

---

## Task 3: Femurprofil als einzelne Hip-Recipe ergänzen

**Ziel:** Eine geführte Messung analog zur Knievollvermessung registrieren.

**Dateien:**

- Modify: `src/lib/hip/recipes.ts`
- Modify: `src/lib/hip/recipes.test.ts`

**Schritt 1: Failing Recipe-Tests**

Prüfen:

- `getRecipe('femurProfile')` existiert,
- `needsCalibration === true`,
- exakt 13 Steps in dokumentierter Reihenfolge,
- `compute` liefert bei gültigen Punkten CI, CCR, Dorr und CPAH,
- ungültige Geometrie zeigt Warnzeile und wirft nicht.

**Schritt 2: `HipKind` erweitern**

```ts
| 'femurProfile'
```

**Schritt 3: Recipe implementieren**

Label: `Femurprofil`.

Ergebniswerte mindestens:

- `Dorr-Vorschlag`
- `Cortical Index`
- `Canal-Calcar Ratio`
- `Femorales Offset`
- `Femoral Offset Ratio`
- `CPAH`

Geometrie:

- Hüftkopfkreis,
- Hals- und Schaftachse,
- 10-cm-Referenzlinie,
- äußere/innere Femurbreite,
- Calcaristhmus,
- sparsame Labels.

**Schritt 4: Tests und Commit**

```bash
npm test -- src/lib/hip/recipes.test.ts src/lib/hip/femurProfile.test.ts
git add src/lib/hip/recipes.ts src/lib/hip/recipes.test.ts
git commit -m "feat(hip): geführtes Femurprofil registrieren"
```

---

## Task 4: Präzise Führung der 10-cm-Messlinie

**Ziel:** Der Nutzer erhält nach Setzen der Schaftachse und des Trochanter-minor-Punkts eine sichtbare, korrekte 10-cm-Hilfslinie.

**Dateien:**

- Modify: `src/lib/hip/recipes.ts`
- Modify: `src/components/HipOverlay.tsx`
- Modify, falls generisch sinnvoll: `src/components/measurementOverlay.tsx`
- Test: `src/lib/hip/recipes.test.ts`

**Designentscheidung:** Keine harte Cornerstone-/Pointer-Sonderlogik. Das Recipe darf eine optionale Draft-Geometrie liefern:

```ts
computeDraft?: (points: P[], mmPerWorldUnit: number) => RenderGeometry
```

Die Draft-Geometrie wird im `HipOverlay` zusätzlich zum bestehenden Punkt-Linienzug gerendert.

**TDD-Schritte:**

1. Test, dass ab Punkt 6 eine Linie 10 cm distal und senkrecht zur Schaftachse berechnet wird.
2. Test, dass ohne Kalibrierung keine scheinbar metrische Linie entsteht.
3. Recipe-Interface und Overlay minimal erweitern.
4. Bereits bestehende Hip-/Knee-Overlays dürfen nicht verändert werden, wenn kein `computeDraft` vorhanden ist.
5. Tests ausführen:

```bash
npm test -- src/lib/hip/recipes.test.ts
```

6. Commit:

```bash
git add src/lib/hip/recipes.ts src/lib/hip/recipes.test.ts src/components/HipOverlay.tsx src/components/measurementOverlay.tsx
git commit -m "feat(hip): 10-cm-Hilfslinie im Femurprofil anzeigen"
```

---

## Task 5: Optionale Toolbar-Sektion „Femurprofil“

**Ziel:** Das Feature bleibt optional und bläht die normale Messsektion nicht auf.

**Dateien:**

- Modify: `src/components/Toolbar.tsx`
- Test: falls UI-Testmuster vorhanden, dort ergänzen; sonst Typecheck plus manueller Smoke-Test dokumentieren.

**Gewünschte Reihenfolge:**

1. Kalibrierung
2. Messungen
3. **Femurprofil** – optional
4. Schablonen
5. Osteotomie
6. Osteophyten

**Verhalten:**

- standardmäßig eingeklappt,
- kein amberfarbener Statuspunkt, solange nicht begonnen,
- grüner Punkt nach abgeschlossener `femurProfile`-Messung,
- Button `Femurprofil starten`,
- deaktiviert ohne Bild oder Kalibrierung,
- Hilfetext: `Optional: Dorr, CPAH und Femurmorphologie quantitativ bestimmen.`

Die allgemeine Messsektion darf `femurProfile` nicht als gewöhnliche Einzelmessung zählen:

```ts
m.kind !== 'osteotomy' && m.kind !== 'femurProfile'
```

**Verifikation:**

```bash
npm run typecheck
npm test
```

**Commit:**

```bash
git add src/components/Toolbar.tsx
git commit -m "feat(hip): optionales Femurprofil in Toolbar ergänzen"
```

---

## Task 5a: Manuelles Bildqualitäts-Gate

**Ziel:** Keine Dorr-/CPAH-Klasse aus ungeeigneten Bildern ausgeben.

**Dateien:**

- Modify: `src/state/hipStore.ts`
- Create: `src/components/FemurProfileQualityGate.tsx`
- Modify: `src/components/Toolbar.tsx`
- Create/Modify Test: `src/state/hipStore.test.ts`

**Datenmodell:**

```ts
export interface FemurProfileImageQuality {
  calibrated: boolean
  apProjectionAcceptable: boolean
  rotationAcceptable: boolean
  lesserTrochanterVisible: boolean
  cortexVisible: boolean
  femurCoverage10cm: boolean
  deformityAffectsGeometry: boolean
  exclusionReasons: string[]
  confirmedAt?: string
}
```

**Verhalten:**

- Klick auf `Femurprofil starten` öffnet zuerst das Checklist-Gate.
- Kalibrierung wird technisch aus dem Viewerstatus vorbefüllt, aber angezeigt.
- Alle übrigen Kriterien sind im MVP manuelle ärztliche Bestätigungen.
- Bei nicht bestandenem Gate darf der Nutzer die Messung zu Dokumentationszwecken fortsetzen, aber Dorr/CPAH müssen als `nicht zuverlässig bestimmbar` unterdrückt werden.
- Keine automatische Rotationserkennung im MVP behaupten.
- Qualität und Ausschlussgründe müssen zusammen mit der Femurprofil-Messung persistierbar sein; die genaue Kopplung an das Measurement wird in Task 7 abgeschlossen.

**Tests:**

- `isFemurProfileClassifiable` ist nur bei bestandenem Gate wahr.
- fehlende Kalibrierung sperrt metrische Klassifikation.
- mindestens ein Ausschlussgrund bleibt beim Store-Roundtrip erhalten.

**Verifikation und Commit:**

```bash
npm test -- src/state/hipStore.test.ts
npm run typecheck
git add src/state/hipStore.ts src/state/hipStore.test.ts src/components/FemurProfileQualityGate.tsx src/components/Toolbar.tsx
git commit -m "feat(hip): Bildqualität vor Femurklassifikation prüfen"
```

---

## Task 6: Ergebnisdarstellung „Morphologie & Fixation“

**Ziel:** Ergebnisse kompakt und klinisch vorsichtig anzeigen.

**Dateien:**

- Create: `src/components/FemurProfileCard.tsx`
- Modify: `src/components/MeasurementPanel.tsx`
- Optional create: `src/components/CpahMatrix.tsx`
- Test: `src/lib/hip/femurProfile.test.ts`; UI per statischem/visuellem Smoke-Test.

**Anzeigetext:**

- `Dorr-Vorschlag B`
- `CI 0,54 · CCR 0,60`
- `CPAH 5H · Dorr B · coxa norma · High-offset`
- bei Grenzbereich: amberfarbener Hinweis,
- bei CPAH 7–9: `Dorr C: zementierte Fixation/Alternative aktiv prüfen. Geometrischer Fit hebt das Frakturrisiko nicht auf.`

Verbotene Formulierungen:

- `Implantat X verwenden`
- `zementfrei kontraindiziert`
- `Osteoporose diagnostiziert`

**CPAH-Matrix:** Analog `src/components/CpakMatrix.tsx`, aber nur wenn der Aufwand klein bleibt. Sonst zunächst Textcode; Matrix in Folgecommit.

**Verifikation:**

```bash
npm run typecheck
npm test
npm run build
```

**Commit:**

```bash
git add src/components/FemurProfileCard.tsx src/components/MeasurementPanel.tsx src/components/CpahMatrix.tsx
git commit -m "feat(hip): Femurmorphologie und CPAH anzeigen"
```

Nur tatsächlich vorhandene Dateien stagen.

---

## Task 7: Ärztliche Bestätigung und Override

**Ziel:** Automatischen Vorschlag und ärztliche finale Klasse getrennt speichern.

**Dateien:**

- Modify: `src/state/hipStore.ts`
- Modify: `src/components/FemurProfileCard.tsx`
- Create/Modify Test: `src/state/hipStore.test.ts`

**Datenmodell:**

```ts
export interface FemurProfileReview {
  imageQuality: FemurProfileImageQuality
  dorrFinal?: DorrType
  overrideReason?:
    | 'rotation'
    | 'kortikalis_unscharf'
    | 'deformitaet'
    | 'laterale_aufnahme'
    | 'gesamtmorphologie'
    | 'sonstiges'
  confirmedAt?: string
}
```

Als optionales Feld an `HipMeasurement`:

```ts
femurProfileReview?: FemurProfileReview
```

Store-Aktion:

```ts
setFemurProfileReview(id, review)
```

**Regeln:**

- ohne Bestätigung bleibt Anzeige `Dorr-Vorschlag`,
- bei identischer Bestätigung `Dorr bestätigt`,
- bei abweichender Klasse ist ein Grund Pflicht,
- Zeitstempel erst beim Speichern der Bestätigung,
- kein Nutzername und keine Patientendaten.

**Tests:**

- Bestätigung wird am richtigen Measurement gespeichert,
- Override ohne Grund wird abgelehnt,
- Nicht-Femurprofil-Messung wird nicht verändert,
- Reset/Remove verhält sich wie bisher.

**Commit:**

```bash
git add src/state/hipStore.ts src/state/hipStore.test.ts src/components/FemurProfileCard.tsx
git commit -m "feat(hip): Dorr-Vorschlag ärztlich bestätigbar machen"
```

---

## Task 8: Plan-JSON auf Version 10 erweitern

**Ziel:** Femurprofil samt Review abwärtskompatibel speichern und laden.

**Dateien:**

- Modify: `src/lib/plan/serialize.ts`
- Create: `src/lib/plan/serializeFemurProfile.test.ts`

**Schritte:**

1. Failing Test mit einem v9-Plan ohne Review: lädt unverändert.
2. Failing Roundtrip-Test mit `femurProfile` und Review.
3. `PLAN_FORMAT_VERSION` von 9 auf 10 erhöhen.
4. Kommentar ergänzen:

```ts
// Version 10: + Femurprofil-Review (Dorr-Bestätigung/Override)
```

5. Da `HipMeasurement` bereits komplett persistiert wird, keine parallele zweite Datenstruktur einführen.
6. IDs nach Laden weiterhin über `ensureIdsAbove` absichern.

**Verifikation:**

```bash
npm test -- src/lib/plan/serializeFemurProfile.test.ts src/lib/plan/serializeFragmente.test.ts src/lib/plan/planGrenzen.test.ts
```

**Commit:**

```bash
git add src/lib/plan/serialize.ts src/lib/plan/serializeFemurProfile.test.ts
git commit -m "feat(plan): Femurprofil in Planformat v10 speichern"
```

---

## Task 9: PDF-Zusammenfassung ergänzen

**Ziel:** Nur das Femurprofil, nicht alle bisherigen Hüft-Einzelmessungen, in die PDF-Zusammenfassung aufnehmen.

**Dateien:**

- Modify: `src/lib/plan/pdfExport.ts`
- Optional test/script: bestehendes PDF-Testmuster verwenden oder kleinen reinen Formatter extrahieren und testen.

**Ausgabe:**

Abschnitt `Femurprofil` mit:

- finalem Dorr oder `Dorr-Vorschlag`,
- CI,
- CCR,
- FO/FOR,
- CPAH,
- Grenzbereich/Warnung,
- `Planungshinweis – keine autonome Implantatentscheidung`.

Keine Patientendaten ergänzen.

**Verifikation:**

```bash
npm run typecheck
npm test
npm run build
```

Wenn ein PDF-Testskript ergänzt wird, dessen Artefakte nur unter `.test-artifacts/` ablegen.

**Commit:**

```bash
git add src/lib/plan/pdfExport.ts
git commit -m "feat(pdf): Femurprofil in Zusammenfassung aufnehmen"
```

---

## Task 10: Wiederverwendung vorhandener CCD-Punkte

**Ziel:** Doppeltes Klicken vermeiden, ohne bestehende Messungen implizit zu verändern.

**Dateien:**

- Modify: `src/state/hipStore.ts`
- Modify: `src/lib/hip/recipes.ts`
- Modify Tests: `src/state/hipStore.test.ts`, `src/lib/hip/recipes.test.ts`

**Vorgehen:**

- Generische Prefill-Unterstützung nicht unnötig ausweiten.
- Beim Start von `femurProfile` die jüngste vollständige `ccd`-Messung suchen.
- Punkte 0–5 übernehmen, wenn exakt sechs valide Punkte vorhanden sind.
- Der Nutzer startet dann bei Schritt 7/13.
- Übernommene Punkte sind im Draft vollständig editierbar.
- Wenn keine gültige CCD-Messung existiert, normal bei Schritt 1 starten.

**Tests:**

- gültige CCD wird übernommen,
- unvollständige/ungültige CCD wird ignoriert,
- andere Messungen werden nicht übernommen,
- erneutes Öffnen nach Abschluss startet keine zweite unbeabsichtigte Messung.

**Commit:**

```bash
git add src/state/hipStore.ts src/state/hipStore.test.ts src/lib/hip/recipes.ts src/lib/hip/recipes.test.ts
git commit -m "feat(hip): CCD-Landmarken im Femurprofil wiederverwenden"
```

---

## Task 11: Dokumentation und manueller Testfahrplan

**Ziel:** Lokale klinische Prüfung ohne Patientendaten dokumentieren.

**Dateien:**

- Modify: `docs/test-runbook.md`
- Modify: `docs/HANDOFF_femurprofil-cpah.md` nur falls Entscheidungen geändert wurden.

**Testfahrplan ergänzen:**

1. Hüft-AP-DICOM ausschließlich lokal laden.
2. Kalibrieren.
3. `Femurprofil` öffnen.
4. Workflow komplett ohne vorhandene CCD durchführen.
5. Ergebniswerte plausibilisieren.
6. Messpunkte verschieben; Werte müssen live aktualisieren.
7. Dorr bestätigen und abweichend mit Grund überschreiben.
8. Plan speichern/laden; Review und Werte erhalten.
9. PDF exportieren; Femurprofilabschnitt vorhanden.
10. Zweiter Durchlauf mit bestehender CCD-Messung; Punkte 0–5 werden übernommen.
11. Grenzfälle A/B und B/C mit nichtpatientenbezogenen Testbildern oder synthetischer Geometrie prüfen.

**Commit:**

```bash
git add docs/test-runbook.md docs/HANDOFF_femurprofil-cpah.md
git commit -m "docs: Testfahrplan für das Femurprofil ergänzen"
```

---

## Task 12: Phase-A-Gesamtprüfung

**Ziel:** Feature technisch abnehmen, bevor schaftspezifische Regeln beginnen.

**Schritte:**

1. Vollständige Prüfung:

```bash
npm run verify
```

Erwartet: Exit 0.

2. Optionaler Laufzeit-Smoke-Test:

```bash
npm run shot
```

Erwartet: App mountet, keine Laufzeitfehler. Screenshots unter `.test-artifacts/`.

3. Diff prüfen:

```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```

4. Prüfen, dass keine DICOMs, Zugangsdaten oder generierten klinischen Daten enthalten sind:

```bash
git status --short
git diff --check
```

5. Draft-PR gegen `main`, niemals gegen `stable`.

**Abnahmekriterien Phase A:**

- Femurprofil optional und standardmäßig eingeklappt.
- Dorr/CPAH kommen aus einer einzigen Rechen-Engine.
- CI/CCR/FOR numerisch getestet.
- Grenzbereiche sichtbar.
- Dorr bleibt Vorschlag bis zur Bestätigung.
- Dorr C erzeugt eine vorsichtige Fixationswarnung, keine autonome Entscheidung.
- alte v9-Pläne laden.
- v10-Roundtrip erhält Review.
- `npm run verify` grün.
- lokaler Test mit echtem DICOM bleibt vor Merge nach `stable` zwingend.

---

# Phase B – schaftspezifische Planung

## Task 13: Lokales Schaftportfolio fachlich bestätigen

**Ziel:** Keine Hersteller- oder Variantenannahmen in Code gießen.

**Kein Code vor Klärung.** Mit Philipp festlegen:

- Quadra-H: Standard, lateralisiert, Short Neck?
- Quadra-S noch klinisch verwendet?
- Quadra-C vorhanden?
- Quadra-P collarless, collared, cemented?
- Welche Größen und CCD-Varianten enthält das importierte Paket?
- Welche Varianten sollen nur vergleichbar, welche als verfügbare Alternative angezeigt werden?

Ergebnis in `docs/HANDOFF_femurprofil-cpah.md` und einem fachlich bestätigten Tabellenabschnitt dokumentieren.

---

## Task 14: Generisches Schaftprofil im Paketformat

**Ziel:** Regeln nicht an Ordnernamen oder Markenstrings koppeln.

**Dateien:**

- Modify: `src/lib/templates/packageFormat.ts`
- Modify: `src/lib/templates/packageFormat.test.ts`
- Modify: `src/lib/templates/registry.ts`
- Modify: `docs/schablonen-pakete.md`

**Vorgeschlagenes optionales Profil:**

```ts
export interface StemPlanningProfile {
  fixation: 'cementless' | 'cemented'
  collar: 'none' | 'collared'
  geometry: 'rectangular-triple-taper' | 'other'
  primaryFixation: 'metaphyseal' | 'metadiaphyseal' | 'diaphyseal' | 'cement'
  ccdDeg: number
  neckVariant?: 'regular' | 'short'
  offsetVariant?: 'standard' | 'lateralized'
  intendedUse: 'primary' | 'revision'
}
```

Schema abwärtskompatibel optional halten. Paketvalidierung mit positiven und negativen Tests.

---

## Task 15: Reine regelbasierte Schaft-Hinweise

**Ziel:** Erklärbare Hinweise aus finalem Dorr, CPAH und Schaftprofil erzeugen.

**Dateien:**

- Create: `src/lib/hip/stemPlanningRules.ts`
- Create: `src/lib/hip/stemPlanningRules.test.ts`

**Regeln:**

- Dorr C + cementless collarless: rote Warnung, zementierte Alternative prüfen.
- Dorr C + cemented: keine PPF-Warnung aus dieser Regel, Bone Health bleibt separat.
- Dorr A + enger Kanal: distales Verklemmen/metaphysäres Undersizing prüfen.
- CPAH vara/H: lateralisiert vergleichen.
- CPAH valga: Überoffset bei lateralisiert warnen.
- Kein Ergebnis darf „empfohlenes Implantat“ heißen; `Planungshinweis` verwenden.

Alle Regeln mit Grundcodes und Klartext zurückgeben, zum Beispiel:

```ts
interface PlanningHint {
  severity: 'info' | 'caution' | 'warning'
  code: string
  text: string
  evidence: string[]
}
```

---

## Task 16: Tatsächlichen Variantenvergleich anbinden

**Ziel:** CPAH nur als Vorauswahl nutzen; endgültige Geometrie aus platzierten Templates bewerten.

**Dateien:**

- Reuse/Modify: `src/lib/hip/templates.ts`
- Create: `src/lib/hip/stemComparison.ts`
- Create: `src/lib/hip/stemComparison.test.ts`
- Modify: `src/components/FemurProfileCard.tsx`
- Modify: `src/components/SelectedTemplatePanel.tsx` oder tatsächlichen bestehenden Variantenselektor nach Codeprüfung.

**Parameter:**

- Delta-FO,
- Delta-LLD,
- Schaftrotation relativ zur Femurachse,
- Schafttiefe,
- Collar-Calcar-Abstand, falls Profil collared,
- proximale/distale Füllung erst dann, wenn Schaftkontur und Kanalgrenzen robust verfügbar sind.

Keine statische Zuordnung `CPAH 5H -> Quadra-P LAT`. Stattdessen relevante Varianten vergleichen und Differenzen anzeigen.

---

## Task 17: Phase-B-Abnahme

**Abnahmekriterien:**

- lokale Schaftliste fachlich bestätigt,
- Regeln basieren auf strukturierten Schaftprofilen, nicht Dateinamen,
- Herstelleroberfläche wird nicht als Ersatz für Primärstabilität behandelt,
- Dorr/Fixationssicherheit dominiert geometrischen CPAH-Fit,
- alle Hinweise haben sichtbare Gründe,
- keine autonome Therapieentscheidung,
- `npm run verify` grün,
- lokaler Test durch Philipp vor Merge nach `stable`.

---

# Reviewfragen an Claude vor Implementierungsbeginn

1. Ist ein 13-Punkt-Recipe mit bestehender Overlay-Architektur ausreichend, oder braucht die 10-cm-Linie eine kleine generische Draft-Geometrie-Erweiterung?
2. Kann das CCD-Prefill ohne Duplikation der Store-Logik sauber in `hipStore.toggleTool` erfolgen?
3. Sollte `femurProfileReview` am `HipMeasurement` hängen oder als separates Store-Objekt geführt werden? Bevorzugt ist das optionale Feld am Measurement, sofern Undo/Redo und Persistenz sauber bleiben.
4. Welche bestehenden Characterization-Tests müssen vor einer Änderung an Toolbar, Overlay oder Planformat ergänzt werden?
5. Gibt es eine einfachere, DRY-konforme Möglichkeit, die CPAH-Matrix analog zur bestehenden `CpakMatrix` zu implementieren?
6. Welche Teile dieses Plans sind unnötig komplex und können ohne Verlust der klinischen Nachvollziehbarkeit entfallen?

Claude soll unsupported assumptions, Sicherheitsrisiken oder eine kleinere robustere Architektur vor dem ersten Code-Commit ausdrücklich benennen.
