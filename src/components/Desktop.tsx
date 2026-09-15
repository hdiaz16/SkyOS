import { useState, type DragEvent, type MouseEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { fs } from '../kernel/fs'
import { ROOT_ID } from '../kernel/types'
import { dispatch } from '../kernel/commands'
import { useUi } from '../state/ui'
import { folderMenu, importFiles } from '../lib/menus'
import { cn } from '../lib/utils'
import { IconGrid } from './IconGrid'
import { NODE_DRAG_TYPE } from './NodeIcon'

export function Desktop() {
  const nodes = useLiveQuery(() => fs.list(ROOT_ID), [])
  const [dragOver, setDragOver] = useState(false)

  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('[data-node]')) useUi.getState().clearSelection()
  }

  const onDoubleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    void dispatch('ui.stackWindows')
  }

  const onContextMenu = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    e.preventDefault()
    useUi.getState().clearSelection()
    const at = { x: e.clientX, y: e.clientY }
    void folderMenu(ROOT_ID, at).then((items) => useUi.getState().openMenu(at.x, at.y, items))
  }

  const onDragOver = (e: DragEvent) => {
    const types = e.dataTransfer.types
    if (!types.includes('Files') && !types.includes(NODE_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = types.includes('Files') ? 'copy' : 'move'
    if (types.includes('Files')) setDragOver(true)
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const raw = e.dataTransfer.getData(NODE_DRAG_TYPE)
    if (raw) {
      const ids: string[] = JSON.parse(raw)
      await dispatch('fs.move', { ids, targetParentId: ROOT_ID })
      return
    }
    await importFiles(ROOT_ID, [...e.dataTransfer.files])
  }

  return (
    <div
      className="absolute inset-0 px-5 pb-28 pt-14"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      <IconGrid nodes={nodes ?? []} animateLayout className="h-full content-start" />

      <div
        className={cn(
          'pointer-events-none absolute inset-3 flex items-center justify-center rounded-3xl border-2 border-dashed transition-opacity duration-200',
          dragOver ? 'border-accent/60 bg-accent-soft opacity-100' : 'opacity-0',
        )}
      >
        <span className="glass rounded-full px-4 py-2 text-[13px] font-medium text-accent shadow-soft">
          Suelta para importar al escritorio
        </span>
      </div>
    </div>
  )
}
