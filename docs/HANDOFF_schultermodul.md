# HAND-OFF — Schultermodul

**Zweck:** Einstieg für eine neue Session am Schultermodul.
**Stand:** 2026-08-07 · `main` = `stable` = `767a064`.

> **Dieses Dokument ist absichtlich kurz.** Seine Vorgängerfassung
> wiederholte den Inhalt von `docs/schulter-modul-plan.md` und war nach
> wenigen Tagen falsch — sie behauptete noch, die Schablonen-Schnittstelle
> sei offen und warte auf Material, obwohl beides längst erledigt war.
> Hier steht deshalb nur, was NIRGENDWO SONST steht; alles Fachliche
> gehört in den Plan und wird von dort gelesen, nicht kopiert.

## ⚠️ Zuerst verifizieren

- `git log --oneline -1` und mit `origin/main` vergleichen — der Stand oben
  ist ein Datumsstempel, kein Versprechen.
- Modul-Status **immer** aus `docs/schulter-modul-plan.md` lesen (Kopf +
  B.5-Tabelle), nicht aus diesem Dokument.

## Wo was steht

| Thema | Quelle |
|---|---|
| Modul-Status, Entscheidungen, offene Punkte | `docs/schulter-modul-plan.md` |
| Paket-Format, Import/Export, lokale Sicherung | `docs/schablonen-pakete.md` |
| Testwege (lokal, statisch, Decode-Smoke) | `docs/test-runbook.md` |
| Freigabe-Prozess, Leitplanken | `CLAUDE.md` |
| Messrezepte + Einordnungen | `src/lib/shoulder/` |
| Schablonen (Katalog/Kontur/Bild/Platzierung) | `src/lib/shoulder/shoulder*.ts` |
| Stores | `src/state/shoulderStore.ts`, `shoulderTemplateStore.ts` |

## Der einzige offene Punkt: RSA-Bilanz Soll/Ist

Alles andere am Modul ist umgesetzt (Schritte 0–7, Schablonen über die
Paket-Schnittstelle mit 18 Familien; das Repo enthält keine Herstellerdaten).

**Was fehlt:** DSA und LSA messen den **Ist-Wert**. Der ursprünglich
mitgeplante Vergleich *prä / geplant / post* — das Schulter-Gegenstück zur
Beinlängen-Bilanz der Hüfte — gibt es nicht.

**Warum das keine Fleißarbeit ist:** Der Soll-Wert entstünde aus der
platzierten Schablone, das wäre machbar. Der *prä/post*-Teil aber nicht:
Anders als die Beinlängen-Bilanz, die beide Seiten auf EINEM Becken-Bild
vergleicht, liegen die Schulter-Zeitpunkte auf **verschiedenen Aufnahmen**.
Ein Vergleich über Bilder hinweg ist im Programm bisher nirgends
vorgesehen und wäre eine eigene Architektur-Entscheidung — keine
Nebenwirkung dieses Schritts. Begründung im Plan unter der B.5-Tabelle.

**Vor dem Anfangen also klären:** Soll nur der Soll/Ist-Vergleich *auf
einer Aufnahme* kommen (klein), oder ein echter Verlauf über mehrere
Aufnahmen (groß, betrifft Plan-Format und Archiv)?

## Betriebs-Zustand (Stand 2026-08-07)

Zwei Kanäle, Details in `CLAUDE.md`:

- **`stable`** — Anwender-Installationen, Installer, Pages-Demo
- **`main`** — Test-Kanal; Tester-Rechner bleiben per `.cendova-branch-pin`
  darauf, sonst schaltet der Launcher sie selbsttätig auf `stable` zurück

Freigabe: `git push origin main:stable` nach bestätigtem lokalem Test —
bei Änderungen am Render-/Decode-Stack (`@cornerstonejs/*`, `dicom-parser`,
Worker-/**Vite-Konfiguration**) zusätzlich ein Test auf einem **echten Mac**.
Diese Regel ist keine Formalie: Die Cornerstone-5-Regression brach das
DICOM-Laden ausschließlich auf Anwender-Macs und war weder in den Tests
noch in der CI sichtbar.

**Fallstrick, der zweimal zugeschlagen hat:** Eine Installation, die auf
einem alten Nebenbranch hängt, meldet brav „Already up to date" und
bekommt trotzdem nie wieder etwas. Der Launcher wechselt inzwischen von
selbst zurück und setzt die erzeugte `package-lock.json` vor jeder
git-Operation zurück — beides kam aber erst später dazu, sodass genau die
betroffenen Rechner den Fix nicht erreichen konnten. Symptom prüfen mit
`git branch --show-current` und `git log --oneline -1`; auflösen mit
`git checkout -- package-lock.json && git checkout -B stable origin/stable`.

## Leitplanken (Kurzform, verbindlich steht es in CLAUDE.md)

- Kommentare/Commits **deutsch**; Helfer-Skripte als `.mjs` in `scripts/`.
- Messlogik nie ohne grüne Tests ändern; Verhaltensänderung = Test-Anpassung
  im selben Commit.
- Keine erfundenen Schwellen/Zielbereiche — nur belegte Aussagen mit
  DOI-Quelle. `rsaBilanz.test.ts` prüft sogar, dass in der Referenzzeile
  **keine Zahl** steht.
- Patienten-DICOMs und Herstellerdaten bleiben lokal, nie committen.
- `npm audit fix --force` niemals ausführen.
- `npm run verify` vor jedem Commit; der primäre Test ist der lokale
  Klick-Test mit echtem DICOM.
