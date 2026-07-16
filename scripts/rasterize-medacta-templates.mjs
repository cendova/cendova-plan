/**
 * Rasterisiert alle Medacta-Schaft-PDFs zu PNG-Bildern für die Web-App.
 *
 * Warum: die echten Konturen helfen klinisch — der Operateur sieht, ob
 * der gewählte Schaft in den Markraum passt. Aus den PDFs holen wir das
 * scharfe Implantatbild, speichern den apOrigin in Pixelkoordinaten und
 * können das Bild beim Rendern an einem Anker richtig platzieren und
 * drehen.
 *
 * Output:
 *  - public/templates/stems/<folder-slug>/<refNo-slug>.png
 *  - src/lib/hip/medactaImages.ts (auto-generierter Index)
 *
 * Aufruf:  node scripts/rasterize-medacta-templates.mjs
 */
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ladeSolldaten } from './lib/solldaten.mjs'

// --- pdfjs-dist (legacy build für Node) ---
// Polyfill für DOMMatrix etc., die pdfjs erwartet aber Node nicht hat.
// @napi-rs/canvas liefert all das.
const canvasMod = await import('@napi-rs/canvas')
const { createCanvas, GlobalFonts: _GlobalFonts } = canvasMod
// pdfjs setzt manche Globals, sonst meckert es.
globalThis.DOMMatrix = canvasMod.DOMMatrix
globalThis.Path2D = canvasMod.Path2D
globalThis.ImageData = canvasMod.ImageData

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
// Worker wird im Node-Betrieb nicht benötigt — wir setzen einen
// Dummy-Pfad, damit pdfjs nicht versucht, einen zu laden.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).href

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = dirname(HERE)
const TEMPLATES_ROOT = join(
  PROJECT_ROOT,
  'Templates Osirix',
  'Fondazione Templates-2',
)
const OUTPUT_DIR = join(PROJECT_ROOT, 'public', 'templates', 'stems')
const INDEX_FILE = join(PROJECT_ROOT, 'src', 'lib', 'hip', 'medactaImages.ts')

// Rasterisierungsauflösung. PDF-Original ist in Punkten (72 dpi).
// Faktor 3 ergibt ~216 dpi — scharf bei Zoom, vertretbare Dateigröße.
const RENDER_SCALE = 3

/** Liest den Katalog und gibt nur die Stem-Einträge zurück. */
function readCatalog() {
  const file = join(PROJECT_ROOT, 'src', 'lib', 'hip', 'medactaCatalog.ts')
  const src = readFileSync(file, 'utf8')
  // Die Datei ist auto-generiertes TypeScript mit JSON-ähnlichem Inhalt.
  // Wir extrahieren das MEDACTA_CATALOG-Array mit einer kleinen Regex.
  const m = src.match(/MEDACTA_CATALOG\s*:\s*MedactaEntry\[\]\s*=\s*(\[[\s\S]*?\n\])\s*\n/)
  if (!m) throw new Error('MEDACTA_CATALOG nicht gefunden in medactaCatalog.ts')
  // Das Array ist gültiges JSON-mit-Anführungszeichen (geliefert von
  // unserer Extraktor-Script). eval ist hier sicher, weil wir die eigene
  // Datei lesen.
  // eslint-disable-next-line no-new-func
  return Function('"use strict"; return (' + m[1] + ')')()
    .filter((e) => e.component === 'Stem')
}

