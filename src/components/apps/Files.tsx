import { useEffect, useState, type DragEvent, type MouseEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, FilePlus2, FolderPlus, Upload } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { ROOT_ID } from '../../kernel/types'
import { dispatch } from '../../kernel/commands'
import { useWindows, type Win } from '../../state/windows'
import { useUi } from '../../state/ui'
import { createFileAndOpen, createFolderAndRename, folderMenu, importFiles, importInto } from '../../lib/menus'
import { cn } from '../../lib/utils'
import { IconGrid } from '../IconGrid'
import { NODE_DRAG_TYPE } from '../NodeIcon'
import { ToolButton } from '../ToolButton'

export function FilesApp({ win }: { win: Win }) {
  const folderId = win.props.folderId ?? ROOT_ID
  const nodes = useLiveQuery(() => fs.list(folderId), [folderId])
  // The result carries its own folderId so stale data from the previous folder is never acted upon.
  const view = useLiveQuery(
    async () => ({
      folderId,
      path: await fs.path(folderId),
      exists: folderId === ROOT_ID || (await fs.get(folderId))?.trashedAt === null,
    }),
    [folderId],
  )
  const fresh = view && view.folderId === folderId ? view : undefined
  const path = fresh?.path
  const selection = useUi((s) => s.selection)
  const selectedCount = selection.length
  const selectedNode = useLiveQuery(async () => (selection.length === 1 ? await fs.get(selection[0]) : undefined), [selection])
  const [dragOver, setDragOver] = useState(false)

  const navigate = (id: string) => {
    useUi.getState().clearSelection()
    useWindows.getState().setProps(win.id, { folderId: id })
  }

  useEffect(() => {
    if (!fresh) return
    if (!fresh.exists) {
      navigate(ROOT_ID)
      return
    }
    const title = fresh.path.length ? fresh.path[fresh.path.length - 1].name : 'Escritorio'
    useWindows.getState().setTitle(win.id, title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, win.id])

  const parentId = path && path.length > 1 ? path[path.length - 2].id : ROOT_ID

  const onBodyMouseDown = (e: MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('[data-node]')) useUi.getState().clearSelection()
  }

  const onContextMenu = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    e.preventDefault()
    useUi.getState().clearSelection()
    useUi.getState().openMenu(e.clientX, e.clientY, folderMenu(folderId, { x: e.clientX, y: e.clientY }))
  }

  const onDragOver = (e: DragEvent) => {
    const types = e.dataTransfer.types
    if (!types.includes('Files') && !types.includes(NODE_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = types.includes('Files') ? 'copy' : 'move'
    setDragOver(true)
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const raw = e.dataTransfer.getData(NODE_DRAG_TYPE)
    if (raw) {
      const ids: string[] = JSON.parse(raw)
      if (ids.includes(folderId)) return
      await dispatch('fs.move', { ids, targetParentId: folderId })
      useUi.getState().clearSelection()
      return
    }
    await importFiles(folderId, [...e.dataTransfer.files])
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
        <ToolButton label="Atrás" disabled={folderId === ROOT_ID} onClick={() => navigate(parentId)}>
          <ChevronLeft className="h-4 w-4" />
        </ToolButton>

        <nav className="flex min-w-0 flex-1 items-center gap-0.5 px-1 text-[13px]">
          <Crumb active={folderId === ROOT_ID} onClick={() => navigate(ROOT_ID)}>
            Escritorio
          </Crumb>
          {(path ?? []).map((n, i, arr) => (
            <span key={n.id} className="flex min-w-0 items-center gap-0.5">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3" />
              <Crumb active={i === arr.length - 1} onClick={() => navigate(n.id)}>
                {n.name}
              </Crumb>
            </span>
          ))}
        </nav>

        <ToolButton label="Nueva carpeta" onClick={() => void createFolderAndRename(folderId)}>
          <FolderPlus className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Nueva nota" onClick={() => void createFileAndOpen(folderId, 'note')}>
          <FilePlus2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Importar archivos" onClick={() => importInto(folderId)}>
          <Upload className="h-4 w-4" />
        </ToolButton>
      </div>

      <div
        className={cn('scrollbar-thin relative min-h-0 flex-1 overflow-y-auto p-3 transition-colors', dragOver && 'bg-accent-soft')}
        onMouseDown={onBodyMouseDown}
        onContextMenu={onContextMenu}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
        }}
        onDrop={onDrop}
      >
        {nodes && nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-[14px] text-ink-2">Esta carpeta está vacía</p>
            <p className="text-[12px] text-ink-3">Arrastra archivos aquí o usa clic derecho.</p>
          </div>
        ) : (
          <IconGrid nodes={nodes ?? []} onOpenFolder={navigate} className="min-h-full" />
        )}
        {dragOver && (
          <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent/60">
            <span className="glass rounded-full px-3 py-1.5 text-[12px] font-medium text-accent shadow-soft">
              Soltar aquí
            </span>
          </div>
        )}
      </div>

      <div className="flex h-7 shrink-0 items-center justify-between border-t border-line px-3 text-[11px] text-ink-3">
        <span>{nodes ? `${nodes.length} ${nodes.length === 1 ? 'elemento' : 'elementos'}` : ''}</span>
        <span className="truncate">
          {selectedCount === 1 && selectedNode
            ? selectedNode.tags?.length
              ? selectedNode.tags.map((t) => `#${t}`).join(' ')
              : selectedNode.name
            : selectedCount > 1
              ? `${selectedCount} seleccionados`
              : ''}
        </span>
      </div>
    </div>
  )
}

function Crumb({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'truncate rounded-md px-1.5 py-0.5 transition',
        active ? 'font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
