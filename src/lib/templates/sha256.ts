/**
 * SHA-256 in reinem TypeScript — Rückfallebene für `crypto.subtle`.
 *
 * Warum überhaupt: Die Web-Crypto-API gibt es nur in SICHEREN Kontexten
 * (HTTPS oder localhost). Im Klinik-Netzbetrieb liefert CendovaView die App
 * aber unter `http://<Servername>/plan/` aus — dort ist `crypto.subtle`
 * undefined. Der Paket-Abgleich (registry.ts) vergleicht Datei-Stände per
 * Hash; ohne Hash brach er still ab, und ein am Server aktualisiertes Paket
 * erreichte Arbeitsplätze mit vorhandenem Paket nie (Befund Release-Check
 * 28.09.2026, im Browser nachgewiesen: isSecureContext=false).
 *
 * Liefert exakt dieselben Werte wie `crypto.subtle.digest('SHA-256', …)`
 * (Test gegen node:crypto) — ein Wechsel der Implementierung verändert also
 * keinen gespeicherten Abgleich-Stand. Gibt zwischendurch den Event-Loop
 * frei, damit ein großes Paket die Oberfläche beim Start nicht einfriert.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** Verarbeitet einen 64-Byte-Block ab `off` und aktualisiert `H`. */
function block(H: Uint32Array, W: Uint32Array, d: Uint8Array, off: number): void {
  for (let i = 0; i < 16; i++) {
    const j = off + i * 4
    W[i] = (d[j] << 24) | (d[j + 1] << 16) | (d[j + 2] << 8) | d[j + 3]
  }
  for (let i = 16; i < 64; i++) {
    const w15 = W[i - 15]
    const w2 = W[i - 2]
    const s0 = ror(w15, 7) ^ ror(w15, 18) ^ (w15 >>> 3)
    const s1 = ror(w2, 17) ^ ror(w2, 19) ^ (w2 >>> 10)
    W[i] = W[i - 16] + s0 + W[i - 7] + s1
  }
  let a = H[0], b = H[1], c = H[2], e = H[4], f = H[5], g = H[6], h = H[7], dd = H[3]
  for (let i = 0; i < 64; i++) {
    const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0
    const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
    h = g
    g = f
    f = e
    e = (dd + t1) | 0
    dd = c
    c = b
    b = a
    a = (t1 + t2) | 0
  }
  H[0] += a
  H[1] += b
  H[2] += c
  H[3] += dd
  H[4] += e
  H[5] += f
  H[6] += g
  H[7] += h
}

/**
 * SHA-256 als Hex-String. `bloeckeProPause` bestimmt, nach wie vielen
 * 64-Byte-Blöcken der Event-Loop freigegeben wird (Standard 2 MiB) — nur
 * für Tests kleiner gesetzt, um die Pausengrenzen zu treffen.
 */
export async function sha256HexJs(daten: Uint8Array, bloeckeProPause = 32768): Promise<string> {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const W = new Uint32Array(64)
  const n = daten.length
  const volleBloecke = Math.floor(n / 64)
  for (let i = 0; i < volleBloecke; i++) {
    block(H, W, daten, i * 64)
    if ((i + 1) % bloeckeProPause === 0) await new Promise((r) => setTimeout(r, 0))
  }
  // Rest + Padding: 0x80, Nullen, Bitlänge als 64-Bit big-endian.
  const rest = n - volleBloecke * 64
  const ende = new Uint8Array(rest < 56 ? 64 : 128)
  ende.set(daten.subarray(volleBloecke * 64))
  ende[rest] = 0x80
  const bits = n * 8
  const dv = new DataView(ende.buffer)
  dv.setUint32(ende.length - 8, Math.floor(bits / 0x100000000))
  dv.setUint32(ende.length - 4, bits >>> 0)
  for (let off = 0; off < ende.length; off += 64) block(H, W, ende, off)
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('')
}
