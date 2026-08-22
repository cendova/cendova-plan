# Handoff: Femurprofil, Dorr/CPAH und schaftspezifische Planung

## Auftrag für die nächste Claude-Session

Dieses Dokument übergibt den medizinischen, funktionalen und technischen Kontext für einen neuen **optionalen Hüft-Workflow „Femurprofil“** in CendovaPlan. Die nächste Session soll zuerst den Implementierungsplan unter `docs/plans/2026-08-08-femurprofil-cpah.md` kritisch prüfen und anschließend taskweise, testgetrieben umsetzen.

## Repository und Branch

- Repository: `https://github.com/cendova/cendova-plan`
- Branch: `feat/hip-femurprofil-cpah`
- Arbeitsverzeichnis bei Hermes: `/opt/data/repos/cendova-plan`
- Ausgangspunkt: aktueller `main`-Commit `dcb96d1`
- Beim Erstellen dieses Handoffs wurde noch kein Feature-Code implementiert.

## Projektregeln

Vor jeder Änderung `CLAUDE.md` und `docs/test-runbook.md` lesen.

- React 19, TypeScript, Vite, Tailwind, Cornerstone3D, Zustand.
- Reines Frontend, keine Cloud-Verarbeitung.
- Patienten-DICOMs bleiben lokal und dürfen nicht in Repo, Agenten-Container oder externe Dienste gelangen.
- Das Tool ist nicht CE-zertifiziert; klinische Hinweise müssen als nachvollziehbare Planungshilfe und nicht als autonome Therapieentscheidung formuliert werden.
- Kommentare und Commits auf Deutsch.
- Messlogik nur mit grünen Tests ändern.
- `main` ist Testkanal, `stable` ist klinischer Freigabekanal. Niemals direkt nach `stable` pushen.

## Ziel

Die normale Hüftplanung soll schlank bleiben. Zusätzlich soll es einen standardmäßig eingeklappten, optionalen Workflow im Stil der Knie-„Vollvermessung“ geben:

> **Femurprofil starten · optional**

Er verbindet:

1. quantitative Femurmorphologie,
2. reproduzierbar unterstützte Dorr-Klassifikation,
3. CPAH-Morphotyp,
4. schaft- und fixationsspezifische Planungshinweise,
5. spätere strukturierte Speicherung und Outcome-Auswertung.

Der Workflow soll keinen Black-box-Score und keine automatische Implantatentscheidung erzeugen.

## Klinisches Entscheidungsmodell

Die Logik ist hierarchisch:

1. **Bildqualität:** Sind quantitative Messungen auf dieser Aufnahme zulässig?
2. **Fixationssicherheit:** Ist eine zementfreie Fixation lokal vertretbar?
3. **Morphotyp/Geometrie:** Welche Schaftvariante rekonstruiert Offset und Beinlänge?
4. **Bone Health:** Muss eine systemische DXA-/Osteoporoseabklärung angestoßen werden?

CPAH beantwortet vor allem Punkt 3. CPAH darf die Fixationssicherheitslogik nicht überstimmen.

## Bildqualitäts-Gate

Vor jeder Klassifikation muss Cendova dokumentieren, ob die Aufnahme für das Femurprofil geeignet ist:

- standardisierte, tief zentrierte AP-Aufnahme,
- neutrale Beckenrotation mit annähernd symmetrischen Foramina obturatoria,
- Femur möglichst etwa 15° innenrotiert und Trochanteren plausibel dargestellt,
- Trochanter minor und mediale/laterale Kortikalisgrenzen sicher erkennbar,
- Femur mindestens 10 cm distal des Trochanter minor vollständig abgebildet,
- gültige Kalibrierung beziehungsweise Pixel Spacing,
- keine Geometrie verfälschende ausgeprägte Deformität.

