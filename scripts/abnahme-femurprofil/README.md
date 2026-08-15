# Abnahme-Skripte Femurprofil

Acht Playwright-Skripte, die den Femurprofil-Workflow im echten Browser
gegen einen laufenden **Dev-Server** prüfen — zusammen 117 Einzelprüfungen.

Sie ergänzen die Unit-Tests um das, was diese prinzipiell nicht sehen:
ob etwas tatsächlich im DOM landet, ob der Klickweg funktioniert und ob
das erzeugte PDF die Zeilen wirklich enthält. Genau dort steckten in der
Entwicklung drei echte Fehler, die alle Unit-Tests passiert hatten:

- ein zweites Overlay-Label, das der geteilte Renderer nie zeichnet,
- die Messliste, die eine Dorr-Klasse zeigte, während die Karte darunter
  „nicht zuverlässig bestimmbar" meldete (das Bildqualitäts-Gate war
  damit ausgehebelt),
- verschluckte Gedankenstriche im PDF, weil jsPDF die Standardschrift in
  WinAnsi kodiert.

## Ausführen

```bash
npm run dev                 # in einem zweiten Terminal laufen lassen
node scripts/abnahme-femurprofil/pruefe-karte.mjs
```

Alle nacheinander:

```bash
for s in scripts/abnahme-femurprofil/pruefe-*.mjs; do
  printf '%-52s ' "$s"; node "$s" >/dev/null 2>&1 && echo OK || echo FEHLER
done
```

Jedes Skript endet mit Exit-Code 0 (alles bestanden) oder 1 und listet
die fehlgeschlagenen Prüfungen. Screenshots landen unter
`.test-artifacts/`.

## Was welches Skript prüft

| Skript | Gegenstand |
|---|---|
| `pruefe-hilfslinie` | 10-cm-Linie während der Platzierung: erscheint ab Punkt 7, bleibt ohne Kalibrierung aus, verschwindet nach Abschluss |
| `pruefe-femurprofil-sektion` | Reihenfolge und Nummerierung der Sektionen, Statuspunkt-Doktrin, Kalibrier-Sperre, Klickweg |
| `pruefe-gate` | Bildqualitäts-Checkliste: Pflicht vor der Messung, umgekehrte Polarität der Deformitäts-Zeile, Zeitstempel, Verwerfen beim Abbruch |
| `pruefe-karte` | Ergebnis-Karte und CPAH-Matrix, Unterdrückung der Klasse ohne Bestätigung, verbotene Formulierungen, Dorr-C-Warnung |
| `pruefe-bestaetigung` | Ärztliche Bestätigung/Override samt Pflichtgrund, Undo, Erkennung veralteter Bestätigungen |
| `pruefe-prefill` | Übernahme der sechs CCD-Punkte, Ankündigung im Dialog, Unabhängigkeit der Kopien |
| `pruefe-plan-v10` | Speichern/Laden über den echten Serialisierungsweg, Abwehr eines präparierten Plans |
| `pruefe-pdf` | Erzeugt ein echtes PDF über den Export-Knopf und sucht die Zeilen im Byte-Strom |

## Stolperstellen

- Das Beispielbild **kalibriert sich nicht von selbst**; die Skripte
  setzen die Kalibrierung direkt im Store. Ohne sie ist der Start
  gesperrt (Absicht).
- Der PDF-Export zeigt ohne Planungsdaten erst einen Hinweis statt zu
  exportieren — `pruefe-pdf` füllt deshalb ein Feld.
- Die Skripte bedienen Stores über `window.__stores` (nur im Dev-Build
  vorhanden, siehe `src/main.tsx`). Gegen einen Produktions-Build laufen
  sie nicht.
- Ändert sich der Ablauf bewusst, **veralten diese Skripte** — genau das
  ist beim Bildqualitäts-Gate passiert: Der Knopf startete nicht mehr
  direkt die Messung, und `pruefe-femurprofil-sektion` fiel um. Das
  Skript gehört dann im selben Commit nachgezogen.
