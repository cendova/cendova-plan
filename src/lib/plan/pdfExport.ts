/**
 * PDF-Export des Plans.
 *
 * Seite 1: Aktueller Viewport-Snapshot (Röntgenbild + alle SVG-Overlays:
 * Messungen, Pfannen, Schäfte, Referenzlinie, Notizen) auf A4 quer.
 * Seite 2 (optional, nur wenn Inhalt): Textuelle Zusammenfassung —
 * Kalibrierung, Hüft-/Knie-Messwerte, Implantat-Auswahl.
 *
 * Verwendet `html2canvas` für DOM→Canvas, weil unsere Overlays als HTML/
 * SVG nebeneinander liegen (Cornerstone-Canvas + absolute SVG-Layer).
 * Eigenes SVG-zu-Canvas-Code hätte mit externen <image>-Refs Probleme
 * (data-URL-Sandbox blockiert externe Resourcen).
 */
import jsPDF from 'jspdf'
// html2canvas-pro statt original html2canvas, weil Tailwind v4 Farben
// im neuen oklch()-CSS-Farbraum emittiert (für besseres Wide-Gamut-
// Rendering). Das originale html2canvas (letzte Version 1.4.1) versteht
// das nicht und wirft „Attempting to parse an unsupported color function
// 'oklch'". Der -pro-Fork ist API-kompatibel und unterstützt oklch nativ.
import html2canvas from 'html2canvas-pro'
import { useViewerStore } from '../../state/viewerStore'
import { useKneePanesStore } from '../../state/kneePanesStore'
import { useHipStore } from '../../state/hipStore'
import { useKneeStore } from '../../state/kneeStore'
import { useTemplateStore } from '../../state/templateStore'
import { useNoteStore } from '../../state/noteStore'
import { useOsteophyteStore } from '../../state/osteophyteStore'
import { usePlanningStore, computeBmi } from '../../state/planningStore'
import { getOrgProfile } from '../../state/orgProfileStore'
import {
  stemCatalogEntries,
  cupCatalogEntries,
  headOffsetMm,
  cupShape,
  cupDiameterMm,
  cupInclination,
  stemAxisAlignment,
  femurAxisAngleCanvasDeg,
} from '../hip/templates'
import { getViewport } from '../cornerstone/viewer'
import {
  findPreopLLD,
  computeImplantLLDCorrection,
  operatedSideOf,
  formatLldForSide,
} from '../hip/lldCalculation'
import { getKneeRecipe, computeWorkflowRaw } from '../knee/recipes'
import { computeCpak } from '../knee/cpak'

/**
 * Wendet die AMBER-Einfärbung der Schablonen-Bilder MANUELL an, vor dem
 * html2canvas-Snapshot.
 *
 * Hintergrund: Die Overlays rendern Hüft-Schäfte und Knie-Implantate als
 * `<image href="…">` mit feColorMatrix-Filtern. html2canvas (auch der
 * -pro-Fork) unterstützt SVG-Filter unzuverlässig — das Ergebnis wäre das
 * rohe PNG (weiß bzw. schwarz-blau) statt der amber Kontur, auf dem
 * Röntgen-Schwarz praktisch unsichtbar (Debug-Runde 3: „Schablonen
 * erscheinen alle nicht im PDF").
 *
 * Auswahl über das Attribut `data-pdf-tint` an den SICHTBAREN Bildern
 * (die Overlays setzen es; Hit-Regionen mit opacity=0 tragen es nicht).
 * Seit dem Schablonen-Paket sind die hrefs blob:-URLs — ein URL-Muster
 * taugt nicht mehr als Erkennung (genau daran scheiterte der PDF-Export
 * nach der Paket-Umstellung).
 *
 * Zwei Masken-Modi, passend zu den Live-Filtern:
 *  - „stem": Medacta-PNGs mit WEISSEM Hintergrund, dunkle Linien.
 *    Alpha = 1,5·A_in − R − G − B (Weiß→transparent, Linienkern→deckend).
 *  - „knee": Referenz-Screenshots mit SCHWARZEM Hintergrund, blaue
 *    Implantat-Linien, weiße Callouts. Alpha = 2·(B − R) (nur „blaue"
 *    Pixel bleiben; Schwarz und Weiß haben B≈R → transparent).
 *
 * Workaround-Mechanik: Transformation pixelweise in ein Canvas anwenden,
 * das eingefärbte Bitmap als data-URL ins href tauschen, Filter abnehmen.
 * Gibt Cleanup-Funktionen zurück (Restorer-Muster).
 */
