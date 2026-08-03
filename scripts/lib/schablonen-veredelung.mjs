// Veredelung von Schablonen-Screenshots — Qualitätsziel „Knie", Prinzip
// ORIGINAL-TREUE.
//
// Lehren aus zwei verworfenen Ansätzen (Autor-Feedback „Qualität deutlich
// schlechter als Hüfte/Knie"):
//  - Reiner Zuschnitt reicht die Quellauflösung unverändert durch
//    (grobe Serien blieben grob, Linien dick).
//  - Mittellinien-Rekonstruktion (Skelett) und Vektorisierung ERFINDEN
//    Geometrie: wellige Pfade, verrundete Ecken, an Kreuzungen zerhackte
//    Konturen. Für chirurgische Planung inakzeptabel — die Wahrheit ist
//    das Quellbild.
//
// Die Knie-Referenz ist schlicht ein HOCHAUFLÖSENDER Screenshot, 1:1
// übernommen. Also tut diese Stufe genau zwei treue Dinge:
//  1. Subpixel-Resampling der WEICHEN Cyan-Maske (min(G,B)−R, enthält das
//     Original-Antialiasing) auf die Zielauflösung 0,1176 mm/px —
//     bikubisch (Catmull-Rom), kein Detail wird erfunden oder entfernt.
//  2. Sanfte Strichbreiten-Angleichung Richtung 0,33 mm (Knie-Optik) über
//     ein vorzeichenbehaftetes Distanzfeld der 0,5-Isolinie: beide
//     Linienränder wandern SYMMETRISCH um dasselbe Delta — die Linien-
//     MITTE (die eigentliche Geometrie) bleibt subpixelgenau liegen.
//     Das Delta ist gedeckelt (nie unter 70 % der Soll-Breite), damit
//     lokal dünnere Stellen nicht aufbrechen.
//
// Voraussetzung für Knie-Qualität bleibt ehrlich die Quelle: ≥ ~6 px/mm
// (ReUnion-Serie: 7,5–8,4). Gröbere Serien werden nachgeschärft besser,
// erreichen das Ziel aber erst mit Neuaufnahme (siehe ARBEITSSTAND).
import { createCanvas, loadImage } from '@napi-rs/canvas'

// ---------------------------------------------------------------------------
// Exakte quadrierte EDT (Felzenszwalb/Huttenlocher), separierbar.
// ---------------------------------------------------------------------------
function edtSquared(f, W, H) {
  const INF = 1e12
  const out = new Float64Array(W * H)
  const d = new Float64Array(Math.max(W, H))
  const v = new Int32Array(Math.max(W, H))
  const z = new Float64Array(Math.max(W, H) + 1)
  const transform = (get, set, n) => {
    let k = 0
    v[0] = 0
    z[0] = -INF
    z[1] = INF
    for (let q = 1; q < n; q++) {
      let s
      for (;;) {
        s = (get(q) + q * q - (get(v[k]) + v[k] * v[k])) / (2 * q - 2 * v[k])
        if (s <= z[k]) k--
        else break
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++
      set(q, (q - v[k]) * (q - v[k]) + get(v[k]))
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) d[y] = f[y * W + x]
    transform((i) => d[i], (i, val) => (out[i * W + x] = val), H)
  }
  for (let y = 0; y < H; y++) {
    const row = new Float64Array(W)
    for (let x = 0; x < W; x++) row[x] = out[y * W + x]
    transform((i) => row[i], (i, val) => (out[y * W + i] = val), W)
  }
  return out
}

/** Catmull-Rom-Kern für bikubisches Resampling (B=0, C=0.5). */
function cubic(t) {
  const a = Math.abs(t)
  if (a <= 1) return 1.5 * a * a * a - 2.5 * a * a + 1
  if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2
  return 0
}

/** Anzahl 8er-Zusammenhangskomponenten der Maske ≥ 0,5 (Kleinstflecken
 *  < 4 px zählen nicht — Antialiasing-Reste). */
function komponentenZahl(f, W, H) {
  const seen = new Uint8Array(W * H)
  const st = []
  let n = 0
  for (let i = 0; i < W * H; i++) {
    if (f[i] < 0.5 || seen[i]) continue
    let area = 0
    st.push(i)
    seen[i] = 1
    while (st.length) {
      const p = st.pop()
      area++
      const px = p % W, py = (p / W) | 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
          const q = ny * W + nx
          if (f[q] >= 0.5 && !seen[q]) { seen[q] = 1; st.push(q) }
        }
    }
    if (area >= 4) n++
  }
  return n
}

/** Quantil q der Maskenwerte ≥ 0,5 — misst, ob Linienkerne voll hell
 *  sind (gesund ≈ 1,0; überverdünnt/blass deutlich darunter). */