/** Slugifiziert einen String für sichere Dateinamen. */
function slug(s) {
  return s
    .replace(/[^a-zA-Z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

/** Findet die PDF-Datei innerhalb eines Template-Ordners (Fallback-tolerant). */
function findPdf(folderPath, pdfFileName) {
  const direct = join(folderPath, pdfFileName)
  if (existsSync(direct)) return direct
  // Fallback: case-insensitiver Vergleich.
  const want = pdfFileName.toLowerCase()
  try {
    const files = readdirSync(folderPath)
    const hit = files.find((f) => f.toLowerCase() === want)
    if (hit) return join(folderPath, hit)
  } catch {}
  return null
}

/** 25.4 mm pro Zoll, 72 PDF-Punkte pro Zoll → mm pro PDF-pt. */
const MM_PER_PT = 25.4 / 72

/** Zusätzlicher Rand (Pixel) um die gefundene BBox, damit die Kontur
 *  nicht bündig am Rand klebt. */
const CROP_MARGIN_PX = 8
/** Mindestgröße einer Komponente (Pixel), damit sie als Implantat-
 *  Kandidat in Frage kommt. Filtert Anti-Aliasing-Krümel raus. */
const MIN_COMPONENT_PX = 200

/** CCD-Winkel (Schenkelhals-Schaft-Winkel) je Schaft-Ordnername —
 *  Hersteller-Katalogdaten, daher aus scripts/katalog-solldaten.local.json
 *  (Sektion stemCcdByFolder; Struktur siehe katalog-solldaten.beispiel.json).
 *  Pflicht: Ohne die Winkel würde die Halsachse (und damit alle fünf
 *  Kopfpositionen) falsch hergeleitet.
 *
 *  Verwendung: In den Hersteller-PDFs steht die Schaftachse senkrecht
 *  (proximal oben, distal unten), der Hals zweigt mit Innenwinkel = CCD
 *  nach OBEN-RECHTS ab. Die fünf Kopfpositionen liegen entlang dieser Achse. */
const CCD_BY_FOLDER = ladeSolldaten({
  pflicht: ['stemCcdByFolder'],
  skript: 'rasterize-medacta-templates',
}).stemCcdByFolder
const CCD_DEFAULT_DEG = 135

/**
 * Rasterisiert eine PDF-Seite, scannt das mittlere Band auf nicht-weiße
 * Pixel, croppt auf die BBox des Implantats und rechnet die übergebenen
 * Bezugspunkte (apOrigin, headPoints) in die NEUE Bild-Pixel-Position um.
 */
async function rasterizePdf(pdfPath, apOriginPt, headPointsPt, folderKey) {
  const data = new Uint8Array(readFileSync(pdfPath))
  const doc = await pdfjs.getDocument({ data, useWorker: false, isEvalSupported: false }).promise
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: RENDER_SCALE })
  const fullW = Math.ceil(viewport.width)
  const fullH = Math.ceil(viewport.height)
  const fullCanvas = createCanvas(fullW, fullH)
  const fullCtx = fullCanvas.getContext('2d')
  await page.render({
    canvasContext: fullCtx,
    viewport,
    background: 'rgba(0,0,0,0)',
  }).promise

  // Implantat-BBox via Connected-Component-Analyse. Wir scannen die
  // GANZE Seite, finden die größte verbundene dunkle Region — das ist
  // das Implantat (durchgehender Outline-Pfad). Titel-Text und Scale-
  // Ruler bestehen aus mehreren KLEINEN Komponenten (einzelne Buchstaben,
  // einzelne Tick-Marks), die alle kleiner sind als die Stem-Outline.
  const fullImageData = fullCtx.getImageData(0, 0, fullW, fullH)
  const bbox = findLargestComponentBBox(fullImageData, fullW, fullH)
  if (!bbox) {
    await doc.cleanup?.()
    await doc.destroy?.()
    throw new Error('Keine Implantat-Kontur gefunden')
  }
  // BBox um Margin ausweiten, an den Page-Rand klemmen.
  const x0 = Math.max(0, bbox.minX - CROP_MARGIN_PX)
  const y0 = Math.max(0, bbox.minY - CROP_MARGIN_PX)
  const x1 = Math.min(fullW, bbox.maxX + CROP_MARGIN_PX)
  const y1 = Math.min(fullH, bbox.maxY + CROP_MARGIN_PX)
  const cropW = x1 - x0
  const cropH = y1 - y0

  // Cropped-Canvas erzeugen und den Ausschnitt rüberkopieren.
  const cropCanvas = createCanvas(cropW, cropH)
  const cropCtx = cropCanvas.getContext('2d')
  cropCtx.drawImage(fullCanvas, x0, y0, cropW, cropH, 0, 0, cropW, cropH)
  const png = await cropCanvas.encode('png')

  // Anker-Punkt der Schablone: wir nutzen den TOP-RIGHT-most Inkable-
  // Pixel als Kopf-Anker. Bei Medactas Layout (Hals oben rechts, Body
  // erstreckt sich nach unten) trifft das ziemlich genau das Ende des
  // Halses, wo der Kopf konstruktiv aufgesetzt wird.
  //
  // apOriginPx liegt EXAKT senkrecht UNTER dem Anker (= Schaft-Richtung
  // im natürlichen PNG-Layout). Damit ergibt sich baselineDeg = 90°
  // (= „nach unten" in Canvas-Konvention) und mit
  // DEFAULT_STEM_ROTATION_DEG = 90° wird die SVG-Rotation = 0 →
  // Implantat erscheint in der natürlichen, nicht-gedrehten Orientierung.
  const cropImageData = cropCtx.getImageData(0, 0, cropW, cropH)
  const anchorPx = findTopRightMostInkable(cropImageData, cropW, cropH)
  // bodyAxisAngleDeg = tatsächliche Längsachse des Schaftkörpers im PNG,
  // ermittelt aus den Zeilen-Mittelpunkten (links<>rechts) im unteren
  // 60% des gecroppten Bildes. Damit kompensieren wir, dass Medacta-
  // PDFs ihren Schaft nicht immer exakt vertikal zeichnen — Tilts von
  // 1-5° kommen vor und sind verantwortlich für die Varus/Valgus-Drift,
  // wenn der Nutzer den Schaft auf die Femur-Achse legt.
  const bodyAxisAngleDeg = computeBodyAxisAngleDeg(cropImageData, cropW, cropH)
  // apOriginPx wird ENTLANG der Body-Achse vom Anker aus gesetzt
  // (statt senkrecht). So liefert atan2(ap−head) im Renderer direkt den
  // Body-Achsen-Winkel als baselineDeg, und die SVG-Rotation passt zur
  // visuellen Implantat-Mittellinie statt zur head→ap-Geraden.
  const bodyAxisRad = (bodyAxisAngleDeg * Math.PI) / 180
  const apOriginDist = cropH * 0.5
  const apOriginPx = [
    anchorPx[0] + Math.cos(bodyAxisRad) * apOriginDist,
    anchorPx[1] + Math.sin(bodyAxisRad) * apOriginDist,
  ]

  // headPointsPx = 5 Positionen der Kopfzentren je Halslänge.
  // Konvention HEAD_OFFSETS_MM = [-4, 0, +4, +8, +12]:
  //   Index 4 (+12 mm, längster Hals) = sichtbarste/äußerste Kugel
  //   Index 3 (+8 mm)
  //   Index 2 (+4 mm)
  //   Index 1 (0 mm)   ← Default-Auswahl im UI
  //   Index 0 (-4 mm,  kürzester Hals, körpernah)
  //
  // ZWEISTUFIGE STRATEGIE:
  //  1) Halsachse aus dem CCD-Winkel ableiten (Medactas PDF-Layout hat
  //     die Schaftachse exakt vertikal, Hals zweigt mit Innenwinkel CCD
  //     nach oben-rechts ab). Richtung vom +12-Anker zum Körper:
  //     (−sin α, +cos α) mit α = 180° − CCD.
  //  2) Direkt aus dem gerenderten PNG die ECHTEN Kugel-Mittelpunkte
  //     entlang dieser Achse per Peak-Detektion finden. So sind die
  //     Positionen pixelgenau — unabhängig von der PDF-Druckskala (die
  //     bei Medacta nicht exakt 1:1 ist).
  //
  // Fallback (keine Kugeln detektiert): analytisch mit 4 mm Schritt aus
  // der angenommenen PDF-Skala.
  const ccdDeg = CCD_BY_FOLDER[folderKey] ?? CCD_DEFAULT_DEG
  const neckAngleFromShaftRad = ((180 - ccdDeg) * Math.PI) / 180
  const stepUx = -Math.sin(neckAngleFromShaftRad)
  const stepUy = +Math.cos(neckAngleFromShaftRad)

  const allPeaks = findBallCentersOnAxis(
    cropImageData,
    cropW,
    cropH,
    anchorPx,
    [stepUx, stepUy],
  )
  // Bei N > 5 Peaks: kombinatorisch das varianzärmste 5-Subset
  // auswählen (filtert MasterLoc-Fremdmarkierungen heraus, bewahrt aber
  // Quadra-P-Kugeln mit Konus-Outline-Overlap).
  const ballPeaks = pickBestChain(allPeaks)

  // Sanity-Check: ist der detektierte Median-Abstand plausibel?
  // Erwartung: 4 mm Kopflängen-Inkrement entspricht ~25–40 px im PNG.
  // Außerhalb dieses Bereichs → Detektion hat keine Kugel-Kette gefunden
  // (z.B. MasterLoc hat ein abweichendes PDF-Layout mit anderen
  // Markierungen, die mein 45°/55°-Achsen-Scan trifft). Dann besser
  // analytischer Fallback als pixelweit danebenliegende Positionen.
  const pxPerMmAnalytic = 1 / (MM_PER_PT / RENDER_SCALE)
  const expectedSpacingPx = 4 * pxPerMmAnalytic  // ~34 px
  const MIN_SPACING_PX = expectedSpacingPx * 0.7   // ~24 px
  const MAX_SPACING_PX = expectedSpacingPx * 1.3   // ~44 px
  let useDetected = ballPeaks.length >= 2
  let medianSpacing = 0
  if (useDetected) {
    const intervals = []
    for (let k = 1; k < ballPeaks.length; k++) {
      intervals.push(ballPeaks[k] - ballPeaks[k - 1])
    }
    intervals.sort((a, b) => a - b)
    medianSpacing = intervals[Math.floor(intervals.length / 2)]
    if (medianSpacing < MIN_SPACING_PX || medianSpacing > MAX_SPACING_PX) {
      useDetected = false
    }
  }

  const headPointsPx = []
  if (useDetected) {
    // ENDPUNKT-BASIERTE UNIFORME POSITIONIERUNG (Achsen-Position)
    //
    // peaks[0]      = erste detektierte Kugel vom Anker aus = +12 mm Halslänge
    // peaks[N-1]    = letzte detektierte Kugel = (5 − N)-te Halslänge
    //                 (z. B. N=5 → -4 mm, N=4 → 0 mm)
    //
    // Warum nicht direkt jeden detektierten Peak verwenden? Mittelpunkts-
    // Peaks (insbesondere bei +4) werden manchmal um 5-6 px durch Kollision
    // mit dem Schaftkonus-Outline verschoben. Die Endpunkte sind frei von
    // dieser Interferenz und damit zuverlässiger. Aus den beiden Endpunkten
    // berechnen wir die uniforme Spannweite (Medactas Kugeln sind physisch
    // gleichmäßig 4 mm beabstandet) und interpolieren die mittleren Index-
    // Positionen exakt linear.
    //
    // ANSCHLIESSEND: Perp-Korrektur. Die berechnete Position liegt auf der
    // CCD-Achse, aber die tatsächlich gezeichnete Kugel-Kette kann um
    // ~2° davon abweichen → kumulative Perp-Drift bis 4-5 px. Mit
    // `snapPerpToBallCenter` wird jede Position senkrecht zur Achse auf
    // den echten Kugel-Mittelpunkt verschoben.
    const N = ballPeaks.length
    const totalAxisSpan = ballPeaks[N - 1] - ballPeaks[0]
    const stepPerHeadIndex = totalAxisSpan / (N - 1)
    for (let i = 0; i < 5; i++) {
      const peakIdx = 4 - i
      const axisPos = ballPeaks[0] + peakIdx * stepPerHeadIndex
      const rawPos = [
        anchorPx[0] + stepUx * axisPos,
        anchorPx[1] + stepUy * axisPos,
      ]
      const snappedPos = snapPerpToBallCenter(
        rawPos,
        [stepUx, stepUy],
        cropImageData,
        cropW,
        cropH,
      )
      headPointsPx.push(snappedPos)
    }
  } else {
    // FALLBACK: analytisch, 4 mm pro Schritt
    for (let i = 0; i < 5; i++) {
      const mmBack = (4 - i) * 4
      const pxBack = mmBack * pxPerMmAnalytic
      headPointsPx.push([
        anchorPx[0] + stepUx * pxBack,
        anchorPx[1] + stepUy * pxBack,
      ])
    }
  }

  // Laterale Schulter: TOP-LEFT-most Inkable-Pixel im gecroppten Bild.
  const shoulderPx = findTopLeftMostInkable(cropImageData, cropW, cropH)

  await doc.cleanup?.()
  await doc.destroy?.()
  return {
    png,
    widthPx: cropW,
    heightPx: cropH,
    /** Millimeter pro Pixel (kalibriert über PDF-pt → mm × Render-Scale). */
    mmPerPx: MM_PER_PT / RENDER_SCALE,
    apOriginPx,
    headPointsPx,
    shoulderPx,
    bodyAxisAngleDeg,
  }
}

/**
 * Findet den proximal-lateralen Eckpunkt der Implantat-Kontur. Wir
 * scannen die obersten ~10 % des gecroppten Bilds zeilenweise von oben
 * nach unten — der LINKSTE Inkable-Pixel in diesem Band markiert die
 * laterale Schulter (in unserer Render-Konvention sitzt der Hals oben-
 * rechts, der Schaft fällt nach unten ab, die Schulter ist links davon).
 *
 * Falls die Schablone gespiegelt vorliegt oder die Konvention nicht
 * passt: hier müsste der Algorithmus pro Familie kalibriert werden.
 * Für die aktuell vorliegenden Medacta-Templates (alle „Left & Right"
 * mit Hals oben-rechts) funktioniert die Heuristik einheitlich.
 */
/**
 * Findet die Mittelpunkte der Kopflängen-Kugeln entlang der Halsachse
 * durch Peak-Detektion. Vom übergebenen Startpunkt aus wird in Richtung
 * `axisDir` gescannt; an jedem Punkt wird der senkrechte SPAN der Tinte
 * gemessen (= Distanz zwischen oberstem und unterstem inken Pixel im
 * Sample-Fenster). Lokale Maxima dieser Span-Werte entsprechen den
 * Kugeln auf dem Hals-Konus.
 *
 * Warum SPAN statt COUNT? Verschiedene Medacta-Familien zeichnen die
 * Halsverlängerungs-Marker unterschiedlich:
 *  - Quadra-P, QUADRA, SMS: GEFÜLLTE Discs → COUNT ≈ SPAN (beides hoch)
 *  - MasterLoc: HOHLE Kreise → COUNT klein (nur Ring-Pixel), aber SPAN
 *    voll (= Außendurchmesser). Eine COUNT-basierte Detektion würde
 *    MasterLoc-Kreise als „nicht Kugel" verwerfen.
 * SPAN funktioniert für beide Stile.
 *
 * Filter:
 *  - MIN_PEAK_SPAN = 12: solide Kugeln (Durchmesser ≥ 12 px)
 *  - KEIN oberer Filter mehr — manche echte Kugeln werden durch
 *    Überlappung mit der Hals-Konus-Außenlinie auf die Window-Sättigung
 *    (= 2 × PERP_RADIUS = 24 px) gedrückt. Ein hartes MAX würde die
 *    raushauen. Stattdessen sortiert die nachgelagerte
 *    `pickBestChain`-Funktion echte Kette von Fremd-Peaks ab.
 *  - MIN_PEAK_SEP = 18: kleiner als erwartetes ~30-px-Inter-Kugel-Abstand
 *
 * Liefert die axis-Positionen (Distanz vom Startpunkt) der detektierten
 * Kugel-Zentren. Leeres Array, wenn keine plausiblen Peaks gefunden.
 */
function findBallCentersOnAxis(imageData, width, height, startPx, axisDir) {
  const { data } = imageData
  const perpDir = [-axisDir[1], axisDir[0]]
  const SCAN_LEN = 220
  const PERP_RADIUS = 12
  const SMOOTH_R = 2
  const MIN_PEAK_SPAN = 12
  const MIN_PEAK_SEP = 18

  function inked(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    const i = (y * width + x) * 4
    if (data[i + 3] < 32) return false
    return !(data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230)
  }

  // SPAN: Distanz zwischen äußerstem inkable Pixel auf jeder Seite der
  // Achse, an jeder Achsen-Position. Bei einer Kugel (egal ob gefüllt
  // oder hohl) entspricht der Peak dem Durchmesser am Ball-Zentrum.
  const raw = new Array(SCAN_LEN)
  for (let s = 0; s < SCAN_LEN; s++) {
    const cx = startPx[0] + axisDir[0] * s
    const cy = startPx[1] + axisDir[1] * s
    let minP = 0, maxP = 0, anyInk = false
    for (let p = -PERP_RADIUS; p <= PERP_RADIUS; p++) {
      if (inked(Math.round(cx + perpDir[0] * p), Math.round(cy + perpDir[1] * p))) {
        if (!anyInk) { minP = p; maxP = p; anyInk = true }
        else { if (p < minP) minP = p; if (p > maxP) maxP = p }
      }
    }
    raw[s] = anyInk ? (maxP - minP) : 0
  }
  // Glättung gegen Anti-Aliasing-Zacken
  const sm = new Array(SCAN_LEN)
  for (let i = 0; i < SCAN_LEN; i++) {
    let sum = 0, c = 0
    for (let j = Math.max(0, i - SMOOTH_R); j <= Math.min(SCAN_LEN - 1, i + SMOOTH_R); j++) {
      sum += raw[j]; c++
    }
    sm[i] = sum / c
  }
  // Peaks: lokale Maxima ≥ MIN_PEAK_SPAN. Kein oberer Filter.
  // Min-Abstand erzwungen (sonst zwei Detektionen pro Kugel).
  // Innerhalb des Min-Abstands behalten wir das höhere Maximum.
  const peaks = []
  for (let i = 1; i < SCAN_LEN - 1; i++) {
    if (sm[i] < MIN_PEAK_SPAN) continue
    let isMax = true
    for (let d = 1; d <= 2; d++) {
      if (i - d >= 0 && sm[i - d] > sm[i]) { isMax = false; break }
      if (i + d < SCAN_LEN && sm[i + d] > sm[i]) { isMax = false; break }
    }
    if (!isMax) continue
    if (peaks.length > 0 && (i - peaks[peaks.length - 1]) < MIN_PEAK_SEP) {
      if (sm[i] > sm[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i
      continue
    }
    peaks.push(i)
  }
  return peaks
}

/**
 * Verschiebt eine berechnete Kugel-Position senkrecht zur Halsachse
 * auf den TATSÄCHLICHEN Kugel-Mittelpunkt. Notwendig, weil der CCD-
 * basierte Achsen-Winkel ~2° vom echten gezeichneten Verlauf abweichen
 * kann — über 120 px Kettenlänge ergibt das eine kumulative Perp-
 * Verschiebung von 4-5 px.
 *
 * Methode: am übergebenen Punkt die Tinten-Ausdehnung perpendikular zur
 * Achse messen (±15 px Suchradius). Der Mittelpunkt dieser Ausdehnung
 * ist das echte Kugel-Zentrum in Perp-Richtung. Die Position wird um
 * diesen Versatz korrigiert.
 *
 * Bei nicht-inkable Position (kein Treffer im Such-Bereich) wird die
 * Position unverändert zurückgegeben.
 */
function snapPerpToBallCenter(pos, axisDir, imageData, width, height) {
  const perpDir = [-axisDir[1], axisDir[0]]
  const { data } = imageData
  function inked(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    const i = (y * width + x) * 4
    if (data[i + 3] < 32) return false
    return !(data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230)
  }
  const PROBE_R = 15
  let minP = Infinity, maxP = -Infinity
  for (let p = -PROBE_R; p <= PROBE_R; p++) {
    const x = Math.round(pos[0] + perpDir[0] * p)
    const y = Math.round(pos[1] + perpDir[1] * p)
    if (inked(x, y)) {
      if (p < minP) minP = p
      if (p > maxP) maxP = p
    }
  }
  if (!isFinite(minP)) return pos
  const midP = (minP + maxP) / 2
  return [pos[0] + perpDir[0] * midP, pos[1] + perpDir[1] * midP]
}

/**
 * Wählt aus einer Liste detektierter Peaks die 5 aus, die am ehesten
 * eine arithmetische Progression bilden (= echte Kopflängen-Kugelkette).
 *
 * Warum nötig? Manche Medacta-PDFs enthalten ZUSÄTZLICHE Markierungen
 * in der Nähe der Kugelkette, die ebenfalls als Peaks detektiert werden
 * (z. B. MasterLoc hat Modular-Schulter-Symbole bei axis 86 und 186).
 * Diese müssen rausgefiltert werden, damit die Endpunkte (peaks[0] und
 * peaks[4]) die echte +12-mm- und -4-mm-Kugelposition treffen.
 *
 * Strategie:
 *  - Erste detektierte Peak (peaks[0]) wird IMMER als +12-Anker
 *    übernommen (Apex der Halskonus = nächstes inkable Pixel zum
 *    Top-Right-Anker des Crops).
 *  - Aus den restlichen Peaks werden alle 4-elementigen Kombinationen
 *    durchprobiert.
 *  - Plausibilitätsfilter pro Kandidat: mittlere Inter-Peak-Distanz
 *    liegt zwischen 25 und 40 px (= 3-5 mm Schritt).
 *  - Auswahl: Subset mit minimaler Distanz-Varianz (= gleichmäßigster
 *    AP-Verlauf).
 *
 * Falls die Eingabe ≤ 5 Peaks enthält, wird sie unverändert zurück-
 * gegeben (kein Filtern nötig).
 */
function pickBestChain(peaks) {
  if (peaks.length === 0) return []
  if (peaks.length <= 5) return peaks

  const first = peaks[0]
  const rest = peaks.slice(1)
  const n = rest.length
  let best = { variance: Infinity, subset: null }

  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        for (let d = c + 1; d < n; d++) {
          const sub = [first, rest[a], rest[b], rest[c], rest[d]]
          const dists = [
            sub[1] - sub[0],
            sub[2] - sub[1],
            sub[3] - sub[2],
            sub[4] - sub[3],
          ]
          const mean = (dists[0] + dists[1] + dists[2] + dists[3]) / 4
          if (mean < 25 || mean > 40) continue
          const variance = dists.reduce(
            (acc, dist) => acc + (dist - mean) ** 2,
            0,
          ) / 4
          if (variance < best.variance) {
            best = { variance, subset: sub }
          }
        }
      }
    }
  }
  // Fallback: wenn kein Subset im plausiblen Bereich lag, nimm die
  // ersten 5 Peaks (besser als nichts; sanity check im Caller fängt
  // krasse Ausreißer ohnehin ab).
  return best.subset || peaks.slice(0, 5)
}

