// Charakterisierungs-Tests (R0): Schablonenpaket-Manifest-Validierung.
// Das Paketformat ist ein externer Vertrag (private Klinik-ZIPs!) —
// Lockerungen/Verschärfungen hier müssen bewusst geschehen.
import { describe, expect, it } from 'vitest'
import {
  istSichererBildpfad,
  mergeManifests,
  referencedImagePaths,
  validateManifest,
  type TemplatePackageManifest,
} from './packageFormat'

const minimal = {
  format: 'cendova-templates',
  formatVersion: 1,
  name: 'Test-Paket',
}

describe('validateManifest', () => {
  it('akzeptiert das Minimal-Manifest', () => {
    const r = validateManifest(minimal)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.name).toBe('Test-Paket')
  })
  it('lehnt Nicht-Objekte und falsches format-Feld ab', () => {
    expect(validateManifest(null).ok).toBe(false)
    expect(validateManifest('zip').ok).toBe(false)
    expect(validateManifest({ ...minimal, format: 'other' }).ok).toBe(false)
  })
  it('lehnt fremde Format-Versionen ab', () => {
    const r = validateManifest({ ...minimal, formatVersion: 2 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Version 2/)
  })
  it('verlangt einen nicht-leeren Namen', () => {
    expect(validateManifest({ ...minimal, name: '' }).ok).toBe(false)
    expect(validateManifest({ format: 'cendova-templates', formatVersion: 1 }).ok).toBe(false)
  })
  it('verlangt exakt 5 Halslängen-Stufen (UI-Vertrag)', () => {
    expect(validateManifest({ ...minimal, headOffsetsMm: [0, 4, 8, 12] }).ok).toBe(false)
    expect(validateManifest({ ...minimal, headOffsetsMm: [-4, 0, 4, 8, 12] }).ok).toBe(true)
  })
})

