import { useState } from 'react'
import { useTemplateStore } from '../state/templateStore'
import { useTemplatePackageStore } from '../state/templatePackageStore'
import { useViewerStore } from '../state/viewerStore'
import {
  useKneeTemplateStore,
  gruppiereNachImplantat,
} from '../state/kneeTemplateStore'
import { Hint } from './Hint'
import { KeinPaketHinweis } from './KeinPaketHinweis'
import { ConfirmDialog } from './ConfirmDialog'
import {
  cupCatalogEntries,
  cupDiameterMm,
  headOffsetMm,
  stemCatalogEntries,
} from '../lib/hip/templates'
import { sizeLabelFor } from '../lib/knee/templates'
import {
  KNEE_IMPLANT_FAMILIES,
  ohneTibiaVariantenZusatz,
} from '../lib/knee/smithNephewCatalog'

/**
 * Listet ALLE platzierten Schablonen mit Ein/Aus-Schalter, Auswahl und
 * Löschen — Hüfte (Pfannen + Schäfte) und Knie (Femur-/Tibiakomponenten).
 * Sitzt rechts unter den Messungen in der App-Sidebar.
 *
 * Modulübergreifend wie das Messungen-Panel darüber: dort stehen Hüft-,
 * Knie- und Schulter-Messungen gemeinsam, unterschieden durch ein Badge.
 * Knie-Schablonen fehlten hier früher komplett — eine ausgeblendete oder
 * aus dem Bild geschobene Knie-Komponente war damit nirgends mehr
 * erreichbar, während dasselbe bei der Hüfte über diese Liste ging.
 */
