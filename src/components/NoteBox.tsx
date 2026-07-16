import { useState } from 'react'
import { getViewport } from '../lib/cornerstone/viewer'
import { useNoteStore, NOTE_COLORS, type TextNote } from '../state/noteStore'

type Vp = NonNullable<ReturnType<typeof getViewport>>

const MIN_SIZE = 9
const MAX_SIZE = 48

export function NoteBox({ note, vp }: { note: TextNote; vp: Vp }) {
  const selected = useNoteStore((s) => s.selectedId === note.id)
  // Frisch angelegte (ausgewählte) Notiz startet direkt im Bearbeitungsmodus.
  const [editing, setEditing] = useState(() => selected)

  const pos = vp.worldToCanvas(note.world)

  function startDrag(e: React.MouseEvent) {
    if (editing) return
    if (e.metaKey || e.ctrlKey) return // Cmd/Strg+Links = Pan (H2)
    e.stopPropagation()
    e.preventDefault()
    useNoteStore.getState().select(note.id)
    const rect = vp.canvas.getBoundingClientRect()
    const start = vp.worldToCanvas(note.world)
    const grabX = e.clientX - rect.left - start[0]
    const grabY = e.clientY - rect.top - start[1]

    function move(ev: MouseEvent) {
      const cx = ev.clientX - rect.left - grabX
      const cy = ev.clientY - rect.top - grabY
      useNoteStore.getState().updatePosition(note.id, vp.canvasToWorld([cx, cy]))
    }
    function up() {
      window.removeEventListener('mousemove', move, true)
      window.removeEventListener('mouseup', up, true)
    }
    window.addEventListener('mousemove', move, true)
    window.addEventListener('mouseup', up, true)
  }

  return (
    <div
      data-overlay-ui
      className="absolute"
      style={{ left: pos[0], top: pos[1] }}
    >
      {selected && <NoteToolbar note={note} />}

      {editing ? (
        <textarea
          data-overlay-ui
          autoFocus
          defaultValue={note.text}
          onBlur={(e) => {
            useNoteStore.getState().updateText(note.id, e.target.value)
            setEditing(false)
          }}
          rows={Math.max(1, note.text.split('\n').length)}
          className="w-44 rounded border border-sky-500 bg-black/70 px-1.5 py-0.5 leading-tight outline-none"
          style={{
            fontSize: note.fontSize,
            color: note.color,
            fontWeight: note.bold ? 'bold' : 'normal',
            textDecoration: note.underline ? 'underline' : 'none',
          }}
        />
      ) : (
        <div
          data-overlay-ui
          onMouseDown={startDrag}
          onDoubleClick={() => {
            useNoteStore.getState().select(note.id)
            setEditing(true)
          }}
          className={[
            'max-w-xs cursor-move whitespace-pre-wrap rounded px-1.5 py-0.5 leading-tight',
            selected ? 'ring-1 ring-sky-500' : '',
          ].join(' ')}
          style={{
            fontSize: note.fontSize,
            color: note.color,
            fontWeight: note.bold ? 'bold' : 'normal',
            textDecoration: note.underline ? 'underline' : 'none',
            textShadow: '0 0 3px #000, 0 0 3px #000',
          }}
        >
          {note.text || 'Notiz'}
        </div>
      )}
    </div>
  )
}

function NoteToolbar({ note }: { note: TextNote }) {
  const store = useNoteStore.getState()
  // Verhindert, dass Klicks die Textarea den Fokus verlieren lassen.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  return (
    <div
      data-overlay-ui
      onMouseDown={keepFocus}
      className="absolute -top-9 left-0 flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-1 py-1 shadow"
    >
      <button
        onClick={() =>
          store.updateStyle(note.id, {
            fontSize: Math.max(MIN_SIZE, note.fontSize - 2),
          })
        }
        className="h-5 w-5 rounded text-xs text-neutral-300 hover:bg-neutral-700"
      >
        A−
      </button>
      <button
        onClick={() =>
          store.updateStyle(note.id, {
            fontSize: Math.min(MAX_SIZE, note.fontSize + 2),
          })
        }
        className="h-5 w-5 rounded text-xs text-neutral-300 hover:bg-neutral-700"
      >
        A+
      </button>
      <div className="mx-0.5 h-4 w-px bg-neutral-700" />
      <button
        onClick={() => store.updateStyle(note.id, { bold: !note.bold })}
        className={[
          'h-5 w-5 rounded text-xs font-bold hover:bg-neutral-700',
          note.bold ? 'bg-neutral-700 text-sky-300' : 'text-neutral-300',
        ].join(' ')}
      >
        F
      </button>
      <button
        onClick={() =>
          store.updateStyle(note.id, { underline: !note.underline })
        }
        className={[
          'h-5 w-5 rounded text-xs underline hover:bg-neutral-700',
          note.underline ? 'bg-neutral-700 text-sky-300' : 'text-neutral-300',
        ].join(' ')}
      >
        U
      </button>
      <div className="mx-0.5 h-4 w-px bg-neutral-700" />
      {NOTE_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => store.updateStyle(note.id, { color: c })}
          className={[
            'h-4 w-4 rounded-full border',
            note.color === c ? 'border-white' : 'border-neutral-600',
          ].join(' ')}
          style={{ backgroundColor: c }}
        />
      ))}
      <div className="mx-0.5 h-4 w-px bg-neutral-700" />
      <button
        onClick={() => store.remove(note.id)}
        className="h-5 w-5 rounded text-xs text-neutral-400 hover:bg-red-900/60 hover:text-red-300"
        title="Notiz löschen"
      >
        ✕
      </button>
    </div>
  )
}
