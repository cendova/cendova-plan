# Femurprofil, Dorr/CPAH und optionale Schaftstrategie – Implementierungsplan

> **Für Claude/Hermes:** Diesen Plan taskweise und testgetrieben umsetzen. Vor Beginn `CLAUDE.md`, `docs/test-runbook.md` und `docs/HANDOFF_femurprofil-cpah.md` lesen.
>
> **Review eingearbeitet (08.08.2026):** Der Plan wurde gegen den Code auf
> `main`/`dcb96d1` geprüft; die Reviewfragen am Ende sind beantwortet, die
> Korrekturen stehen direkt in den Tasks. Commit-Messages folgen der
> Repo-History (deutsche Prosa-Titel, KEIN `feat(...)`-Präfix).

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

Erwartet: leer. Die Dokumentation dieses Vorhabens (dieser Plan,
`docs/HANDOFF_femurprofil-cpah.md`, das Mockup
`docs/screenshots/cpah-matrix-mockup.png` und der zugehörige
`docs/screenshots/QUELLEN.md`-Eintrag) ist bereits committet — kein
späterer Task stagt diese Dateien noch.

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
  // BEWUSST KEIN eigenes confidence-Feld: es wäre vollständig aus
  // `borderline` ableitbar (null = sicher, sonst grenzwertig) — zwei
  // Felder für eine Information laufen auseinander.
}

