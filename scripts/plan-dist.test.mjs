// Charakterisierung der Build-Aktualitaetspruefung (scripts/plan-dist.mjs).
//
// Der Fall, der sie ausgeloest hat: dist/ war alt, der Commit-Stempel passte
// trotzdem - der Planen-Knopf lief auf einem Build ohne Embedded-Vertrag v2.
// Genau das muss hier rot werden, wenn die Logik je aufweicht.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { pruefeDist } from './plan-dist.mjs'

const skriptOrdner = dirname(fileURLToPath(import.meta.url))

const angelegt = []
afterEach(() => {
  for (const d of angelegt.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** Minimaler Repo-Abzug: Quelle mit Vertragsversion + optionaler Build. */
function baueAttrappe({ quellVertrag = 2, build = { vertrag: 2 }, quelleNeuer = false } = {}) {
  const wurzel = mkdtempSync(join(tmpdir(), 'plan-dist-'))
  angelegt.push(wurzel)
  mkdirSync(join(wurzel, 'src/lib'), { recursive: true })
  writeFileSync(
    join(wurzel, 'src/lib/embedded.ts'),
    `const CONTRACT_VERSION = ${quellVertrag}\n`,
  )
  writeFileSync(join(wurzel, 'index.html'), '<html></html>')
  writeFileSync(join(wurzel, 'package.json'), '{}')

  if (build) {
    mkdirSync(join(wurzel, 'dist'), { recursive: true })
    writeFileSync(join(wurzel, 'dist/index.html'), '<html>gebaut</html>')
    writeFileSync(
      join(wurzel, 'dist/.build-info.json'),
      JSON.stringify({ vertrag: build.vertrag, commit: null, gebautAm: '2026-08-05T00:00:00Z' }),
    )
    // Zeiten explizit setzen: sonst entscheidet die Sekundenaufloesung des
    // Dateisystems darueber, ob der Build als "neuer als die Quelle" gilt.
    const alt = new Date('2026-08-01T00:00:00Z')
    const neu = new Date('2026-08-02T00:00:00Z')
    utimesSync(join(wurzel, 'src/lib/embedded.ts'), quelleNeuer ? neu : alt, quelleNeuer ? neu : alt)
    utimesSync(join(wurzel, 'index.html'), alt, alt)
    utimesSync(join(wurzel, 'package.json'), alt, alt)
    utimesSync(join(wurzel, 'src'), alt, alt)
    utimesSync(join(wurzel, 'src/lib'), alt, alt)
    const gebaut = new Date('2026-08-01T12:00:00Z')
    utimesSync(join(wurzel, 'dist/index.html'), gebaut, gebaut)
  }
  return wurzel
}

describe('pruefeDist', () => {
  it('meldet nichts, wenn der Build zur Quelle passt', () => {
    expect(pruefeDist(baueAttrappe())).toEqual([])
  })

  it('meldet einen fehlenden Build', () => {
    expect(pruefeDist(baueAttrappe({ build: null })).join(' ')).toMatch(/fehlt/)
  })

  it('erkennt einen Build mit aelterem Embedded-Vertrag', () => {
    // Der Realtest-Fall: Datei da, Zeiten unauffaellig - nur der Vertrag alt.
    const gruende = pruefeDist(baueAttrappe({ quellVertrag: 2, build: { vertrag: 1 } }))
    expect(gruende.join(' ')).toMatch(/Vertrag v1.*v2/)
  })

  it('erkennt einen Build ohne Visitenkarte als alt', () => {
    const wurzel = baueAttrappe()
    rmSync(join(wurzel, 'dist/.build-info.json'))
    expect(pruefeDist(wurzel).join(' ')).toMatch(/Visitenkarte/)
  })

  it('erkennt Quelldateien, die neuer sind als der Build', () => {
    const gruende = pruefeDist(baueAttrappe({ quelleNeuer: true }))
    expect(gruende.join(' ')).toMatch(/Quelldateien sind neuer/)
  })
})

describe('Aufruf als Programm', () => {
  // Realtest 05.08.: Beide Skripte pruefen "bin ich direkt aufgerufen?" - und
  // taten das mit `file://${process.argv[1]}`. Auf WINDOWS trifft das nie zu
  // (Backslash-Pfad gegen file:///C:/...), also passierte dort NICHTS, mit
  // Exit-Code 0. Der Launcher meldete "in Ordnung", dist/ blieb alt und der
  // Build trug keine Visitenkarte. Auf Linux/macOS lief alles - der Fehler
  // war also nur auf der Plattform des Nutzers sichtbar.
  it('vergleicht das Hauptmodul plattformneutral (pathToFileURL)', () => {
    for (const datei of readdirSync(skriptOrdner).filter((d) => d.endsWith('.mjs'))) {
      const quelle = readFileSync(join(skriptOrdner, datei), 'utf8')
      const zeilen = quelle
        .split('\n')
        .filter((z) => !z.trim().startsWith('//') && /file:\/\/\$\{process\.argv\[1\]\}/.test(z))
      expect(zeilen, `${datei} baut die file://-URL von Hand (bricht auf Windows)`).toEqual([])
    }
  })

  it('meldet beim direkten Aufruf ein Ergebnis statt stillzuschweigen', () => {
    // Fängt jede Neuauflage von „lief durch, tat aber nichts" ab.
    // Bewusst OHNE Erwartung an den Exit-Code: ob dist/ gerade aktuell ist,
    // hängt am Repo-Zustand (jeder neue Commit veraltet es) - geprüft wird
    // nur, DASS das Skript ein Urteil abgibt.
    const lauf = spawnSync(process.execPath, [join(skriptOrdner, 'plan-dist.mjs'), '--nur-pruefen'], {
      encoding: 'utf8',
      cwd: tmpdir(), // bewusst NICHT im Repo: der Pfad kommt aus dem Skript selbst
    })
    expect(lauf.stdout).toMatch(/CendovaPlan-Build/)
  })
})
