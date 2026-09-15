import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Check, Plus, X } from 'lucide-react'
import { widgets, type TodoItem, type Widget } from '../../kernel/widgets'
import { cn } from '../../lib/utils'

export function TodoWidget({ widget }: { widget: Widget }) {
  // A list written by Sky arrives as plain {text, done}: without ids every row looked like the same row, so
  // ticking one ticked them all and deleting one deleted the lot. They get an id here, by position, and the
  // first save writes it down for good.
  const items = (Array.isArray(widget.config.items) ? widget.config.items : []).map((raw, i) => {
    const item = (raw ?? {}) as Partial<TodoItem>
    return { id: item.id ?? `i${i}`, text: String(item.text ?? ''), done: !!item.done }
  })
  const [draft, setDraft] = useState('')

  const save = (next: TodoItem[]) => void widgets.setConfig(widget.id, { items: next })

  const add = () => {
    const text = draft.trim()
    if (!text) return
    save([...items, { id: nanoid(6), text, done: false }])
    setDraft('')
  }

  const pending = items.filter((i) => !i.done).length

  return (
    <div className="flex h-full flex-col gap-2">
      <ul className="scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="group/item flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-2">
            <button
              type="button"
              aria-label={item.done ? 'Marcar pendiente' : 'Marcar hecha'}
              onClick={() => save(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                item.done ? 'border-accent bg-accent text-white' : 'border-line-2 hover:border-accent',
              )}
            >
              {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
            </button>
            <span className={cn('min-w-0 flex-1 truncate text-[13px]', item.done ? 'text-ink-3 line-through' : 'text-ink')}>{item.text}</span>
            <button
              type="button"
              aria-label="Eliminar tarea"
              onClick={() => save(items.filter((i) => i.id !== item.id))}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-3 opacity-0 transition hover:text-danger group-hover/item:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="px-1 py-2 text-[12px] text-ink-3">Nada pendiente. Agrega una tarea abajo.</li>}
      </ul>
      <form
        className="flex shrink-0 items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={pending ? `${pending} pendiente${pending === 1 ? '' : 's'} · nueva tarea…` : 'Nueva tarea…'}
          className="h-8 min-w-0 flex-1 rounded-lg bg-surface-2 px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:ring-1 focus:ring-accent/40"
        />
        <button
          type="submit"
          aria-label="Agregar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent transition hover:brightness-95"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