/**
 * Erkennt die Längsachse des Schaftkörpers im gecroppten PNG.
 *
 * Methode (Mittelstreifen-PCA): pro Y-Zeile werden die Body-Außenränder
 * (linkester/rechtester inkable Pixel) gesucht, dann NUR im zentralen
 * 20%-Streifen des Bodys nach inkablen Pixeln gesucht und deren X-Mittel
 * genommen. Das erfasst die per Definition zentrierte, gestrichelte
 * Mittellinie aus dem PDF und ignoriert sowohl die Body-Outlines als
 * auch die randständige (mediale) Calcar-Schraffur.
 *
 * Auf die Punkte (strip_mean_x, y) wird dann eine Hauptkomponenten-Achse
 * (= dominanter Eigenvektor der 2×2-Kovarianzmatrix) gefittet.
 *
 * Warum START bei 70% der Höhe + SCHMALER 10%-Streifen? Im oberen
 * Bereich sitzen Hals, Kopf, Konus UND der proximale Schaft-Flare mit
 * der lateralen Schulter. In der Flare-Zone wandert der Zeilen-Mittel-
 * punkt mit der zurückweichenden Schulter mit → scheinbarer Tilt (bei
 * SMS bis ~16° in den Bändern bis 75%!). Zusätzlich reicht bei GROSSEN
 * SMS-Schäften die mediale Calcar-Schraffur weit nach distal und würde
 * einen breiteren Streifen kontaminieren. Beides zusammen (tiefer Start
 * UND schmaler Streifen) ist nötig: erst dann erfasst die Detektion nur
 * den geraden diaphysären Schaft (= die Achse, an der der Operateur den
 * Markraum ausrichtet). Ergebnis: ALLE Familien < 0.4° Rest-Tilt
 * (vorher SMS bis 3.3°), Quadra-P/MasterLoc bleiben bei ~0°.
 *
 * Fallback: 90° (vertikal).
 */