async function pretintTemplateImages(
  root: HTMLElement,
): Promise<Array<() => void>> {
  const restorers: Array<() => void> = []
  // Amber-400 #FFC400 — identisch zum Live-Overlay (Implantat = amber).
  const TINT_R = 255
  const TINT_G = 196
  const TINT_B = 0

  const candidates: Array<{ el: SVGImageElement; mode: string }> = []
  root.querySelectorAll('image[data-pdf-tint]').forEach((node) => {
    const el = node as SVGImageElement
    candidates.push({ el, mode: el.getAttribute('data-pdf-tint') || 'stem' })
  })

  for (const { el, mode } of candidates) {
    const originalHref =
      el.getAttribute('href') || el.getAttribute('xlink:href') || ''
    const originalFilter = el.getAttribute('filter')
    try {
      // Bild laden (funktioniert für http- UND blob:-URLs), in ein Canvas
      // zeichnen, Pixel pro Pixel einfärben.
      const resp = await fetch(originalHref)
      const blob = await resp.blob()
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.drawImage(bitmap, 0, 0)
      const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      const data = imgData.data
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        data[i] = TINT_R
        data[i + 1] = TINT_G
        data[i + 2] = TINT_B
        // Alpha-Maske wie der jeweilige Live-feColorMatrix (s. Doku oben).
        const newA = mode === 'knee' ? 2 * (b - r) : 1.5 * a - r - g - b
        data[i + 3] = newA < 0 ? 0 : newA > 255 ? 255 : newA
      }
      ctx.putImageData(imgData, 0, 0)
      const tintedUrl = canvas.toDataURL('image/png')

      // href austauschen, Filter abnehmen (das Bild ist jetzt schon
      // eingefärbt — Filter wäre doppelte Anwendung).
      el.setAttribute('href', tintedUrl)
      el.removeAttribute('filter')

      restorers.push(() => {
        el.setAttribute('href', originalHref)
        if (originalFilter) el.setAttribute('filter', originalFilter)
      })
    } catch (err) {
      // Bei Fehler ignorieren, das Bild fehlt dann im PDF. Lieber EINE
      // unsichtbare Schablone als gar kein PDF.
      console.warn('Pretint failed for', originalHref, err)
    }
  }
  return restorers
}

/**
 * „Friert" alle editierbaren Textfelder (Patient-Bar: BLD + Cave) für den
 * Snapshot ein, indem jedes `<input>`/`<textarea>` temporär durch ein
 * statisches `<span>` mit identischem Text und identischer Typografie
 * ersetzt wird.
 *
 * Warum nötig: html2canvas (auch der -pro-Fork) rendert echte Formular-
 * Felder nicht über den Browser, sondern bildet deren Text-Layout selbst
 * nach — und legt die vertikale Grundlinie von Input-Text falsch, vor
 * allem in einem Flex-Container mit `items-center`. Der eingegebene Wert
 * „rutscht" dann nach unten aus der Box. Bei einem `<span>` tritt das
 * Problem nicht auf, weil html2canvas normalen Fließtext korrekt setzt.
 *
 * Gleiches Restorer-Muster wie `pretintStemImages`: Cleanup-Funktionen
 * werden nach dem Snapshot in umgekehrter Reihenfolge aufgerufen.
 */
function freezeFormFields(root: HTMLElement): Array<() => void> {
  const restorers: Array<() => void> = []
  root.querySelectorAll('input, textarea').forEach((node) => {
    const el = node as HTMLInputElement | HTMLTextAreaElement
    // Nur Text-artige Felder behandeln; Slider/Checkboxen etc. würden als
    // Text völlig falsch dargestellt (sind im Capture-Root aber ohnehin
    // nicht vorhanden — der Guard ist reine Vorsicht).
    if (el.tagName === 'INPUT') {
      const t = (el as HTMLInputElement).type
      if (t && !['text', 'search', 'email', 'tel', 'url'].includes(t)) return
    }

    const cs = window.getComputedStyle(el)
    const span = document.createElement('span')
    // Leerer Wert → NBSP, damit die Box ihre Ein-Zeilen-Höhe behält und
    // das Layout nicht kollabiert.
    span.textContent = el.value && el.value.length > 0 ? el.value : ' '

    // Box: an die Stelle des Inputs in der Flex-Zeile treten. Der Input
    // füllt dort (via w-full + flex-shrink) den Restplatz — das bilden wir
    // mit flex:1 / min-width:0 nach, overflow:hidden kappt zu langen Text.
    span.style.flex = '1 1 0%'
    span.style.minWidth = '0'
    span.style.display = 'flex'
    span.style.alignItems = 'center'
    span.style.overflow = 'hidden'
    span.style.whiteSpace = 'pre'

    // Typografie 1:1 vom Live-Element übernehmen, damit es identisch aussieht.
    span.style.fontFamily = cs.fontFamily
    span.style.fontSize = cs.fontSize
    span.style.fontWeight = cs.fontWeight
    span.style.fontStyle = cs.fontStyle
    span.style.letterSpacing = cs.letterSpacing
    span.style.color = cs.color
    span.style.lineHeight = cs.lineHeight

    const prevDisplay = el.style.display
    el.style.display = 'none'
    el.insertAdjacentElement('afterend', span)
    restorers.push(() => {
      span.remove()
      el.style.display = prevDisplay
    })
  })
  return restorers
}

