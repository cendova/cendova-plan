# Kniegelenksnahe Osteotomien — Recherche & Umsetzungsvorschlag

Stand: 28.09.2026 · Status: **Stufen 1–3 umgesetzt** (Branch
`feat/knie-umstellungsosteotomie`, siehe Teil D) · Zweck: fachliche
Grundlage und Bauplan für einen eigenen Punkt „Umstellungsosteotomie" im
Kniemodul, auch als Referenz für spätere Sessions.

Sprachregel wie überall im Programm (nicht CE-zertifiziert): Alles, was
die App ausgibt, ist ein **Planungshinweis**, keine Empfehlung und keine
Therapieentscheidung.

---

## Kurzfassung

- **Fachlich** ist die Planung kniegelenksnaher Osteotomien gut
  standardisiert: Deformitätsanalyse nach Paley auf der Ganzbein-
  Standaufnahme, Zielpunkt der Traglinie auf dem Tibiaplateau, Korrektur-
  winkel nach **Miniaci** am Scharnierpunkt, Grenzwert-Prüfung der
  Gelenklinie (MPTA ≤ 95°) und ggf. Doppel-Level-Osteotomie (DLO).
  Der ESSKA-Konsens 2024 macht genau diesen Ablauf zur Pflicht.
- **Unsere Ausgangslage ist gut:** Die 17-Punkt-Vollvermessung liefert
  bereits Hüftkopfzentrum, Kniezentrum, Sprunggelenkmitte, beide
  Gelenktangenten, mHKA, Mikulicz-Abstand, mLDFA, mMPTA und JLCA; die
  seitliche Aufnahme liefert den tibialen Slope. Und das Schaft-Crop-
  Werkzeug der Schulter kann ein Bildfragment bereits ausschneiden und
  drehen — mathematisch genügt das für eine Rotation um den Scharnier-
  punkt, ohne das Datenmodell zu ändern.
- **Vorschlag:** neuer optionaler Punkt **„6 · Umstellungsosteotomie"** im
  Kniemodul, gestaffelt in drei Stufen: (1) Deformitätsanalyse
  vervollständigen, (2) Miniaci-Planer für HTO/DFO mit Vorher/Nachher-
  Werten und Warnregeln, (3) Bildsimulation, DLO und Weichteilkorrektur.

---

## Teil A — Fachliche Grundlagen

### A.1 Pflichtablauf laut ESSKA-Konsens

Der ESSKA-Konsens zum schmerzhaften degenerativen Varusknie (94 Operateure,
24 Länder) fordert: gute Ganzbein- und Knieaufnahmen sind Pflicht, die
Deformitätsanalyse folgt den **Paley-Winkeln und -Normbereichen**, die
Korrektur erfolgt auf der Ebene der Deformität (ggf. als DLO) unter Erhalt
einer physiologischen Gelenklinie. [1]

Teil II legt die **Scharnierlage** fest: bei der medial öffnenden HTO
(MOWHTO) auf Höhe der Oberkante des proximalen Tibiofibulargelenks, bei
der lateral schließenden DFO (LCW-DFO) knapp oberhalb der medialen
Femurkondyle; biplanare Schnitte werden empfohlen. [2]

### A.2 Relevante Parameter

| Parameter | Norm (Paley) | Wofür | Bei uns vorhanden? |
|---|---|---|---|
| mHKA / mFTA | 180° ± ~2° | Gesamtachse, Ziel der Korrektur | ✅ Vollvermessung |
| Mikulicz-Abstand (MAD) | medial wenige mm | Achsabweichung in mm | ✅ |
| **WBL-Ratio** (Traglinie in % der Plateaubreite, 0 % = medial) | ~50 % | **Zielgröße der HTO** | ❌ fehlt, aus vorhandenen Punkten berechenbar |
| mLDFA | 85–90° | femorale Deformität? → DFO | ✅ |
| mMPTA | 85–90° | tibiale Deformität? → HTO | ✅ |
| JLCA | 0–2° [5] | intraartikuläre/Weichteil-Komponente, Überkorrektur-Risiko | ✅ |
| **JLO** (Gelenklinie gegen Boden bzw. Traglinie) | ≈ 0°, Grenzen uneinheitlich | Schräge der Gelenklinie nach Korrektur | ❌ fehlt |
| mLPFA, mLDTA | 85–95° / 86–92° | vollständige Paley-Analyse | ❌ optional, je 1–2 Zusatzpunkte |
| Posteriorer tibialer Slope | individuell | ändert sich bei Öffnung/Schließung | ✅ seitliches Bild |
| Patellahöhe (Caton-Deschamps) | 0,6–1,2 | sinkt bei öffnender HTO | ❌ seitliches Bild, später |

