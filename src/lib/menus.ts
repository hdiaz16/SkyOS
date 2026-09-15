import { dispatch, useToasts, type CommandContext } from '../kernel/commands'
import { projectFile } from '../kernel/project'
import { ROOT_ID, fileKind, type FsNode } from '../kernel/types'
import { USER_WIDGET_TYPES, WIDGET_META } from '../kernel/widgets'
import { useUi } from '../state/ui'
import type { MenuItem } from '../state/ui'
import { useDialog } from '../state/dialog'
import { isAiConfigured } from '../ai/settings'
import { summarizeFolder, synthesizeFiles, tasksFromFiles, TRANSFORM_PRESETS, transformFile } from '../ai/tasks'
import { suggestPlacement } from '../ai/classify'
import { attachNodesToSky, canAttach } from '../ai/attachments'
import { FILE_TYPES } from './fileTypes'
import { pickFiles } from './pickFiles'

export interface Point {
  x: number
  y: number
}

/** Creates a folder and immediately enters rename mode on it. */
export async function createFolderAndRename(parentId: string): Promise<void> {
  const node = await dispatch<FsNode>('fs.createFolder', { parentId })
  useUi.getState().select([node.id])
  useUi.getState().setRenaming(node.id)
}

/** Creates a file of the given type and opens it in the editor. */
export async function createFileAndOpen(parentId: string, typeId = 'note'): Promise<void> {
  const node = await dispatch<FsNode>('fs.createFile', { parentId, type: typeId })
  await dispatch('ui.open', { id: node.id })
}

/** Imports files and, when they land on the desktop, lets Sky suggest where they belong. */
export async function importFiles(parentId: string, files: File[], ctx?: CommandContext): Promise<FsNode[]> {
  if (!files.length) return []
  const created = await dispatch<FsNode[]>('fs.import', { parentId, files }, ctx)
  if (parentId === ROOT_ID && created.length) void suggestPlacement(created)
  return created
}

export function importInto(parentId: string): void {
  void pickFiles().then((files) => void importFiles(parentId, files))
}

export function fileTypeMenu(parentId: string): MenuItem[] {
  return [
    { type: 'label', label: 'Nuevo archivo' },
    ...FILE_TYPES.map<MenuItem>((t) => ({
      label: t.label,
      shortcut: `.${t.ext}`,
      onSelect: () => void createFileAndOpen(parentId, t.id),
    })),
  ]
}

export function widgetMenu(): MenuItem[] {
  return [
    { type: 'label', label: 'Añadir widget' },
    ...USER_WIDGET_TYPES.map<MenuItem>((t) => ({
      label: WIDGET_META[t].label,
      onSelect: () => void dispatch('widgets.create', { type: t }),
    })),
  ]
}

/** Either the way in to a folder's memory or the way to give it one; a folder is only ever in one of the two. */
async function projectItem(folderId: string): Promise<MenuItem[]> {
  if (folderId === ROOT_ID) return []
  const file = await projectFile(folderId)
  return [
    { type: 'separator' },
    file
      ? { label: 'Abrir memoria del proyecto', onSelect: () => void dispatch('ui.open', { id: file.id }) }
      : { label: 'Convertir en proyecto', onSelect: () => void dispatch('project.start', { folderId }) },
  ]
}

export async function folderMenu(parentId: string, at?: Point): Promise<MenuItem[]> {
  const items: MenuItem[] = [
    { label: 'Nueva carpeta', onSelect: () => void createFolderAndRename(parentId) },
    { label: 'Nueva nota', onSelect: () => void createFileAndOpen(parentId, 'note') },
    {
      label: 'Nuevo archivo…',
      onSelect: () => {
        if (at) useUi.getState().openMenu(at.x, at.y, fileTypeMenu(parentId))
        else void createFileAndOpen(parentId, 'text')
      },
    },
  ]
  if (parentId === ROOT_ID && at) {
    items.push({ label: 'Añadir widget…', onSelect: () => useUi.getState().openMenu(at.x, at.y, widgetMenu()) })
  }
  if (isAiConfigured()) {
    items.push({ type: 'separator' }, { label: 'Resumir contenido con Sky', onSelect: () => void runTask(() => summarizeFolder(parentId)) })
  }
  items.push({ type: 'separator' }, { label: 'Importar archivos…', onSelect: () => importInto(parentId) })
  items.push(...(await projectItem(parentId)))
  return items
}

function transformMenu(node: FsNode): MenuItem[] {
  return [
    { type: 'label', label: `Transformar "${node.name}"` },
    ...TRANSFORM_PRESETS.map<MenuItem>((p) => ({
      label: p.label,
      onSelect: () => void runTask(() => transformFile(node.id, p.instruction, p.label)),
    })),
    { type: 'separator' },
    {
      label: 'Otra instrucción…',
      onSelect: async () => {
        const instruction = await useDialog.getState().ask({
          title: `¿Qué hacer con "${node.name}"?`,
          description: 'Sky te mostrará el resultado antes de tocar el archivo.',
          placeholder: 'Por ejemplo: conviértelo en una lista de pendientes',
          confirmLabel: 'Transformar',
        })
        if (instruction) void runTask(() => transformFile(node.id, instruction, 'Transformar'))
      },
    },
  ]
}

/** Puts the selection in the command bar; says so when none of it is readable. */
async function attachSelection(ids: string[]): Promise<void> {
  const count = await attachNodesToSky(ids)
  if (!count) useToasts.getState().push({ message: 'Sky no puede leer estos archivos directamente; funciona con textos, imágenes y PDF.', kind: 'error' })
}

async function runTask(task: () => Promise<unknown>): Promise<void> {
  try {
    await task()
  } catch (err) {
    useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo iniciar la tarea', kind: 'error' })
  }
}

export async function nodeMenu(node: FsNode, ids: string[], at?: Point): Promise<MenuItem[]> {
  const many = ids.length > 1
  const items: MenuItem[] = []
  if (!many) {
    items.push({ label: 'Abrir', shortcut: 'Enter', onSelect: () => void dispatch('ui.open', { id: node.id }) })
    items.push({ label: 'Renombrar', shortcut: 'F2', onSelect: () => useUi.getState().setRenaming(node.id) })
    if (isAiConfigured()) {
      const kind = fileKind(node)
      const aiItems: MenuItem[] = []
      if (kind === 'folder') aiItems.push({ label: 'Resumir contenido con Sky', onSelect: () => void runTask(() => summarizeFolder(node.id)) })
      if (kind === 'text') {
        aiItems.push({
          label: 'Transformar con Sky…',
          onSelect: () => {
            if (at) useUi.getState().openMenu(at.x, at.y, transformMenu(node))
          },
        })
      }
      if (canAttach(node)) aiItems.push({ label: 'Pedir a Sky sobre este archivo…', onSelect: () => void attachSelection([node.id]) })
      if (aiItems.length) items.push({ type: 'separator' }, ...aiItems)
    }
    if (node.kind === 'folder') items.push(...(await projectItem(node.id)))
    items.push({ type: 'separator' })
  } else if (isAiConfigured()) {
    items.push(
      { type: 'label', label: `${ids.length} elementos seleccionados` },
      { label: 'Pedir a Sky con estos archivos…', onSelect: () => void attachSelection(ids) },
      { label: 'Sintetizar en un documento', onSelect: () => void runTask(() => synthesizeFiles(ids)) },
      { label: 'Extraer pendientes', onSelect: () => void runTask(() => tasksFromFiles(ids)) },
      { type: 'separator' },
    )
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
