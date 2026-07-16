import { useState } from 'react'
import { useTemplateStore } from '../state/templateStore'
import { useTemplatePackageStore } from '../state/templatePackageStore'
import { Hint } from './Hint'
import { ConfirmDialog } from './ConfirmDialog'
import {
  cupCatalogEntries,
  cupDiameterMm,
  headOffsetMm,
  stemCatalogEntries,
} from '../lib/hip/templates'

/**
 * Listet alle platzierten Schablonen (Pfannen + Schäfte) mit Ein/Aus-
 * Schalter, Auswahl und Löschen — analog zum Messungen-Panel. Sitzt
 * rechts unter den Messungen in der App-Sidebar.
 */
export function TemplatesPanel() {
  const cups = useTemplateStore((s) => s.templates)
  const stems = useTemplateStore((s) => s.stems)
  const selectedId = useTemplateStore((s) => s.selectedId)
  const setVisible = useTemplateStore((s) => s.setVisible)
  const select = useTemplateStore((s) => s.select)
  const remove = useTemplateStore((s) => s.remove)
  const removeAll = useTemplateStore((s) => s.removeAll)

  const pkgInfo = useTemplatePackageStore((s) => s.info)
  // Bestätigung vor dem Sammel-Löschen (UX-Befund P1-5).
  const [confirmClear, setConfirmClear] = useState(false)
  const cupEntries = cupCatalogEntries()
  const stemEntries = stemCatalogEntries()
  const hasAny = cups.length > 0 || stems.length > 0
  // Ohne Schablonen-Paket gibt es keine Katalogdaten (das öffentliche Repo
  // enthält keine Hersteller-Schablonen) → freundlicher Hinweis statt
  // leerer Auswahl. Vermessung ist davon nicht betroffen.
  const noCatalog =
    !pkgInfo && cupEntries.length === 0 && stemEntries.length === 0

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-y border-neutral-700 px-3 py-2">
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
          removeAll()
          setConfirmClear(false)
        }}
      >
        Alle platzierten Pfannen und Schäfte werden entfernt.
      </ConfirmDialog>

      <div className="p-2">
        {noCatalog && (
          <p className="mx-1 mb-2 rounded border border-amber-800/60 bg-amber-950/40 px-2 py-1.5 text-[11px] leading-snug text-amber-300">
            Kein Schablonen-Paket geladen — Schablonen sind erst nach dem
            Import verfügbar (Paket-Symbol oben in der Kopfzeile). Messen
            geht auch ohne.
          </p>
        )}
        {!hasAny && (
          <Hint>
            <p className="px-1 py-1 text-xs text-neutral-500">
              Noch keine Schablonen platziert. „Pfanne hinzufügen" oder
              „Schaft hinzufügen" im linken Menü.
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
                  onSelect={select}
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
                  onSelect={select}
                  onToggleVisible={setVisible}
                  onRemove={remove}
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