export interface CpahResult {
  type: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  offsetSubtype: OffsetSubtype
  code: string
}
```

Regeln ausschließlich als benannte Konstanten an einer Stelle definieren.
Quellenpflicht (Projekt-Leitplanke, Muster DSA/LSA):

- CI-Grenzen 0,50/0,60, NSA-Grenzen 120°/140° und FOR 1,60 stammen laut
  Handoff aus dem CPAH-Paper (Stauss et al., J Arthroplasty 2026,
  [DOI 10.1016/j.arth.2026.05.011](https://doi.org/10.1016/j.arth.2026.05.011)).
  **Prüfung durchgeführt am 08.08.2026, Ergebnis: offen.** Am Abstract
  verifiziert ist nur die STRUKTUR — neun Morphotypen aus Dorr-Typ und
  NSA, je eine Normal- und eine High-Offset-Untergruppe; die dort
  genannten Typen („2N, 5N, 5H, 6N, 8N") bestätigen die Schreibweise
  Zahl+N/H. Die ZAHLEN stehen nicht im Abstract, und der Volltext ist
  nicht frei zugänglich (kein PMC-Eintrag, `convert_article_ids` liefert
  keine PMCID; der Dorr-Übersichtsartikel PMC7371079 gibt leeren
  Volltext). Die Werte sind daher aus dem Handoff übernommen und im
  Modulkopf von `femurProfile.ts` ausdrücklich als **nicht am Volltext
  geprüft** markiert. Nicht erneut über PubMed suchen — das ist erledigt;
  offen ist nur der Zugriff auf den Volltext (Philipp hat ihn).
- Die Grenz**zonen** 0,58–0,62 und 0,48–0,52 sind eine **eigene
  Konvention** dieses Projekts (im Handoff „vorgeschlagen"), keine
  Paper-Angabe — im Kommentar ausdrücklich so kennzeichnen.
- Unterschied zum ISCD-DXA-Trigger (CI < 0,40 = DXA-Empfehlung, KEINE
  CPAH-Grenze) im selben Kommentar dokumentieren.

**Schritt 4: Test erneut ausführen**

```bash
npm test -- src/lib/hip/femurProfile.test.ts
```

Erwartet: PASS.

**Schritt 5: Commit**

```bash
git add src/lib/hip/femurProfile.ts src/lib/hip/femurProfile.test.ts
git commit -m "Dorr- und CPAH-Klassifikation ergänzen"
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
11    innerer Kanalrand medial auf Höhe Mitte Trochanter minor (Calcar-Ebene)
12    innerer Kanalrand lateral auf Höhe Mitte Trochanter minor (Calcar-Ebene)
```

> Terminologie: bewusst NICHT „Calcaristhmus" — der Isthmus ist die engste
> Stelle der Diaphyse und liegt deutlich distaler. Gemeint ist die
> Kanalbreite auf Calcar-Höhe (Dorr-Referenzebene, CCR-Nenner).

**Schritt 1: Failing Tests mit synthetischer Geometrie**

Testfälle müssen bekannte Werte erzeugen, zum Beispiel:

- äußerer Durchmesser 40 mm,
- innerer Durchmesser 20 mm,
- `CI = 0,50`,
- Kanalbreite auf Calcar-Höhe 40 mm,
- `CCR = 0,50`,
- FO 64 mm und Z 40 mm,
- `FOR = 1,60`.

Zusätzlich testen:

- vertauschte Klickrichtung medial/lateral liefert positive identische Distanzen,
- ein 2 mm NEBEN der 10-cm-Linie gesetzter Kortikalis-Punkt liefert dieselbe
  Breite (Breiten entstehen aus der PROJEKTION der vier Punkte auf die
  Senkrechte zur Schaftachse, nicht aus rohen Punktabständen — sonst
  überschätzt jede Klick-Toleranz systematisch; Helfer
  `closestPointOnLine`/`perpendicularDistance` existieren in `lib/geometry`),
- ungültige Geometrie bei Z <= 0 oder X > Z,
- nahezu kollineare Hüftkopfpunkte erzeugen Warnung statt Absturz,
- fehlende/zu wenige Punkte liefern `null`.

**Schritt 2: Erwartetes Fehlschlagen bestätigen**

```bash
npm test -- src/lib/hip/femurProfile.test.ts
```

**Schritt 3: `computeFemurProfileRaw` implementieren**

Ergebnisinterface (Stand der Umsetzung — die Null-Semantik ist eine
bewusste Präzisierung: die Klassifizierer werfen bei NaN, also darf
unbrauchbare Geometrie sie gar nicht erst erreichen; `warnings` sagt
warum ein Wert fehlt):

```ts
export interface FemurProfileRaw {
  headCenter: Types.Point3
  headRadiusWorld: number
  shaftAxis: [Types.Point3, Types.Point3]
  nsaDeg: number | null // null, wenn die Halsmitte (fast) im Kopfzentrum liegt (Nullvektor-Falle)
  femoralOffsetMm: number
  outerDiameter10cmMm: number
  canalDiameter10cmMm: number
  medialCortexMm: number
  lateralCortexMm: number
  corticalIndex: number | null // null bei Z = 0; bleibt als Rohwert stehen, wenn implausibel (dann dorr = null)
  canalCalcarMm: number // Kanalbreite auf Calcar-Höhe (Mitte Troch. minor)
  canalCalcarRatio: number | null // null bei Y = 0; reine Anzeigegröße, kein CPAH-Input
  femoralOffsetRatio: number | null // null bei Z = 0
  dorr: DorrSuggestion | null // null bei Z = 0, X = 0 oder wenn die vier Kortikalis-Ablagen nicht streng außen–innen–innen–außen geordnet sind (fängt auch einseitig vertauschte Punkte, die X < Z lassen)
  nsaClass: NsaClass | null // null, wenn nsaDeg null ist
  cpah: CpahResult | null // null, sobald Dorr, NSA oder FOR fehlt
  warnings: string[]
}
```

`mmPerWorldUnit` explizit übergeben. Keine Rundung im Rechenkern; Rundung
nur in der Anzeige. Rückgabe `null` bei unvollständigen Punkten und bei
Schaftachse ohne Länge (ohne Achse gibt es keine Senkrechte, also keinen
einzigen Breitenwert). Punkt 6 (Trochanter minor) verankert nur die
10-cm-Hilfslinie und geht in keinen Messwert ein — per Test festgenagelt.

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
git commit -m "Femurprofil aus Landmarken berechnen"
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
- `AVAILABLE_RECIPES` enthält `femurProfile` NICHT (wie `osteotomy`: in der
  `RECIPES`-Registry, aber nicht in der Angebotsliste der Mess-Sektion —
  sonst erscheint das Werkzeug DOPPELT: als ToolButton in „2 · Messungen"
  UND als eigene Sektion),
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
- Kanalbreite auf Calcar-Höhe,
- sparsame Labels.

**Schritt 4: Tests und Commit**

```bash
npm test -- src/lib/hip/recipes.test.ts src/lib/hip/femurProfile.test.ts
git add src/lib/hip/recipes.ts src/lib/hip/recipes.test.ts
git commit -m "geführtes Femurprofil registrieren"
```

---

## Task 4: Präzise Führung der 10-cm-Messlinie

**Ziel:** Der Nutzer erhält nach Setzen der Schaftachse und des Trochanter-minor-Punkts eine sichtbare, korrekte 10-cm-Hilfslinie.

**Dateien:**

- Modify: `src/lib/hip/recipes.ts`
- Modify: `src/components/measurementOverlay.tsx` — das **Rendern** gehört
  in den geteilten Kern (`MeasurementSvg`), als weiterer optionaler Prop.
- Modify: `src/components/HipOverlay.tsx` — das **Berechnen** gehört hierher.
  Das ist keine Doppelarbeit, sondern das bestehende Muster: `MeasurementSvg`
  kennt weder das aktive Rezept noch den Kalibrierfaktor; `HipOverlay` hat
  beides (`recipe`, `factor`) und reicht rezept-abgeleitete Daten schon
  heute als Prop durch (`draftLineGroups={recipe?.lineGroups}`).
- Test: `src/lib/hip/recipes.test.ts`

Knie- und Schulter-Overlay bleiben unberührt, weil sie den neuen Prop
schlicht nicht setzen.

**Designentscheidung:** Keine harte Cornerstone-/Pointer-Sonderlogik. Das Recipe darf eine optionale Draft-Geometrie liefern:

```ts
computeDraft?: (points: P[], mmPerWorldUnit: number | null) => RenderGeometry
```

**`number | null` ist die entscheidende Stelle, nicht Kosmetik:**
`HipOverlay` berechnet heute `const factor = calibration?.mmPerWorldUnit ?? 1`.
Wer diesen `factor` durchreicht, löscht genau die Information, die
Schritt 2 verlangt — unkalibriert und echte DICOM-Kalibrierung mit Faktor
1 wären im Rezept ununterscheidbar, und dort bliebe nur die verbotene
Prüfung `=== 1`. Deshalb `null` für „nicht kalibriert":

```ts
recipe?.computeDraft?.(draftPoints, calibration ? factor : null)
```

(`calibration` liegt in `HipOverlay` bereits vor; `recipe` ist dort
`Recipe | undefined`, das Fragezeichen muss also auch hinter `recipe` —
genau wie beim bestehenden `draftLineGroups={recipe?.lineGroups}`.)
Das Ergebnis geht an `MeasurementSvg` und wird dort über denselben
`OverlayGeometry`-Renderpfad gezeichnet, den fertige Messungen benutzen —
kein zweiter Zeichen-Pfad.

**TDD-Schritte:**

1. Test, dass ab Punkt 6 eine Linie 10 cm distal und senkrecht zur Schaftachse berechnet wird.
2. Test, dass ohne Kalibrierung keine scheinbar metrische Linie entsteht:
   `computeDraft(punkte, null)` liefert keine bemaßte Linie,
   `computeDraft(punkte, 1)` sehr wohl.
   **Kriterium ist `calibration != null`, NICHT `mmPerWorldUnit === 1`** —
   bei Kalibrierung aus DICOM-Pixelabstand ist der Faktor exakt 1 als
   ECHTER Wert (Cornerstone-Welt = mm; dieselbe Falle wie beim AHD).
   Weil `HipOverlay` das `null` einsetzt, bleibt der Test ein reiner
   Rezept-Test in `recipes.test.ts` — ohne Viewer-Store.
3. Recipe-Interface und Overlay minimal erweitern.
4. Rezepte ohne `computeDraft` müssen exakt wie bisher rendern — Knie- und
   Schulter-Overlay setzen den neuen Prop nicht und bleiben unverändert.
5. Tests ausführen:

```bash
npm test -- src/lib/hip/recipes.test.ts
```

6. Commit:

```bash
git add src/lib/hip/recipes.ts src/lib/hip/recipes.test.ts src/components/HipOverlay.tsx src/components/measurementOverlay.tsx
git commit -m "10-cm-Hilfslinie im Femurprofil anzeigen"
```

---

## Task 5: Optionale Toolbar-Sektion „Femurprofil“

**Ziel:** Das Feature bleibt optional und bläht die normale Messsektion nicht auf.

**Dateien:**

- Modify: `src/components/Toolbar.tsx`
- Test: keiner. Im Repo existiert kein UI-Testmuster (keine einzige
  `*.test.tsx` unter `src/components/`) — Absicherung über `npm run typecheck`
  plus den in Task 11 dokumentierten manuellen Smoke-Test.

**Gewünschte Reihenfolge:**

1. Kalibrierung
2. Messungen
3. **Femurprofil** – optional
4. Schablonen
5. Osteotomie
6. Osteophyten

**Verhalten:**

- Section-id `hip-femurprofil` (NEU); die bestehenden ids (`hip-cal`,
  `hip-measure`, `hip-templates`, `hip-osteotomy`, `hip-osteophytes`)
  NICHT umbenennen — sie sind localStorage-Schlüssel der gemerkten
  Einklapp-Zustände. Nur die Titel-Nummern (Strings) ändern sich.
- standardmäßig eingeklappt,
- kein amberfarbener Statuspunkt, solange nicht begonnen (Doktrin
  „optionaler Schritt": emerald oder nichts),
- grüner Punkt nach abgeschlossener `femurProfile`-Messung,
- Button `Femurprofil starten` im Hero-Stil der Knie-Vollvermessung
  (violett), damit „geführter Workflow" wiedererkennbar ist,
- deaktiviert ohne Bild oder ohne Kalibrierung (`calibration != null`).
  **Diese Sperre ist tragend, nicht kosmetisch** (Befund aus dem Review zu
  Task 4): `needsCalibration` ist im Bestand NUR ein Anzeige-Hinweis
  („· unkalibriert" in `MeasurementPanel`), kein Gate. Unkalibriert
  bekommt `compute` über `computeVisible` immer den Ersatzfaktor 1 —
  die Führungslinie bleibt dann zwar korrekt aus (`computeDraft` erhält
  `null`), die FERTIGE Messung zeichnet aber weiterhin eine „10-cm"-Linie
  bei 100 Welteinheiten und die Werteliste zeigt mm-Zahlen, die keine
  sind. Ohne die Sperre liefen die Schritt-Texte „auf der 10-cm-Linie"
  also ins Leere. Der Einstiegspunkt ist die einzige Stelle, die das
  verhindern kann: im Rezept sind unkalibriert und echte
  DICOM-Kalibrierung mit Faktor 1 prinzipiell ununterscheidbar.
- Hilfetext: `Optional: Dorr, CPAH und Femurmorphologie quantitativ bestimmen.`
- **Doktrin-Ausnahme dokumentieren:** Die HipSection-Regel „optionale
  Schritte hinten" wird hier bewusst durchbrochen — das Femurprofil ist
  eine Messung und muss VOR den Schablonen stehen, weil sein Ergebnis die
  Schaftwahl informiert. Begründung in den Ablauf-Kommentar der
  HipSection aufnehmen, sonst „repariert" die nächste Konsistenz-Runde
  die Position zurück.

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
git commit -m "optionales Femurprofil in Toolbar ergänzen"
```