/**
 * Blendet vor dem Snapshot alle als `data-pdf-hide` markierten Elemente
 * aus (z. B. die Patient-Namenszeile, die im PDF in die Kopfzeile wandert).
 * Restorer-Muster wie oben.
 */
function hidePdfHiddenElements(root: HTMLElement): Array<() => void> {
  const restorers: Array<() => void> = []
  root.querySelectorAll('[data-pdf-hide]').forEach((node) => {
    const el = node as HTMLElement
    const prev = el.style.display
    el.style.display = 'none'
    restorers.push(() => {
      el.style.display = prev
    })
  })
  return restorers
}

// (cropCanvasToContent entfiel mit dem Aushang-Layout: Das PDF zeigt
// bewusst EXAKT den vom Planer eingestellten Bildausschnitt — Zoom und
// Verschiebung sind Regie des Nutzers, nichts wird weggeschnitten.)

/**
 * Erfasst den Viewport (Bild + Overlays) als Canvas-Snapshot.
 * `viewportEl` ist das `<main>`-Element aus Viewport.tsx — enthält
 * Cornerstone-Canvas UND alle SVG-Overlays als Kinder.
 */
async function snapshotViewport(viewportEl: HTMLElement): Promise<HTMLCanvasElement> {
  // html2canvas-Optionen:
  //  - backgroundColor: schwarz (passt zum medizinischen Viewer)
  //  - useCORS: erlaubt Cross-Origin-Bilder (für stem-PNGs)
  //  - scale: 2 für höhere Auflösung im PDF
  //  - logging: aus
  // scale: 3 statt 2 — wichtig für die dünnen Cup-SVG-Linien (strokeWidth
  // ~2 px wird sonst bei A4-Verkleinerung sub-pixel und verschwindet).
  return html2canvas(viewportEl, {
    backgroundColor: '#000000',
    useCORS: true,
    scale: 3,
    logging: false,
  })
}

/** Liest den Implantat-Anzeigenamen aus dem Hüft-Katalog. */
function stemDisplayName(catalogIndex: number, sizeIndex: number): string {
  const entry = stemCatalogEntries()[catalogIndex]
  const size = entry?.sizes[sizeIndex]
  if (!entry || !size) return '(unbekannt)'
  const folder = entry.folder.replace('MEDACTA INTERNATIONAL - [Stem] - ', '')
  return `${folder} – Größe ${size.size}`
}
function cupDisplayName(catalogIndex: number, sizeIndex: number): string {
  const entry = cupCatalogEntries()[catalogIndex]
  const size = entry?.sizes[sizeIndex]
  if (!entry || !size) return '(unbekannt)'
  const folder = entry.folder.replace('MEDACTA INTERNATIONAL - [Cup] - ', '')
  return `${folder} – Ø ${size.size} mm`
}

/**
 * Erzeugt und lädt das PDF herunter — Seite 1 ist der „OP-Aushang":
 * maximales Röntgenbild (bzw. beim Knie ZWEI Bilder nebeneinander), je
 * EXAKT im aktuell eingestellten Bildausschnitt (Zoom/Verschiebung =
 * Regie des Planers), die Kopfleiste liegt im Vordergrund darüber
 * (Nutzer-Entscheidung Debug-Runde 2). `viewportEls` sind die Capture-
 * Wurzeln der Panes (Haupt-Pane, optional rechtes Knie-Pane).
 */
