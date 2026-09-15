import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { motion } from 'motion/react'
import { fileKind, type FsNode } from '../kernel/types'
import { dispatch } from '../kernel/commands'
import { useUi } from '../state/ui'
import { useBlobUrl } from '../lib/hooks'
import { nodeMenu } from '../lib/menus'
import { cn, stripExt } from '../lib/utils'
import { KindIcon } from './KindIcon'

export const NODE_DRAG_TYPE = 'application/x-mesa-nodes'

interface Props {
  node: FsNode
  /** Called instead of the default open behaviour for folders (e.g. navigate inside a Files window). */
  onOpenFolder?: (id: string) => void
  /** Animate position changes when siblings appear or disappear. Keep off inside movable windows. */
  animateLayout?: boolean
}

export function NodeIcon({ node, onOpenFolder, animateLayout = false }: Props) {
  const selected = useUi((s) => s.selection.includes(node.id))
  const renaming = useUi((s) => s.renamingId === node.id)
  const kind = fileKind(node)
  const isFolder = kind === 'folder'
  const [dropHover, setDropHover] = useState(false)
  const { url: thumb } = useBlobUrl(kind === 'image' ? node.id : null, node.updatedAt)

  const open = () => {
    if (isFolder && onOpenFolder) onOpenFolder(node.id)
    else void dispatch('ui.open', { id: node.id })
  }

  const onMouseDown = (e: MouseEvent) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const ui = useUi.getState()
    if (e.ctrlKey || e.metaKey) ui.toggleSelect(node.id)
    else if (!selected) ui.select([node.id])
  }

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ui = useUi.getState()
    const ids = selected && ui.selection.length > 1 ? ui.selection : [node.id]
    if (!selected) ui.select([node.id])
    const at = { x: e.clientX, y: e.clientY }
    void nodeMenu(node, ids, at).then((items) => ui.openMenu(at.x, at.y, items))
  }

  const onDragStart = (e: DragEvent) => {
    const ui = useUi.getState()
    const ids = selected && ui.selection.length > 1 ? ui.selection : [node.id]
    e.dataTransfer.setData(NODE_DRAG_TYPE, JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'move'
  }

  const acceptsDrop = (e: DragEvent) =>
    isFolder && (e.dataTransfer.types.includes(NODE_DRAG_TYPE) || e.dataTransfer.types.includes('Files'))

  const onDragOver = (e: DragEvent) => {
    if (!acceptsDrop(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
    setDropHover(true)
  }

  const onDrop = async (e: DragEvent) => {
    if (!acceptsDrop(e)) return
    e.preventDefault()
    e.stopPropagation()
    setDropHover(false)
    const raw = e.dataTransfer.getData(NODE_DRAG_TYPE)
    if (raw) {
      const ids: string[] = JSON.parse(raw)
      if (ids.includes(node.id)) return
      await dispatch('fs.move', { ids, targetParentId: node.id })
      useUi.getState().clearSelection()
    } else if (e.dataTransfer.files.length) {
      await dispatch('fs.import', { parentId: node.id, files: [...e.dataTransfer.files] })
    }
  }

  return (
    <motion.div
      layout={animateLayout}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
    <div
      draggable={!renaming}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={() => setDropHover(false)}
      onDrop={onDrop}
      onMouseDown={onMouseDown}
      onDoubleClick={open}
      onContextMenu={onContextMenu}
      title={node.tags?.length ? `${node.name}\n${node.tags.map((t) => `#${t}`).join(' ')}` : node.name}
      data-node={node.id}
      className={cn(
        'group flex w-[104px] cursor-default flex-col items-center gap-1.5 rounded-xl px-2 pb-2 pt-2.5 text-center outline-none transition-colors',
        selected ? 'bg-accent-soft' : 'hover:bg-surface-2',
        dropHover && 'ring-2 ring-accent bg-accent-soft',
      )}
    >
      <div className="relative flex h-14 w-14 items-center justify-center">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="no-drag h-14 w-14 rounded-lg border border-line object-cover shadow-soft"
          />
        ) : (
          <KindIcon kind={kind} name={node.name} className={isFolder ? 'h-14 w-14' : 'h-13 w-13'} />
        )}
      </div>
      {renaming ? (
        <RenameInput node={node} />
      ) : (
        <span
          className={cn(
            'line-clamp-2 w-full break-words px-0.5 text-[12px] leading-[1.25]',
            dropHover ? 'font-medium text-accent' : 'text-ink',
            selected && 'font-medium',
          )}
        >
          {dropHover ? 'Soltar aquí' : node.name}
        </span>
      )}
    </div>
    </motion.div>
  )
}

function RenameInput({ node }: { node: FsNode }) {
  const [value, setValue] = useState(node.name)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const base = node.kind === 'file' ? stripExt(node.name).length : node.name.length
    el.setSelectionRange(0, base)
  }, [node])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    useUi.getState().setRenaming(null)
    const next = value.trim()
    if (commit && next && next !== node.name) void dispatch('fs.rename', { id: node.id, name: next })
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="w-full rounded-md border border-accent bg-surface-solid px-1 py-0.5 text-center text-[12px] text-ink outline-none"
    />
  )
}
