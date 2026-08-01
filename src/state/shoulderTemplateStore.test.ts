// Charakterisierungs-Tests des Schulter-Schablonen-Stores + der Listen-
// Gruppierung — analog kneeTemplateListe.test.ts: im Container ohne Paket
// nicht im Browser prüfbar, deshalb als reine Store-/Funktionstests.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  gruppiereShoulderNachImplantat,
  useShoulderTemplateStore,
  type ShoulderTemplate,
} from './shoulderTemplateStore'
import type { Types } from '@cornerstonejs/core'

const P: Types.Point3 = [0, 0, 0]

const t = (
  id: string,
  groupId: string,
  visible = true,
): ShoulderTemplate =>
  ({
    id,
    groupId,
    visible,
    kind: 'affinis-short-stem',
    side: 'R',
    sizeIndex: 0,
    center: P,
    rotationDeg: 0,
  }) as ShoulderTemplate

beforeEach(() => {
  useShoulderTemplateStore.setState({ templates: [], selectedId: null })
})

describe('gruppiereShoulderNachImplantat', () => {
  it('eine Zeile je Gruppe, Sichtbarkeit = mindestens eine sichtbar', () => {
    const zeilen = gruppiereShoulderNachImplantat(
      [t('s1', 'g1', false), t('s2', 'g1', true), t('s3', 'g2', false)],
      's3',
    )
    expect(zeilen).toHaveLength(2)
    expect(zeilen[0].sichtbar).toBe(true)
    expect(zeilen[1].sichtbar).toBe(false)
    expect(zeilen[1].ausgewaehlt).toBe(true)
  })
})

describe('useShoulderTemplateStore', () => {
  it('add legt Single-Gruppe an (groupId = id) und selektiert', () => {
    const id = useShoulderTemplateStore.getState().add('affinis-glenoid', 'L', P)
    const s = useShoulderTemplateStore.getState()
    expect(s.templates).toHaveLength(1)
    expect(s.templates[0].groupId).toBe(id)
    expect(s.templates[0].side).toBe('L')
    expect(s.selectedId).toBe(id)
  })

  it('remove entfernt gruppenweit und löst die Auswahl', () => {
    useShoulderTemplateStore.setState({
      templates: [t('s1', 'g1'), t('s2', 'g1'), t('s3', 'g2')],
      selectedId: 's2',
    })
    useShoulderTemplateStore.getState().remove('s1')
    const s = useShoulderTemplateStore.getState()
    expect(s.templates.map((x) => x.id)).toEqual(['s3'])
    expect(s.selectedId).toBeNull()
  })

  it('setGroupVisible blendet die ganze Gruppe um', () => {
    useShoulderTemplateStore.setState({
      templates: [t('s1', 'g1'), t('s2', 'g1'), t('s3', 'g2')],
      selectedId: null,
    })
    useShoulderTemplateStore.getState().setGroupVisible('s2', false)
    const s = useShoulderTemplateStore.getState()
    expect(s.templates.find((x) => x.id === 's1')?.visible).toBe(false)
    expect(s.templates.find((x) => x.id === 's2')?.visible).toBe(false)
    expect(s.templates.find((x) => x.id === 's3')?.visible).toBe(true)
  })

  it('setSizeIndex klemmt auf den Familien-Katalog (leer -> 0)', () => {
    // Ohne Paket ist SHOULDER_IMPLANT_FAMILIES leer -> maxSizeIndex 0.
    const id = useShoulderTemplateStore.getState().add('affinis-glenoid', 'R', P, 3)
    expect(
      useShoulderTemplateStore.getState().templates.find((x) => x.id === id)
        ?.sizeIndex,
    ).toBe(0)
  })
})