function kernIntensitaet(f, q) {
  const werte = []
  for (let i = 0; i < f.length; i++) if (f[i] >= 0.5) werte.push(f[i])
  if (!werte.length) return 0
  werte.sort((a, b) => a - b)
  return werte[Math.min(werte.length - 1, (werte.length * q) | 0)]
}

/** Median der horizontalen Läufe durch die 0,5-Maske = Strichbreite (px). */
function strichbreitePx(mask, W, H) {
  const runs = []
  for (let y = 0; y < H; y++) {
    let run = 0
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x] >= 0.5) run++
      else {
        if (run > 0 && run < 16) runs.push(run)
        run = 0
      }
    }
  }
  if (runs.length < 5) return 0
  runs.sort((a, b) => a - b)
  return runs[(runs.length / 2) | 0]
}

/**
 * @param pfad           Quell-Screenshot (PNG)
 * @param mmPerPxQuelle  Maßstab (Kugel-Kalibrierung)
 * @param opt.zielMmPerPx Default 0.1176 (Hüft-/Knie-Format, 216 dpi)
 * @param opt.strichMm    Default 0.33 (Knie-Optik)
 * @param opt.randMm      Default 1.5
 * @returns { png, widthPx, heightPx, mmPerPx, quelle: {pxProMm, strichMm} }
 */
