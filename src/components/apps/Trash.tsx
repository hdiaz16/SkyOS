import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RotateCcw, Trash2, X } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { fileKind } from '../../kernel/types'
import { dispatch } from '../../kernel/commands'
import { cn, formatBytes, formatRelative } from '../../lib/utils'
import { KindIcon } from '../KindIcon'

/** Two-step confirmation that resets itself after a few seconds. */
function useArmed(): [string | null, (id: string | null) => void] {
  const [armed, setArmed] = useState<string | null>(null)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(null), 3500)
    return () => window.clearTimeout(t)
  }, [armed])
  return [armed, setArmed]
}

export function TrashApp() {
  const items = useLiveQuery(() => fs.listTrash(), []) ?? []
  const [armed, setArmed] = useArmed()

  const emptyTrash = () => {
    if (armed !== 'empty') {
      setArmed('empty')
      return
    }
    setArmed(null)
    void dispatch('fs.emptyTrash')
  }

  const purgeOne = (id: string) => {
    if (armed !== id) {
      setArmed(id)
      return
    }
    setArmed(null)
    void dispatch('fs.purge', { ids: [id] })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="text-[13px] text-ink-2">
          {items.length} {items.length === 1 ? 'elemento' : 'elementos'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!items.length}
            onClick={() => void dispatch('fs.restore', { ids: items.map((n) => n.id) })}
            className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            Restaurar todo
          </button>
          <button
            type="button"
            disabled={!items.length}
            onClick={emptyTrash}
            className={cn(
              'rounded-lg px-2.5 py-1 text-[12px] font-medium transition disabled:opacity-30 disabled:hover:bg-transparent',
              armed === 'empty' ? 'bg-danger text-white hover:brightness-110' : 'text-danger hover:bg-danger/10',
            )}
          >
            {armed === 'empty' ? '¿Seguro? Vaciar' : 'Vaciar papelera'}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-3">
          <Trash2 className="h-8 w-8" strokeWidth={1.25} />
          <p className="text-[13px]">La papelera está vacía</p>
        </div>
      ) : (
        <ul className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {items.map((n) => (
            <li key={n.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-surface-2">
              <KindIcon kind={fileKind(n)} name={n.name} className="h-8 w-8 shrink-0" />
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
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-ink-2 transition hover:bg-accent-soft hover:text-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurar
              </button>
              <button
                type="button"
                title="Eliminar definitivamente"
                onClick={() => purgeOne(n.id)}
                className={cn(
                  'flex h-8 items-center justify-center rounded-lg text-[12px] transition',
                  armed === n.id
                    ? 'gap-1.5 bg-danger px-2.5 text-white hover:brightness-110'
                    : 'w-8 text-ink-3 hover:bg-danger/10 hover:text-danger',
                )}
              >
                <X className="h-4 w-4" />
                {armed === n.id && 'Borrar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