function computeBodyAxisAngleDeg(imageData, width, height) {
  const { data } = imageData
  const startY = Math.floor(height * 0.7)
  /** Halbe Streifenbreite als Anteil der halben Body-Breite. 0.10 =
   *  zentrale 10% — schmal genug, um die Calcar-Schraffur auch bei
   *  großen Schäften draußen zu halten. */
  const STRIP_HALF_FRAC = 0.1
  function inked(x, y) {
    const i = (y * width + x) * 4
    if (data[i + 3] < 32) return false
    return !(data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230)
  }
  // Mittelstreifen-Suche: pro Y-Zeile zuerst die Body-Außenränder
  // finden, dann NUR im zentralen Streifen (STRIP_HALF_FRAC) des Bodys
  // nach inkablen Pixeln suchen. Das erfasst zuverlässig die gestrichelte
  // Mittellinie im PDF (die per Definition zentriert ist), ignoriert aber
  // die Calcar-Schraffur, die immer randständig (medial) sitzt — und ignoriert
  // natürlich die linken/rechten Body-Outlines selbst.
  //
  // Wenn keine Pixel im Mittelstreifen einer Zeile sind (gestrichelte
  // Linie ist gerade in einer Lücke), wird die Zeile übersprungen. PCA
  // läuft am Ende über die gesammelten Mittel-Punkte.
  const centers = []
  for (let y = startY; y < height; y++) {
    let leftX = -1
    for (let x = 0; x < width; x++) {
      if (inked(x, y)) { leftX = x; break }
    }
    if (leftX < 0) continue
    let rightX = -1
    for (let x = width - 1; x >= 0; x--) {
      if (inked(x, y)) { rightX = x; break }
    }
    if (rightX <= leftX) continue
    // Zentraler Streifen des Bodys (siehe STRIP_HALF_FRAC)
    const bodyMid = (leftX + rightX) / 2
    const halfBody = (rightX - leftX) / 2
    const searchHalf = halfBody * STRIP_HALF_FRAC
    const sLeft = Math.max(leftX + 1, Math.floor(bodyMid - searchHalf))
    const sRight = Math.min(rightX - 1, Math.ceil(bodyMid + searchHalf))
    let sumX = 0, count = 0
    for (let x = sLeft; x <= sRight; x++) {
      if (inked(x, y)) {
        sumX += x
        count++
      }
    }
    if (count > 0) centers.push([sumX / count, y])
  }
  // Fallback: wenn weniger als 10 Mittelstreifen-Treffer (z.B. die
  // gestrichelte Linie ist extrem dünn oder selten), nimm doch die
  // Outline-Midpoints als Notlösung.
  if (centers.length < 10) {
    centers.length = 0
    for (let y = startY; y < height; y++) {
      let leftX = -1, rightX = -1
      for (let x = 0; x < width; x++) if (inked(x, y)) { leftX = x; break }
      if (leftX < 0) continue
      for (let x = width - 1; x >= 0; x--) if (inked(x, y)) { rightX = x; break }
      centers.push([(leftX + rightX) / 2, y])
    }
    if (centers.length < 10) return 90
  }
  // 2×2-Kovarianz auf den Centers, dann größter Eigenvektor.
  let sumX = 0, sumY = 0
  for (const [x, y] of centers) { sumX += x; sumY += y }
  const cx = sumX / centers.length
  const cy = sumY / centers.length
  let sxx = 0, syy = 0, sxy = 0
  for (const [x, y] of centers) {
    const dx = x - cx, dy = y - cy
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  const trace = sxx + syy
  const disc = Math.sqrt(Math.max(0, (sxx - syy) ** 2 + 4 * sxy ** 2))
  const lambda1 = (trace + disc) / 2
  let vx, vy
  if (Math.abs(sxy) > 1e-9) {
    vx = sxy
    vy = lambda1 - sxx
  } else {
    vx = sxx >= syy ? 1 : 0
    vy = sxx >= syy ? 0 : 1
  }
  // „Zeigt nach unten" erzwingen (positive Y in PNG-Konvention).
  if (vy < 0) { vx = -vx; vy = -vy }
  let angle = (Math.atan2(vy, vx) * 180) / Math.PI
  if (angle < 0) angle += 360
  return angle
}

/**
 * Findet den TOP-RIGHT-most Inkable-Pixel im oberen Band des Bilds.
 * Bei Medactas Schaft-Templates ist das das Ende des Hals-Konus —
 * also genau dort, wo der Kopf konstruktiv aufgesetzt wird. Wir nutzen
 * diesen Punkt als „Kopf-Anker" für die UI-Platzierung.
 */
function findTopRightMostInkable(imageData, width, height) {
  const { data } = imageData
  const scanBand = Math.max(20, Math.floor(height * 0.15))
  let bestX = -1
  let bestY = 0
  for (let y = 0; y < scanBand; y++) {
    const rowStart = y * width * 4
    // Von rechts nach links — erstes Inkable in dieser Zeile ist der
    // rechteste; merken, wenn größer als das bisherige Maximum.
    for (let x = width - 1; x >= 0; x--) {
      const i = rowStart + x * 4
      const a = data[i + 3]
      if (a < 32) continue
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r > 230 && g > 230 && b > 230) continue
      if (x > bestX) {
        bestX = x
        bestY = y
      }
      break
    }
  }
  if (bestX < 0) return [Math.floor(width / 2), 20]
  return [bestX, bestY]
}