export async function veredleSchablone(pfad, mmPerPxQuelle, opt = {}) {
  const zielMmPerPx = opt.zielMmPerPx ?? 0.1176
  const strichMm = opt.strichMm ?? 0.33
  const randMm = opt.randMm ?? 1.5

  const img = await loadImage(pfad)
  const W = img.width, H = img.height
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, W, H)

  // Weiche Cyan-Maske [0..1] — trägt das Original-Antialiasing.
  // Rote Pixel (Referenzkreis der Quell-Software) sind „unbekannt": der
  // Kreis ÜBERDECKT dort die Zeichnung. Sie werden markiert und unten aus
  // der Umgebung gefüllt — Linien, die beidseitig am Kreis ankommen,
  // laufen dann durch, statt Mikro-Lücken im Zentrumsmarker zu
  // hinterlassen (Befund der adversariellen Sichtprüfung).
  const maske = new Float64Array(W * H)
  const rot = new Uint8Array(W * H)
  let mnX = W, mxX = -1, mnY = H, mxY = -1
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (r > 110 && r - g > 50 && r - b > 50) rot[y * W + x] = 1
      maske[y * W + x] = Math.max(0, Math.min(255, Math.min(g, b) - r)) / 255
    }

  // Pegel-Normierung der Rohmaske. Die Quell-Software zeichnet eine
  // Serie gelegentlich im HERVORGEHOBENEN Zustand: statt reinem Cyan
  // (0,255,255) dann z. B. (153,254,255) — min(G,B)−R ergibt nur noch
  // 0,40 und KEIN Pixel überschreitet die Binarisierungsschwelle 0,5.
  // Ergebnis wäre ein blasser Geisterumriss ohne Linienkern (Befund der
  // Sichtprüfung an zwei Bildern). Die Geometrie ist dabei unversehrt,
  // es fehlt nur der Pegel — also hochskalieren.
  //
  // Für normale Aufnahmen ein exaktes NO-OP: reines Cyan liefert
  // min(255,255)−0 = 255, der Maximalwert ist dort 1,0.
  let maxRoh = 0
  for (let i = 0; i < maske.length; i++) if (maske[i] > maxRoh) maxRoh = maske[i]
  if (maxRoh > 0.25 && maxRoh < 0.98)
    for (let i = 0; i < maske.length; i++) maske[i] = Math.min(1, maske[i] / maxRoh)

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (maske[y * W + x] <= 0.15) continue
      if (x < mnX) mnX = x
      if (x > mxX) mxX = x
      if (y < mnY) mnY = y
      if (y > mxY) mxY = y
    }
  if (mxX < 0) throw new Error('keine Zeichnung (Cyan) gefunden')

  // Unbekannt-Region SO KLEIN wie möglich halten: Rot-Kern + 1 px Saum +
  // alle rot-kontaminierten Mischpixel (r > 60) in Kernnähe. Eine
  // pauschale 2-px-Dilatation hatte Ring und Zentrumspunkt zu einer
  // vollen Scheibe verschmolzen — die Strahlen liefen dann so weit, dass
  // leicht gekippte Orientierungen benachbarte PARALLEL-Linien fälschlich
  // verbanden (Klecks im Zentrum). Mit enger Maske bleibt das echte
  // Bildmaterial im Ring-Loch erhalten und jeder Strahl quert die Maske
  // in ~2 px — Brücken zwischen Parallel-Linien sind dann unmöglich.
  const rotDil = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!rot[y * W + x]) continue
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
          const q = ny * W + nx
          if (rotDil[q]) continue
          // 1-px-Saum immer; weiter außen nur echte Mischpixel.
          const nah = Math.abs(dx) <= 1 && Math.abs(dy) <= 1
          if (nah || data[q * 4] > 60) rotDil[q] = 1
        }
    }
  // Richtungsstrahl-Inpainting NUR innerhalb der Rotmaske, in drei
  // Schritten (Reihenfolge ist der Kern der Lösung — Befunde der
  // adversariellen Sichtprüfungen an Glenosphere, s-Stem und Cup):
  //
  //  1. ORIENTIERUNGEN wählen: erlaubt sind nur Richtungen, in denen
  //     nachweislich Strukturen in die Region einlaufen (globale
  //     Bewertung, lokale Maxima im Orientierungsraum). Ein freies max
  //     über alle Richtungen verbrückt eng stehende Parallel-Linien.
  //  2. SAUM-Reparatur: die unmaskierten, aber noch rot-kontaminierten
  //     Randpixel (Originalwert gedrückt → „Kerben") werden per LANGEM
  //     Strahl über Maske+Saum hinweg angehoben — nur nach oben, und nur
  //     wenn die Fortsetzung dahinter STRENG hell bleibt (min-Lookahead):
  //     das repariert Linien, lässt echte dunkle Zwischenräume dunkel und
  //     hebt nichts an, was hinter einem quer getroffenen Bogen liegt.
  //  3. FÜLLUNG mit KURZEN Strahlen: Rot-Pixel enden am reparierten Saum
  //     (erster Nicht-Rot-Pixel). Kurze Strahlen können weder die dunklen
  //     Quadranten dichter Marker fluten (s-Stem: Fadenkreuz im Kreis —
  //     lange Strahlen trafen hinter dem Ring zwangsläufig Bögen) noch
  //     Parallel-Linien verbrücken.
  let hatRot = false
  for (let i = 0; i < rotDil.length; i++) if (rotDil[i]) { hatRot = true; break }
  if (hatRot) {
    // SAUM: unmaskierte Pixel bis 2 px um die Maske (oft rot-gedrückt).
    const saum = new Uint8Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!rotDil[y * W + x]) continue
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
            const q = ny * W + nx
            if (!rotDil[q]) saum[q] = 1
          }
      }
    // Bilinear-Sampling, das GESPERRTE Pixel (noch ungefüllte Maske bzw.
    // unreparierter Saum) ausschließt und die Gewichte renormalisiert —
    // sonst mischt ein halbzahliger Exit-Punkt kontaminierte Dunkelwerte
    // in den Stützwert (Befund: 55-%-Füllungen an den Dot-Spalten).
    // null = keine gültige Stütze an dieser Position.
    const bilinearOhne = (fx, fy, sperre) => {
      const x0 = Math.floor(fx), y0 = Math.floor(fy)
      if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return 0
      const tx = fx - x0, ty = fy - y0
      const i0 = y0 * W + x0
      let summe = 0, gewicht = 0
      for (const [i, w] of [
        [i0, (1 - tx) * (1 - ty)],
        [i0 + 1, tx * (1 - ty)],
        [i0 + W, (1 - tx) * ty],
        [i0 + W + 1, tx * ty],
      ]) {
        if (sperre(i)) continue
        summe += maske[i] * w
        gewicht += w
      }
      return gewicht > 0.05 ? summe / gewicht : null
    }
    // KURZER Strahl: Wert am ersten Nicht-Rot-Pixel (Saum zählt als
    // Exit), abgesichert per KONDITIONALEM Lookahead hinter dem Exit:
    //  - Satter Exit (≥ 0,7 = Linienkern getroffen): tolerant —
    //    max(2,5 px, 4,5 px) dahinter muss hell sein. Erlaubt Strich-
    //    Punkt-Fortsetzungen, verwirft quer getroffene dünne Striche
    //    (2,5–4,5 px dahinter durchschlagen → beide dunkel).
    //  - Streif-Exit (< 0,7 = AA-Flanke): streng — min beider Lookaheads.
    //    Eine echte AA-Flanke läuft PARALLEL weiter (beide hell); der
    //    Quer-Streifer an einer Nachbarlinie fällt dahinter ins Dunkel.
    const sperreU = (q) => rotDil[q] === 1
    // Reichweite (cap): eine echte QUERUNG des Ringstrichs hat ihre
    // Exits binnen weniger px; TANGENTIAL-Rutschen entlang des Ring-
    // kanals (endet scheinbar „hell" an quer stehenden Bögen → erfundene
    // Füllungen, Befund s-Stem) braucht bei den realen Ringradien ≥ 8 px.
    // Im dünnen Umfeld sind 6 px sicher (deckt die breitere Rot-über-
    // Cyan-Mischzone an Linienkreuzungen ab), im dichten nur 4 px.
    // Einzige legitime lange Ausnahme: DURCHMESSER-Strahlen — der Marker
    // ist ein Kreis ums Rotationszentrum, alles, was ihn echt durchquert
    // (Achsen, Fadenkreuz, kollineare Ring+Punkt-Spalten), zielt durchs
    // Zentrum: 12 px.
    const strahlKurz = (x, y, dx, dy, cap) => {
      for (let t = 0.5; t <= cap; t += 0.5) {
        const fx = x + dx * t, fy = y + dy * t
        const ix = Math.round(fx), iy = Math.round(fy)
        if (ix < 0 || ix >= W || iy < 0 || iy >= H) return 0
        if (rotDil[iy * W + ix]) continue
        const exitWert = bilinearOhne(fx, fy, sperreU)
        if (exitWert === null) continue
        const las = [
          bilinearOhne(fx + dx * 2.5, fy + dy * 2.5, sperreU),
          bilinearOhne(fx + dx * 4.5, fy + dy * 4.5, sperreU),
        ].filter((v) => v !== null)
        if (!las.length) return exitWert
        return exitWert >= 0.7
          ? Math.min(exitWert, Math.max(...las))
          : Math.min(exitWert, ...las)
      }
      return 0
    }
    // LANGER, STRENGER Strahl (für die Saum-Reparatur): Exit erst hinter
    // Maske+Saum, Wert = min(Exit, Lookahead 2,5 px, Lookahead 4,5 px) —
    // nur eine Struktur, die PARALLEL zum Strahl weiterläuft, bleibt über
    // beide Lookaheads hell; ein quer getroffener dünner Bogen ist
    // dahinter durchschlagen → kein falscher Lift.
    const sperreUS = (q) => rotDil[q] === 1 || saum[q] === 1
    const strahlStreng = (x, y, dx, dy) => {
      for (let t = 0.5; t <= 25; t += 0.5) {
        const fx = x + dx * t, fy = y + dy * t
        const ix = Math.round(fx), iy = Math.round(fy)
        if (ix < 0 || ix >= W || iy < 0 || iy >= H) return 0
        const q = iy * W + ix
        if (rotDil[q] || saum[q]) continue
        const werte = [
          bilinearOhne(fx, fy, sperreUS),
          bilinearOhne(fx + dx * 2.5, fy + dy * 2.5, sperreUS),
          bilinearOhne(fx + dx * 4.5, fy + dy * 4.5, sperreUS),
        ].filter((v) => v !== null)
        if (!werte.length) continue
        return Math.min(...werte)
      }
      return 0
    }
    // Toleranter langer Strahl (fürs Scoring): wie strahlStreng über
    // Maske+Saum hinweg (der Saum ist beim Scoring noch unrepariert und
    // darf nicht als Stützwert dienen), aber mit max-Lookahead, damit
    // Strich-Punkt-Strukturen ihre Orientierung anmelden können.
    const strahlTolerant = (x, y, dx, dy) => {
      for (let t = 0.5; t <= 25; t += 0.5) {
        const fx = x + dx * t, fy = y + dy * t
        const ix = Math.round(fx), iy = Math.round(fy)
        if (ix < 0 || ix >= W || iy < 0 || iy >= H) return 0
        const q = iy * W + ix
        if (rotDil[q] || saum[q]) continue
        const exitWert = bilinearOhne(fx, fy, sperreUS)
        if (exitWert === null) continue
        const las = [
          bilinearOhne(fx + dx * 2.5, fy + dy * 2.5, sperreUS),
          bilinearOhne(fx + dx * 4.5, fy + dy * 4.5, sperreUS),
        ].filter((v) => v !== null)
        return las.length ? Math.min(exitWert, Math.max(...las)) : exitWert
      }
      return 0
    }
    const ORIENTIERUNGEN = 16
    const unbekannt = []
    for (let i = 0; i < rotDil.length; i++) if (rotDil[i]) unbekannt.push(i)
    // Schritt 1: Orientierungs-Auswahl (nur saubere Stützwerte jenseits
    // von Maske+Saum, vor Reparatur und Füllung).
    const score = new Float64Array(ORIENTIERUNGEN)
    for (const i of unbekannt) {
      const x = i % W, y = (i / W) | 0
      for (let k = 0; k < ORIENTIERUNGEN; k++) {
        const a = (Math.PI * k) / ORIENTIERUNGEN
        const dx = Math.cos(a), dy = Math.sin(a)
        score[k] += Math.min(
          strahlTolerant(x, y, dx, dy),
          strahlTolerant(x, y, -dx, -dy),
        )
      }
    }
    const maxScore = Math.max(...score)
    const erlaubt = new Uint8Array(ORIENTIERUNGEN)
    for (let k = 0; k < ORIENTIERUNGEN; k++) {
      const vor = score[(k + ORIENTIERUNGEN - 1) % ORIENTIERUNGEN]
      const nach = score[(k + 1) % ORIENTIERUNGEN]
      if (score[k] >= vor && score[k] >= nach && score[k] >= 0.15 * maxScore)
        erlaubt[k] = 1
    }
    // Umgebungsdichte: mittlere Helligkeit der ECHTEN Pixel bis 8 px um
    // die Region. Fernstützung und Saum-Lift beweisen nur in DÜNNEM
    // Umfeld etwas — in dichtem (s-Stem: Kreis, Fadenkreuz, Kragen- und
    // Halslinien) landet fast jeder lange Strahl samt Lookahead irgendwo
    // auf Tinte: der Lift flutete dort ganze dunkle Zeilen auf ~0,7 und
    // die Füllung fand falsche beidseitige Stützen (Befund Endprüfung).
    let dSumme = 0, dN = 0
    {
      let mnUx = W, mxUx = 0, mnUy = H, mxUy = 0
      for (const i of unbekannt) {
        const x = i % W, y = (i / W) | 0
        if (x < mnUx) mnUx = x
        if (x > mxUx) mxUx = x
        if (y < mnUy) mnUy = y
        if (y > mxUy) mxUy = y
      }
      for (let y = Math.max(0, mnUy - 8); y <= Math.min(H - 1, mxUy + 8); y++)
        for (let x = Math.max(0, mnUx - 8); x <= Math.min(W - 1, mxUx + 8); x++) {
          const q = y * W + x
          if (rotDil[q] || saum[q]) continue
          dSumme += maske[q]
          dN++
        }
    }
    const dünnesUmfeld = dN > 0 && dSumme / dN <= 0.35
    // Schritt 2: Saum-Reparatur (Lift, nie abdunkeln) — nur im dünnen
    // Umfeld; im dichten bleiben gedrückte Saumpixel lieber gedrückt
    // (die Grat-Kern-Garantie repariert Linienkerne später lokal).
    if (dünnesUmfeld) {
      for (let i = 0; i < saum.length; i++) {
        if (!saum[i]) continue
        const x = i % W, y = (i / W) | 0
        let best = 0
        for (let k = 0; k < ORIENTIERUNGEN; k++) {
          if (!erlaubt[k]) continue
          const a = (Math.PI * k) / ORIENTIERUNGEN
          const dx = Math.cos(a), dy = Math.sin(a)
          const v = Math.min(strahlStreng(x, y, dx, dy), strahlStreng(x, y, -dx, -dy))
          if (v > best) best = v
        }
        if (best > maske[i]) maske[i] = best
      }
    }
    // Schritt 3: Füllung — nur BEIDSEITIGE Stütze. Einseitig am Marker
    // endende Linien behalten bewusst eine kleine ehrliche Lücke (die
    // rot überdeckte Zone): lieber ein fehlendes Endstück als erfundene
    // Geometrie in einer OP-Schablone.
    let zSx = 0, zSy = 0, zN = 0
    for (const i of unbekannt) { zSx += i % W; zSy += (i / W) | 0; zN++ }
    const zX = zSx / zN, zY = zSy / zN
    const füllung = []
    for (const i of unbekannt) {
      const x = i % W, y = (i / W) | 0
      let best = 0
      for (let k = 0; k < ORIENTIERUNGEN; k++) {
        if (!erlaubt[k]) continue
        const a = (Math.PI * k) / ORIENTIERUNGEN
        const dx = Math.cos(a), dy = Math.sin(a)
        // Durchmesser-Privileg: Strahl läuft ≤ 1,5 px am Zentrum vorbei.
        const weit = Math.abs((zX - x) * -dy + (zY - y) * dx) <= 1.5
        const cap = weit ? 12 : dünnesUmfeld ? 6 : 4
        // Stütze je Richtung: lokale Querung (kurz) ODER — nur im dünnen
        // Umfeld — eine Struktur, die JENSEITS des Markers anhaltend
        // hell weiterläuft (toleranter Lang-Strahl: trägt auch Strich-
        // Punkt-Arme, deren Strichphase am Marker gerade Lücke hat —
        // Befund Cup-Abrisse). Im dichten Umfeld beweist Fernstützung
        // nichts und bleibt aus.
        const vVor = Math.max(
          strahlKurz(x, y, dx, dy, cap),
          dünnesUmfeld ? strahlTolerant(x, y, dx, dy) : 0,
        )
        const vZur = Math.max(
          strahlKurz(x, y, -dx, -dy, cap),
          dünnesUmfeld ? strahlTolerant(x, y, -dx, -dy) : 0,
        )
        const v = Math.min(vVor, vZur)
        if (v > best) best = v
      }
      füllung.push([i, best])
    }
    for (const [i, v] of füllung) maske[i] = v
    if (process.env.VEREDELUNG_DEBUG) {
      let cx = 0, cy = 0, n = 0
      for (const i of unbekannt) { cx += i % W; cy += (i / W) | 0; n++ }
      cx = Math.round(cx / n); cy = Math.round(cy / n)
      let out = `DEBUG Quellraum um Rot-Zentrum (${cx},${cy}); U=unbekannt S=Saum:\n`
      for (let y = cy - 11; y <= cy + 11; y++) {
        let row = ''
        for (let x = cx - 12; x <= cx + 12; x++) {
          const i = y * W + x
          const v = Math.round(maske[i] * 9)
          const tag = rotDil[i] ? 'U' : saum[i] ? 'S' : ' '
          row += (v === 0 ? ' .' : String(v).padStart(2)) + tag
        }
        out += row + '\n'
      }
      console.log(out)
    }
    // Aufräumen (1): AA-Werte (< 0,5) sind nur legitim direkt AN einem
    // Linienkern (≥ 0,5). Frei schwebende Mittelwerte — Reste schräger
    // Stützrichtungen — werden Hintergrund, sonst bliebe ein schwacher
    // Geister-Schleier um die Kreuzung.
    for (const i of unbekannt) {
      const v = maske[i]
      if (v < 0.03 || v >= 0.5) continue
      const x = i % W, y = (i / W) | 0
      let amKern = false
      for (let dy = -1; dy <= 1 && !amKern; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
          if (maske[ny * W + nx] >= 0.5) { amKern = true; break }
        }
      if (!amKern) maske[i] = 0
    }
    // Aufräumen (2): isolierte KLEINST-Füllungen (< 5 px, ≥ 0,5) ohne
    // Anschluss an echte Tinte sind Strahl-Koinzidenzen, keine Rekon-
    // struktion — weg damit (Befund: 2-px-Sprenkel im Leerraum).
    {
      const inU = new Uint8Array(W * H)
      for (const i of unbekannt) inU[i] = 1
      const gesehen = new Uint8Array(W * H)
      for (const start of unbekannt) {
        if (gesehen[start] || maske[start] < 0.5) continue
        const komp = [start]
        const st = [start]
        gesehen[start] = 1
        let echterAnschluss = false
        while (st.length) {
          const p = st.pop()
          const px = p % W, py = (p / W) | 0
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = px + dx, ny = py + dy
              if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
              const q = ny * W + nx
              if (maske[q] < 0.5) continue
              if (!inU[q]) { echterAnschluss = true; continue }
              if (!gesehen[q]) { gesehen[q] = 1; st.push(q); komp.push(q) }
            }
        }
        if (!echterAnschluss && komp.length < 5)
          for (const p of komp) maske[p] = 0
      }
    }
  }

  const strichQuellePx = strichbreitePx(maske, W, H) || 3

  // --- Zielraster (symmetrisch ums BBox-Zentrum; Bildmitte = Anker) ---
  const skala = mmPerPxQuelle / zielMmPerPx
  const randPx = randMm / zielMmPerPx
  const halfW = Math.ceil(((mxX - mnX + 1) / 2) * skala + randPx)
  const halfH = Math.ceil(((mxY - mnY + 1) / 2) * skala + randPx)
  const ZW = 2 * halfW, ZH = 2 * halfH
  const cxQ = (mnX + mxX + 1) / 2, cyQ = (mnY + mxY + 1) / 2

  // --- Bikubisches Resampling der weichen Maske ---
  const ziel = new Float64Array(ZW * ZH)
  for (let y = 0; y < ZH; y++) {
    const sy = cyQ + (y + 0.5 - halfH) / skala - 0.5
    const y0 = Math.floor(sy)
    for (let x = 0; x < ZW; x++) {
      const sx = cxQ + (x + 0.5 - halfW) / skala - 0.5
      const x0 = Math.floor(sx)
      let v = 0, wsum = 0
      for (let j = -1; j <= 2; j++) {
        const wy = cubic(sy - (y0 + j))
        if (wy === 0) continue
        const yy = Math.min(H - 1, Math.max(0, y0 + j))
        for (let i2 = -1; i2 <= 2; i2++) {
          const wx = cubic(sx - (x0 + i2))
          if (wx === 0) continue
          const xx = Math.min(W - 1, Math.max(0, x0 + i2))
          v += maske[yy * W + xx] * wx * wy
          wsum += wx * wy
        }
      }
      ziel[y * ZW + x] = Math.max(0, Math.min(1, wsum ? v / wsum : 0))
    }
  }

  // --- Sanfte Breitenkorrektur über das vorzeichenbehaftete Distanzfeld ---
  // SDF zur 0,5-Isolinie: innen positiv. Beide Ränder wandern symmetrisch
  // um delta nach innen → Linienmitte bleibt liegen.
  const istBreiteZiel = strichQuellePx * skala // Quell-Strich im Zielraster
  const sollBreiteZiel = strichMm / zielMmPerPx
  // Nie mehr wegnehmen, als bis 70 % der Soll-Breite übrig bleiben.
  const delta = Math.max(
    0,
    Math.min((istBreiteZiel - sollBreiteZiel) / 2, (istBreiteZiel - 0.7 * sollBreiteZiel) / 2),
  )
  let final = ziel
  if (delta > 0.15) {
    // EDT-Konvention (Felzenszwalb): 0 an den FEATURE-Pixeln, INF sonst —
    // das Ergebnis ist der Abstand zum nächsten Feature-Pixel.
    const zurLinie = new Float64Array(ZW * ZH)
    const zumHintergrund = new Float64Array(ZW * ZH)
    for (let i = 0; i < ziel.length; i++) {
      zurLinie[i] = ziel[i] >= 0.5 ? 0 : 1e12
      zumHintergrund[i] = ziel[i] >= 0.5 ? 1e12 : 0
    }
    const dLinie = edtSquared(zurLinie, ZW, ZH)
    const dHinter = edtSquared(zumHintergrund, ZW, ZH)
    // SDF in px: innerhalb der Linie positiv (Abstand zum Rand), außen
    // negativ — einmal berechnet, delta-unabhängig.
    const sdf = new Float64Array(ZW * ZH)
    for (let i = 0; i < sdf.length; i++) {
      sdf[i] =
        ziel[i] >= 0.5 ? Math.sqrt(dHinter[i]) - 0.5 : 0.5 - Math.sqrt(dLinie[i])
    }
    // Zwei Selbsttests gegen Überverdünnung (Befunde Sichtprüfung):
    //  1. Fragmentierung (rsa-cup): lokal dünnere Bogenpartien dürfen
    //     nicht in Punktketten zerfallen → Komponentenzahl vergleichen.
    //  2. Kernhelligkeit (rsa-cup_05): die Läufe-Messung überschätzt bei
    //     GEKIPPTEN Serien die Strichbreite (bis √2) → delta zu groß, die
    //     Linienkerne erreichen dann nie mehr volle Helligkeit (blass).
    //     Korrektes Thinning lässt Kerne bei 1,0 (clamp) — fällt der
    //     Median der Kerne unter 0,8, war delta zu aggressiv.
    // In beiden Fällen delta halbieren, bis beides hält (oder Korrektur
    // entfällt).
    const vorher = komponentenZahl(ziel, ZW, ZH)
    let d = delta
    for (;;) {
      const kand = new Float64Array(ZW * ZH)
      for (let i = 0; i < kand.length; i++) {
        // Antialiasing über 1 px um die neue Kante bei sdf = d.
        kand[i] = Math.max(0, Math.min(1, sdf[i] - d + 0.5))
      }
      if (
        komponentenZahl(kand, ZW, ZH) <= vorher &&
        kernIntensitaet(kand, 0.5) >= 0.8
      ) {
        final = kand
        break
      }
      d /= 2
      if (d < 0.15) break // Korrektur entfällt — Original-Breite behalten
    }
  }

  // --- Finale Kern-Normalisierung ---
  // Reine Pegel-Anpassung (keine Geometrie-Änderung): erreichen die
  // Linienkerne nach Resampling (z. B. leichtes Downscale) nicht volle
  // Helligkeit, wird die gesamte Maske so skaliert, dass p90 der Kerne
  // auf 1,0 liegt — bei gesunden Bildern ein No-op.
  const kern = kernIntensitaet(final, 0.9)
  if (kern > 0 && kern < 0.95) {
    for (let i = 0; i < final.length; i++)
      final[i] = Math.min(1, final[i] / kern)
  }

  // --- Grat-Kern-Garantie ---
  // Je nach Subpixel-Lage der Quelle kann eine EINZELNE dünne Linie nach
  // dem Resampling ohne vollhellen Kern bleiben (z. B. Mittelachse
  // konstant bei 85 % — wirkt beim Durchblättern der Größen abwechselnd
  // matt und hell, Befund s-Stem). Reparatur lokal und geometrie-treu:
  // Ein Pixel, das im Querschnitt einer Richtung das STRIKTE lokale
  // Maximum ist (Grat = Linienmitte), bekommt vollen Kern. Echte
  // AA-Flanken sind nie strikte Grate (der Nachbar-Kern ist heller) und
  // bleiben unangetastet.
  //
  // Bewertung auf EINGEFRORENEN Werten (Kopie), Anwendung danach —
  // In-Place-Scans kaskadierten bei 2-px-Plateaus zu zeilenweisem
  // Dithering (Befund Gleichmäßigkeits-Prüfung). Ein 2-px-Plateau ist
  // eine Linie, deren Mitte auf der Pixelgrenze liegt: die ehrliche
  // Wiedergabe ist beidseitig voller Kern PLUS symmetrische AA-Flanken
  // (≈ 0,4), massegleich zum Geschwister-Profil „216·255·216".
  {
    const eingefroren = Float64Array.from(final)
    // Querschnitts-Richtungen: [Schritt, Gegenschritt] in Indexdistanz.
    const richtungen = [1, ZW, ZW + 1, ZW - 1]
    const kerne = []
    const flanken = []
    for (let y = 1; y < ZH - 1; y++)
      for (let x = 1; x < ZW - 1; x++) {
        const i = y * ZW + x
        const v = eingefroren[i]
        if (v < 0.6 || v >= 0.985) continue
        for (const s of richtungen) {
          const a = eingefroren[i - s], b = eingefroren[i + s]
          // Senkrechte Richtung zum getesteten Querschnitt.
          const q = s === 1 ? ZW : s === ZW ? 1 : s === ZW + 1 ? ZW - 1 : ZW + 1
          const c = eingefroren[i - q], d = eingefroren[i + q]
          // Ein Paar disqualifiziert, wenn im Querschnitt ODER senkrecht
          // dazu ein Voll-Kern liegt: dann ist der Mittelwert AA-Flanke
          // bzw. Kurvenscheitel — nie anheben. Ein gedrücktes Kern-
          // SEGMENT (längs gesund, quer kernlos) bleibt reparierbar.
          if (a >= 0.985 || b >= 0.985 || c >= 0.985 || d >= 0.985) continue
          if (v >= a && v >= b && (v > a || v > b)) {
            kerne.push(i)
            // Plateau-Partner (Gleichstand im Querschnitt): dessen
            // Außenseite bekommt die AA-Flanke; die eigene Außenseite
            // ebenso. Ohne Partner existieren die Flanken schon (der
            // Grat war striktes Maximum über echtem AA).
            if (Math.abs(v - b) <= 0.01) flanken.push(i - s)
            if (Math.abs(v - a) <= 0.01) flanken.push(i + s)
            break
          }
        }
      }
    for (const i of kerne) final[i] = 1
    for (const i of flanken) final[i] = Math.max(final[i], 0.4)
  }

  // --- Staub-Entfernung ---
  // Isolierte Kleinst-Flecken (≤ 4 px Kern, keine weitere Tinte im
  // 5-px-Umkreis) sind Screenshot-Staub, keine Zeichnung — die Punkte
  // von Strich-Punkt-Linien liegen dagegen immer binnen 2–3 px neben
  // ihren Strichen und bleiben unberührt (Befund: 2-px-Sprenkel im
  // Leerraum zweier Insert-Bilder).
  {
    const gesehen = new Uint8Array(ZW * ZH)
    for (let start = 0; start < ZW * ZH; start++) {
      if (gesehen[start] || final[start] < 0.5) continue
      const komp = [start]
      const st = [start]
      gesehen[start] = 1
      while (st.length) {
        const p = st.pop()
        const px = p % ZW, py = (p / ZW) | 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx, ny = py + dy
            if (nx < 0 || nx >= ZW || ny < 0 || ny >= ZH) continue
            const q = ny * ZW + nx
            if (final[q] >= 0.5 && !gesehen[q]) { gesehen[q] = 1; st.push(q); komp.push(q) }
          }
      }
      if (komp.length > 4) continue
      const imKomp = new Set(komp)
      let nachbarTinte = false
      for (const p of komp) {
        const px = p % ZW, py = (p / ZW) | 0
        for (let dy = -5; dy <= 5 && !nachbarTinte; dy++)
          for (let dx = -5; dx <= 5; dx++) {
            const nx = px + dx, ny = py + dy
            if (nx < 0 || nx >= ZW || ny < 0 || ny >= ZH) continue
            const q = ny * ZW + nx
            if (final[q] >= 0.5 && !imKomp.has(q)) { nachbarTinte = true; break }
          }
        if (nachbarTinte) break
      }
      if (!nachbarTinte)
        for (const p of komp) {
          // Fleck samt AA-Saum löschen.
          const px = p % ZW, py = (p / ZW) | 0
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = px + dx, ny = py + dy
              if (nx >= 0 && nx < ZW && ny >= 0 && ny < ZH) final[ny * ZW + nx] = 0
            }
        }
    }
  }

  // --- Ausgabe: Cyan auf Schwarz (Filter-kompatibel: Alpha = B−R) ---
  const out = createCanvas(ZW, ZH)
  const octx = out.getContext('2d')
  const imgData = octx.createImageData(ZW, ZH)
  for (let i = 0; i < ZW * ZH; i++) {
    const a = final[i]
    const p = i * 4
    imgData.data[p] = 0
    imgData.data[p + 1] = Math.round(255 * a)
    imgData.data[p + 2] = Math.round(255 * a)
    imgData.data[p + 3] = 255
  }
  octx.putImageData(imgData, 0, 0)

  return {
    png: await out.encode('png'),
    widthPx: ZW,
    heightPx: ZH,
    mmPerPx: zielMmPerPx,
    quelle: {
      pxProMm: +(1 / mmPerPxQuelle).toFixed(2),
      strichMm: +(strichQuellePx * mmPerPxQuelle).toFixed(2),
    },
  }
}
