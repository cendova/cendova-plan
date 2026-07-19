# Bildquellen & Lizenzen der Screenshots

Die Screenshots in diesem Ordner zeigen CendovaPlan mit **frei lizenzierten,
anonymisierten Lehr-Röntgenbildern** — **keine** Patientendaten, **keine**
Hersteller-Schablonen. Die Röntgenbilder wurden lokal über
`scripts/bild-zu-dicom.mjs` in DICOM verpackt und in den Viewer geladen.

Weil die zugrunde liegenden Röntgenbilder unter **CC BY-SA** stehen, stehen
die davon abgeleiteten Screenshots (`.png`) unter derselben Lizenz —
unabhängig von der Apache-2.0-Lizenz des Programmcodes.

| Screenshot | Zugrunde liegendes Bild | Autor | Lizenz | Quelle |
| --- | --- | --- | --- | --- |
| `huefte-becken-ap.png` | „Protrusio acetabuli rechts mehr als links 81W – CR ap – 001" | Hellerhoff | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Protrusio_acetabuli_rechts_mehr_als_links_81W_-_CR_ap_-_001.jpg) |
| `knie-ganzbein.png` | „Genu varum – Roe Ganzbein 001" | Hellerhoff | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Genu_varum_-_Roe_Ganzbein_001.jpg) |

**Eigene Demo-Screenshots erzeugen** (ohne echte Patientendaten):

1. Ein frei lizenziertes Röntgenbild besorgen (z. B. Wikimedia Commons,
   Lizenz notieren) **oder** das synthetische Testbild verwenden
   (`node scripts/generate-sample-dicom.mjs`).
2. `node scripts/bild-zu-dicom.mjs --in bild.jpg --out demo.dcm --mm-per-px 0.25`
3. `demo.dcm` in CendovaPlan laden, vermessen, Screenshot machen.
4. Bei CC-BY-/CC-BY-SA-Quellen Autor + Lizenz hier eintragen.