---

## Task 5a: Manuelles Bildqualitäts-Gate

**Ziel:** Keine Dorr-/CPAH-Klasse aus ungeeigneten Bildern ausgeben.

**Dateien:**

- Modify: `src/state/hipStore.ts`
- Create: `src/components/FemurProfileQualityGate.tsx`
- Modify: `src/components/Toolbar.tsx`
- Create Test: `src/state/hipStore.test.ts` (existiert noch nicht)

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

Das Gate als schlanke Variante des bestehenden `ConfirmDialog`-Musters
bauen — kein neues Dialogsystem.

**Zwischenzustand definiert:** Bricht der Nutzer die Messung nach
bestandenem Gate ab (`cancelTool`), wird der Gate-Zustand verworfen —
ein späterer Neustart beginnt wieder mit der Checkliste. Sonst klebte
eine alte Bestätigung an einer neuen Aufnahme.

**Tests:**

- `isFemurProfileClassifiable` ist nur bei bestandenem Gate wahr.
- fehlende Kalibrierung sperrt metrische Klassifikation.
- mindestens ein Ausschlussgrund bleibt beim Store-Roundtrip erhalten.
- `cancelTool` verwirft den Gate-Zustand.

**Verifikation und Commit:**

```bash
npm test -- src/state/hipStore.test.ts
npm run typecheck
git add src/state/hipStore.ts src/state/hipStore.test.ts src/components/FemurProfileQualityGate.tsx src/components/Toolbar.tsx
git commit -m "Bildqualität vor Femurklassifikation prüfen"
```

