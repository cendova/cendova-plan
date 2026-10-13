# CendovaPlan

[Deutsch](README.md) · [Français](README.fr.md) · [English](README.en.md)

Browser application for hip, knee and shoulder arthroplasty planning from
DICOM images. Images are processed locally in the browser. Learning and
research project, without CE certification and not intended for clinical use:
see [DISCLAIMER.md](DISCLAIMER.md).

## Local development

After cloning this repository, open a terminal in its directory. Node.js and
npm must be installed.

```sh
npm ci
npm run dev
```

Open the address printed by the server, usually <http://localhost:5173/>.
To run the code checks, tests and production build:

```sh
npm run verify
```

## Languages

Choose **English**, **Français** or **Deutsch** in the top toolbar. Your
preference is saved in this browser. The URL parameter `?lang=en`, `?lang=fr`
or `?lang=de` selects a language directly. At startup, the application checks
this parameter, the saved preference and the browser's languages, then falls
back to German.

The interface, measurement instructions, messages and PDF exports are
localized. Names, notes, user-entered data, product references and saved plan
values are preserved. Calculations are independent of the language.
Manufacturer templates require a separate local package; see
[docs/schablonen-pakete.md](docs/schablonen-pakete.md).

## Add another language

Create a folder under `src/i18n/locales/` containing `meta.json` and translated
JSON message catalogs. Language folders are discovered automatically. German
remains the source language and message placeholders must be retained. See the
[localization guide](docs/localisation.md) for the format, fallback rules and
checks.

The standard PDF font covers French accents and Latin-1 characters; `œ` is
written as `oe`. A language using another script also needs a Unicode font
embedded in the PDF.

Source: [cendova/cendova-plan](https://github.com/cendova/cendova-plan).
Apache-2.0 license; original attribution retained in [NOTICE](NOTICE).
