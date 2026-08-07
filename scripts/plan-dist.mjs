// Haelt dist/ aktuell - die EINE Stelle, an der entschieden wird, ob
// CendovaPlan neu gebaut werden muss. Bewusst hier (und nicht in CendovaView),
// damit beide Launcher dieselbe Logik benutzen und sie mit dem Repo mitwaechst:
//
//   cendova-plan/scripts/start-local.ps1   (CendovaPlan allein gestartet)
//   cendova-view/scripts/start-local.ps1   (Suite-Start, liefert dist unter /plan)
//
// Hintergrund (Realtest 05.08.): Der Nutzer startete NUR CendovaPlan - dessen
// Launcher startete aber bloss den Dev-Server und ruehrte dist/ nie an. Der
// Planen-Knopf in CendovaView lief darum weiter auf einem alten Build, der den
// Embedded-Vertrag v2 (zweites Knie-Bild) noch nicht kannte. Sichtbar wurde das
// erst als Fehlermeldung IM Planungsfenster - viel zu spaet.
//
// Die Pruefung ist deshalb inhaltlich statt nur stempelbasiert:
//   1. dist/index.html fehlt
//   2. keine Visitenkarte (dist/.build-info.json) - Build von vor diesem Stand
//   3. Vertragsversion im Build != Vertragsversion in der Quelle  <- der Fall oben
//   4. Commit im Build != aktueller Commit
//   5. irgendeine Quelldatei ist NEUER als dist/index.html
// Punkt 5 faengt alles ab, was Stempel nicht sehen: abgebrochener Build,
// haendische Aenderung, fehlgeschlagener git pull mit schon geaenderten Dateien.
//
// Aufruf:  node scripts/plan-dist.mjs [--mit-install] [--nur-pruefen]
// Exit 0 = dist ist aktuell, 1 = es fehlt/ist alt (bei --nur-pruefen) bzw.
// der Build ist fehlgeschlagen.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { commitOderNull, vertragAusQuelle } from './build-info.mjs'

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..')
const nurPruefen = process.argv.includes('--nur-pruefen')
const mitInstall = process.argv.includes('--mit-install')

/** Quellen, aus denen dist entsteht - Aenderung hier heisst: neu bauen. */
const QUELLEN = ['src', 'public', 'index.html', 'package.json', 'vite.config.ts']

function juengsteAenderung(pfad) {
  if (!existsSync(pfad)) return 0
  const s = statSync(pfad)
  if (!s.isDirectory()) return s.mtimeMs
  let neuste = s.mtimeMs
  for (const eintrag of readdirSync(pfad, { withFileTypes: true })) {
    if (eintrag.name === 'node_modules' || eintrag.name.startsWith('.')) continue
    neuste = Math.max(neuste, juengsteAenderung(join(pfad, eintrag.name)))
  }
  return neuste
}

/** @returns {string[]} Gruende, warum gebaut werden muss (leer = aktuell). */
export function pruefeDist(wurzelPfad = wurzel) {
  const index = join(wurzelPfad, 'dist/index.html')
  if (!existsSync(index)) return ['dist/ fehlt (noch nie gebaut)']

  const gruende = []
  const infoDatei = join(wurzelPfad, 'dist/.build-info.json')
  let info = null
  if (existsSync(infoDatei)) {
    try {
      info = JSON.parse(readFileSync(infoDatei, 'utf8'))
    } catch {
      gruende.push('Build-Visitenkarte unlesbar')
    }
  } else {
    gruende.push('Build stammt aus einem aelteren Stand (ohne Visitenkarte)')
  }

  if (info) {
    const soll = vertragAusQuelle(wurzelPfad)
    if (info.vertrag !== soll) {
      gruende.push(`Build kennt Embedded-Vertrag v${info.vertrag}, die Quelle hat v${soll}`)
    }
    const commit = commitOderNull(wurzelPfad)
    if (commit && info.commit && info.commit !== commit) {
      gruende.push(`Build ist von Commit ${info.commit.slice(0, 7)}, aktuell ist ${commit.slice(0, 7)}`)
    }
  }

  const gebaut = statSync(index).mtimeMs
  const quelle = Math.max(...QUELLEN.map((q) => juengsteAenderung(join(wurzelPfad, q))))
  if (quelle > gebaut) gruende.push('Quelldateien sind neuer als der Build')

  return gruende
}