---

## Task 6: Ergebnisdarstellung „Morphologie & Fixation“

**Ziel:** Ergebnisse kompakt und klinisch vorsichtig anzeigen.

**Dateien:**

- Create: `src/components/FemurProfileCard.tsx`
- Modify: `src/components/MeasurementPanel.tsx`
- Create: `src/components/CpahMatrix.tsx`
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

**CPAH-Matrix (Design beschlossen 08.08.2026, Mockup:
`docs/screenshots/cpah-matrix-mockup.png`):**

Eigene kleine Komponente `CpahMatrix.tsx` nach dem MUSTER der
`CpakMatrix` — KEINE Verallgemeinerung der CpakMatrix (die trägt
knie-spezifische Semantik). Wie beim Knie ist es ein kontinuierlicher
2D-Plot mit Zellen-Overlay, kein reines Raster — der Punkt zeigt, wie
nah die Anatomie an einer Klassengrenze liegt:

- **X-Achse: NSA**, geclampt auf [105°..155°]; Spalten vara | norma |
  valga mit Trennlinien bei 120°/140°.
- **Y-Achse: CI**, geclampt auf [0,30..0,80], hohe CI OBEN; Zeilen
  Dorr A (oben) | B | C (unten) mit Trennlinien bei 0,60/0,50.
- Zellen tragen die Typ-Nummern 1–9 (A: 1/2/3, B: 4/5/6, C: 7/8/9),
  aktive Zelle violett hervorgehoben, Punkt = (NSA, CI) amber — alles
  wie CpakMatrix.
- **Grenzzonen 0,58–0,62 und 0,48–0,52 als schmale amber Bänder**
  (geringe Deckkraft) quer über den Plot: die eigene Konvention wird
  sichtbar gemacht statt versteckt; ein Punkt im Band IST die
  Grenzbereichs-Anzeige — keine zweite Markierung nötig.
- **Dorr-C-Zeile mit dezentem rotem Grundton** (Fixationswarnung der
  Typen 7–9 ist damit räumlich verortet).
- **H/N als FOR-Leiste unter dem Plot:** horizontale Mini-Skala
  [1,0..2,2] mit Schwellen-Marke bei 1,60, Zonen-Beschriftung N | H und
  Punkt beim gemessenen FOR. Die dritte Dimension gehört sichtbar
  gemacht, nicht nur als Buchstabe im Code.
- Footer mit Rohwerten (CI, NSA, FOR, FO) in `tabular-nums` wie beim
  CPAK-Footer.
- **Kein „geplant"-Punkt** — bewusster Unterschied zur CpakMatrix: CPAH
  beschreibt die Anatomie und ändert sich durch das Implantat nicht.
  Als Kommentar in die Komponente.
- Schwellen und Bänder aus den benannten Konstanten in
  `femurProfile.ts` ableiten (dieselbe Technik wie CpakMatrix mit
  `CPAK_*_THRESHOLDS`) — Zellen, Bänder und Punkt bleiben garantiert
  konsistent zur Rechenlogik.
- Bei nicht bestandenem Gate wird die Matrix NICHT gerendert (nur
  Rohwerte) — analog `nicht zuverlässig bestimmbar`.

Reihenfolge im Task: FemurProfileCard mit Textcode zuerst, CpahMatrix
als eigener Folgecommit im selben Task.

**Verifikation:**

```bash
npm run typecheck
npm test
npm run build
```

**Commits (zwei, entsprechend der Reihenfolge oben):**

```bash
git add src/components/FemurProfileCard.tsx src/components/MeasurementPanel.tsx
git commit -m "Femurmorphologie und CPAH anzeigen"

git add src/components/CpahMatrix.tsx src/components/FemurProfileCard.tsx
git commit -m "CPAH-Matrix als 2D-Plot ergänzen"
```

---

## Task 7: Ärztliche Bestätigung und Override

**Ziel:** Automatischen Vorschlag und ärztliche finale Klasse getrennt speichern.

**Dateien:**

- Modify: `src/state/hipStore.ts`
- Modify: `src/components/FemurProfileCard.tsx`
- Modify Test: `src/state/hipStore.test.ts` (in Task 5a angelegt)

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

- `overrideReason: 'sonstiges'` bleibt im MVP OHNE Freitextfeld — sonst
  müsste `planGrenzen.ts` den neuen Freitext deckeln (DoS-Schutz), und
  ein Grund-Enum reicht für die Dokumentation.
- `setFemurProfileReview` muss einen History-Snapshot auslösen wie die
  übrigen Mutationen — sonst macht Undo die Bestätigung nicht rückgängig.
