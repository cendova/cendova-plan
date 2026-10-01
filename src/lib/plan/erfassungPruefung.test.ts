import { describe, expect, it } from 'vitest'
import { erfassungUnvollstaendig } from './erfassungPruefung'

describe('Plausibilität des Export-Snapshots', () => {
  it('erkennt einen schwarzen Snapshot bei sichtbarem Live-Bild', () => {
    // Realtest 01.10.2026: AP-Bild im PDF schwarz, live normal.
    expect(erfassungUnvollstaendig(55, 1)).toBe(true)
    expect(erfassungUnvollstaendig(55, 15)).toBe(true)
  })
  it('akzeptiert einen Snapshot in der Helligkeit des Live-Bildes', () => {
    expect(erfassungUnvollstaendig(55, 55.3)).toBe(false)
    // Overlays machen den Snapshot eher heller, nie Alarm.
    expect(erfassungUnvollstaendig(55, 70)).toBe(false)
  })
  it('schlägt bei dunklem oder unlesbarem Live-Bild nie Alarm', () => {
    expect(erfassungUnvollstaendig(5, 0)).toBe(false)
    expect(erfassungUnvollstaendig(null, 0)).toBe(false)
    expect(erfassungUnvollstaendig(55, null)).toBe(false)
  })
})