function findTopLeftMostInkable(imageData, width, height) {
  const { data } = imageData
  const scanBand = Math.max(20, Math.floor(height * 0.1))
  let bestX = width
  let bestY = 0
  for (let y = 0; y < scanBand; y++) {
    const rowStart = y * width * 4
    for (let x = 0; x < width; x++) {
      const i = rowStart + x * 4
      const a = data[i + 3]
      if (a < 32) continue
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r > 230 && g > 230 && b > 230) continue
      if (x < bestX) {
        bestX = x
        bestY = y
      }
    }
  }
  // Fallback: wenn nichts im Scan-Band — Bild-Top-Left.
  if (bestX === width) return [0, 0]
  return [bestX, bestY]
}

/**
 * Findet die 5 Kopflängen-Kugeln im gecroppten Implantat-PNG via
 * Connected-Component-Analyse. Medactas Templates haben an jeder
 * Halsverlängerungs-Position eine kleine gefüllte schwarze Kugel auf
 * dem Konus, alle ähnlich groß und auf einer Linie angeordnet.
 *
 * Selektions-Kriterien:
 *  - Komponente klein (Kugel hat typisch 30–500 px bei Render-Scale 3)
 *  - Roughly quadratische Bounding-Box (Aspect-Ratio < 2)
 *  - Dichte ≥ 50 % (gefüllte Kreise haben ~78 %; Filter schließt
 *    Linien-Cluster aus, die zwar ähnlich groß aber sehr sparse sind)
 *  - Die 5 ähnlich-großen werden ausgewählt; sortiert entlang ihrer
 *    Hauptachse (Summe x+y), damit die Reihenfolge konsistent ist.
 *
 * Liefert `null`, wenn weniger als 5 plausible Kandidaten gefunden
 * werden — der Caller hat dann einen Fallback.
 */