export function TemplatesPanel() {
  const cups = useTemplateStore((s) => s.templates)
  const stems = useTemplateStore((s) => s.stems)
  const selectedId = useTemplateStore((s) => s.selectedId)
  const setVisible = useTemplateStore((s) => s.setVisible)
  const select = useTemplateStore((s) => s.select)
  const remove = useTemplateStore((s) => s.remove)
  const removeAll = useTemplateStore((s) => s.removeAll)

  const kneeTemplates = useKneeTemplateStore((s) => s.templates)
  const kneeSelectedId = useKneeTemplateStore((s) => s.selectedId)
  const selectKnee = useKneeTemplateStore((s) => s.select)
  const removeKnee = useKneeTemplateStore((s) => s.remove)
  const setKneeGroupVisible = useKneeTemplateStore((s) => s.setGroupVisible)
  const removeAllKnee = useKneeTemplateStore((s) => s.removeAll)

  const pkgInfo = useTemplatePackageStore((s) => s.info)
  const planningMode = useViewerStore((s) => s.planningMode)
  // Bestätigung vor dem Sammel-Löschen (UX-Befund P1-5).
  const [confirmClear, setConfirmClear] = useState(false)
  const cupEntries = cupCatalogEntries()
  const stemEntries = stemCatalogEntries()

  // EINE Zeile je Implantat, nicht je Kontur (Begründung + Tests am Store).
  const kneeZeilen = gruppiereNachImplantat(kneeTemplates, kneeSelectedId)

  const hasAny = cups.length > 0 || stems.length > 0 || kneeZeilen.length > 0

  // Auswahl ist LISTENWEIT exklusiv. Hüft- und Knie-Store führen je ein
  // eigenes `selectedId`; solange sie in getrennten Panels lebten, war das
  // egal. In einer gemeinsamen Liste wären sonst zwei Zeilen gleichzeitig
  // markiert — und rechts erschienen zwei Eigenschaften-Panels.
  const waehleHueft = (id: string) => {
    selectKnee(null)
    select(id)
  }
  const waehleKnie = (id: string) => {
    select(null)
    selectKnee(id)
  }
  // Ohne Schablonen-Paket gibt es keine Katalogdaten (das öffentliche Repo
  // enthält keine Hersteller-Schablonen) → freundlicher Hinweis statt
  // leerer Auswahl. Vermessung ist davon nicht betroffen.
  const noCatalog =
    !pkgInfo && cupEntries.length === 0 && stemEntries.length === 0

  return (
    // Eigenes Scrollen wie im Messungen-Panel darüber: `max-h-[45%]` deckelt
    // die Höhe, `min-h-0` erlaubt dem inneren Bereich zu schrumpfen. Vorher
    // wuchs das Panel unbegrenzt und hatte KEIN overflow — bei mehreren
    // Schablonen waren die letzten Einträge nicht mehr erreichbar.
    <div className="flex max-h-[45%] min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-y border-neutral-700 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Schablonen
        </span>
        {hasAny && (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-[11px] text-neutral-500 transition hover:text-red-400"
          >
            Alle löschen
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirmClear}
        title="Alle Schablonen löschen?"
        confirmLabel="Alle löschen"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          // „Alle" heisst alles, was die Liste zeigt — wie clearAll() im
          // Messungen-Panel. Vorher raeumte der Button nur den Hueft-Store,
          // versprach im Text aber pauschal „Pfannen und Schäfte", auch im
          // Knie-Modus, wo genau die nicht gemeint sein konnten.
          removeAll()
          removeAllKnee()
          setConfirmClear(false)
        }}
      >
        Alle platzierten Schablonen werden entfernt.
      </ConfirmDialog>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {/* Im Schulter-Modus bewusst KEIN Import-Aufruf: ein Paket enthält
            keine Schulter-Schablonen, die Aufforderung liefe also ins Leere.
            Den Stand erklärt dort Sektion 5 der linken Leiste. */}
        {noCatalog && planningMode !== 'shoulder' && (
          <KeinPaketHinweis className="mb-2" />
        )}
        {/* Schulter-Erklärung IMMER zeigen, nicht nur im Leerzustand. Vorher
            stand sie im `!hasAny`-Zweig — also genau dann, wenn die Liste
            leer war und der Satz „die Liste zeigt Hüft-Schablonen" nicht
            stimmte; sobald wirklich welche dastanden, verschwand er. Der
            zweite Satz kommt deshalb nur, wenn tatsächlich etwas gelistet
            wird. Neutral statt amber: es fehlt nichts, was der Nutzer
            beisteuern könnte (gleiche Begründung wie in der linken Leiste). */}
        {planningMode === 'shoulder' && (
          <p className="mx-1 mb-2 rounded border border-neutral-700 bg-neutral-800/50 px-2 py-1.5 text-[11px] leading-snug text-neutral-400">
            Schulter-Schablonen sind noch nicht verfügbar.
            {hasAny && ' Die Liste zeigt die der anderen Module.'}
          </p>
        )}
        {!hasAny && planningMode !== 'shoulder' && (
          <Hint>
            {/* Der Hinweis nennt die Buttons des AKTIVEN Modus. Vorher stand
                hier immer „Pfanne/Schaft hinzufügen" — im Knie-Tab gibt es
                die aber gar nicht. */}
            <p className="px-1 py-1 text-xs text-neutral-500">
              {planningMode === 'hip'
                ? 'Noch keine Schablonen platziert. „Pfanne hinzufügen" oder „Schaft hinzufügen" in der linken Leiste.'
                : 'Noch keine Schablonen platziert. Femur- oder Tibiakomponente in der linken Leiste auswählen.'}
            </p>
          </Hint>
        )}

        {hasAny && (
          <ul className="flex flex-col gap-1">
            {cups.map((cup) => {
              const entry = cupEntries[cup.catalogIndex]
              const diameter = cupDiameterMm(cup.catalogIndex, cup.sizeIndex)
              return (
                <TemplateRow
                  key={cup.id}
                  id={cup.id}
                  badge={`P${cup.id.replace(/[^0-9]/g, '')}`}
                  title={`${entry?.family ?? 'Pfanne'} · ${cup.side === 'R' ? 'rechts' : 'links'}`}
                  subtitle={`⌀ ${diameter} mm`}
                  selected={cup.id === selectedId}
                  visible={cup.visible !== false}
                  onSelect={waehleHueft}
                  onToggleVisible={setVisible}
                  onRemove={remove}
                />
              )
            })}
            {stems.map((stem) => {
              const entry = stemEntries[stem.catalogIndex]
              const size = entry?.sizes[stem.sizeIndex]
              const offset = headOffsetMm(stem.headOffsetIndex)
              const offsetTxt = offset >= 0 ? `+${offset}` : `${offset}`
              return (
                <TemplateRow
                  key={stem.id}
                  id={stem.id}
                  badge={`S${stem.id.replace(/[^0-9]/g, '')}`}
                  title={`${entry?.family ?? 'Schaft'} ${entry?.variant ?? ''} · ${stem.side === 'R' ? 'rechts' : 'links'}`}
                  subtitle={`Gr. ${size?.size ?? '?'} · Kopf ${offsetTxt} mm`}
                  selected={stem.id === selectedId}
                  visible={stem.visible !== false}
                  onSelect={waehleHueft}
                  onToggleVisible={setVisible}
                  onRemove={remove}
                />
              )
            })}
            {kneeZeilen.map(({ haupt, sichtbar, ausgewaehlt }) => {
              const familie = KNEE_IMPLANT_FAMILIES.find(
                (f) => f.kind === haupt.kind,
              )
              // Badge nach Bauteil, wie „P"/„S" bei der Hüfte.
              const kuerzel =
                familie?.bone === 'Tibia'
                  ? 'T'
                  : familie?.bone === 'Femur'
                    ? 'F'
                    : 'K'
              const inlay = haupt.insertThicknessMm
              return (
                <TemplateRow
                  key={haupt.groupId}
                  id={haupt.id}
                  badge={`${kuerzel}${haupt.id.replace(/[^0-9]/g, '')}`}
                  title={`${familie ? ohneTibiaVariantenZusatz(familie.label) : 'Schablone'} · ${haupt.side === 'R' ? 'rechts' : 'links'}`}
                  subtitle={`Gr. ${sizeLabelFor(haupt.kind, haupt.sizeIndex) || '?'}${
                    inlay != null ? ` · Inlay ${inlay} mm` : ''
                  }`}
                  selected={ausgewaehlt}
                  visible={sichtbar}
                  onSelect={waehleKnie}
                  onToggleVisible={setKneeGroupVisible}
                  onRemove={removeKnee}
                />
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function TemplateRow({
  id,
  badge,
  title,
  subtitle,
  selected,
  visible,
  onSelect,
  onToggleVisible,
  onRemove,
}: {
  id: string
  badge: string
  title: string
  subtitle: string
  selected: boolean
  visible: boolean
  onSelect: (id: string) => void
  onToggleVisible: (id: string, visible: boolean) => void
  onRemove: (id: string) => void
}) {
  return (
    <li
      onClick={() => onSelect(id)}
      className={[
        'group flex items-center gap-2 rounded px-2 py-1.5 text-sm transition',
        selected
          ? 'bg-sky-900/40 ring-1 ring-sky-700'
          : 'hover:bg-neutral-800',
      ].join(' ')}
    >
      <span className="w-7 shrink-0 text-xs font-semibold text-sky-400">
        {badge}
      </span>
      <div
        className={[
          'flex flex-1 flex-col leading-tight',
          visible ? 'text-neutral-200' : 'text-neutral-500',
        ].join(' ')}
      >
        <span className="text-[11px] text-neutral-400">{title}</span>
        <span className="tabular-nums">{subtitle}</span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleVisible(id, !visible)
        }}
        className="shrink-0 text-neutral-500 transition hover:text-sky-300"
        title={visible ? 'Im Bild ausblenden' : 'Im Bild einblenden'}
      >
        <EyeIcon off={!visible} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove(id)
        }}
        className="shrink-0 text-xs text-neutral-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
        title="Schablone entfernen"
      >
        ✕
      </button>
    </li>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    >
      <path d="M1 7s2.3-4 6-4 6 4 6 4-2.3 4-6 4-6-4-6-4z" />
      <circle cx="7" cy="7" r="1.8" />
      {off && <line x1="1.5" y1="1.5" x2="12.5" y2="12.5" />}
    </svg>
  )
}
