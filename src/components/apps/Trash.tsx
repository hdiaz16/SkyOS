import { useLiveQuery } from 'dexie-react-hooks'
import { RotateCcw, Trash2, X } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { fileKind } from '../../kernel/types'
import { dispatch } from '../../kernel/commands'
import { formatBytes, formatRelative } from '../../lib/utils'
import { KindIcon } from '../KindIcon'

export function TrashApp() {
  const items = useLiveQuery(() => fs.listTrash(), []) ?? []

  const empty = () => {
    if (window.confirm('¿Vaciar la papelera? Esto no se puede deshacer.')) void dispatch('fs.emptyTrash')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="text-[13px] text-ink-2">
          {items.length} {items.length === 1 ? 'elemento' : 'elementos'}
        </span>
        <button
          type="button"
          disabled={!items.length}
          onClick={empty}
          className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-danger transition hover:bg-danger/10 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          Vaciar papelera
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-3">
          <Trash2 className="h-8 w-8" strokeWidth={1.25} />
          <p className="text-[13px]">La papelera está vacía</p>
        </div>
      ) : (
        <ul className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {items.map((n) => (
            <li key={n.id} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
              <KindIcon kind={fileKind(n)} className="h-8 w-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{n.name}</p>
                <p className="text-[11px] text-ink-3">
                  {n.trashedAt ? formatRelative(n.trashedAt) : ''}
                  {n.kind === 'file' ? ` · ${formatBytes(n.size)}` : ''}
                </p>
              </div>
              <button
                type="button"
                title="Restaurar"
                onClick={() => void dispatch('fs.restore', { ids: [n.id] })}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-ink-2 opacity-0 transition group-hover:opacity-100 hover:bg-accent-soft hover:text-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurar
              </button>
              <button
                type="button"
                title="Eliminar definitivamente"
                onClick={() => {
                  if (window.confirm(`¿Eliminar "${n.name}" para siempre?`)) void dispatch('fs.purge', { ids: [n.id] })
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 opacity-0 transition group-hover:opacity-100 hover:bg-danger/10 hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