export async function exportPlanPdf(viewportEls: HTMLElement[]): Promise<void> {
  // Snapshot je Pane. DOM-Vorbereitung mit Restorer-Muster (Cleanup in
  // finally): Textfelder einfrieren, data-pdf-hide ausblenden,
  // Schaft-PNGs einfärben (sonst schwarz-auf-schwarz).
  const canvases: HTMLCanvasElement[] = []
  for (const el of viewportEls) {
    const restorers = freezeFormFields(el)
    restorers.push(...hidePdfHiddenElements(el))
    restorers.push(...(await pretintTemplateImages(el)))
    try {
      canvases.push(await snapshotViewport(el))
    } finally {
      for (let i = restorers.length - 1; i >= 0; i--) restorers[i]()
    }
  }

  // A4 quer (297 × 210 mm). Querformat passt zur typischen X-Ray-Geometrie.
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth() // 297
  const pageH = pdf.internal.pageSize.getHeight() // 210

  // — Patient + Planungsdaten für die Kopfzeile —
  const patient = useViewerStore.getState().patientInfo
  const planning = usePlanningStore.getState()
  const ts = new Date().toLocaleString('de-DE')

  const fmtIsoDate = (iso: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
  }
  const nameStr = patient
    ? [patient.lastName, patient.firstName].filter(Boolean).join(', ') || '–'
    : '–'
  const gebStr = patient?.birthDate
    ? patient.birthDate +
      (patient.ageYears != null ? ` (${patient.ageYears} J.)` : '')
    : '–'
  // Größe/Gewicht: manueller Override (Dialog) hat Vorrang, sonst DICOM.
  const hCm =
    planning.heightCm || (patient?.heightCm != null ? String(patient.heightCm) : '')
  const wKg =
    planning.weightKg || (patient?.weightKg != null ? String(patient.weightKg) : '')
  const groesseGewicht =
    hCm || wKg ? `${hCm || '–'} cm / ${wKg || '–'} kg` : '–'
  const bmiVal = computeBmi(hCm, wKg)
  const bmiText = bmiVal != null ? bmiVal.toFixed(1) : '–'
  const opTermin = planning.surgeryDateUnknown
    ? 'noch unklar'
    : planning.surgeryDate
      ? fmtIsoDate(planning.surgeryDate)
      : '–'
  let rehaText = '–'
  if (planning.reha === 'Physio') rehaText = 'Physio'
  else if (planning.reha)
    rehaText =
      planning.reha +
      (planning.rehaDate ? ` ab ${fmtIsoDate(planning.rehaDate)}` : '')

  // BLD (klinisch) — wandert prominent in die Kopfzeile (Hüfte).
  const clinicalBld = useViewerStore.getState().clinicalBld
  const planningMode = useViewerStore.getState().planningMode

  // — 1. Röntgenbild(er): maximaler Raum, EXAKT der eingestellte Ausschnitt —
  // Die Kopfzeile wird DANACH gezeichnet und liegt damit im Vordergrund
  // über dem Bild (Aushang-Layout, Nutzer-Entscheidung Debug-Runde 2).
  // Beim Knie stehen AP + seitlich nebeneinander; die Breiten verteilen
  // sich proportional zum Seitenverhältnis, gemeinsame Höhe.
  const margin = 1.5 // minimale Seitenränder — Bild maximal breit
  const gap = 2 // Abstand zwischen AP und seitlich (Knie)
  const imgAreaW = pageW - 2 * margin
  const aspects = canvases.map((c) => c.width / c.height)
  const totalAspect = aspects.reduce((a, b) => a + b, 0)
  const gapsW = gap * (canvases.length - 1)
  // Gemeinsame Höhe: volle Seitenhöhe, sofern die Breite reicht — sonst so
  // hoch, wie die Breite erlaubt. NIE verzerren (anatomische Proportionen!).
  const commonH = Math.min(pageH, (imgAreaW - gapsW) / totalAspect)
  const widths = aspects.map((a) => a * commonH)
  const totalImgW = widths.reduce((a, b) => a + b, 0) + gapsW
  let imgX = margin + (imgAreaW - totalImgW) / 2
  const imgY = (pageH - commonH) / 2
  canvases.forEach((c, i) => {
    pdf.addImage(
      c.toDataURL('image/jpeg', 0.92),
      'JPEG',
      imgX,
      imgY,
      widths[i],
      commonH,
      undefined,
      'FAST',
    )
    imgX += widths[i] + gap
  })

  // — 2. Kopfzeile (blau, deckend) — liegt ÜBER dem Bild (Vordergrund) —
  const headerH = 18
  pdf.setFillColor(20, 30, 45)
  pdf.rect(0, 0, pageW, headerH, 'F')
  // Bewusst OHNE Akzentlinie unter dem Kopf — die wirkte im Ausdruck als
  // störender blauer Strich zwischen Kopfzeile und Röntgenbild (Klinik).

  // Titel links (zweizeilig, kompakt).
  pdf.setTextColor(225, 233, 242)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.text('CendovaPlan', 8, 7)
  // Untertitel aus dem Einrichtungs-Profil (leer = neutral, nur der Name).
  const orgSubtitle = getOrgProfile().headerSubtitle.trim()
  if (orgSubtitle) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6)
    pdf.setTextColor(165, 182, 205)
    // Auf die schmale Kopf-Spalte umbrechen (bis vor die Datenspalten bei
    // x≈44), max. zwei Zeilen.
    const subLines: string[] = pdf.splitTextToSize(orgSubtitle, 34).slice(0, 2)
    subLines.forEach((ln, i) => pdf.text(ln, 8, 11 + i * 3))
  }

  // Label (grau) + Wert (hell, bei Bedarf gekürzt) auf einer Zeile.
  const fit = (text: string, maxW: number): string => {
    if (pdf.getTextWidth(text) <= maxW) return text
    let t = text
    while (t.length > 1 && pdf.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
    return t + '…'
  }
  const headerField = (
    x: number,
    y: number,
    label: string,
    value: string,
    labelW: number,
    valueMaxW: number,
    valueColor: [number, number, number] = [226, 233, 241],
  ) => {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6)
    pdf.setTextColor(140, 158, 182)
    pdf.text(label, x, y)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(valueColor[0], valueColor[1], valueColor[2])
    pdf.text(fit(value, valueMaxW), x + labelW, y)
  }

  // Vier Datenspalten à drei Zeilen. Reihenstart r1, Zeilenhöhe lh.
  // CAVE-Inhalte (Allergien/Antikoagulation) stehen ROT in Spalte 3,
  // BLD groß in amber in Spalte 4 (Aushang: auf einen Blick erfassbar).
  const r1 = 6
  const lh = 4.3
  const CAVE_RED: [number, number, number] = [252, 120, 120]
  const groesseBmi =
    groesseGewicht === '–'
      ? bmiText !== '–'
        ? `BMI ${bmiText}`
        : '–'
      : groesseGewicht + (bmiText !== '–' ? `  ·  BMI ${bmiText}` : '')
  // Spalte 1 — Patient
  headerField(44, r1, 'Name', nameStr, 16, 50)
  headerField(44, r1 + lh, 'geb.', gebStr, 16, 50)
  headerField(44, r1 + 2 * lh, 'Größe/Gew.', groesseBmi, 16, 50)
  // Spalte 2 — Administrativ
  headerField(114, r1, 'Versicher.', planning.insurance || '–', 16, 46)
  headerField(114, r1 + lh, 'Krankenhaus', planning.hospital || '–', 16, 46)
  headerField(114, r1 + 2 * lh, 'OP-Termin', opTermin, 16, 46)
  // Spalte 3 — Reha + CAVE (rot, damit es im OP sofort auffällt)
  headerField(180, r1, 'Reha', rehaText, 15, 40)
  const allergies = planning.allergies.trim()
  const anticoag = planning.anticoagulation.trim()
  headerField(
    180,
    r1 + lh,
    'Allergien',
    allergies || '–',
    15,
    40,
    allergies ? CAVE_RED : undefined,
  )
  headerField(
    180,
    r1 + 2 * lh,
    'Antikoag.',
    anticoag || '–',
    15,
    40,
    anticoag ? CAVE_RED : undefined,
  )
  // Spalte 4 — Sonstiges + BLD (groß, amber — nur Hüftmodul)
  headerField(238, r1, 'Sonstiges', planning.other.trim() || '–', 14, 41)
  if (planningMode === 'hip') {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10.5)
    pdf.setTextColor(251, 191, 36)
    pdf.text(
      fit(`BLD ${clinicalBld.trim() || '–'}`, 55),
      238,
      r1 + 2 * lh + 0.8,
    )
  }

  // — 3. Fußzeile — NIE auf der Kante zwischen Bild und Papier (Klinik-
  // Report: je nach Druckskalierung/Seitenverhältnis stand die Zeile genau
  // auf dem Übergang und war unlesbar). Das Bild ist vertikal zentriert;
  // liegt unter seiner Unterkante genug Weißraum, wandert die Zeile aufs
  // Papier (dunkles Grau); sonst bewusst 2,5 mm INS Bild (helles Grau auf
  // Röntgen-Schwarz).
  const imgBottom = imgY + commonH
  const footerOnPaper = pageH - imgBottom >= 6
  const footerY = footerOnPaper
    ? imgBottom + 3.5
    : Math.min(pageH - 4, imgBottom - 2.5)
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'normal')
  if (footerOnPaper) {
    pdf.setTextColor(105, 105, 105)
  } else {
    pdf.setTextColor(180, 180, 180)
  }
  const plannerName =
    planning.planner.trim() || getOrgProfile().defaultPlanner.trim()
  pdf.text(
    plannerName
      ? `Planung durchgeführt von ${plannerName} am ${ts}`
      : `Planung durchgeführt am ${ts}`,
    8,
    footerY,
  )
  pdf.text(
    'ohne CE-Kennzeichnung — keine alleinige Grundlage für klinische Entscheidungen',
    pageW - 8,
    footerY,
    { align: 'right' },
  )

  // — Seite 2: Zusammenfassung —
  const calibration = useViewerStore.getState().calibration
  const factor = calibration?.mmPerWorldUnit ?? 1
  const hipMeasurements = useHipStore.getState().measurements
  const kneeMeasurements = useKneeStore.getState().measurements
  const cups = useTemplateStore.getState().templates
  const stems = useTemplateStore.getState().stems
  const notes = useNoteStore.getState().notes
  const referenceLine = useTemplateStore.getState().referenceLine
  const osteophytes = useOsteophyteStore.getState().regions

  const hasSummary =
    hipMeasurements.length +
      kneeMeasurements.length +
      cups.length +
      stems.length +
      notes.length >
    0

  if (hasSummary || calibration || patient) {
    pdf.addPage('a4', 'portrait')
    const pw = pdf.internal.pageSize.getWidth() // 210
    let y = 18
    pdf.setTextColor(15, 25, 40)
    pdf.setFontSize(16)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Zusammenfassung', 14, y)
    y += 8
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(80, 80, 80)
    pdf.text(`Erstellt am ${ts}`, 14, y)
    y += 8

    // Patient (aus DICOM) + klinische BLD-Notiz zuoberst.
    if (patient) {
      const nameLine = [patient.lastName, patient.firstName]
        .filter(Boolean)
        .join(', ')
      const birthLine = patient.birthDate
        ? `geb. ${patient.birthDate}` +
          (patient.ageYears != null ? ` (${patient.ageYears} J.)` : '')
        : ''
      const bodyLine = [
        patient.heightCm != null ? `${patient.heightCm} cm` : '',
        patient.weightKg != null ? `${patient.weightKg} kg` : '',
      ]
        .filter(Boolean)
        .join(' / ')
      const lines = [nameLine, birthLine, bodyLine].filter(Boolean)
      if (lines.length > 0) {
        // (writeSection ist erst weiter unten definiert — inline ausgeben)
        pdf.setTextColor(15, 25, 40)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.text('Patient', 14, y)
        y += 5.5
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9.5)
        pdf.setTextColor(45, 55, 70)
        for (const line of lines) {
          pdf.text(line, 14, y)
          y += 5
        }
        y += 3
      }
    }
    if (clinicalBld && clinicalBld.trim()) {
      pdf.setTextColor(15, 25, 40)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text('Klinische Beinlängendifferenz', 14, y)
      y += 5.5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9.5)
      pdf.setTextColor(45, 55, 70)
      pdf.text(clinicalBld, 14, y)
      y += 8
    }
    // (Cave-Inhalte — Allergien/Antikoagulation — stehen in „Planung &
    // Organisation" und rot in der Kopfzeile von Seite 1.)

    const writeSection = (title: string, lines: string[]) => {
      if (lines.length === 0) return
      pdf.setTextColor(15, 25, 40)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text(title, 14, y)
      y += 5.5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9.5)
      pdf.setTextColor(45, 55, 70)
      for (const line of lines) {
        if (y > 285) {
          pdf.addPage('a4', 'portrait')
          y = 18
        }
        pdf.text(line, 14, y)
        y += 5
      }
      y += 3
    }

    // Kalibrierung — nur vermerken, WIE kalibriert wurde (ausgemessen vs.
    // Vergrößerungsfaktor); keine technische Skalierung mehr.
    if (calibration) {
      const lines: string[] = []
      if (calibration.referenceMm > 0) {
        const mag =
          calibration.magnificationFactor &&
          calibration.magnificationFactor !== 1
            ? ` · Vergrößerung ${calibration.magnificationFactor.toFixed(2)}×`
            : ''
        lines.push(
          `Ausgemessen — Referenz-Strecke ${calibration.referenceMm} mm${mag}`,
        )
      } else {
        lines.push(
          `Vergrößerungsfaktor ${calibration.magnificationFactor?.toFixed(2) ?? '1.00'}× (aus PixelSpacing)`,
        )
      }
      writeSection('Kalibrierung', lines)
    }

    // Planung & Organisation (OP-Termin, Klinik, Versicherung, Reha …).
    {
      const planningLines: string[] = [
        `Krankenhaus: ${planning.hospital || '–'}`,
        `OP-Termin: ${opTermin}`,
        `Versicherung: ${planning.insurance || '–'}`,
        `Größe/Gewicht: ${groesseGewicht}  ·  BMI ${bmiText}`,
        `Reha: ${rehaText}`,
      ]
      if (planning.allergies.trim())
        planningLines.push(`Allergien: ${planning.allergies.trim()}`)
      if (planning.anticoagulation.trim())
        planningLines.push(`Antikoagulation: ${planning.anticoagulation.trim()}`)
      if (planning.other.trim())
        planningLines.push(`Sonstiges: ${planning.other.trim()}`)
      writeSection('Planung & Organisation', planningLines)
    }

    // Hüft-Messungen bewusst NICHT mehr im PDF (auf Wunsch entfernt) — die
    // klinisch relevante Beinlängen-Bilanz steht weiter unten.

    // Knie-Messungen — mit berechneten Werten (Winkel/Längen) + CPAK-Typ.
    if (kneeMeasurements.length > 0) {
      const lines: string[] = []
      for (const m of kneeMeasurements) {
        const recipe = getKneeRecipe(m.kind)
        if (!recipe) continue
        if (m.points.length < recipe.steps.length) {
          lines.push(
            `• ${recipe.label}: unvollständig (${m.points.length}/${recipe.steps.length} Punkte)`,
          )
          continue
        }
        try {
          const { values } = recipe.compute(m.points, factor)
          if (values.length <= 2) {
            lines.push(
              `• ${recipe.label}: ${values
                .map((v) => `${v.label} ${v.value}`)
                .join(' | ')}`,
            )
          } else {
            // Viele Werte (Vollvermessung) → je Zeile, eingerückt.
            lines.push(`• ${recipe.label}:`)
            for (const v of values) lines.push(`   ${v.label}: ${v.value}`)
          }
          // CPAK-Klassifikation aus der Vollvermessung.
          if (m.kind === 'workflow') {
            const raw = computeWorkflowRaw(m.points, factor)
            if (raw) {
              const c = computeCpak(raw.mLDFA, raw.mMPTA)
              lines.push(
                `   CPAK: Typ ${c.type} (${c.alignment} / ${c.jlo}) · aHKA ${c.aHKA.toFixed(1)}° · JLO ${c.JLO.toFixed(1)}°`,
              )
            }
          }
        } catch {
          lines.push(`• ${recipe.label}: Wert nicht berechenbar`)
        }
      }
      writeSection('Knie-Messungen', lines)
    }

    // Pfannen — mit klinischer Inklination statt SVG-Rotation. Die
    // Inklination berechnet sich aus dem Pfannen-Rim relativ zur
    // Becken-Referenzlinie (43° = typischer OP-Zielwert).
    if (cups.length > 0) {
      writeSection(
        'Pfannen (Cup)',
        cups.map((c) => {
          const dia = cupDiameterMm(c.catalogIndex, c.sizeIndex)
          const shape = cupShape(c.center, dia, c.rotationDeg, factor, c.side)
          const incl = referenceLine
            ? cupInclination(
                shape.rimFrom,
                shape.rimTo,
                referenceLine[0],
                referenceLine[1],
              )
            : null
          const inclText = incl != null ? `Inklination ${incl.toFixed(1)}°` : 'Inklination (keine Referenzlinie)'
          return (
            `• ${c.side}: ${cupDisplayName(c.catalogIndex, c.sizeIndex)}` +
            ` | ${inclText}`
          )
        }),
      )
    }

    // Schäfte — Rotation klinisch als Varus/Valgus-Tilt relativ zur
    // user-definierten Femur-Schaft-Achse (Fallback auf 90°-Vertikale,
    // wenn keine Achse vorhanden).
    if (stems.length > 0) {
      const vp = getViewport()
      writeSection(
        'Schäfte (Stem)',
        stems.map((s) => {
          const head = headOffsetMm(s.headOffsetIndex)
          let referenceAngleDeg: number | undefined
          if (s.femurAxis && vp) {
            referenceAngleDeg = femurAxisAngleCanvasDeg(s.femurAxis, (p) =>
              vp.worldToCanvas(p),
            )
          }
          const align = stemAxisAlignment(
            s.rotationDeg,
            s.side,
            referenceAngleDeg,
          )
          const alignText =
            align.label === 'Neutral'
              ? 'Achse neutral (0°)'
              : `${align.degrees.toFixed(1)}° ${align.label}`
          const refNote =
            referenceAngleDeg != null
              ? ' (vs. Femur-Achse)'
              : ' (vs. Vertikale)'
          return (
            `• ${s.side}: ${stemDisplayName(s.catalogIndex, s.sizeIndex)}` +
            ` | Halslänge ${head >= 0 ? '+' : ''}${head} mm` +
            ` | ${alignText}${refNote}`
          )
        }),
      )
    }

    // Beinlängen-Bilanz (prä-OP + Implantat-Korrektur = post-OP)
    // Nur wenn LLD-Messung UND Implantate UND Referenzlinie da sind.
    const preopLLD = findPreopLLD(hipMeasurements, factor)
    const correction = computeImplantLLDCorrection(
      cups,
      stems,
      referenceLine,
      factor,
    )
    if (preopLLD != null && correction.perSide.length > 0) {
      // Relativ zur operierten Seite, OHNE Klammer-Erklärungen.
      const opSide = operatedSideOf(correction.perSide) ?? 'R'
      const postopLLD = preopLLD + correction.totalSigned
      const lines: string[] = []
      lines.push(`Prä-OP: ${formatLldForSide(preopLLD, opSide)}`)
      for (const c of correction.perSide) {
        lines.push(
          `Korrektur ${c.side}: ${c.mm >= 0 ? '+' : ''}${(c.mm / 10).toFixed(2).replace('.', ',')} cm`,
        )
      }
      lines.push(`Post-OP: ${formatLldForSide(postopLLD, opSide)}`)
      writeSection('Beinlängen-Bilanz', lines)
    }

    // Notizen
    if (notes.length > 0) {
      writeSection(
        'Notizen',
        notes.map((n, i) => `• [${i + 1}] ${n.text}`),
      )
    }

    // Osteophyten-Markierungen (Erinnerung zur intraop. Entfernung).
    if (osteophytes.length > 0) {
      writeSection('Osteophyten (intraop. entfernen)', [
        `${osteophytes.length} markierte Fläche(n) — siehe rot schraffierte Bereiche im Bild`,
      ])
    }

    // Becken-Referenz-Hinweis
    if (referenceLine) {
      writeSection('Becken-Referenzlinie', ['gesetzt'])
    }

    // Footer
    if (y < 280) y = 285
    pdf.setFontSize(7)
    pdf.setTextColor(150, 150, 150)
    pdf.text(
      'Skizzier-Tool ohne CE-Kennzeichnung — keine alleinige Grundlage für klinische Entscheidungen',
      pw / 2,
      292,
      { align: 'center' },
    )
  }

  // Speichern
  const fileTs = new Date()
    .toISOString()
    .replace(/[T:]/g, '-')
    .replace(/\.\d{3}Z$/, '')
  pdf.save(`cendova-plan-${fileTs}.pdf`)
}

