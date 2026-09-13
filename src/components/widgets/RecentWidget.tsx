import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../kernel/db'
import { fileKind, type FsNode } from '../../kernel/types'
import { dispatch } from '../../kernel/commands'
import type { Widget } from '../../kernel/widgets'
import { formatRelative } from '../../lib/utils'
import { KindIcon } from '../KindIcon'

export function RecentWidget({ widget }: { widget: Widget }) {
  const limit = typeof widget.config.limit === 'number' && widget.config.limit > 0 ? Math.min(widget.config.limit, 12) : 6
  const files = useLiveQuery(
    async () => {
      const rows = await db.nodes.where('kind').equals('file').and((n) => n.trashedAt === null).reverse().sortBy('updatedAt')
      return rows.slice(0, limit)
    },
    [limit],
    [] as FsNode[],
  )

  if (files.length === 0) return <p className="flex h-full items-center justify-center text-[12px] text-ink-3">Aún no hay archivos</p>

  return (
    <ul className="scrollbar-thin -mx-1 h-full overflow-y-auto">
      {files.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            onClick={() => void dispatch('ui.open', { id: f.id })}
            className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-surface-2"
          >
            <KindIcon kind={fileKind(f)} className="h-7 w-7 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-ink">{f.name}</span>
              <span className="block text-[11px] text-ink-3">{formatRelative(f.updatedAt)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
