#!/usr/bin/env node
// Baut das Schaft-Planungsprofil-Addon (merge-ZIP) für das eigene
// Schablonen-Paket — die Einmal-Brücke von den fachlich bestätigten
// Radaelli-Zuordnungen (docs/HANDOFF_femurprofil-cpah.md, Task 13) zu
// maschinenlesbaren Profilen im Manifest-Feld `stemProfileByFolder`
// (Format: Task 14, src/lib/templates/packageFormat.ts).
//
// Ablauf (lokal auf dem Rechner mit dem Paket):
//   1. node scripts/build-stem-profile-addon.mjs --init
//      → liest das Paket (Standard: .cendova-daten/schablonen-paket.zip,
//        überschreibbar mit --src <pfad.zip>), listet alle Schaft-Ordner
//        und schreibt scripts/schaft-profile.local.json mit
//        VORSCHLÄGEN aus den bestätigten Zuordnungen. Die Datei ist
//        gitignored (*.local.json) — Herstellerbezüge bleiben lokal.
//   2. Die Datei prüfen/korrigieren (der Vorschlag ist Heuristik über
//      den Ordnernamen — die Verantwortung liegt beim Prüfer).
//   3. node scripts/build-stem-profile-addon.mjs
//      → validiert die Profile, gleicht sie gegen das Paket ab und
//        schreibt cendova-schaft-profile-addon.zip (gitignored).
//   4. Das Addon in der App importieren (Paket-Menü) — merge:true
//      ergänzt das Bestandspaket, ersetzt es nicht. Danach „Paket
//      exportieren" für die anderen Rechner.
//
// Die App validiert beim Import nochmals vollständig (packageFormat.ts);
// die Prüfungen hier sind eine Vorstufe mit denselben Regeln.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'

const ARGS = process.argv.slice(2)
const INIT = ARGS.includes('--init')
const srcIdx = ARGS.indexOf('--src')
const PAKET_PFAD = srcIdx >= 0 ? ARGS[srcIdx + 1] : '.cendova-daten/schablonen-paket.zip'
const LOCAL_JSON = 'scripts/schaft-profile.local.json'
const AUSGABE = 'cendova-schaft-profile-addon.zip'