Die Paley-Normwerte in der Tabelle sind die bekannten Lehrbuchwerte; der
ESSKA-Konsens verweist ausdrücklich auf sie. [1] JLCA-Normbereich 0–2°
laut Micicoi et al. [5]

### A.3 Zieldefinition

- **Varusknie / HTO:** Traglinie durch einen Punkt lateral der Plateaumitte
  (klassisch „Fujisawa-Punkt" um 62,5 %). Feucht et al. schlagen einen
  **individualisierten** Zielbereich vor: je nach Pathologie 50–55 %,
  55–60 % oder 60–65 %; das entspricht einem mFTA von im Mittel 0,3° (50 %)
  bis 3,4° Valgus (65 %), rund 1,1° je 5 %-Schritt. Die Unterschiede sind
  klein, eine präzise Technik ist Pflicht. [3]
- **Valgusknie / DFO:** Der Zielwert ist in der Literatur uneinheitlich;
  üblich ist eine Korrektur Richtung neutral. **Eigene Festlegung für den
  Default: 50 %**, im UI frei einstellbar. (Nicht an einer Primärquelle
  verifiziert.) Öffnende und schließende DFO erreichen laut Metaanalyse
  vergleichbare Ergebnisse; die Technikwahl bleibt Operateurssache. [14]

### A.4 Methode Miniaci

Die neue Traglinie wird vom Hüftkopfzentrum durch den Zielpunkt auf dem
Plateau bis auf Höhe des Sprunggelenks verlängert. Das Sprunggelenkzentrum
wird um den Scharnierpunkt gedreht, bis es auf der neuen Linie liegt; der
Drehwinkel ist der **Korrekturwinkel**. Elson et al. haben genau diese
Konstruktion digital nachgebaut: Intra-Rater-ICC 0,965–0,985 für den
Winkel, Inter-Rater 0,986, unabhängig von der Erfahrung und vergleichbar
mit kommerzieller Software. [4]

Für die DFO gilt dieselbe Konstruktion spiegelbildlich: die neue Linie
läuft vom Sprunggelenk durch den Zielpunkt, gedreht wird das Hüftkopf-
zentrum um das femorale Scharnier.

**Öffnungs- bzw. Keilhöhe** (eigene Herleitung, reine Geometrie): liegt
der Startpunkt der Osteotomie im Abstand L vom Scharnier, klafft er um die
Sehne `h = 2 · L · sin(α/2)`. Die verbreitete Faustregel „1 mm ≈ 1°"
stimmt nur für L ≈ 57 mm; bei L = 70 mm und α = 10° sind es 12,2 mm.
Die App muss die Höhe darum aus der tatsächlich gezeichneten Schnittlinie
rechnen, nicht per Faustregel.

### A.5 Warn- und Grenzregeln

1. **Postoperativer MPTA > 95°:** Kim et al. fanden oberhalb von 95,2° einen
   sprunghaften Anstieg der Gelenklinienschräge und schlechtere klinische
   Ergebnisse. [6] Sohn et al. identifizierten präoperativ JLO ≥ 3° und
   JLCA ≥ 5° als Risikofaktoren (mit beiden: 77,8 % erreichten MPTA ≥ 95°)
   und raten dann zu einer anderen Osteotomieform. [7] Ein Editorial rät
   bei geplantem MPTA > 95° zur DLO. [8]
   **Aber:** Rosso et al. sahen nach 10 Jahren keinen Zusammenhang zwischen
   MPTA ≥ 95° und dem Ergebnis. [9] → Die App gibt einen **Hinweis**
   („DLO erwägen"), keine Sperre.
2. **Erhöhter JLCA → Überkorrektur:** Der JLCA enthält Weichteil-Laxität,
   die sich nach der Korrektur teils zurückbildet. Micicoi et al. schlagen
   eine Formel vor, um die geplante Korrektur um diesen Anteil zu
   verkleinern. [5] Ryu et al.: reines Miniaci überkorrigierte in 55,3 %,
   eine laxitätsbereinigte Planung nur in 22,8 %; ihre vereinfachte Formel
   zieht ein Drittel der JLCA-Änderung vom Miniaci-Winkel ab. [10]
   **Am Volltext geprüft (28.09.2026):** geplanter Winkel = Zielwinkel −
   ⅓ ΔJLCA, mit ΔJLCA = JLCA in der Valgusstress-Aufnahme minus JLCA im
   Stand (Apex lateral positiv). Die Stressaufnahme ist ein eigenes Bild —
   die App übernimmt ΔJLCA deshalb als Zahleneingabe. Belegt ist die
   Formel nur für die medial öffnende HTO mit Ziel im Fujisawa-Bereich.
3. **Scharnier:** Lage wie ESSKA [2]; die Takeuchi-Klassifikation der
   lateralen Scharnierfraktur (Typ I–III relativ zum Tibiofibulargelenk)
   zeigt, warum die Höhe zählt. [11] Die App kann die Lage nicht
   erkennen, nur den gesetzten Punkt anzeigen und die Soll-Lage benennen.
4. **Doppel-Level-Osteotomie:** Schröter et al. korrigierten schwere
   Varusfehlstellungen (mTFA −11°) mit öffnender HTO plus schließender
   DFO auf 0° bei postoperativ MPTA 89,2° und mLDFA 87° — Gelenklinie
   erhalten. [12]
5. **Slope und Patellahöhe:** Öffnende und schließende HTO verändern Slope,
   Tibialänge und Patellahöhe unterschiedlich. [13] Das ist in der AP-
   Planung nicht steuerbar; die App zeigt den präoperativen Slope aus dem
   seitlichen Bild als Referenz und benennt die Richtung der Änderung.

---

## Teil B — Wie andere Programme es umsetzen

Quellenlage: Nur für **TraumaCad** ist ein öffentliches Handbuch
verfügbar (Version 2.5, S. 91–110) [B1]; die übrigen Angaben stammen aus
Herstellerseiten, Broschüren und Validierungsstudien. „n.v." = nicht an
einer Primärquelle verifiziert.

### B.1 Die Produkte im Einzelnen

- **TraumaCad (Brainlab)** hat zwei Wege. Das Werkzeug „High Tibial
  Osteotomy" ist ein reiner Winkelrechner: Hüftkopfkreis, Plateau- und
  Plafondlinie, Ziel **fest bei 62 %** der Plateaubreite; kein Scharnier,
  keine Keilhöhe. Der eigentliche Osteotomie-Ablauf läuft über die
  **Limb Alignment Analysis mit CORA-Werkzeugen**: Assistent für die
  Landmarken, automatische Werte mLPFA, mLDFA, mMPTA, mLDTA, JLCA, MAD und
  Längen mit Rot/Grün-Normwertmarkierung, CORA aus proximaler und
  distaler Achse, Keiltyp Open/Neutral/Close oder frei verschiebbares
  Rotationszentrum, bis zu 4 CORAs, „Finish and Cut" erzeugt die
  Bildfragmente, „Auto Alignment" richtet sie aus, eine Spalte „Post"
  zeigt die Werte danach samt Keilwinkel und -breite. [B1]
  Validierung: TraumaCad gegen manuelles PACS bei MOWHTO, Interrater-ICC
  0,909–0,989. [B2]
- **mediCAD (Hectec)** bietet im 2D-Ganzbeinmodul automatische und
  manuelle Osteotomie sowie eine Paley-Variante, femoral/tibial, ein- oder
  mehrstufig, Open oder Closed. [B3] Beim manuellen Keil setzt man zwei
  Punkte für die Schnittlinie und einen dritten als Scharnier (n.v., nur
  Suchauszug). Planungsmethoden laut Hersteller: Miniaci, CORA und
  „End-Point-First"; die Seite warnt vor Überkorrektur der Gelenkwinkel
  um mehr als 4°. [B4] Das Zusatzprodukt **AO Osteotomy** erkennt
  Landmarken per KI, bewertet mit Ampel, empfiehlt Tibia-, Femur- oder
  Doppelosteotomie, schlägt Scharnier und Schnitte vor und simuliert zu
  einem Standardziel. [B5] Validierung (klassisches mediCAD): ICC 0,896
  (JLCA) bis 0,995 (mTFA), Keilhöhe 0,969. [B6]
- **Materialise OrthoView** bestimmt den CORA über Achsdefinitionen, ein
  „MAD Wizard" markiert abnorme mLDFA/MPTA, auch Dome-Osteotomien sind
  möglich; Osteotomie und Prothese lassen sich nacheinander planen. [B7]
  Genauer HTO-Ablauf n.v.
- **PeekMed** misst automatisch mLDFA, mTFA, mMPTA, JLCA, JLO und den
  Durchgang der Traglinie in % („WBP") und schlägt HTO, DFO oder beides
  vor. [B8] Eine Videoarbeit beschreibt Miniaci mit Scharnier an der
  Fibulaköpfchenspitze und Öffnung bis zur Ziel-Traglinie. [B9]
- **Sectra 2D Planning** hat „Osteotomy guides" für Lage, Art und Größe
  des Keils [B10]; validiert gegen die mCORA-Technik mit ICC 0,989–0,999.
  [B11]
- **Bone Ninja** (iPad) ist ein Lehrwerkzeug mit Schneiden, Drehen per Pin
  und Feinverschieben, ohne HTO-spezifischen Ablauf. [B12]
- **Nur Messung, keine Planung:** IB Lab LAMA misst die Paley-Winkel
  automatisch, Abweichung ≤ 0,5° zu menschlichen Messern; Fehler vor allem
  an Osteosynthesematerial. [B13]

### B.2 Vergleich

| | TraumaCad | mediCAD / AO | OrthoView | PeekMed | Sectra |
|---|---|---|---|---|---|
| HTO öffnend/schließend | ja | ja | ja | ja (öffnend) | ja |
| DFO | ja (CORA) | ja | ja | ja | ja |
| DLO | ja, ≤ 4 CORAs | ja + Empfehlung | n.v. | ja + Empfehlung | n.v. |
| KI-Landmarken | nein | ja (AO) | n.v. | ja | n.v. |
| Ziel | 62 % fest oder CORA | Miniaci, CORA, Standardziel | CORA | Traglinie in % | n.v. |
| Scharnier | Keiltyp oder frei | 3. Punkt / automatisch | n.v. | Fibulaköpfchen | n.v. |
| Bildfragment-Simulation | ja | ja | ja | ja | ja |
| Normwert-/JLO-Warnung | Farbe | Ampel + Warnung | MAD Wizard | JLO-Vermeidung | n.v. |
| Plattenvorlagen | ja | ja | ja | n.v. | n.v. |
| **JLCA-Korrektur im Ziel** | nein | n.v. | n.v. | n.v. | n.v. |

### B.3 Gemeinsamer Kern und was wir daraus lernen

Alle ernsthaften Programme teilen denselben Ablauf: Kalibrierung →
Landmarken → automatische Paley-Analyse mit Normwert-Markierung → Ziel
als Traglinie in % oder Ziel-mHKA → Schnittlinie und Scharnier → Fragment
um das Scharnier drehen → Korrekturwinkel und Keilhöhe in mm →
Vorher/Nachher-Tabelle → Bericht. **Genau das bilden die Stufen 1 bis 3
in Teil C ab.**

Folgerungen:

1. **Scharnier frei setzbar** ist Standard (TraumaCad, mediCAD, Bone
   Ninja) — kein festes Schema, nur die ESSKA-Soll-Lage als Text.
2. **mLPFA und mLDTA** gehören bei TraumaCad zur Grundanalyse. Das spricht
   dafür, sie in Stufe 1 aufzunehmen.
3. **Eine JLCA-Korrektur der Zielberechnung** ist bei keinem Produkt
   verifiziert. Das wäre ein echtes Unterscheidungsmerkmal — aber erst,
   wenn die Formel fachlich abgesichert ist.
4. **KI-Landmarken und automatische Verfahrenswahl** (AO Osteotomy,
   PeekMed) sind die Oberklasse. Für uns bewusst nicht vorgesehen:
   Vorauswahl ja, Automatik nein.

---

## Teil C — Umsetzungsvorschlag im Kniemodul

### C.0 Einordnung

- Neuer **optionaler** Punkt **„6 · Umstellungsosteotomie"** nach
  „5 · Schablonen". Status-Punkt emerald-oder-nichts, wie Osteotomie und
  Osteophyten der Hüfte. Der Name trennt ihn bewusst vom
  „Osteotomie-Planer" der Hüfte, der die Schenkelhals-Resektion meint.
- **Voraussetzung ist die Vollvermessung.** Ohne sie ist der Punkt
  ausgegraut mit dem Hinweis, zuerst Abschnitt 3 abzuschließen. Damit
  entsteht keine zweite Rechen-Engine: alle Achsen und Winkel kommen aus
  `computeWorkflowRaw` (`src/lib/knee/recipes.ts`), die Osteotomie
  rechnet nur darauf weiter.

### C.1 Stufe 1 — Deformitätsanalyse vervollständigen (klein, sofort nützlich)

Ergänzt die Werteliste der Vollvermessung, ohne neue Klicks:

- **WBL-Ratio:** Schnittpunkt der Traglinie Hüfte→Sprunggelenk mit der
  Plateautangente (Punkte 9/10), in % der Plateaubreite von medial.
- **JLO:** Winkel der Plateautangente gegen die Senkrechte zur Traglinie.
- **mLPFA und mLDTA** (je ein bis zwei Zusatzpunkte: Trochanterspitze,
  Tibiaplafond) — TraumaCad zählt beide zur Grundanalyse [B1].
- **Normbereich-Ampel** für mLPFA, mLDFA, mMPTA, mLDTA, JLCA nach Paley und ein
  Lokalisations-Hinweis: „Deformität tibial / femoral / beidseits" — die
  Grundlage, ob HTO, DFO oder DLO in Frage kommt.

### C.2 Stufe 2 — Miniaci-Planer (Kern)

Ablauf im Panel, von oben nach unten:

1. **Typ wählen:** MOWHTO · LCWHTO · DFO lateral öffnend · DFO medial
   schließend. Vorauswahl aus Stufe 1 (Varus tibial → MOWHTO, Valgus
   femoral → DFO), frei änderbar.
2. **Ziel setzen:** WBL-% als Regler (Default 62,5 % bei Varus, 50 % bei
   Valgus), daneben live der resultierende mHKA. Optional die drei
   Feucht-Bereiche als Schnellwahl.
3. **Scharnierpunkt klicken.** Die Soll-Lage laut ESSKA steht als Text
   daneben.
4. **Startpunkt der Osteotomie klicken** (mediale bzw. laterale
   Kortikalis). Damit ist die Schnittlinie definiert.

Ergebnis-Box „Vorher → Nachher":

| Wert | vorher | nachher |
|---|---|---|
| mHKA, WBL-%, Mikulicz | aus Vollvermessung | geometrisch simuliert |
| mMPTA bzw. mLDFA | gemessen | + Korrekturwinkel am operierten Knochen |
| JLO | Stufe 1 | simuliert |
| Korrekturwinkel | — | Miniaci |
| Öffnungs-/Keilhöhe | — | Sehne `2·L·sin(α/2)` |
| Beinlängenänderung | — | Abstand Hüfte–Sprunggelenk vorher/nachher |

Dazu die Warnregeln aus A.5 als Planungshinweise mit sichtbaren Belegen,
nach dem Muster von `stemPlanningRules.ts`.

**Zeichnung:** alte Traglinie gestrichelt, neue durchgezogen, Schnittlinie
rot, Keil als Dreieck, Zielpunkt auf dem Plateau markiert. Die
Punkte bleiben verschiebbar, alles rechnet live nach.

### C.3 Stufe 3 — Bildsimulation, DLO, Weichteilkorrektur

- **Bildsimulation:** Das distale Fragment (Tibia bis Sprunggelenk bei der
  HTO) wird als Bildausschnitt um den Scharnier gedreht. Das Schaft-Crop-
  Werkzeug (`cropGeometry.ts`, `shaftFragmentStore.ts`) dreht um den
  Polygon-Schwerpunkt C und verschiebt dann. Eine Drehung um den Scharnier
  H ist damit exakt darstellbar, wenn man den Versatz
  `offset = R(α)·(C − H) + H − C` setzt — **kein neues Datenmodell nötig**.
  Das Overlay hängt bereits modusunabhängig im Viewport.
- **DLO:** zwei Scharniere, Aufteilung der Gesamtkorrektur so, dass mLDFA
  und mMPTA in den Normbereich kommen (Schröter-Logik [12]).
- **JLCA-Korrektur** als zuschaltbare Option, erst nach Volltext-Prüfung
  der Formel [10].
- **Seitliches Bild:** präoperativer Slope als Referenz, Hinweis auf die
  erwartete Richtung der Slope- und Patellahöhen-Änderung.

### C.4 Technik

- **Rechenkern** `src/lib/knee/osteotomy.ts`, rein funktional:
  `wblRatio()`, `jlo()`, `miniaciKorrektur()`, `keilhoehe()`,
  `simuliereNachher()`, `beinlaengenAenderung()`. **Tests zuerst** an
  synthetischen Geometrien mit bekanntem Ergebnis (CLAUDE.md: Messlogik
  nie ohne grüne Tests).
- **Store:** Osteotomie als eigener Messungstyp im `kneeStore`
  (Typ, Ziel-%, Scharnier, Startpunkt); die Ergebniswerte werden immer
  neu berechnet, nie gespeichert.
- **Planformat v11** (aktuell v10) mit Migration; **PDF-Abschnitt**
  „Umstellungsosteotomie" mit Vorher/Nachher-Tabelle und Hinweisen.
- **Plattenschablonen** (z. B. winkelstabile HTO-Platten) sind Hersteller-
  material und kämen nur über ein lokales Paket-Addon, nie ins Repo.

### C.5 Bewusst nicht vorgesehen

- keine automatische Landmarkenerkennung,
- keine 3D-/CT-Planung und keine patientenspezifischen Schnittblöcke,
- keine Rotationsfehler-Analyse (braucht CT),
- keine autonome Wahl des Osteotomietyps — nur Vorauswahl.

### C.6 Entscheidungen (28.09.2026: „alles auf einmal wie vorgeschlagen")

1. **Zielwert:** Default 62,5 % bei Varus, 50 % bei Valgus; Feucht-
   Schnellwahl (Bereichsmitten 52,5/57,5/62,5 %) plus „50 % neutral".
2. **DFO** ist dabei (öffnend und schließend), ebenso die **DLO**.
3. **Bildsimulation** ist dabei und abschaltbar.
4. **JLCA-Korrektur** nach Ryu als optionale ΔJLCA-Eingabe, nur bei der
   öffnenden HTO (dafür ist die Formel belegt).
5. **mLPFA/mLDTA** als eigene Einzelmessungen in Abschnitt 4 — die 17-
   Punkt-Vollvermessung und damit alle gespeicherten Pläne bleiben
   unverändert.

---

## Teil D — Umsetzung (Stand Branch)

| Baustein | Datei | Tests |
|---|---|---|
| WBL-%, MJLA, anatomisch sortierte Plateaupunkte | `src/lib/knee/recipes.ts` (`computeWorkflowRaw`) | `recipes.test.ts` |
| mLPFA, mLDTA als Einzelmessung | `src/lib/knee/recipes.ts` | `recipes.test.ts` |
| Paley-Ampel, Lokalisation, Vorauswahl | `src/lib/knee/deformitaet.ts` | `deformitaet.test.ts` |
| Rechenkern HTO/DFO/DLO, Keile, Hinweise, Fragmente | `src/lib/knee/osteotomie.ts` | `osteotomie.test.ts` (inkl. Miniaci-Äquivalenz) |
| Eingaben-Store, Klick-Reihenfolge | `src/state/kneeOsteotomieStore.ts` | `kneeOsteotomieStore.test.ts` |
| Overlay: Setzen, Ziehen, Keil, neue Traglinie, Bildsimulation | `src/components/KneeOsteotomieOverlay.tsx` | Browser |
| Steuerung (Toolbar „6 · Umstellungsosteotomie") | `src/components/KneeOsteotomieSteuerung.tsx` | Browser |
| Karten „Deformitätsanalyse" und „Umstellungsosteotomie" | `src/components/KneeOsteotomieKarten.tsx` | Browser |
| Planformat v11, Grenzen-Prüfung | `src/lib/plan/serialize.ts`, `planGrenzen.ts` | `serializeOsteotomie.test.ts` |
| PDF-Abschnitte | `src/lib/plan/osteotomieText.ts` | `osteotomieText.test.ts` |
| Gemeinsames Fragment-Zeichnen (auch Schulter-Crop) | `src/components/fragmentBild.ts` | Browser |

Kernprinzip: Die Korrektur dreht die Vollvermessungspunkte distal des
Schnitts um das Scharnier; alle Nachher-Werte kommen aus derselben
`computeWorkflowRaw` wie die Vorher-Werte. Keine zweite Rechen-Engine.

Bekannte Grenzen: Die Traglinien-Prozente beziehen sich auf die
Plateau-Tangentenpunkte als Plateauränder (Schritt-Text der
Vollvermessung entsprechend präzisiert). Slope, Patellahöhe und Rotation
sind nicht simuliert. Das Bildfragment ist ein Band um die Schnittlinie
bis unter das Sprunggelenk und kann bei eng stehenden Beinen Teile des
Gegenbeins mitdrehen.

---

## Quellen

Verifiziert über PubMed (DOI-Links):

1. Dawson M et al. ESSKA Formal Consensus Part I — indications and planning.
   KSSTA 2024;32:1891–1901. [10.1002/ksa.12256](https://doi.org/10.1002/ksa.12256)
2. Ollivier M et al. ESSKA Formal Consensus Part II — surgical strategy and
   complications. KSSTA 2024;32:2194–2205. [10.1002/ksa.12273](https://doi.org/10.1002/ksa.12273)
3. Feucht MJ et al. Degree of axis correction in valgus HTO: an
   individualised approach. Int Orthop 2014;38:2273–2280. [10.1007/s00264-014-2442-7](https://doi.org/10.1007/s00264-014-2442-7)
4. Elson DW et al. High reliability in digital planning of MOWHTO using
   Miniaci's method. KSSTA 2015;23:2041–2048. [10.1007/s00167-014-2920-x](https://doi.org/10.1007/s00167-014-2920-x)
5. Micicoi G et al. Managing intra-articular deformity in HTO: a narrative
   review. J Exp Orthop 2020;7:65. [10.1186/s40634-020-00283-1](https://doi.org/10.1186/s40634-020-00283-1)
6. Kim JS et al. Excessively increased joint-line obliquity after MOWHTO.
   Arthroscopy 2022;38:1904–1915. [10.1016/j.arthro.2021.11.004](https://doi.org/10.1016/j.arthro.2021.11.004)
7. Sohn S et al. Risk factors for excessive coronal inclination after
   MOWHTO. Arch Orthop Trauma Surg 2022;142:561–569. [10.1007/s00402-020-03660-8](https://doi.org/10.1007/s00402-020-03660-8)
8. Servant C. Editorial: Avoid creating an oblique joint line after MOWHTO.
   Arthroscopy 2022;38:1916–1918. [10.1016/j.arthro.2021.12.025](https://doi.org/10.1016/j.arthro.2021.12.025)
9. Rosso F et al. Joint line obliquity does not affect outcomes of OWHTO at
   10 years. Am J Sports Med 2022;50:461–470. [10.1177/03635465211059811](https://doi.org/10.1177/03635465211059811)
10. Ryu DJ et al. Planning method considering latent medial laxity in
    MOW proximal tibial osteotomy. Orthop J Sports Med 2021;9. [10.1177/23259671211034151](https://doi.org/10.1177/23259671211034151)
11. Takeuchi R et al. Fractures around the lateral cortical hinge after
    MOWHTO: a new classification. Arthroscopy 2012;28:85–94. [10.1016/j.arthro.2011.06.034](https://doi.org/10.1016/j.arthro.2011.06.034)
12. Schröter S et al. Double level osteotomy in severe varus osteoarthritis.
    Arch Orthop Trauma Surg 2019;139:519–527. [10.1007/s00402-018-3068-9](https://doi.org/10.1007/s00402-018-3068-9)
13. Rhee SJ et al. Hybrid lateral closed-wedge vs opening-wedge HTO.
    J Arthroplasty 2023;38:1455–1463. [10.1016/j.arth.2023.02.027](https://doi.org/10.1016/j.arth.2023.02.027)
14. Diaz CC et al. DFO for valgus malalignment: closing vs opening wedge,
    systematic review and meta-analysis. Am J Sports Med 2023;51:798–811.
    [10.1177/03635465211051740](https://doi.org/10.1177/03635465211051740)

Software (Teil B):

- B1. TraumaCad 2.5 User's Guide (Brainlab), S. 91–110. [PDF](https://traumacad.com/support/release/TraumaCad/2.5/Setup/Brainlab/TC%20BUZZ/OEM/Guides/TraumaCad_UsersGuide_Ver.2.5_OEM.pdf)
- B2. Laven IEWG et al. J Exp Orthop 2022. [10.1186/s40634-022-00475-x](https://doi.org/10.1186/s40634-022-00475-x)
- B3. mediCAD Broschüre 2025. [PDF](https://www.medicad.eu/wp-content/uploads/2025/04/2025_Web_DE_17-01_CE-5-compressed.pdf)
- B4. mediCAD: Planung der Korrektur komplexer Deformitäten. [Web](https://www.medicad.eu/planung-der-korrektur-komplexer-deformitaeten/?lang=en)
- B5. AO Foundation: AO Osteotomy planning software (mediCAD). [Web](https://www.aofoundation.org/approved/approvedsolutionsfolder/2022/ao-osteotomy-planning-software---medicad)
- B6. Schröter S et al. KSSTA 2013. [10.1007/s00167-012-2114-3](https://doi.org/10.1007/s00167-012-2114-3)
- B7. Materialise: Tibial osteotomy planning. [Web](https://www.materialise.com/en/cases/tibial-osteotomy-planning)
- B8. PeekMed Hilfe: Knee osteotomy. [Web](https://help.peekmed.com/knee-osteotomy-how-to-perform)
- B9. Micicoi G et al. Video J Sports Med 2021 (ein Koautor ist bei PeekMed tätig). [10.1177/26350254211032968](https://doi.org/10.1177/26350254211032968)
- B10. Sectra 2D Planning. [Web](https://medical.sectra.com/product/sectra-2d-planning-system/)
- B11. Zhang Y et al. J Knee Surg 2021. [10.1055/s-0040-1710372](https://doi.org/10.1055/s-0040-1710372)
- B12. Bone Ninja (Rubin Institute). [Web](https://www.limblength.org/about-us/physician-education/bone-ninja-app-for-ipad/)
- B13. Stotter C et al. KSSTA 2023. [10.1007/s00167-023-07644-0](https://doi.org/10.1007/s00167-023-07644-0)
- Ergänzend für die DLO-Planung (Stufe 3): Capella M et al. Arch Orthop
  Trauma Surg 2023 — Ziel 62,5 %, JLO fest 88°, femorales Scharnier nahe
  Tuberculum adductorium, tibiales ~1,5 cm unter der lateralen Gelenklinie.
  [10.1007/s00402-023-04997-6](https://doi.org/10.1007/s00402-023-04997-6)
