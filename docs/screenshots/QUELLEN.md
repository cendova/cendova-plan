# Bildquellen & Lizenzen der Screenshots

Die Screenshots in diesem Ordner zeigen CendovaPlan mit **frei lizenzierten,
anonymisierten Lehr-Röntgenbildern** — **keine** Patientendaten, **keine**
Hersteller-Schablonen. Die Röntgenbilder wurden lokal über
`scripts/bild-zu-dicom.mjs` in DICOM verpackt und in den Viewer geladen.

Weil die zugrunde liegenden Röntgenbilder unter **CC BY-SA** bzw. **CC BY**
stehen, stehen die davon abgeleiteten Screenshots unter derselben Lizenz
(CC BY-SA bleibt CC BY-SA, CC BY mit Namensnennung) — unabhängig von der
Apache-2.0-Lizenz des Programmcodes.

**Ausnahme:** reine UI-Mockups ohne Röntgenbild (Design-Vorlagen) enthalten
nichts Fremdlizenziertes und stehen wie der Code unter Apache 2.0. Welcher
Eintrag was ist, steht in der Lizenzspalte der Tabelle.

| Screenshot | Zugrunde liegendes Bild | Autor | Lizenz | Quelle |
| --- | --- | --- | --- | --- |
| `huefte-becken-ap.jpg` | „Protrusio acetabuli rechts mehr als links 81W – CR ap – 001" | Hellerhoff | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Protrusio_acetabuli_rechts_mehr_als_links_81W_-_CR_ap_-_001.jpg) |
| `knie-ganzbein.jpg` | „Genu varum – Roe Ganzbein 001" | Hellerhoff | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Genu_varum_-_Roe_Ganzbein_001.jpg) |
| Website-Kachel „Osteotomie" (`knie-osteotomie-kachel.jpg` auf cendova.de) | Abb. 1 (Panel oben links, Ausschnitt) aus: Stotter C, Klestil T, Chen K, Hummer A, Salzlechner C, Angele P, Nehrer S. *Artificial intelligence-based analyses of varus leg alignment and after high tibial osteotomy show high accuracy and reproducibility.* Knee Surg Sports Traumatol Arthrosc 2023;31:5885–5895 | Stotter et al. 2023 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) — Ausschnitt, in DICOM umgewandelt, mit Messlinien überlagert | [doi:10.1007/s00167-023-07644-0](https://doi.org/10.1007/s00167-023-07644-0) · reproduzierbar über `scripts/website-screenshots/hole-ganzbein-varus.mjs` |
| `cpah-matrix-mockup.png` | — (reines UI-Mockup, synthetische Beispielwerte, kein Röntgenbild) | eigenes Projekt | Apache 2.0 (wie der Code) | Design-Vorlage für `CpahMatrix.tsx`, siehe `docs/plans/2026-08-08-femurprofil-cpah.md` Task 6 |

Warum ein zweites Ganzbein für die Osteotomie: Das Hellerhoff-Ganzbein zeigt
eine fortgeschrittene Varusgonarthrose (17° Varus) — dort wäre keine
Umstellung mehr indiziert, sondern eine Prothese. Das Stotter-Bild zeigt
einen milden Varus bei erhaltenem Gelenkspalt (der Patient erhielt in der
Studie eine öffnende HTO) — das fachlich passende Bild für die HTO-Planung.
Pixelabstand 0,94 mm/px ist eine plausible Annahme (Femurlänge/Hüftkopf).

**Website-Screenshots reproduzierbar erzeugen:** `npm run dev`, dann
`node scripts/website-screenshots/hole-ganzbein-varus.mjs` (einmalig) und
`node scripts/website-screenshots/erzeuge.mjs` → `konvertiere.mjs`.

**Eigene Demo-Screenshots erzeugen** (ohne echte Patientendaten):

1. Ein frei lizenziertes Röntgenbild besorgen (z. B. Wikimedia Commons,
   Lizenz notieren) **oder** das synthetische Testbild verwenden
   (`node scripts/generate-sample-dicom.mjs`).
2. `node scripts/bild-zu-dicom.mjs --in bild.jpg --out demo.dcm --mm-per-px 0.25`
3. `demo.dcm` in CendovaPlan laden, vermessen, Screenshot machen.
4. Bei CC-BY-/CC-BY-SA-Quellen Autor + Lizenz hier eintragen.