function findHeadBalls(imageData, width, height) {
  const { data } = imageData
  const ink = new Uint8Array(width * height)
  for (let i = 0, p = 0; p < ink.length; i += 4, p++) {
    if (data[i + 3] < 32) continue
    if (data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230) continue
    ink[p] = 1
  }
  // Standard-CC (4-Konnektivität).
  const visited = new Uint8Array(ink.length)
  const queue = new Int32Array(ink.length)
  const allComps = []
  for (let p = 0; p < ink.length; p++) {
    if (!ink[p] || visited[p]) continue
    let head = 0
    let tail = 0
    queue[tail++] = p
    visited[p] = 1
    let count = 0
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    while (head < tail) {
      const idx = queue[head++]
      const y = (idx / width) | 0
      const x = idx - y * width
      count++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0) {
        const n = idx - 1
        if (ink[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n }
      }
      if (x < width - 1) {
        const n = idx + 1
        if (ink[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n }
      }
      if (y > 0) {
        const n = idx - width
        if (ink[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n }
      }
      if (y < height - 1) {
        const n = idx + width
        if (ink[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n }
      }
    }
    if (count < 50) continue
    allComps.push({ count, minX, maxX, minY, maxY })
  }

  // Kugel-KETTE finden: bei Medactas Templates sind die 5 Kugeln durch
  // eine dünne Linie verbunden → bilden EINE Komponente mit
  // charakteristischen Eigenschaften:
  //   - Bounding-Box quasi-quadratisch (Aspect ≤ 2)
  //   - mittlere Größe (typisch 100×100 bis 200×200 Pixel bei Scale 3)
  //   - sehr SPARSE Dichte (~5–15 %), weil nur 5 kleine Discs + dünne
  //     Verbindungslinie in der Bbox sitzen
  //   - liegt im OBEREN Drittel des Bilds (proximal — wo der Hals sitzt)
  const chainCandidates = allComps.filter((c) => {
    const w = c.maxX - c.minX + 1
    const h = c.maxY - c.minY + 1
    if (w < 40 || w > 300) return false
    if (h < 40 || h > 300) return false
    if (Math.max(w, h) / Math.min(w, h) > 2.5) return false
    const density = c.count / (w * h)
    if (density > 0.25) return false
    // Die KETTE sitzt sehr weit oben am Hals (innerhalb der ersten
    // ~20% der Bildhöhe). Calcar-Schraffur und ähnliche Sparse-Patterns
    // sind tiefer und werden hier ausgesiebt.
    if (c.maxY > height * 0.2) return false
    return true
  })
  if (chainCandidates.length === 0) return null
  // Bei mehreren Kandidaten den am WEITESTEN OBEN liegenden nehmen
  // (kleinste minY) — das ist die echte Kugel-Kette am Hals-Apex.
  chainCandidates.sort((a, b) => a.minY - b.minY)
  const chain = chainCandidates[0]

  // 5 Kugeln entlang der Diagonalen der Chain-Bbox — von unten-links
  // nach oben-rechts. Das entspricht der Medacta-Konvention: kürzeste
  // Halslänge (− mm) sitzt körpernah, längste (+ mm) am Hals-Apex.
  // Für die meisten Templates passt diese Richtung; bei abweichendem
  // Layout müsste man pro Familie kalibrieren.
  const balls = []
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    const cx = chain.minX + t * (chain.maxX - chain.minX)
    const cy = chain.maxY - t * (chain.maxY - chain.minY)
    balls.push([cx, cy])
  }
  return balls
}

/**
 * Findet das Implantat per Connected-Component-Analyse. Heuristik:
 * Das Implantat ist IMMER das vertikal längste Objekt auf einer
 * Medacta-Schablone (Schäfte sind 100–200 mm tall, Titel/Logo/Skala
 * sind alle deutlich kürzer). Wir filtern Komponenten unter
 * MIN_COMPONENT_PX und nehmen unter den verbleibenden die mit der
 * GRÖSSTEN HÖHE (nicht Pixel-Anzahl — das hatte bei den SMS-Templates
 * versagt, weil die massiven „SMS"-Titel-Letter mehr Pixel haben
 * konnten als der Schaftkörper).
 *
 * Liefert die BBox des gewählten Implantats — die wird zum Crop-
 * Bereich. Inner-Linien (Schaftachse, Hals-Achse, Calcar-Schraffur)
 * liegen geometrisch INNERHALB dieser BBox und werden mitgecroppt.
 */
function findLargestComponentBBox(imageData, width, height) {
  const { data } = imageData
  // Ink-Maske als Uint8Array (1 = inkable, 0 = leer/weiß).
  const ink = new Uint8Array(width * height)
  for (let i = 0, p = 0; p < ink.length; i += 4, p++) {
    const a = data[i + 3]
    if (a < 32) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r > 230 && g > 230 && b > 230) continue
    ink[p] = 1
  }

  // BFS-basiertes Component-Labeling. Wir merken uns für jede Komponente
  // Pixel-Anzahl und Bounding-Box, finden am Ende die größte.
  const visited = new Uint8Array(ink.length)
  // Vorallokierte Queue (Index-Array). Wir nutzen ein typisiertes Array
  // für Performance — bei 4000×3000 = 12M Pixeln kann die Queue groß
  // werden, also nehmen wir den größten möglichen Worst-Case.
  const queue = new Int32Array(ink.length)
  let best = null

  for (let p = 0; p < ink.length; p++) {
    if (!ink[p] || visited[p]) continue
    // Neue Komponente — BFS.
    let head = 0
    let tail = 0
    queue[tail++] = p
    visited[p] = 1
    let count = 0
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    while (head < tail) {
      const idx = queue[head++]
      const y = (idx / width) | 0
      const x = idx - y * width
      count++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      // 4-Konnektivität (orthogonale Nachbarn). 8-Konnektivität war zu
      // gierig — bei den SMS- und Quadra-P-Templates verbanden diagonale
      // Antialiasing-Pixel die Implantat-Outline mit Titel-Text bis hin
      // zu einer einzigen seitenweit gespannten Komponente, deren BBox
      // dann die ganze Seite war.
      if (x > 0) {
        const n = idx - 1
        if (ink[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n }
      }
      if (x < width - 1) {
        const n = idx + 1
        if (ink[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n }
      }
      if (y > 0) {
        const n = idx - width
        if (ink[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n }
      }
      if (y < height - 1) {
        const n = idx + width
        if (ink[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n }
      }
    }
    if (count < MIN_COMPONENT_PX) continue
    const componentHeight = (maxY - minY) + 1
    const componentWidth = (maxX - minX) + 1
    // BBox-Pixel-Dichte: Anteil inkable / BBox-Fläche. Spann-Komponenten
    // (lange dünne Linien wie PDF-Border oder seitenweite Schaftachse
    // mit Verlängerung über Implantat hinaus) haben Dichte < 1 %.
    // Implantat-Outlines + innere Marker erreichen 2–5 %. Text-Glyphen
    // 10 %+. Wir filtern alles mit Dichte < 1.5 %, sodass nur „kompakte"
    // Komponenten kandidieren.
    const density = count / (componentHeight * componentWidth)
    if (density < 0.015) continue
    // Höhe als Auswahlkriterium — Implantat ist IMMER das längste
    // dicht-besetzte Objekt auf der Seite.
    if (!best || componentHeight > best.height) {
      best = {
        count,
        height: componentHeight,
        minX,
        maxX: maxX + 1,
        minY,
        maxY: maxY + 1,
      }
    }
  }
  if (!best) return null
  return {
    minX: best.minX,
    maxX: best.maxX,
    minY: best.minY,
    maxY: best.maxY,
  }
}

async function main() {
  const entries = readCatalog()
  console.log(`▶ ${entries.length} Schaft-Einträge zu rasterisieren`)
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const imageIndex = {}

  let totalCount = 0
  let successCount = 0
  let errorCount = 0

  for (const entry of entries) {
    const folderPath = join(TEMPLATES_ROOT, entry.folder)
    if (!existsSync(folderPath)) {
      console.warn(`  ⚠ Ordner fehlt: ${entry.folder}`)
      continue
    }
    const outFolder = join(OUTPUT_DIR, slug(entry.folder))
    mkdirSync(outFolder, { recursive: true })
    imageIndex[entry.folder] = {}

    for (const size of entry.sizes) {
      totalCount += 1
      const pdfPath = findPdf(folderPath, size.pdfFile)
      if (!pdfPath) {
        console.warn(`  ⚠ PDF fehlt: ${entry.folder} / ${size.pdfFile}`)
        errorCount += 1
        continue
      }
      try {
        const {
          png,
          widthPx,
          heightPx,
          mmPerPx,
          apOriginPx,
          headPointsPx,
          shoulderPx,
          bodyAxisAngleDeg,
        } = await rasterizePdf(pdfPath, size.apOrigin, size.headPoints, entry.folder)
        const refSlug = slug(size.refNo.split(' ')[0])
        const fileName = `${refSlug}_${slug(size.size)}.png`
        const outPath = join(outFolder, fileName)
        writeFileSync(outPath, png)
        imageIndex[entry.folder][size.refNo] = {
          path: `/templates/stems/${slug(entry.folder)}/${fileName}`,
          widthPx,
          heightPx,
          mmPerPx,
          apOriginPx,
          headPointsPx,
          shoulderPx,
          bodyAxisAngleDeg,
        }
        successCount += 1
        if (successCount % 10 === 0) {
          process.stdout.write(`  ${successCount}/${totalCount} fertig…\r`)
        }
      } catch (err) {
        console.warn(`  ✕ Rasterisierung fehlgeschlagen: ${size.pdfFile} — ${err.message}`)
        errorCount += 1
      }
    }
  }
  console.log(`\n✔ ${successCount}/${totalCount} Bilder erzeugt (${errorCount} Fehler)`)

  // Index-TypeScript-Datei schreiben.
  const ts = `// Auto-generiert aus scripts/rasterize-medacta-templates.mjs.
// Nicht manuell bearbeiten — neu generieren bei Bild-Änderungen.

/** Metadaten eines auf das Implantat zugeschnittenen PNGs. */
export interface MedactaImageMeta {
  /** Relativer Pfad für den Browser (\`/templates/...\`). */
  path: string
  /** PNG-Größe in Pixeln (NACH dem Crop). */
  widthPx: number
  heightPx: number
  /** Millimeter pro Pixel — Welt-Skala leitet sich daraus ab. */
  mmPerPx: number
  /** apOrigin (Anker aus Osirix-Katalog) in PNG-Pixel-Koordinaten. */
  apOriginPx: [number, number]
  /** Kopfzentren je Halslängen-Index in PNG-Pixel-Koordinaten. */
  headPointsPx: [number, number][]
  /** Proximale laterale Schulter in PNG-Pixel-Koordinaten — Pivot für
   *  die Drehung der Schablone (Top-Left-most Inkable-Pixel). */
  shoulderPx: [number, number]
  /** Längsachse des Schaftkörpers im PNG, als Winkel von der positiven
   *  X-Achse (Canvas-Konvention, im Uhrzeigersinn). Vom Rasterizer per
   *  Zeilen-Mittelpunkt-PCA über das untere 60% des PNGs ermittelt.
   *  Wird in useStemContourPlacement als baselineDeg verwendet — damit
   *  passt die SVG-Rotation exakt zur visuellen Mittellinie, statt
   *  zur head→ap-Strecke (die je nach Halslänge schwankt). */
  bodyAxisAngleDeg: number
}

/**
 * Index aller Schaft-Bilder, keyed by Katalog-Ordner und Referenznummer.
 * Beim Rendern in TemplateOverlay liefert dieser Index das PNG plus die
 * Pixel-Skala — apOrigin (in PDF-pt aus medactaCatalog) lässt sich
 * damit in Pixel umrechnen:
 *   apOrigin_px = (apOrigin.x * scale, (heightPt − apOrigin.y) * scale)
 *   (Y-Flip, weil PDF y nach oben, PNG y nach unten.)
 */
export const MEDACTA_IMAGES: Record<string, Record<string, MedactaImageMeta>> = ${JSON.stringify(imageIndex, null, 2)}
`
  writeFileSync(INDEX_FILE, ts)
  console.log(`✔ Index geschrieben: ${INDEX_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
