// Charakterisierung der Build-Aktualitaetspruefung (scripts/plan-dist.mjs).
//
// Der Fall, der sie ausgeloest hat: dist/ war alt, der Commit-Stempel passte
// trotzdem - der Planen-Knopf lief auf einem Build ohne Embedded-Vertrag v2.
// Genau das muss hier rot werden, wenn die Logik je aufweicht.

import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pruefeDist } from './plan-dist.mjs'

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
