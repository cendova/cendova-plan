# Schultermodul — Recherche & Umsetzungsplan

**Stand:** 2026-07-29 · **Status:** Schritte 0–4 umgesetzt, offen sind 5 und 7
**Ziel:** Drittes Planungsmodul (Schulter) konsistent zu Hüfte und Knie.
**Schablonen:** kommen später vom Autor — der Plan hält die Schnittstelle frei.

**Festgelegt (Rückmeldung 2026-07-29):**
1. **Beides** — anatomische TSA **und** Reverse (RSA).
2. **Seiten-Flag** statt getrennter Ansichten.
3. **Nur true a.p.** — weitere Ebenen später.

→ Konsequenzen ausgearbeitet in **B.8** (Prothesentyp), **B.9** (Seite),
**B.10** (Aufnahme-Ebene); die Reihenfolge in B.5 ist entsprechend angepasst.

> ⚠️ Unverändert gültig: CendovaPlan ist **kein Medizinprodukt**
> (Lern-/Forschungsprojekt, nicht für die klinische Anwendung).

---

## Teil A — Fachliche Recherche: welche Parameter?

### A.0 Die entscheidende Vorfrage: 2D-Röntgen, nicht CT

CendovaPlan misst **2D-Projektionsaufnahmen**. Für die Schulter ist das eine
härtere Einschränkung als bei Hüfte und Knie, und sie bestimmt den Zuschnitt
des Moduls.