describe('referencedImagePaths', () => {
  it('sammelt Pfade aus Knie-Index, Medacta-Index und Hintergründen', () => {
    const r = validateManifest({
      ...minimal,
      kneeImages: {
        'a|AP|0': { path: 'images/knee/a.png', widthPx: 1, heightPx: 1, mmPerPx: 1 },
      },
      medactaImages: {
        Folder: { ref1: { path: 'images/stems/s.png' } },
      },
      backgrounds: {
        'x|AP': { file: 'images/bg.png', description: 'x' },
      },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(referencedImagePaths(r.manifest).sort()).toEqual([
        'images/bg.png',
        'images/knee/a.png',
        'images/stems/s.png',
      ])
    }
  })
})

// --- Merge-Import (Kontur-Addons, z. B. S&N-DXF) -------------------------

const kontur = (wMm: number, quelle?: 'dxf') => ({
  wMm,
  hMm: wMm * 0.9,
  points: [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ],
  ...(quelle ? { quelle: quelle } : {}),
})

const basis: TemplatePackageManifest = {
  format: 'cendova-templates',
  formatVersion: 1,
  name: 'Klinik-Paket',
  kneeContours: { 'legion-ps-femur|AP|0': kontur(54) },
}

const addon: TemplatePackageManifest = {
  format: 'cendova-templates',
  formatVersion: 1,
  name: 'S&N Narrow (DXF)',
  merge: true,
  kneeContours: {
    'legion-ps-femur|AP|1': kontur(58, 'dxf'),
    'legion-ps-femur|AP|0': kontur(54.2, 'dxf'), // Überschreiben erlaubt
  },
}

describe('mergeManifests', () => {
  it('vereinigt Konturen schlüsselweise, behält Basis-Felder, kombiniert Namen', () => {
    const out = mergeManifests(basis, addon)
    expect(Object.keys(out.kneeContours ?? {}).sort()).toEqual([
      'legion-ps-femur|AP|0',
      'legion-ps-femur|AP|1',
    ])
    expect(out.kneeContours?.['legion-ps-femur|AP|0']?.quelle).toBe('dxf')
    expect(out.kneeContours?.['legion-ps-femur|AP|1']?.wMm).toBe(58)
    expect(out.name).toBe('Klinik-Paket + S&N Narrow (DXF)')
    expect(out.merge).toBeUndefined()
  })
  it('funktioniert ohne Basis-Paket (Addon wirkt allein über Bundled-Daten)', () => {
    const out = mergeManifests(null, addon)
    expect(out.name).toBe('S&N Narrow (DXF)')
    expect(out.merge).toBeUndefined()
    expect(out.kneeContours?.['legion-ps-femur|AP|1']?.quelle).toBe('dxf')
  })
})

describe('validateManifest (Merge/Konturen)', () => {
  it('akzeptiert ein Kontur-Addon', () => {
    expect(validateManifest(JSON.parse(JSON.stringify(addon))).ok).toBe(true)
  })
  it('lehnt unvollständige Konturen ab', () => {
    const bad = { ...addon, kneeContours: { x: { wMm: 1, hMm: 2, points: [] } } }
    expect(validateManifest(JSON.parse(JSON.stringify(bad))).ok).toBe(false)
  })
})

describe('stemCcdByFolder (Paket-CCD-Winkel)', () => {
  it('akzeptiert plausible Winkel und vereinigt schlüsselweise (Addon gewinnt)', () => {
    const b = { ...basis, stemCcdByFolder: { 'A STD': 135, 'A LAT': 125 } }
    const a = { ...addon, stemCcdByFolder: { 'A LAT': 127, 'B STD': 135 } }
    expect(validateManifest(JSON.parse(JSON.stringify(a))).ok).toBe(true)
    const out = mergeManifests(b, a)
    expect(out.stemCcdByFolder).toEqual({ 'A STD': 135, 'A LAT': 127, 'B STD': 135 })
  })
  it('lehnt unplausible Winkel ab (Tippfehler-/Vertauschungs-Schutz)', () => {
    for (const deg of [12.5, 1250, NaN, '125' as unknown as number]) {
      const bad = { ...addon, stemCcdByFolder: { X: deg } }
      expect(validateManifest(JSON.parse(JSON.stringify(bad))).ok).toBe(false)
    }
  })
})

// --- Bildpfad-Regel (Security-Fix §9) -------------------------------------
// Externe URLs bleiben verboten, aber gebündelte App-Pfade (kein images/-
// Präfix) sind LEGITIM — reale Pakete referenzieren sie. Regression:
// ein images/-Zwang lehnte echte Pakete ab („Paket verschwunden").

const mitKneeImagePfad = (path: string) => ({
  format: 'cendova-templates',
  formatVersion: 1,
  name: 'Pfad-Testpaket',
  kneeImages: { 'legion-ps-femur|AP|0': { path, wMm: 60, hMm: 40 } },
})

describe('istSichererBildpfad', () => {
  it('erlaubt ZIP-interne images/-Pfade', () => {
    expect(istSichererBildpfad('images/Legion ap.png')).toBe(true)
    expect(
      istSichererBildpfad('images/MEDACTA INTERNATIONAL - [Stem] - Quadra-P STD/40.png'),
    ).toBe(true)
  })
  it('erlaubt gebündelte App-Pfade (kein images/-Präfix)', () => {
    expect(istSichererBildpfad('/templates/knee/legion-ap.png')).toBe(true)
    expect(istSichererBildpfad('templates/knee/legion-ap.png')).toBe(true)
  })
  it('verbietet externe URLs und Schemata', () => {
    expect(istSichererBildpfad('https://example.com/beacon.png')).toBe(false)
    expect(istSichererBildpfad('http://example.com/x.png')).toBe(false)
    expect(istSichererBildpfad('data:image/png;base64,AAAA')).toBe(false)
    expect(istSichererBildpfad('javascript:alert(1)')).toBe(false)
    expect(istSichererBildpfad('//example.com/x.png')).toBe(false)
  })
  it('verbietet Pfad-Ausbrüche und Backslashes', () => {
    expect(istSichererBildpfad('images/../../etc/x.png')).toBe(false)
    expect(istSichererBildpfad('images\\x.png')).toBe(false)
    expect(istSichererBildpfad('')).toBe(false)
  })
})

describe('validateManifest — Bildpfade', () => {
  it('akzeptiert images/-Pfade', () => {
    expect(validateManifest(mitKneeImagePfad('images/legion.png')).ok).toBe(true)
  })
  it('akzeptiert gebündelte App-Pfade (Nutzer-Regression)', () => {
    expect(
      validateManifest(mitKneeImagePfad('/templates/knee/legion-ap.png')).ok,
    ).toBe(true)
  })
  it('lehnt externe URLs ab', () => {
    const r = validateManifest(mitKneeImagePfad('https://example.com/beacon.png'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Unsicherer Bildpfad/)
  })
})
