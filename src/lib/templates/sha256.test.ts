// Die Rückfall-SHA-256 MUSS bitgenau mit Web-Crypto übereinstimmen: Der
// Paket-Abgleich speichert Hashes und vergleicht sie beim nächsten Start.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256HexJs } from './sha256'

const referenz = (d: Uint8Array) => createHash('sha256').update(d).digest('hex')
const zufall = (n: number, saat = 7) => {
  const d = new Uint8Array(n)
  let x = saat
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    d[i] = x >>> 24
  }
  return d
}

describe('sha256HexJs', () => {
  it('trifft die bekannten Testvektoren', async () => {
    expect(await sha256HexJs(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(await sha256HexJs(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('stimmt an allen Padding-Grenzen mit node:crypto überein', async () => {
    // 55/56 und 63/64/65: genau dort wechselt das Padding von einem auf zwei Blöcke.
    for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000]) {
      const d = zufall(n, n)
      expect(await sha256HexJs(d), `Länge ${n}`).toBe(referenz(d))
    }
  })

  it('bleibt über die Pausen-Grenzen hinweg exakt', async () => {
    // Pause nach je 3 Blöcken — die Verarbeitung darf dadurch nichts verlieren.
    const d = zufall(64 * 10 + 17, 3)
    expect(await sha256HexJs(d, 3)).toBe(referenz(d))
  })

  it('rechnet auch Megabyte-Pakete korrekt', async () => {
    const d = zufall(3 * 1024 * 1024 + 5, 11)
    expect(await sha256HexJs(d)).toBe(referenz(d))
  })
})