Für das MVP ist dies ein ärztlich bestätigtes Checklist-Gate, keine vermeintlich automatische Bildqualitäts-KI. Bei nicht bestandenem Gate darf Cendova zwar Rohlandmarken speichern, aber keine scheinpräzise Dorr-/CPAH-Klasse ausgeben. Ausschlussgründe werden strukturiert gespeichert.

## Zentrale radiologische Messungen

### Rohlandmarken

- drei Punkte der Hüftkopfkontur,
- Schenkelhals-Mittelpunkt,
- Femurschaftachse proximal/distal,
- Mitte des Trochanter minor,
- auf der Linie 10 cm distal des Trochanter minor:
  - äußere Kortikalis medial,
  - innere Kortikalis medial,
  - innere Kortikalis lateral,
  - äußere Kortikalis lateral,
- am Calcaristhmus:
  - innerer Kanalrand medial,
  - innerer Kanalrand lateral.

### Abgeleitete Größen

- NSA/CCD,
- femorales Offset `FO`,
- äußerer Femurdurchmesser `Z` bei 10 cm,
- intramedullärer Kanaldurchmesser `X` bei 10 cm,
- mediale/laterale Kortikalisdicke,
- Cortical Index `CI = (Z - X) / Z`,
- Calcaristhmus `Y`,
- Canal-to-Calcar Ratio `CCR = X / Y`,
- Femoral Offset Ratio `FOR = FO / Z`,
- Dorr-Vorschlag,
- CPAH-Typ 1–9 plus N/H-Untertyp,
- Messsicherheit beziehungsweise Grenzbereich.

## Dorr-Klassifikation

Im CPAH-Paper wurden folgende CI-Grenzen verwendet:

- Dorr A: `CI > 0,60`
- Dorr B: `0,50 <= CI <= 0,60`
- Dorr C: `CI < 0,50`

Vorgeschlagene explizite Grenzzonen:

- A/B-Grenzbereich: `0,58–0,62`
- B/C-Grenzbereich: `0,48–0,52`

Die automatische Ausgabe muss **„Dorr-Vorschlag“** heißen. Sie muss durch den ärztlichen Nutzer bestätigt oder überschrieben werden können. Bei Override Grund speichern.

Wichtig: Der ISCD-Schwellenwert `CI < 0,40` ist ein Trigger für präoperative DXA, keine CPAH-Grenze und keine automatische Zementierungsindikation. Beide Regeln dürfen technisch nicht vermischt werden.

## CPAH

CPAH kombiniert:

- Dorr/CI,
- NSA,
- FOR.

Matrix:

- Dorr A: Typ 1 vara, Typ 2 norma, Typ 3 valga
- Dorr B: Typ 4 vara, Typ 5 norma, Typ 6 valga
- Dorr C: Typ 7 vara, Typ 8 norma, Typ 9 valga

NSA-Grenzen aus dem Paper:

- vara: `<120°`
- norma: `120–140°`
- valga: `>140°`

Offset-Untertyp:

- N: `FOR < 1,60`
- H: `FOR >= 1,60`

CPAH wurde retrospektiv und monozentrisch an 2D-Aufnahmen entwickelt. Für die eigentlichen Schaftvergleiche wurden nur fünf Fälle je CPAH-Typ digital geplant. Es gab keine implantierten Vergleichsgruppen, keine PPF-, Lockerungs-, Revisions- oder PROM-Endpunkte. Deshalb darf „geometrisch passend“ nicht als „klinisch überlegen“ dargestellt werden.

## Fixationssicherheitsregeln

### Dorr A

- zementfreie Quadra-/Quadra-P-Optionen grundsätzlich plausibel,
- aber Warnung vor distalem Verklemmen, Hochstand und metaphysärem Undersizing bei engem Kanal.

### Dorr B

- echte Entscheidungszone,
- zementfrei möglich bei guter lokaler Stabilität,
- collared Variante beziehungsweise zementierte Alternative abhängig von Alter, Geschlecht, Fragilität und Knochenstatus prüfen,
- zementiertes Backup dokumentieren.