/**
 * Bequemer Auslöser für den PDF-Export: sucht das Viewport-Element, setzt
 * die Statuszeile und fängt Fehler ab. Wird vom Export-Button UND vom
 * Vor-Export-Hinweis („Trotzdem exportieren") genutzt — so liegt die
 * Lookup-/Status-Logik nur an einer Stelle.
 */
export async function triggerPdfExport(): Promise<void> {
  const setStatus = useViewerStore.getState().setStatus
  const el = document.getElementById('viewport-capture-root')
  if (!el) {
    setStatus('PDF-Export: Viewport-Element nicht gefunden')
    return
  }
  // Vollbild-Modus vor dem Snapshot auflösen — ein per display:none
  // verstecktes Pane liefert html2canvas nichts. Kurz warten, bis Layout
  // und Cornerstone-Resize (Viewport-Effekt) durch sind.
  const panes = useKneePanesStore.getState()
  if (panes.maximizedPane != null) {
    panes.setMaximizedPane(null)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const roots: HTMLElement[] = [el]
  // Knie-Zwei-Bild-Ansicht: die seitliche Aufnahme kommt als zweites Bild
  // mit auf Seite 1 (AP + seitlich nebeneinander, Nutzer-Wunsch).
  if (
    useViewerStore.getState().planningMode === 'knee' &&
    panes.splitView &&
    panes.rightHasImage
  ) {
    const right = document.getElementById('viewport-capture-root-right')
    if (right) roots.push(right)
  }
  setStatus('PDF wird erzeugt …')
  try {
    await exportPlanPdf(roots)
    setStatus('PDF wurde gespeichert.')
  } catch (err) {
    setStatus(
      `PDF-Export fehlgeschlagen: ${
        err instanceof Error ? err.message : 'Unbekannt'
      }`,
    )
  }
}