- ohne Bestätigung bleibt Anzeige `Dorr-Vorschlag`,
- bei identischer Bestätigung `Dorr bestätigt`,
- bei abweichender Klasse ist ein Grund Pflicht,
- Zeitstempel erst beim Speichern der Bestätigung,
- kein Nutzername und keine Patientendaten.

**Tests:**

- Bestätigung wird am richtigen Measurement gespeichert,
- Undo nach `setFemurProfileReview` stellt den unbestätigten Zustand wieder her,
- Override ohne Grund wird abgelehnt,
- Nicht-Femurprofil-Messung wird nicht verändert,
- Reset/Remove verhält sich wie bisher.

**Commit:**

```bash
git add src/state/hipStore.ts src/state/hipStore.test.ts src/components/FemurProfileCard.tsx
git commit -m "Dorr-Vorschlag ärztlich bestätigbar machen"
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
   (Streng genommen bräuchte ein optionales Feld am ohnehin vollständig
   persistierten Measurement KEINEN Versionssprung — v10 wird trotzdem
   gesetzt, weil im Projekt jede strukturelle Erweiterung eine Version
   bekommt und die Historie im Kommentar dokumentiert wird.
   `planGrenzen.ts` braucht KEINE Änderung, solange der Override-Grund
   ein Enum ohne Freitext bleibt.)
6. IDs nach Laden weiterhin über `ensureIdsAbove` absichern.

**Verifikation:**

```bash
npm test -- src/lib/plan/serializeFemurProfile.test.ts src/lib/plan/serializeFragmente.test.ts src/lib/plan/planGrenzen.test.ts
```

**Commit:**

```bash
git add src/lib/plan/serialize.ts src/lib/plan/serializeFemurProfile.test.ts
git commit -m "Femurprofil in Planformat v10 speichern"
```

---

## Task 9: PDF-Zusammenfassung ergänzen

**Ziel:** Nur das Femurprofil, nicht alle bisherigen Hüft-Einzelmessungen, in die PDF-Zusammenfassung aufnehmen.

**Dateien:**

- Modify: `src/lib/plan/pdfExport.ts`
- Create: `src/lib/plan/femurProfilText.ts` — reiner Formatter
  (Rohwerte → Textzeilen), keine DOM-/jsPDF-Abhängigkeit.
- Create: `src/lib/plan/femurProfilText.test.ts`

Der Formatter ist nicht optional: `pdfExport.ts` arbeitet auf DOM und
jsPDF und ist als Ganzes nicht sinnvoll testbar (dort gibt es bis heute
keinen Test), während die ausgegebenen Zeilen klinische Werte tragen.
Die Trennung folgt dem Muster `stemDisplayName`/`cupDisplayName`, nur als
eigenes, testbares Modul.

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
git add src/lib/plan/pdfExport.ts src/lib/plan/femurProfilText.ts src/lib/plan/femurProfilText.test.ts
git commit -m "Femurprofil in Zusammenfassung aufnehmen"
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
git commit -m "CCD-Landmarken im Femurprofil wiederverwenden"
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
3. **Toolbar-Smoke** (dies ist der in Task 5 und im Review-Ergebnis
   zugesagte dokumentierte Smoke-Test, da es kein UI-Testmuster gibt):
   Sektion „Femurprofil" ist eingeklappt, trägt vor dem Start KEINEN
   amberfarbenen Punkt, steht vor den Schablonen; ohne Kalibrierung ist
   der Startknopf deaktiviert; die übrigen Sektionen haben ihre gemerkten
   Einklapp-Zustände behalten (ids unverändert); das Femurprofil taucht
   NICHT als Werkzeug in „Messungen" auf.
4. `Femurprofil` öffnen — die **Bildqualitäts-Checkliste** erscheint zuerst.
5. Gate bewusst NICHT bestehen lassen: Messung ist möglich, aber Dorr/CPAH
   erscheinen als `nicht zuverlässig bestimmbar`, und die CPAH-Matrix wird
   nicht gerendert.
6. Messung abbrechen und neu starten: die Checkliste erscheint erneut
   (kein Gate-Zustand von der vorigen Aufnahme).
7. Gate bestehen; Workflow komplett ohne vorhandene CCD durchführen.
8. Ergebniswerte plausibilisieren.
9. **CPAH-Matrix sichtprüfen:** aktive Zelle passt zu Dorr und NSA, der
   Punkt sitzt an der erwarteten Stelle, FOR-Leiste zeigt N bzw. H.
10. Messpunkte verschieben; Werte und Matrix müssen live aktualisieren.
11. Dorr bestätigen und abweichend mit Grund überschreiben; Undo prüfen.
12. Plan speichern/laden; Review und Werte erhalten.
13. PDF exportieren; Femurprofilabschnitt vorhanden.
14. Zweiter Durchlauf mit bestehender CCD-Messung; Punkte 0–5 werden übernommen.
15. Grenzfälle A/B und B/C mit nichtpatientenbezogenen Testbildern oder
    synthetischer Geometrie prüfen — der Punkt muss sichtbar im amber
    Grenzband liegen.

**Commit:**

```bash
git add docs/test-runbook.md docs/HANDOFF_femurprofil-cpah.md
git commit -m "Testfahrplan für das Femurprofil ergänzen"
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

**Ergebnis der Abnahme (11.08.2026): Phase A umgesetzt.**