### Dorr C

- zementierte Fixation als Default beziehungsweise deutlich bevorzugte Option,
- geometrisch guter Sitz eines zementfreien Schafts hebt das PPF- und Primärstabilitätsrisiko nicht auf,
- CPAH 7–9 müssen eine sichtbare Fixationswarnung erzeugen.

Große Register- und Kohortendaten zeigen mehr frühe periprothetische Femurfrakturen beziehungsweise PPF-Revisionen mit zementfreien Schäften, besonders bei älteren Frauen. Ein isolierter osteoporotischer DXA-T-Score bei guter lokaler Morphologie ist dagegen keine automatische Zementierungsindikation.

## Aktuell bekannte Schaftfamilien

### Quadra-H und Quadra-S

- gerade, rechteckig/trapezoidale, triple-tapered, collarless zementfreie Schäfte,
- gleiche mechanische Geometrie; H voll HA-beschichtet, S sandgestrahlt,
- Standard 135°, lateralisiert 127°, Short-Neck-Optionen,
- Oberfläche ersetzt keine sichere Primärstabilität,
- Quadra-H zeigte direkten proximalen BMD-Verlust/Stress-Shielding, gleichzeitig gute Langzeitfixation; beides ist vereinbar.

### Quadra-C

- zementierter polierter Schaft,
- Standard- und lateralisierte Optionen,
- relevante Alternative bei Dorr C beziehungsweise mechanisch fragilem Femur.

### Quadra-P

- zementfrei triple-tapered mit proximalem MectaGrip und HA,
- collarless, collared und cemented verfügbar,
- Standard 135° und lateralisiert 127°; laut Systembeschreibung verändert der Wechsel auf lateralisiert bei gleicher Größe nicht das vertikale Offset,
- collared unterstützt axial, ist aber kein automatischer Ersatz für Zement bei Dorr C.

### Quadra-R

- langer Revisions-/Frakturschaft,
- nicht Teil des primären elektiven MVP-Algorithmus.

Die tatsächliche lokal verwendete Schaftliste muss vor der finalen Regelmatrix mit Philipp bestätigt werden. Herstellerangaben dienen nur zur Beschreibung des Designs, nicht als Wirksamkeitsbeweis.

## Geometrische Planungshinweise

- CPAH 1/4/7, coxa vara: Standard und lateralisiert vergleichen; Risiko der Offset-Unterrekonstruktion.
- H-Untertyp: lateralisierte Option prüfen; Offset nicht primär über überlange Köpfe kompensieren.
- CPAH 3/6/9, coxa valga: Risiko der Offset-Überrekonstruktion; lateralisierte Variante nicht automatisch wählen.
- Dorr C/CPAH 7–9: Fixationswarnung dominiert die geometrische Fit-Empfehlung.

Ein endgültiger Schafthinweis soll dynamisch aus der tatsächlich platzierten Schablone kommen:

- Delta femorales Offset,
- Delta Beinlänge,
- Schafttiefe,
- Varus/Valgus,
- proximale/distale Kanalpassung,
- Collar-Calcar-Beziehung.

## UX-Entscheidungen

Empfohlener Name:

- Reiter/Sektion: **Femurprofil**
- Aktion: **Femurprofil starten**
- Ergebnisbox: **Morphologie & Fixation**

Die Sektion ist optional und standardmäßig eingeklappt. Sie darf keinen amberfarbenen „offen“-Status erzeugen, solange sie nicht begonnen wurde. Nach Abschluss grüner Statuspunkt.

Der Ergebnisblock zeigt kompakt:

- Dorr-Vorschlag plus CI und Sicherheit,
- CCR,
- CPAH inklusive Klartext,
- Planungs-/Fixationshinweise,
- manuelle Bestätigung/Override.

## Bewusste MVP-Grenzen

Nicht im ersten Schritt:

