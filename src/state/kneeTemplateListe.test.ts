// Charakterisierungs-Tests der Schablonen-Liste (rechte Leiste).
//
// Hintergrund: Knie-Schablonen tauchten in der rechten Liste ueberhaupt
// nicht auf — eine ausgeblendete oder aus dem Bild geschobene Komponente
// war damit nirgends mehr erreichbar. Beim Nachruesten ist die
// Gruppierung der heikle Teil: ein Implantat liegt als AP- UND als
// seitliche Kontur im Store, und `remove`/`setGroupVisible` fassen beide
// gemeinsam. Zwei Listenzeilen fuer ein Implantat waeren also gelogen.
//
// Diese Logik laesst sich im Container NICHT im Browser pruefen: das
// oeffentliche Repo enthaelt bewusst kein Schablonen-Paket, ohne das sich
// keine einzige Schablone platzieren laesst. Deshalb hier als reine
// Funktion getestet.
import { describe, expect, it } from 'vitest'
import {
  gruppiereNachImplantat,
  useKneeTemplateStore,
  type KneeTemplate,
} from './kneeTemplateStore'
import type { Types } from '@cornerstonejs/core'

const P: Types.Point3 = [0, 0, 0]

/** Minimale Schablone; nur die Felder, an denen die Gruppierung haengt. */
const t = (
  id: string,
  groupId: string,
  view: 'AP' | 'lateral',
  visible = true,
): KneeTemplate =>
  ({
    id,
    groupId,
    view,
    visible,
    kind: 'legion-ps-femur',
    side: 'R',
    sizeIndex: 0,
    center: P,
    rotationDeg: 0,
    pane: view === 'AP' ? 'left' : 'right',
  }) as KneeTemplate

describe('gruppiereNachImplantat', () => {
  it('macht aus AP + seitlich EINE Zeile', () => {
    const zeilen = gruppiereNachImplantat(
      [t('kneeT1', 'g1', 'AP'), t('kneeT2', 'g1', 'lateral')],
      null,
    )
    expect(zeilen).toHaveLength(1)
  })

  it('nimmt die AP-Kontur als Stellvertreter — auch wenn sie spaeter kommt', () => {
    const zeilen = gruppiereNachImplantat(
      [t('kneeT2', 'g1', 'lateral'), t('kneeT1', 'g1', 'AP')],
      null,
    )
    expect(zeilen[0].haupt.id).toBe('kneeT1')
  })

  it('faellt auf den ersten Eintrag zurueck, wenn es keine AP-Kontur gibt', () => {
    const zeilen = gruppiereNachImplantat([t('kneeT9', 'g1', 'lateral')], null)
    expect(zeilen[0].haupt.id).toBe('kneeT9')
  })

  it('trennt verschiedene Implantate', () => {
    const zeilen = gruppiereNachImplantat(
      [
        t('kneeT1', 'femur', 'AP'),
        t('kneeT2', 'femur', 'lateral'),
        t('kneeT3', 'tibia', 'AP'),
      ],
      null,
    )
    expect(zeilen).toHaveLength(2)
    expect(zeilen.map((z) => z.haupt.id)).toEqual(['kneeT1', 'kneeT3'])
  })

  it('behaelt die Reihenfolge der Platzierung', () => {
    const zeilen = gruppiereNachImplantat(
      [t('kneeT5', 'zweit', 'AP'), t('kneeT1', 'erst', 'AP')],
      null,
    )
    expect(zeilen.map((z) => z.haupt.groupId)).toEqual(['zweit', 'erst'])
  })

  it('gilt als sichtbar, solange EINE Kontur sichtbar ist', () => {
    const zeilen = gruppiereNachImplantat(
      [t('kneeT1', 'g1', 'AP', false), t('kneeT2', 'g1', 'lateral', true)],
      null,
    )
    // Sonst liesse sich eine halb ausgeblendete Gruppe nicht mehr komplett
    // abschalten — der Augen-Klick wuerde sie erst wieder einblenden.
    expect(zeilen[0].sichtbar).toBe(true)
  })

  it('ist unsichtbar, wenn KEINE Kontur sichtbar ist', () => {
    const zeilen = gruppiereNachImplantat(
      [t('kneeT1', 'g1', 'AP', false), t('kneeT2', 'g1', 'lateral', false)],
      null,
    )
    expect(zeilen[0].sichtbar).toBe(false)
  })

  it('markiert die Zeile, wenn IRGENDEINE Kontur der Gruppe ausgewaehlt ist', () => {
    const paar = [t('kneeT1', 'g1', 'AP'), t('kneeT2', 'g1', 'lateral')]
    // Auswahl der seitlichen Kontur muss dieselbe Zeile markieren.
    expect(gruppiereNachImplantat(paar, 'kneeT2')[0].ausgewaehlt).toBe(true)
    expect(gruppiereNachImplantat(paar, 'kneeT1')[0].ausgewaehlt).toBe(true)
    expect(gruppiereNachImplantat(paar, 'fremd')[0].ausgewaehlt).toBe(false)
    expect(gruppiereNachImplantat(paar, null)[0].ausgewaehlt).toBe(false)
  })

  it('liefert fuer eine leere Liste eine leere Liste', () => {
    expect(gruppiereNachImplantat([], null)).toEqual([])
  })
})

describe('setGroupVisible', () => {
  it('schaltet die GANZE Gruppe, nicht nur die angeklickte Kontur', () => {
    const store = useKneeTemplateStore.getState()
    store.reset()
    useKneeTemplateStore.setState({
      templates: [
        t('kneeT1', 'g1', 'AP'),
        t('kneeT2', 'g1', 'lateral'),
        t('kneeT3', 'g2', 'AP'),
      ],
    })
    useKneeTemplateStore.getState().setGroupVisible('kneeT1', false)
    const nach = useKneeTemplateStore.getState().templates
    expect(nach.filter((x) => x.groupId === 'g1').every((x) => !x.visible)).toBe(true)
    // Das andere Implantat bleibt unberuehrt.
    expect(nach.find((x) => x.id === 'kneeT3')!.visible).toBe(true)
    useKneeTemplateStore.getState().reset()
  })

  it('ignoriert eine unbekannte id, statt alles umzuschalten', () => {
    useKneeTemplateStore.setState({ templates: [t('kneeT1', 'g1', 'AP')] })
    useKneeTemplateStore.getState().setGroupVisible('gibtsNicht', false)
    expect(useKneeTemplateStore.getState().templates[0].visible).toBe(true)
    useKneeTemplateStore.getState().reset()
  })
})