Laut PubMed hält die JAAOS-Übersicht zur präoperativen Planung der anatomischen
Schulterprothese ausdrücklich fest, dass ein Templating auf Nativröntgen zwar
möglich ist, die komplexe **dreidimensionale** glenohumerale Anatomie damit aber
nicht genau erfasst wird — Glenoid- und Humerusversion sowie die
Humeruskopf-Subluxation gehören ins CT
([DOI](https://doi.org/10.5435/JAAOS-D-21-01119)).

**Konsequenz für den Zuschnitt:**

- **IM Modul:** alles, was auf einer korrekt eingestellten a.p.-Aufnahme
  (echtes a.p. der Skapula / „true AP", Grashey) valide messbar ist.
- **NICHT im Modul:** Glenoid-**Version** (Friedman, axial/CT),
  Humerus-Retroversion, Walch-Typisierung als *gemessener* Wert. Walch/Favard
  können später allenfalls als **manuell gewählte Klassifikation** ins
  Planungsprotokoll wandern — nicht als errechneter Messwert.
- Das ist kein Mangel, sondern die ehrliche Abgrenzung. Sie gehört als Hinweis
  in die UI (analog zum bestehenden Umgang mit unsicheren Messungen).

### A.1 Kern-Parameter Stufe 1 (a.p., präoperativ) — Umsetzungsempfehlung

| Parameter | Definition (a.p.) | Punkte | Warum |
|---|---|---|---|
| **CSA** (Critical Shoulder Angle) | Winkel zwischen der Glenoidlinie (oberer↔unterer Glenoidrand) und der Linie vom unteren Glenoidrand zum lateralsten Akromionpunkt | 3 | Etabliertester Röntgenwinkel der Schulter; hoher CSA → Rotatorenmanschetten-Pathologie, niedriger → Omarthrose |
| **LSA / Glenoid-Inklination** (β-Winkel n. Maurer) | Winkel zwischen Skapulaspina-Achse (Floor of supraspinatus fossa) und Glenoidlinie | 4 | Teil-Komponente des CSA; separat interpretierbar, RSA-relevant |
| **AHD** (akromiohumeraler Abstand) | kürzester Abstand Akromion-Unterrand ↔ Humeruskopf-Kontur | 2 (+Kopfkreis) | Screening Rotatorenmanschetten-Defekt; < 7 mm = pathologisch. **Braucht Kalibrierung** (mm) |
| **Akromion-Index (AI)** | (Glenoid↔Akromion lateral) / (Glenoid↔Humeruskopf lateral) | 4 | Dimensionslos → **keine Kalibrierung nötig**, günstig als Frühfunktion |
| **CCD-Äquivalent: humeraler Hals-Schaft-Winkel** | Winkel Humerusschaft-Achse ↔ Kopf-Hals-Achse (anatomisch ≈ 130–135°) | 4 | Direktes Gegenstück zum bestehenden Hüft-CCD; Basis fürs Schaft-Templating |
| **Humeruskopf-Radius / -Zentrum** | Kreis durch 3 Konturpunkte | 3 | Wie beim Hüftkopf: `circleFrom3Points` existiert bereits — 1:1 wiederverwendbar |

Zur CSA-Verlässlichkeit: Laut PubMed war die Inter-/Intraobserver-Reliabilität
auf standardisierten a.p.-Aufnahmen exzellent (ICC > 0,9), auch bei
fortgeschrittener Omarthrose ([DOI](https://doi.org/10.1016/j.jor.2020.04.004)).
Eine aktuelle Übersicht bestätigt den CSA als verlässliches Röntgenmaß —
mahnt aber **korrekt eingestellte Aufnahmen** an und bewertet den prognostischen
Nutzen als noch offen ([DOI](https://doi.org/10.1016/j.jseint.2023.11.002)).
→ **UI-Konsequenz:** Hinweis „true AP erforderlich" beim Start der CSA-Messung.

### A.2 Reverse-Prothese (RSA): Bilanz-Parameter — gleichrangiges Ziel

Hier liegt der eigentliche konzeptionelle Zwilling zur **Beinlängen-Bilanz** der
Hüfte: zwei Winkel, prä/post vergleichbar, direkt planungsrelevant.

| Parameter | Definition (a.p.) | Bedeutung |
|---|---|---|
| **DSA** (Distalization Shoulder Angle) | Winkel Skapulaspina ↔ Linie Akromion-Spitze → Tuberculum majus | Distalisierung; Maß für die Deltaspannung |
| **LSA** (Lateralization Shoulder Angle) | Winkel Skapulaspina ↔ Linie Akromion-Spitze → Humerusschaft-Achse | Lateralisierung |

Laut PubMed war in einer Kohorte von 216 Grammont-Reverse-Prothesen **mehr
Distalisierung (DSA)** mit besseren ASES-Werten und weniger Schmerz assoziiert,
**mehr Lateralisierung (LSA)** dagegen mit schlechteren ASES-/SST-Werten
([DOI](https://doi.org/10.1016/j.jse.2024.03.049)). Eine Multicenter-Studie
nutzt dieselben Winkel, um Implantat-Designs zu vergleichen
([DOI](https://doi.org/10.1016/j.jseint.2024.02.006)); eine State-of-the-art-
Übersicht ordnet Glenosphären-Position und Hals-Schaft-Winkel als
ergebnisrelevant ein ([DOI](https://doi.org/10.1016/j.jisako.2023.05.007)).

**Das ergibt die Schulter-Entsprechung der gelben Beinlängen-Box:**
eine **„RSA-Bilanz"** mit Prä-OP / Planung / Post-OP je für DSA und LSA.
Damit bleibt das Modul konzeptuell exakt im Muster der Hüfte.

### A.3 Bewusst zurückgestellt

- **Glenoid-Version, Humerus-Retroversion, Walch B2/B3** → CT-Domäne
  (s. A.0; Walch-Ergebnisse hängen an 3D-Planung,
  [DOI](https://doi.org/10.1016/j.jse.2025.01.023)).
- **Hamada-Stadium / Favard** → Klassifikationen, keine Messungen. Später
  optional als Auswahlfeld im Planungsprotokoll; das AHD-Maß liefert die
  Grundlage ([Hamada-Kontext via AHD](https://doi.org/10.1007/s11999-014-3770-z)).
- **Instabilitäts-Parameter** (Glenoid track, Hill-Sachs) → anderer
  Eingriffstyp, nicht Endoprothetik-Planung.

---

## Teil B — Umsetzungsplan: konsistent zu Hüfte & Knie

### B.0 Das bestehende Muster (Ist-Analyse)

Beide Module folgen exakt derselben Schichtung — das Schultermodul kopiert sie:

```
src/lib/<modul>/geometry.ts    reine Vektor-/Winkelmathematik
src/lib/<modul>/recipes.ts     Mess-Rezepte: kind, steps[], compute() → {values, geometry}
src/lib/<modul>/templates.ts   Schablonen-Geometrie (Form, Position, Größen)
src/lib/<modul>/<hersteller>Catalog.ts
src/state/<modul>Store.ts      Zustand-Store mit measurements[]
```

Der **Recipe-Vertrag** ist das Herzstück und bereits modul-übergreifend
identisch (`RenderGeometry` ist in `knee/recipes.ts` sogar als „identisch zur
Hüft-Form" dokumentiert):

```ts
export interface KneeRecipe {
  kind: KneeKind
  label: string
  steps: string[]              // Eingabeaufforderung je Punkt
  needsCalibration: boolean    // Längen ja, Winkel nein
  lineGroups: [number, number][]
  compute: (points: P[], mmPerWorldUnit: number) => KneeComputed
}
```

→ **Ein `ShoulderRecipe` mit demselben Vertrag** macht das Modul sofort
kompatibel mit Viewport, Overlay, Werteliste und PDF.

### B.1 Was neu entsteht

```
src/lib/shoulder/geometry.ts          nur Schulter-Spezifika (s. B.2)
src/lib/shoulder/recipes.ts           ShoulderKind + Rezepte
src/lib/shoulder/rsaBalance.ts        DSA/LSA-Bilanz  (Analogon zu hip/lldCalculation.ts)
src/lib/shoulder/templates.ts         später — Schnittstelle jetzt festlegen
src/state/shoulderStore.ts            Klon von hipStore
src/components/ShoulderOverlay.tsx    Klon von HipOverlay
+ je Rechenkern eine *.test.ts        Pflicht (siehe B.5)
```

### B.2 Geometrie: fast nichts ist neu

Aus `hip/geometry.ts` **unverändert wiederverwendbar**:
`sub/add/scale/len/dist/dot/midpoint/unit`, `angleBetweenVectors`,
`angleBetweenLines`, `angleAtVertex`, `perpendicularDistance`,
`closestPointOnLine`, **`circleFrom3Points`** (Humeruskopf statt Hüftkopf —
inklusive der bestehenden `degenerate`-Warnung bei kollinearen Punkten).

Wirklich neu ist **nur**:
- `scapulaSpineAxis()` — Referenzachse für LSA/DSA/Inklination,
- `glenoidLine()` — oberer↔unterer Glenoidrand,
- ein Seiten-Vorzeichen (links/rechts), damit „lateral" eindeutig ist.

> **Empfehlung:** Die geteilten Primitiven **nicht** ein drittes Mal kopieren.
> Vor Modulstart nach `src/lib/geometry/` (oder `lib/shared/geometry.ts`)
> heben und aus hip/knee re-exportieren — reiner Move, durch die bestehenden
> Tests abgesichert. Sonst driften drei Kopien auseinander (genau der
> Konventions-Drift, den `refLineFrame` schon einmal beheben musste).

### B.3 Der zentrale Integrationspunkt: `PlanningMode`

`PlanningMode = 'hip' | 'knee'` ist an **~15 Stellen** verdrahtet:
`viewerStore.ts` (Typ, Persistenz-Key), `Toolbar.tsx` (Umschalter + Panels),
`Viewport.tsx`, `App.tsx`, `PlanningDataDialog.tsx`, `pdfExport.ts`,
`serialize.ts`, `beispielbild.ts`.

**Vorgehen:** Typ auf `'hip' | 'knee' | 'shoulder'` erweitern und **den
TypeScript-Compiler die Arbeit machen lassen** — `npm run typecheck` listet
jede Stelle auf, an der ein Fall fehlt. Kein Raten, keine vergessene Stelle.

### B.4 Plan-Format (Persistenz)

`serialize.ts` führt `hipMeasurements` / `kneeMeasurements` getrennt.
→ `shoulderMeasurements` ergänzen, **`PLAN_FORMAT_VERSION` auf 7 anheben**,
Laden abwärtskompatibel halten (`plan.shoulderMeasurements ?? []` — exakt das
Muster, das `genericMeasurements` in v6 schon nutzt). Ältere Pläne müssen
weiter laden; das prüft ein Test.

### B.5 Reihenfolge der Umsetzung

| Schritt | Inhalt | Ergebnis |
|---|---|---|
| **0** ✅ | Geometrie-Primitiven nach `lib/geometry/` heben (reiner Move) | erledigt — 127 Tests unverändert grün, Bundle identisch |
| **1** ✅ | `PlanningMode` + `shoulderStore` (inkl. `side: 'R'\|'L'` und `prosthesis`) + leerer Schulter-Modus | erledigt — Tab, Seiten-/Typ-Schalter, Modus überlebt Reload |
| **2** ✅ | **CSA** als erstes Rezept (3 Punkte, keine Kalibrierung, Seiten-Snapshot) | erledigt — inkl. Overlay, Werteliste, PDF **und Plan v7** (s. u.) |
| **3** ✅ | Akromion-Index, Glenoid-Inklination, Hals-Schaft-Winkel | erledigt — Winkel-Set komplett, alle vier ohne Kalibrierung; Undo/Redo nachgezogen |
| **4** ✅ | **AHD** (braucht Kalibrierung) + Humeruskopf-Kreis | erledigt — erste Maße mit Maßstab; ohne Kalibrierung wird bewusst NICHT beurteilt |
| **5** | **RSA-Bilanz** (DSA/LSA, prä/geplant/post) — nur bei `prosthesis === 'reverse'` | Analogon zur Beinlängen-Bilanz |
| **6** ✅ | ~~Plan v7~~ (vorgezogen nach Schritt 2) und ~~Undo/Redo~~ (nachgezogen in Schritt 3) | erledigt |
| **7** | Schablonen-Schnittstelle je Typ, sobald Material da ist | Templating |

> **Warum Plan v7 vorgezogen wurde:** Sobald es echte Messungen gibt, wäre ein
> Plan-Format ohne Schulter-Feld stiller Datenverlust — gemessen, gespeichert,
> beim Laden weg, ohne Meldung. Das Format speichert seit Schritt 2
> `shoulderMeasurements` sowie die zuletzt gewählte Seite/Prothese; beide Felder
> sind optional, ältere Pläne laden unverändert.

**Warum CSA zuerst:** wenige Punkte, keine Kalibrierung, klar definiert, gut
belegt — die kürzeste Strecke bis „es funktioniert im echten Bild". Er ist
zudem für **beide** Prothesentypen relevant, trägt also unabhängig von der
Typ-Entscheidung.

**Schritte 0–2 sind jetzt vollständig spezifiziert und startklar.**

### B.6 Testpflicht (CLAUDE.md)

Messlogik nie ohne grüne Tests. Für jedes Rezept ein Charakterisierungs-Test mit
von Hand gerechneten Referenzwerten (Muster: `cpak.test.ts`, `geometry.test.ts`).
Sinnvolle Fälle: Normalwerte (CSA ≈ 33°), Extremwerte, kollineare
Humeruskopf-Punkte (`degenerate`), Links/Rechts-Spiegelung.

### B.7 Schablonen — Schnittstelle jetzt, Inhalt später

Hüfte und Knie trennen bereits sauber **Katalog** (Größen/Maße) von
**Geometrie** (Form) von **Bild** (Hintergrund-PNG). Für die Schulter gilt
dieselbe Dreiteilung — die Bausteine hängen am Prothesentyp (B.8):
**anatomisch** Humeruskopf + Glenoid-Komponente, **revers** Glenosphäre +
Inlay/Humerus-Schaft. Da Schablonen ohnehin über das Paket-Format
importiert werden (`templates/packageFormat.ts`) und **nicht** im Repo liegen
(Hersteller-Material), ist hier vorerst **nichts zu tun außer der
Typ-Definition** — die Paket-Pipeline steht schon.

---

### B.8 Entscheidung 1 — TSA **und** Reverse

Beide Prothesentypen im selben Modul, unterschieden durch einen Schalter im
Schulter-Panel:

```ts
export type ShoulderProsthesis = 'anatomic' | 'reverse'
```

**Was der Schalter steuert — und was nicht:**

| Bereich | anatomisch (TSA) | revers (RSA) |
|---|---|---|
| CSA, Akromion-Index, Glenoid-Inklination, AHD, Hals-Schaft-Winkel, Kopfkreis | ✅ identisch | ✅ identisch |
| **DSA / LSA-Bilanz** | ausgeblendet | ✅ Kernstück |
| Schablonen-Slots (später) | Kopf + Glenoid-Komponente | Glenosphäre + Inlay/Humerus |

Die **präoperative Analyse ist also gemeinsam** — nur die Bilanz und die
Schablonen-Slots hängen am Typ. Das hält die Rezepte frei von Sonderfällen:
Der Typ filtert, welche Rezepte das Panel *anbietet*, er verändert **keine**
Rechenlogik. (Muster: `kneeKindPlaceable` filtert schon heute die angebotenen
Knie-Familien.)

**Folge für die Reihenfolge:** Die RSA-Bilanz ist damit kein optionales
Extra mehr, sondern gleichrangiges Ziel — sie bleibt in der Abfolge aber
hinter den Winkeln, weil sie auf der Skapulaspina-Achse aufbaut, die die
Winkel ohnehin einführen.

### B.9 Entscheidung 2 — Seiten-Flag

**Konvention aus dem Projekt übernehmen:** `hip/lldCalculation.ts` verwendet
bereits durchgehend `side: 'R' | 'L'` (inkl. Vorzeichen- und Label-Logik).
Das Schultermodul nutzt **denselben Typ** — kein zweites Vokabular
(`'left'|'right'`) einführen.

```ts
side: 'R' | 'L'        // shoulderStore, modul-global
```

**Warum überhaupt nötig:** Auf der a.p.-Aufnahme ist „lateral" seitenabhängig.
CSA (lateralster Akromionpunkt), Akromion-Index und die DSA/LSA-Richtung sind
ohne Seitenkenntnis nicht eindeutig orientierbar.

> **Fallstrick, der eingeplant werden muss:** Ist `side` modul-global und der
> Nutzer schaltet es **nachträglich** um, würden bereits gesetzte Messungen
> still umgedeutet. Deshalb: `side` beim **Anlegen** jeder Messung in die
> Messung hineinkopieren (Snapshot), so wie die Hüfte die Seite an der
> jeweiligen Schablone führt. Das globale Flag ist dann nur die *Vorbelegung*
> für neue Messungen. Ein Test muss das absichern.

**Optionaler Komfort (nicht Stufe 1):** DICOM-Tag `Laterality (0020,0060)`
bzw. `ImageLaterality (0020,0062)` zur Vorbelegung auslesen. Aktuell liest die
Render-Schicht nur `imagePlaneModule`; das Tag ist bei Projektionsaufnahmen
zudem oft leer oder unzuverlässig gepflegt. Also: **als Vorschlag verwenden,
nie als Wahrheit** — der Umschalter bleibt immer sichtbar und überschreibbar.

### B.10 Entscheidung 3 — nur true a.p.

Vereinfacht das Modul spürbar:

- **Keine Split-View.** Die knie-spezifische Zweit-Ansicht
  (`planningMode === 'knee' && splitView` in `Viewport.tsx`/`App.tsx`,
  `kneePanesStore`) bleibt **unangetastet** — Schulter rendert einen Viewport.
- **Ein Aufnahme-Hinweis genügt:** Beim Start jeder Winkelmessung ein Hinweis
  „echte a.p.-Aufnahme (Skapula-Ebene) erforderlich" — fachlich geboten, weil
  die CSA-Literatur die Reliabilität ausdrücklich an korrekt eingestellte
  Aufnahmen knüpft ([DOI](https://doi.org/10.1016/j.jseint.2023.11.002)).
- **Später erweiterbar:** Kommt die axiale/Y-Aufnahme dazu, ist der
  Knie-Split-View das fertige Muster. Nichts im jetzigen Zuschnitt verbaut das.

---

## Quellen

Recherche über PubMed:

- CSA-Reliabilität bei Omarthrose — [10.1016/j.jor.2020.04.004](https://doi.org/10.1016/j.jor.2020.04.004)
- CSA Current-Concepts-Review — [10.1016/j.jseint.2023.11.002](https://doi.org/10.1016/j.jseint.2023.11.002)
- DSA/LSA und klinisches Ergebnis nach RSA — [10.1016/j.jse.2024.03.049](https://doi.org/10.1016/j.jse.2024.03.049)
- Glenoid-Lateralisierung, Design-Vergleich (LSA/DSA) — [10.1016/j.jseint.2024.02.006](https://doi.org/10.1016/j.jseint.2024.02.006)
- Reverse-Prothese State-of-the-art — [10.1016/j.jisako.2023.05.007](https://doi.org/10.1016/j.jisako.2023.05.007)
- Präoperative Planung aTSA (Röntgen vs. CT) — [10.5435/JAAOS-D-21-01119](https://doi.org/10.5435/JAAOS-D-21-01119)
- Walch B2/B3, 3D-CT-Planung — [10.1016/j.jse.2025.01.023](https://doi.org/10.1016/j.jse.2025.01.023)
- AHD/Hamada-Verlauf — [10.1007/s11999-014-3770-z](https://doi.org/10.1007/s11999-014-3770-z)
