import { dispatch } from '../kernel/commands'
import type { FsNode } from '../kernel/types'
import { useUi } from '../state/ui'
import type { MenuItem } from '../state/ui'
import { pickFiles } from './pickFiles'

/** Creates a folder and immediately enters rename mode on it. */
export async function createFolderAndRename(parentId: string): Promise<void> {
  const node = await dispatch<FsNode>('fs.createFolder', { parentId })
  useUi.getState().select([node.id])
  useUi.getState().setRenaming(node.id)
}

/** Creates a note and opens it in the editor. */
export async function createNoteAndOpen(parentId: string): Promise<void> {
  const node = await dispatch<FsNode>('fs.createNote', { parentId })
  await dispatch('ui.open', { id: node.id })
}

export function importInto(parentId: string): void {
  void pickFiles().then((files) => {
    if (files.length) void dispatch('fs.import', { parentId, files })
  })
}

export function folderMenu(parentId: string): MenuItem[] {
  return [
    { label: 'Nueva carpeta', onSelect: () => void createFolderAndRename(parentId) },
    { label: 'Nueva nota', onSelect: () => void createNoteAndOpen(parentId) },
    { type: 'separator' },
    { label: 'Importar archivos…', onSelect: () => importInto(parentId) },
  ]
}

export function nodeMenu(node: FsNode, ids: string[]): MenuItem[] {
  const many = ids.length > 1
  const items: MenuItem[] = []
  if (!many) {
    items.push({ label: 'Abrir', shortcut: 'Enter', onSelect: () => void dispatch('ui.open', { id: node.id }) })
    items.push({ label: 'Renombrar', shortcut: 'F2', onSelect: () => useUi.getState().setRenaming(node.id) })
    items.push({ type: 'separator' })
  }
  items.push({
    label: many ? `Mover ${ids.length} a la papelera` : 'Mover a la papelera',
    shortcut: 'Supr',
    danger: true,
    onSelect: () => {
      void dispatch('fs.trash', { ids })
      useUi.getState().clearSelection()
    },
  })
  return items
}