- kein ML-/KI-Risikomodell,
- keine automatische Segmentierung,
- kein CFI und keine Canal Bone Ratio,
- keine sagittale Femurkrümmung oder Anteversion aus AP-Aufnahme,
- keine Diagnose Osteoporose aus dem Röntgenbild,
- keine autonome Empfehlung eines konkreten Implantats,
- keine Änderung am Cornerstone-/Decode-Stack,
- keine Patientendaten oder klinischen DICOMs im Repo.

## Quellen

- CPAH: https://pubmed.ncbi.nlm.nih.gov/42134629/
- Dorr-Klassifikation und quantitative Reliabilität: https://pmc.ncbi.nlm.nih.gov/articles/PMC7371079/
- ISCD Official Positions 2023: https://iscd.org/official-positions-2023/
- radiologische Femurparameter/PPF: https://pubmed.ncbi.nlm.nih.gov/32209287/
- Automatisierbarkeit radiologischer Messungen: https://pubmed.ncbi.nlm.nih.gov/38007206/
- elektive PPF-Kohorte: https://pubmed.ncbi.nlm.nih.gov/28290738/
- NARA-Register: https://pubmed.ncbi.nlm.nih.gov/25274795/
- AAOS Hüftarthrose-Leitlinie: https://www.aaos.org/globalassets/quality-and-practice-resources/osteoarthritis-of-the-hip/oah-cpg.pdf
- Quadra-Systembeschreibung: https://www.medacta.com/en/quadra
- Quadra-P-Systembeschreibung: https://www.medacta.com/en/quadra-p-system-global
- Quadra-H-Stress-Shielding, Morita: https://pubmed.ncbi.nlm.nih.gov/38631686/

## Radaelli-Zuordnung des lokalen Portfolios — Stand 11.08.2026