// Wertelisten — Spiegel von packageFormat.ts (dort ist die Wahrheit).
const FIXATION = ['cementless', 'cemented']
const COLLAR = ['none', 'collared']
const PRIMARY = ['metaphyseal', 'metadiaphyseal', 'diaphyseal', 'cement']
const NECK = ['regular', 'short']
const OFFSET = ['standard', 'lateralized']
const USE = ['primary', 'revision']
const RADAELLI = ['A', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D', 'E', 'F']

function lesePaketStemOrdner() {
  if (!existsSync(PAKET_PFAD)) return null
  const entries = unzipSync(new Uint8Array(readFileSync(PAKET_PFAD)))
  const manifestBytes = entries['manifest.json']
  if (!manifestBytes) {
    console.error(`FEHLER: ${PAKET_PFAD} enthält kein manifest.json.`)
    process.exit(1)
  }
  const manifest = JSON.parse(strFromU8(manifestBytes))
  const ordner = [
    ...new Set(
      (manifest.medactaCatalog ?? [])
        .filter((e) => e.component === 'Stem')
        .map((e) => e.folder),
    ),
  ]
  return { manifest, ordner }
}

/**
 * Vorschlag je Ordnername — kodiert die am 22.08.2026 fachlich
 * BESTÄTIGTEN Zuordnungen (Handoff, Abschnitt „Radaelli-Zuordnung"):
 * Quadra-P/Quadra-H = B2, MasterLoc = A, SMS = F; zementierte Varianten
 * ohne Klasse; Revisionsschäfte außerhalb. Alles andere bleibt ein
 * Gerüst zum Ausfüllen. NUR ein Vorschlag — Schritt 2 ist Pflicht.
 */
function schlageProfilVor(ordner) {
  const n = ordner.toLowerCase()
  const lateral = /\blat\b|lateral/.test(n)
  const basis = {
    fixation: 'cementless',
    collar: /collared/.test(n) ? 'collared' : 'none',
    primaryFixation: 'metadiaphyseal',
    intendedUse: 'primary',
    ...(lateral ? { offsetVariant: 'lateralized' } : /\bstd\b/.test(n) ? { offsetVariant: 'standard' } : {}),
  }
  if (/revision|quadra-?r\b/.test(n)) {
    return { ...basis, primaryFixation: 'diaphyseal', intendedUse: 'revision' }
  }
  if (/cemented|zement|quadra-?c\b/.test(n)) {
    return { fixation: 'cemented', collar: basis.collar, primaryFixation: 'cement', intendedUse: 'primary' }
  }
  if (/quadra-?p\b|quadra-?h\b/.test(n)) return { ...basis, radaelliClass: 'B2' }
  if (/masterloc/.test(n)) return { ...basis, radaelliClass: 'A', primaryFixation: 'metaphyseal' }
  if (/\bsms\b/.test(n)) {
    return { ...basis, radaelliClass: 'F', primaryFixation: 'metaphyseal', neckVariant: 'short' }
  }
  if (/amistem/.test(n)) return { ...basis, radaelliClass: 'C3' }
  return { ...basis, _hinweis: 'automatisch nicht zuordenbar — bitte ausfüllen' }
}

function profilFehler(p) {
  if (typeof p !== 'object' || p === null) return 'ist kein Objekt'
  if (!FIXATION.includes(p.fixation)) return `fixation unbekannt (${p.fixation})`
  if (!COLLAR.includes(p.collar)) return `collar unbekannt (${p.collar})`
  if (!PRIMARY.includes(p.primaryFixation)) return `primaryFixation unbekannt (${p.primaryFixation})`
  if (!USE.includes(p.intendedUse)) return `intendedUse unbekannt (${p.intendedUse})`
  if (p.radaelliClass !== undefined && !RADAELLI.includes(p.radaelliClass))
    return `radaelliClass unbekannt (${p.radaelliClass})`
  if (p.neckVariant !== undefined && !NECK.includes(p.neckVariant))
    return `neckVariant unbekannt (${p.neckVariant})`
  if (p.offsetVariant !== undefined && !OFFSET.includes(p.offsetVariant))
    return `offsetVariant unbekannt (${p.offsetVariant})`
  if (p.fixation === 'cemented') {
    if (p.radaelliClass !== undefined) return 'radaelliClass gilt nur für zementfreie Schäfte'
    if (p.primaryFixation !== 'cement') return "zementiert braucht primaryFixation 'cement'"
  } else if (p.primaryFixation === 'cement') {
    return "zementfrei darf primaryFixation 'cement' nicht tragen"
  }
  if (p._hinweis !== undefined) return 'trägt noch den _hinweis-Platzhalter — bitte ausfüllen und entfernen'
  return null
}

if (INIT) {
  if (existsSync(LOCAL_JSON)) {
    console.error(`FEHLER: ${LOCAL_JSON} existiert bereits — bitte prüfen oder löschen, kein stilles Überschreiben.`)
    process.exit(1)
  }
  const paket = lesePaketStemOrdner()
  if (!paket) {
    console.error(
      `FEHLER: Kein Paket unter ${PAKET_PFAD} gefunden.\n` +
        'Entweder --src <pfad.zip> angeben oder in der App „Paket exportieren" und den Pfad nutzen.',
    )
    process.exit(1)
  }
  const daten = {
    _dokumentation:
      'Schaft-Planungsprofile je Katalog-Ordner (Radaelli/Fixation, Task 13/14). ' +
      'VORSCHLAG per Namens-Heuristik — vor dem Bauen prüfen! Schlüssel mit _ werden ignoriert. ' +
      'Werte: siehe scripts/schaft-profile.beispiel.json bzw. src/lib/templates/packageFormat.ts.',
  }
  for (const ordner of paket.ordner) daten[ordner] = schlageProfilVor(ordner)
  writeFileSync(LOCAL_JSON, JSON.stringify(daten, null, 2) + '\n')
  console.log(`${paket.ordner.length} Schaft-Ordner gefunden. Vorschläge geschrieben nach ${LOCAL_JSON}:`)
  for (const ordner of paket.ordner) {
    const p = daten[ordner]
    console.log(
      `  ${ordner}\n    → ${p.fixation}${p.radaelliClass ? ` · Radaelli ${p.radaelliClass}` : ''}` +
        `${p.offsetVariant ? ` · ${p.offsetVariant}` : ''} · ${p.intendedUse}${p._hinweis ? '  ⚠ ' + p._hinweis : ''}`,
    )
  }
  console.log('\nJetzt die Datei prüfen/korrigieren, dann ohne --init erneut ausführen.')
  process.exit(0)
}

if (!existsSync(LOCAL_JSON)) {
  console.error(`FEHLER: ${LOCAL_JSON} fehlt — zuerst mit --init erzeugen.`)
  process.exit(1)
}
const roh = JSON.parse(readFileSync(LOCAL_JSON, 'utf8'))
const profile = Object.fromEntries(
  Object.entries(roh).filter(([k]) => !k.startsWith('_')),
)
if (Object.keys(profile).length === 0) {
  console.error('FEHLER: Keine Profile in der Datei.')
  process.exit(1)
}
let fehler = 0
for (const [ordner, p] of Object.entries(profile)) {
  const f = profilFehler(p)
  if (f) {
    console.error(`FEHLER: „${ordner}" ${f}`)
    fehler++
  }
}
if (fehler > 0) process.exit(1)

// Abgleich gegen das Paket (nur Warnungen — das Addon ist auch ohne
// lesbares Paket baubar, z. B. auf einem Zweitrechner).
const paket = lesePaketStemOrdner()
if (paket) {
  for (const ordner of paket.ordner) {
    if (!profile[ordner]) console.warn(`WARNUNG: Paket-Ordner ohne Profil: „${ordner}"`)
  }
  for (const ordner of Object.keys(profile)) {
    if (!paket.ordner.includes(ordner))
      console.warn(`WARNUNG: Profil ohne Paket-Ordner (Tippfehler?): „${ordner}"`)
  }
} else {
  console.warn(`WARNUNG: Kein Paket unter ${PAKET_PFAD} — Ordnernamen ungeprüft.`)
}

const manifest = {
  format: 'cendova-templates',
  formatVersion: 1,
  name: 'Schaft-Planungsprofile',
  merge: true,
  createdAt: new Date().toISOString(),
  generator: 'build-stem-profile-addon',
  stemProfileByFolder: profile,
}
writeFileSync(AUSGABE, zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest, null, 1)) }))
console.log(
  `${AUSGABE} geschrieben (${Object.keys(profile).length} Profile).\n` +
    'In der App importieren (Paket-Menü) — merge:true ergänzt das Bestandspaket.',
)