Tasks 0–11 sind implementiert und gepusht (`feat/hip-femurprofil-cpah`,
bis `6721a55`). `npm run verify` grün (444 Unit-Tests, Typecheck, Build je
Exit 0), dazu 117 Browser-Prüfungen in `scripts/abnahme-femurprofil/`.
Der Diff gegen `main` umfasst 24 Dateien, keine DICOMs, keine
Zugangsdaten, `git diff --check` sauber.

**Grenzwerte am Volltext verifiziert (11.08.2026).** Philipp hat das
Paper beigebracht; alle drei Schwellen sind wörtlich belegt (Methodenteil
S. 2 für CI 0,5/0,6 und NSA 120°/140°, S. 3 für FOR 1,60) und stimmen
mit der Umsetzung überein — einschließlich der EINSCHLIESSENDEN
B-Grenzen („0.5 to 0.6"). Fundstellen stehen im Modulkopf von
`femurProfile.ts`. Zwei Präzisierungen daraus:

- Die FOR-Schwelle 1,60 ist **verteilungsbasiert** (Mittelwert + 1 SD der
  Kohorte), nicht klinisch hergeleitet — sie trennt „auffällig hohes
  Offset in dieser Kohorte" ab, nicht „behandlungsbedürftig".
- FOR = FO / **Kortikalis**-Breite 10 cm distal des Trochanter minor
  (also Z, nicht der Kanal) — so implementiert.

**Was der lokale Test noch leisten muss** (die Skripte fahren nur
synthetische Geometrie): Plausibilität der Werte an echter Anatomie,
Punktsetzung am realen Röntgenbild, und die Frage, ob die
10-cm-Hilfslinie in der Praxis dort liegt, wo man sie erwartet.

**Abnahmekriterien Phase A:**

- Femurprofil optional und standardmäßig eingeklappt.
- Dorr/CPAH kommen aus einer einzigen Rechen-Engine.
- CI/CCR/FOR numerisch getestet.
- Bei nicht bestandenem Bildqualitäts-Gate werden Dorr und CPAH als
  `nicht zuverlässig bestimmbar` unterdrückt und die CPAH-Matrix nicht
  gerendert; nach Abbruch beginnt ein Neustart wieder mit der Checkliste.
- Grenzbereiche sichtbar — als amberfarbener Hinweis in der Karte UND als
  Grenzband in der Matrix.
- CPAH-Matrix zeigt die Zellen 1–9, die Grenzbänder 0,58–0,62 / 0,48–0,52
  und die FOR-Leiste; alle Schwellen aus den Konstanten in
  `femurProfile.ts` abgeleitet, nicht doppelt gepflegt.
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

**Neu gefasst am 11.08.2026, nachdem der Volltext vorlag.** Das Paper
vergleicht nicht Marken, sondern **Schaft-GEOMETRIEN** nach der
Klassifikation von Radaelli et al. (Methodenteil S. 3):

| Klasse | Beschreibung im Paper | dort geprüfte Designs |
|---|---|---|
| **A** | straight stem (Geradschaft) | 3 |
| **B3** | shortened quadrangular taper (verkürzter Rechteck-Taper) | 1 |
| **C2** | anatomic fit-and-fill | 1 |
| **F** | short stem (Kurzschaft) | 2 |

Damit ändert sich, was zu bestätigen ist. Die alte Frageliste zielte auf
Quadra-Varianten; die Ergebnisse des Papers hängen aber an der
Geometrie-Klasse, nicht am Namen. Übertragbar sind sie nur, wenn jedem
Schaft im Paket seine Klasse zugeordnet ist.

**Was Philipp bestätigen muss — in dieser Reihenfolge:**

1. **Geometrie-Klasse je Schaft im Paket.** Das Programm kennt aus dem
   Paket `family`, `variant`, Größen und den CCD-Winkel
   (`STEM_CCD_BY_FOLDER`) — die Klasse A/B3/C2/F steht dort nicht und
   lässt sich auch nicht ableiten. Ohne sie ist keine Regel aus dem
   Paper anwendbar. Das ist die eigentliche Sperre für Phase B.
2. **Fixation je Schaft:** zementfrei oder zementiert. Trägt die
   Dorr-C-Logik (die dominiert laut Handoff den geometrischen Fit) und
   steht ebenfalls nicht im Paket.
3. **Collar:** collarless / collared — nur dort, wo es die Variante
   wirklich gibt.
4. **Rolle:** Welche Varianten sind lokal **verfügbar** (dürfen als
   Alternative vorgeschlagen werden) und welche nur **vergleichbar**
   (erscheinen im Vergleich, aber nicht als Empfehlung)?

**Wichtige Einschränkung, die in die Regeln gehört:** Das Paper plant
digital an fünf Fällen je CPAH-Typ. Es gibt **keine implantierten
Vergleichsgruppen und keine Endpunkte** (PPF, Lockerung, Revision, PROM).
Aussagen bleiben deshalb „geometrisch passend", nie „klinisch überlegen".

Ergebnis in `docs/HANDOFF_femurprofil-cpah.md` und einem fachlich
bestätigten Tabellenabschnitt dokumentieren.

**ERLEDIGT 22.08.2026 — von Philipp bestätigt:**

| Schaft | Klasse | Fixation | Rolle |
|---|---|---|---|
| Quadra-P collarless/collared | B2 (nicht verkürzt) | zementfrei | planbar |
| Quadra-H | B2 | zementfrei | planbar |
| SMS | F | zementfrei | planbar |
| MasterLoc | A | zementfrei | planbar |
| Quadra-C | — (zementiert, außerhalb Radaelli) | zementiert | planbar |
| Quadra-P Cemented | — (zementiert, außerhalb Radaelli) | zementiert | planbar |

Quadra-S und AMIStem werden lokal nicht verwendet; Quadra-R (Revision)
liegt außerhalb des Papers. Alle Schäfte im Einsatz sind **planbar** —
es gibt keine Nur-Vergleichs-Rolle. Details und Quellen (u. a.
MasterLoc-RSA-Studie DOI 10.1016/j.artd.2023.101157) im Handoff,
Abschnitt „Radaelli-Zuordnung". Regel-Konsequenz für Phase B: A und F
sind vom Paper direkt simuliert, **B2 nicht** (nur Analogie zu B3 —
ausweisen!); Quadra-C und Quadra-P Cemented tragen die
„Dorr C → zementiert"-Regel.

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

**ERLEDIGT 22.08.2026 — mit zwei bewussten Abweichungen vom Entwurf
oben** (der stammt von VOR der Task-13-Neufassung):

- `geometry: 'rectangular-triple-taper' | 'other'` ersetzt durch
  `radaelliClass?: RadaelliKlasse` (A/B1–B3/C1–C3/D/E/F, optional) — die
  Regeln aus Task 13/15 hängen an der Radaelli-Klasse, ein
  Freitext-Geometriefeld hätte keinen Konsumenten. Die Validierung
  erzwingt: Klasse NUR bei `fixation: 'cementless'`; `primaryFixation:
  'cement'` genau bei `fixation: 'cemented'`.
- `ccdDeg` entfällt — der CCD-Winkel hat mit `stemCcdByFolder` bereits
  eine Quelle im Paketformat; eine zweite würde still divergieren.

Umsetzung: `StemPlanningProfile` + leeres `STEM_PROFILE_BY_FOLDER` in
`medactaCatalog.ts` (öffentliches Repo bleibt ohne Herstellerdaten),
Manifest-Feld `stemProfileByFolder` mit schlüsselweiser Vereinigung
(Muster stemCcdByFolder) in `packageFormat.ts` + `registry.ts`,
10 neue Tests (positive/negative inkl. Konsistenzregeln, Merge),
Doku-Tabelle in `docs/schablonen-pakete.md` ergänzt.

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

**ERLEDIGT 29.08.2026:** `stemPlanningRules.ts` (reine Funktion, 5 Regeln
wie oben, PlanningHint exakt nach Entwurf, warnings→cautions→infos
sortiert) + 16 Tests inkl. Verbots-Sweep über alle Kombinationen. Die
UI-Anbindung in `FemurProfileCard` kam gleich mit (war im Task nicht
gelistet, aber der Nutzer wartete sichtbar darauf): Die statische
Dorr-C-Box ist durch die Regel-Hinweise ersetzt; ihr Wortlaut lebt als
Regel `DORR_C_FIXATION` wörtlich weiter — `pruefe-karte.mjs` prüft ihn
und bleibt grün. Hinweise nur bei Klassifikationsfreigabe; unbestätigter
Dorr wird in den Belegen als „Vorschlag, unbestätigt" gekennzeichnet;
zementierte Profile lösen die Dorr-C-Regel bewusst nicht aus. Der
`schaftProfil`-Parameter ist implementiert und getestet, wird aber erst
in Task 16 mit der tatsächlich platzierten Schablone verbunden.

---

## Task 16: Tatsächlichen Variantenvergleich anbinden

**Ziel:** CPAH nur als Vorauswahl nutzen; endgültige Geometrie aus platzierten Templates bewerten.

**Dateien:**

- Reuse/Modify: `src/lib/hip/templates.ts`
- Create: `src/lib/hip/stemComparison.ts`
- Create: `src/lib/hip/stemComparison.test.ts`
- Modify: `src/components/FemurProfileCard.tsx`
- Modify: den bestehenden Varianten-Selektor — `SelectedTemplatePanel`/`SelectedStemPanel` sind KEINE eigenen Dateien, sie leben in `src/components/Toolbar.tsx`.

**Parameter:**

- Delta-FO,
- Delta-LLD,
- Schaftrotation relativ zur Femurachse,
- Schafttiefe,
- Collar-Calcar-Abstand, falls Profil collared,
- proximale/distale Füllung erst dann, wenn Schaftkontur und Kanalgrenzen robust verfügbar sind.

Keine statische Zuordnung `CPAH 5H -> Quadra-P LAT`. Stattdessen relevante Varianten vergleichen und Differenzen anzeigen.

**ERLEDIGT 29.08.2026 — mit bewussten Abgrenzungen:**

- `stemComparison.ts`: femurseitiger Abgleich Schablonenkopf ↔
  anatomisches Kopfzentrum entlang der GEMESSENEN Schaftachse (Punkte
  4/5 — dieselbe Referenz wie FO/FOR): **Δ Offset (femoral)** und
  **Δ Kopfhöhe entlang Achse** (+ = mehr Offset bzw. Verlängerung,
  Vorzeichen identisch zu `PlanningDelta`); Gegenseiten-Warnung; ohne
  Kalibrierung null. 12 Tests inkl. schräger Achse und
  vertauschte-Achse-Doktrin.
- Karte „Morphologie & Fixation": Abschnitt **„Schablonen-Abgleich"**
  (reaktiv auf die selektierte bzw. erste sichtbare Schaftschablone),
  Profilzeile (Ordner · Fixation · Radaelli-Klasse), Deltas live beim
  Ziehen. Das Profil des platzierten Schafts fließt jetzt in die
  Planungshinweise (Task 15) ein.
- Neue Regel `CPAH_EVIDENZ_KLASSE` (Task-13-Konsequenz): Radaelli-Klasse
  außerhalb der simulierten A/B3/C2/F → info „Geometrie-Analogie, keine
  direkte Evidenz" (betrifft die B2-Arbeitspferde Quadra-P/Quadra-H).
  Konstante `CPAH_SIMULIERTE_KLASSEN` exportiert.
- **Bewusst NICHT umgesetzt:** Schaftrotation zur Achse und die
  Gesamt-LLD-/Offset-Bilanz mit Pfanne existieren bereits im
  Messungen-Panel (`stemAxisAlignment`, `computePlanningDelta`) — keine
  Doppelanzeige. Schafttiefe, Collar-Calcar-Abstand und proximale/
  distale Füllung sind vertagt: Die Schablonen sind Pixelbilder ohne
  robuste Schulter-/Collar-Koordinate in der Rechenschicht, und die
  Kanalgrenzen liegen nur auf zwei Höhen vor — der Plan selbst knüpft
  die Füllung an „robust verfügbar". Der Toolbar-Varianten-Selektor
  blieb unangetastet: Beim Größen-/Varianten-Wechsel aktualisiert die
  Karte die Differenzen live, das erfüllt den Zweck ohne Umbau.
- Voraussetzung für Profilzeile/Profilregeln: das private Paket muss
  `stemProfileByFolder` befüllen (Task 14-Format, Task-13-Klassen) —
  ohne Eintrag erscheinen Abgleich-Deltas trotzdem, nur ohne
  Profil-Informationen.

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

# Review-Ergebnis (08.08.2026) — Fragen beantwortet, Plan angepasst

Geprüft gegen den Code auf `main` (`dcb96d1`); alle Korrekturen stehen
direkt in den Tasks. Kurzfassung der Antworten:

1. **Draft-Geometrie:** Ja, die kleine Erweiterung ist nötig.
   `computeDraft` existiert nirgends. Während der laufenden Platzierung
   zeichnet der Kern nur Draft-Punkte und Verbindungslinien zwischen
   GESETZTEN Punkten (`draftLineGroups`); berechnete Geometrie rendert er
   bisher nur für fertige Messungen (`computed`). Der neue Prop benutzt
   genau diesen vorhandenen `OverlayGeometry`-Renderpfad weiter — kein
   zweiter Zeichen-Pfad. Berechnet wird in `HipOverlay` (dem Muster von
   `draftLineGroups` folgend), inklusive `null` bei fehlender
   Kalibrierung; Knie und Schulter bleiben unberührt (Task 4).
2. **CCD-Prefill:** Ja — `toggleTool` hat mit `prefillFromGlobalRefLine`
   bereits exakt dieses Muster; das CCD-Prefill wird die zweite Quelle.
   Punktreihenfolge verifiziert: `ccd` = 6 Punkte in identischer
   Reihenfolge zu `femurProfile` 0–5.
3. **Review am Measurement:** Optionales Feld ist richtig; Persistenz
   kommt gratis. Prüfpunkt eingearbeitet: `setFemurProfileReview` muss
   einen History-Snapshot auslösen (Task 7).
4. **Charakterisierungs-Tests vorab:** `AVAILABLE_RECIPES` ohne
   `femurProfile` (Task 3); v9-Plan lädt unverändert (Muster
   `serializeFragmente.test.ts`, existiert); Sektion zeigt
   `statusDot: undefined` solange nicht begonnen.
   **Nicht testbar und bewusst ungetestet:** der `hasHipMeasurement`-Filter
   ist ein Inline-Selektor in `Toolbar.tsx` (nicht im Store) — für ihn
   existiert kein Unit-Test-Muster; Absicherung laut Task 5 über Typecheck
   plus dokumentierten manuellen Smoke-Test.
5. **CpahMatrix:** Eigene kleine Komponente nach dem Muster, keine
   Verallgemeinerung der CpakMatrix — Design in Task 6 festgeschrieben,
   Mockup unter `docs/screenshots/cpah-matrix-mockup.png`.
6. **Vereinfachungen:** `confidence`-Feld gestrichen (ableitbar aus
   `borderline`); Gate als ConfirmDialog-Variante; v10 beibehalten,
   aber begründet (Task 8).

**Quellen via PubMed verifiziert** (alle real, Inhalt passt):
CPAH-Paper Stauss et al. 2026
([DOI 10.1016/j.arth.2026.05.011](https://doi.org/10.1016/j.arth.2026.05.011));
Morphologie↔PPF ([DOI 10.1016/j.arth.2020.02.048](https://doi.org/10.1016/j.arth.2020.02.048));
dänische PPF-Kohorte ([DOI 10.1080/17453674.2017.1302908](https://doi.org/10.1080/17453674.2017.1302908));
NARA ([DOI 10.2106/JBJS.M.00643](https://doi.org/10.2106/JBJS.M.00643));
Morita ([DOI 10.1302/2046-3758.134.BJR-2023-0188.R1](https://doi.org/10.1302/2046-3758.134.BJR-2023-0188.R1));
Mess-Automatisierung ([DOI 10.1016/j.arth.2023.11.021](https://doi.org/10.1016/j.arth.2023.11.021)).
Die konkreten Grenzwerte stehen NICHT in den Abstracts — Volltext-Prüfung
ist Teil von Task 1.