*Von Philipp bestätigt (11.08.2026): Quadra-P = B2 („nicht verkürzt"),
SMS = F; Quadra-S/H und AMIStem werden lokal NICHT verwendet. Für den
MasterLoc liegt der Vorschlag **Typ A** vor — noch unbestätigt.*

Radaelli-Taxonomie (2023, [DOI 10.1016/j.arth.2022.09.014](https://doi.org/10.1016/j.arth.2022.09.014)):
**A** flat taper (Flachkeil) · **B1** rechteckiger Taper, gestrahlt ·
**B2** quadrangulärer Taper, HA-beschichtet · **B3** verkürzter
quadrangulärer Taper · **C1** fit-and-fill · **C2** anatomisch
fit-and-fill · **C3** kurzer fit-and-fill · **D** konisch (Spline) ·
**E** zylindrisch · **F** kalkargeführter Kurzschaft.
Die Klassifikation gilt NUR für zementfreie Schäfte.

| Schaft | Belegte Geometrie | Klasse | Status |
|---|---|---|---|
| Quadra-P collarless/collared | Dreifach-Taper trapezoid, MectaGrip proximal + HA, distal reduziert, aber NICHT verkürzt | **B2** | ✅ bestätigt |
| SMS | Kurzschaft, „anatomic curvature along the calcar arch", metaphysärer Press-fit; Hersteller-Indikation u. a. Dorr A/enger Kanal | **F** | ✅ bestätigt |
| MasterLoc | „cementless flat dual tapered design … designed for proximal fixation" (Medacta); RSA-Studie: „cementless flat dual-tapered wedge stem", dort direkt mit dem Typ-A-Archetyp Taperloc verglichen | **A** | 🟡 Vorschlag |
| Quadra-P Cemented | poliert, Edelstahl | keine Radaelli-Klasse | zementiert |
| Quadra-C | poliert, zementiert | keine Radaelli-Klasse | zementiert — **offen: noch im Einsatz?** |
| Quadra-R | Revisionsschaft | außerhalb (Paper: primäre elektive THA) | — |
| Quadra-S / Quadra-H / AMIStem | — | — | ❌ lokal nicht verwendet |

**Folgen für die Regeln (mit den bestätigten Klassen):**

- Das CPAH-Paper simulierte NUR A, B3, C2 und F. Damit sind SMS (F) und
  — falls A bestätigt wird — MasterLoc DIREKT von den Simulationen
  abgedeckt.
- **Quadra-P (B2), das Arbeitspferd, ist es NICHT.** Der nächste
  simulierte Verwandte ist B3 (verkürzte Variante derselben
  Taper-Familie). Regeln müssen diese Lücke ausweisen („keine direkte
  CPAH-Evidenz für B2, Analogie zu B3") statt sie zu verwischen.
- Alle CPAH-Ableitungen bleiben GEOMETRIE-Aussagen (Paper ohne
  Outcome-Endpunkte, 5 Fälle/Typ) — nie als klinische Überlegenheit
  formulieren.
- Quadra-C/Quadra-P-Cemented laufen außerhalb der Klassifikation; ihre
  Rolle kommt aus der Dorr-C-/Fixations-Logik, nicht aus CPAH.

**Noch offen vor Task 13:** (a) MasterLoc = A bestätigen; (b) ist
Quadra-C noch im Einsatz?; (c) je Variante klären, ob sie „verfügbar"
(planbar) oder nur „vergleichbar" (Anzeige) sein soll.

Quellen (via PubMed bzw. Hersteller):
Radaelli et al. 2022 ([DOI 10.1016/j.arth.2022.09.014](https://doi.org/10.1016/j.arth.2022.09.014));
MasterLoc-RSA-Studie Sluiter et al. ([DOI 10.1016/j.artd.2023.101157](https://doi.org/10.1016/j.artd.2023.101157), Volltext PMC10374859 — „This stem is a cementless flat dual-tapered wedge stem … shortened stem length … proximal coating of plasma-sprayed titanium");
Register-Konsolidierung Finger et al. ([DOI 10.1016/j.artd.2024.101582](https://doi.org/10.1016/j.artd.2024.101582), Volltext PMC11715119 — B1 höchste Revisionsrate 8,09 %);
Hersteller: [Quadra-P-System](https://www.medacta.com/en/quadra-p-system-global),
[MasterLoc](https://www.medacta.com/en/masterloc),
[SMS](https://www.medacta.com/en/sms) (Beschreibungen via
Such-Snippets belegt; medacta.com ist aus dem Container nicht direkt
erreichbar).

## Offene fachliche Entscheidungen

1. Welche Schaftvarianten sind lokal tatsächlich verfügbar und sollen im MVP regelbasiert abgebildet werden?
2. Soll das manuelle Dorr-Override bereits im ersten PR persistiert werden oder in einem zweiten PR folgen?
3. Soll „Bone Health/DXA empfohlen“ im ersten PR nur als Hinweis erscheinen oder als eigener strukturierter Datensatz?
4. Welche Neutralitätszone gilt klinisch für Delta-FO und Delta-LLD bei einem späteren Schaftvergleich?
5. Reicht im MVP die aktuelle manuelle Femurschaftachse oder soll die Achse direkt aus zwei Kanalquerschnitten berechnet werden?

## Startprompt für Claude

> Arbeite auf `feat/hip-femurprofil-cpah`. Lies zuerst `CLAUDE.md`, `docs/test-runbook.md`, dieses Handoff und `docs/plans/2026-08-08-femurprofil-cpah.md`. Prüfe den Plan kritisch gegen den aktuellen Code. Implementiere taskweise mit TDD und kleinen deutschen Commits. Keine Patientendaten, keine Änderungen am Decode-/Cornerstone-Stack, kein Push nach `stable`. Klinische Ausgaben müssen als Dorr-Vorschlag/Planungshinweis formuliert und vollständig aus sichtbaren Rohmesswerten erklärbar sein. Stoppe bei fachlichen Grenzwertentscheidungen, die in den offenen Fragen nicht festgelegt sind.