/**
 * Warnt, wenn CendovaView ein ANDERES Verzeichnis unter /plan ausliefert als
 * dieses hier. Auf dem Nutzer-PC lagen zwei Klone (cendova-plan und der
 * frueher benannte EndoMiCAD) - ein Update im falschen blieb wirkungslos.
 */
function warneVorZwilling() {
  const eltern = join(wurzel, '..')
  if (!existsSync(join(eltern, 'cendova-view/package.json'))) return
  const bedient = join(eltern, 'cendova-plan')
  if (!existsSync(join(bedient, 'package.json'))) return
  try {
    if (realpathSync(bedient) === realpathSync(wurzel)) return
    console.log('')
    console.log('ACHTUNG: CendovaView liefert den Planen-Knopf aus einem ANDEREN Ordner aus:')
    console.log(`  bedient wird:   ${realpathSync(bedient)}`)
    console.log(`  du startest:    ${realpathSync(wurzel)}`)
    console.log('Aenderungen hier erreichen den Planen-Knopf nicht. Entweder den bedienten')
    console.log('Ordner starten oder CendovaView per start-local starten (baut ihn mit).')
    console.log('')
  } catch {
    // Pfad nicht aufloesbar - dann lieber schweigen als falsch warnen.
  }
}

// Siehe build-info.mjs: der naive `file://`-Vergleich ist auf Windows immer
// falsch. Hier wog das doppelt schwer - das Skript tat dort NICHTS und ging
// mit 0 nach Hause, also meldete start-local "alles in Ordnung", waehrend
// dist/ unangetastet alt blieb.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  warneVorZwilling()
  const gruende = pruefeDist()
  if (gruende.length === 0) {
    console.log('CendovaPlan-Build (dist/) ist aktuell.')
    process.exit(0)
  }
  console.log(`CendovaPlan-Build ist nicht aktuell: ${gruende.join('; ')}`)
  if (nurPruefen) process.exit(1)

  const lauf = (args) => spawnSync('npm', args, { cwd: wurzel, stdio: 'inherit', shell: true }).status
  if (mitInstall && lauf(['install', '--no-audit', '--no-fund']) !== 0) {
    console.log('Achtung: npm install fehlgeschlagen - Build uebersprungen.')
    process.exit(1)
  }
  console.log('Baue CendovaPlan (fuer den Planen-Knopf) - das dauert einen Moment ...')
  // Ausgabe AUFFANGEN statt durchreichen: Der Build schreibt rund 50 Zeilen,
  // die fuer den Anwender nichts bedeuten - Externalisierungs-Hinweise aus
  // den Cornerstone-Codec-Paketen (nicht von uns behebbar), die Dateitabelle
  // und Bundlegroessen-Tipps. Genau solches Rauschen hat schon einmal eine
  // echte Meldung verdeckt ("Update uebersprungen" blieb wochenlang
  // unbemerkt). Bei einem FEHLER wird alles ungekuerzt ausgegeben.
  const bau = spawnSync('npm', ['run', 'build'], {
    cwd: wurzel,
    shell: true,
    encoding: 'utf8',
  })
  if (bau.status !== 0) {
    process.stdout.write(bau.stdout ?? '')
    process.stderr.write(bau.stderr ?? '')
    console.log('Achtung: CendovaPlan-Build fehlgeschlagen - der Planen-Knopf laeuft weiter')
    console.log('auf dem alten Stand. Naechster Start versucht es erneut.')
    process.exit(1)
  }
  // Kurzfassung: die Stempel-Zeile des postbuild-Hooks ist die einzige
  // Build-Ausgabe, die den Anwender wirklich betrifft.
  const stempel = (bau.stdout ?? '')
    .split('\n')
    .find((z) => z.startsWith('Build gestempelt:'))
  if (stempel) console.log('  ' + stempel.trim())

  // Gegenprobe: hat der Build wirklich geliefert, was fehlte?
  const rest = pruefeDist()
  if (rest.length > 0) {
    console.log(`Achtung: dist/ gilt weiterhin als veraltet (${rest.join('; ')}).`)
    process.exit(1)
  }
  console.log('CendovaPlan-Build ist aktuell.')
}
