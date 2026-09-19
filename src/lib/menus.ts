import { dispatch, useToasts, type CommandContext } from '../kernel/commands'
import { fs } from '../kernel/fs'
import { projectFile } from '../kernel/project'
import { ROOT_ID, fileKind, type FsNode } from '../kernel/types'
import { USER_WIDGET_TYPES, WIDGET_META } from '../kernel/widgets'
import { useUi, DESKTOP_SURFACE } from '../state/ui'
import type { MenuItem } from '../state/ui'
import { useDialog } from '../state/dialog'
import { isAiConfigured } from '../ai/settings'
import { summarizeFolder, synthesizeFiles, tasksFromFiles, TRANSFORM_PRESETS, transformFile } from '../ai/tasks'
import { suggestPlacement } from '../ai/classify'
import { attachNodesToSky, canAttach } from '../ai/attachments'
import { FILE_TYPES } from './fileTypes'
import { pickFiles } from './pickFiles'
import { formatBytes } from './utils'

export interface Point {
  x: number
  y: number
}

/** Creates a folder and immediately enters rename mode on it, on the surface that asked. */
export async function createFolderAndRename(parentId: string, surface = DESKTOP_SURFACE): Promise<void> {
  const node = await dispatch<FsNode>('fs.createFolder', { parentId })
  useUi.getState().select([node.id], surface)
  useUi.getState().setRenaming(node.id, surface)
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

export async function folderMenu(parentId: string, at?: Point, surface = DESKTOP_SURFACE): Promise<MenuItem[]> {
  const items: MenuItem[] = [
    { label: 'Nueva carpeta', onSelect: () => void createFolderAndRename(parentId, surface) },
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

/** A folder for the selection, named on the spot; it appears selected where the selection was. */
async function groupSelection(ids: string[], surface: string): Promise<void> {
  const name = await useDialog.getState().ask({
    title: 'Agrupar en una carpeta',
    description: `${ids.length} elementos pasan a una carpeta nueva, junto a donde están. Se puede deshacer.`,
    placeholder: 'Nombre de la carpeta',
    confirmLabel: 'Agrupar',
  })
  if (name === null) return
  const folder = await dispatch<FsNode>('fs.group', { ids, name })
  useUi.getState().select([folder.id], surface)
}

/** Tags for one or many, replacing what there was; each file keeps its own undo entry. */
async function tagSelection(ids: string[]): Promise<void> {
  const current = ids.length === 1 ? ((await fs.get(ids[0]))?.tags ?? []).join(' ') : ''
  const raw = await useDialog.getState().ask({
    title: ids.length === 1 ? 'Etiquetas' : `Etiquetas para ${ids.length} elementos`,
    description: 'Palabras cortas, separadas por espacios o comas. Reemplazan las que había.',
    placeholder: 'factura 2026 pendiente',
    initialValue: current,
    confirmLabel: 'Guardar',
  })
  if (raw === null) return
  const tags = raw.split(/[\s,]+/).filter(Boolean)
  for (const id of ids) await dispatch('fs.setTags', { id, tags })
}

const KIND_LABEL: Record<ReturnType<typeof fileKind>, string> = {
  folder: 'Carpeta',
  text: 'Texto',
  image: 'Imagen',
  pdf: 'PDF',
  document: 'Documento',
  spreadsheet: 'Hoja de cálculo',
  presentation: 'Presentación',
  canvas: 'Lienzo',
  other: 'Archivo',
}

const fmtDate = (ms: number) => new Date(ms).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

async function whereIs(parentId: string): Promise<string> {
  if (parentId === ROOT_ID) return 'Escritorio'
  const chain = await fs.path(parentId)
  return ['Escritorio', ...chain.map((p) => p.name)].join(' › ')
}

/** Everything that can be said about the selection without opening anything: what, how big, where, when. */
async function showProperties(ids: string[]): Promise<void> {
  const nodes = (await Promise.all(ids.map((id) => fs.get(id)))).filter((n): n is FsNode => !!n)
  if (!nodes.length) return
  const lines: string[] = []
  if (nodes.length === 1) {
    const n = nodes[0]
    lines.push(`Tipo: ${KIND_LABEL[fileKind(n)]}`)
    if (n.kind === 'file') lines.push(`Tamaño: ${formatBytes(n.size)}`)
    else {
      const inside = await fs.list(n.id)
      lines.push(`Contiene: ${inside.length} ${inside.length === 1 ? 'elemento' : 'elementos'}`)
    }
    lines.push(`Ubicación: ${await whereIs(n.parentId)}`)
    lines.push(`Creado: ${fmtDate(n.createdAt)}`, `Modificado: ${fmtDate(n.updatedAt)}`)
    if (n.tags?.length) lines.push(`Etiquetas: ${n.tags.map((t) => `#${t}`).join(' ')}`)
  } else {
    const files = nodes.filter((n) => n.kind === 'file')
    const folders = nodes.length - files.length
    lines.push(`${files.length} ${files.length === 1 ? 'archivo' : 'archivos'}${folders ? ` y ${folders} ${folders === 1 ? 'carpeta' : 'carpetas'}` : ''}`)
    if (files.length) lines.push(`Tamaño de los archivos: ${formatBytes(files.reduce((sum, n) => sum + n.size, 0))}`)
    const kinds = new Map<string, number>()
    for (const n of nodes) kinds.set(KIND_LABEL[fileKind(n)], (kinds.get(KIND_LABEL[fileKind(n)]) ?? 0) + 1)
    lines.push(`Tipos: ${[...kinds].map(([k, c]) => `${k} (${c})`).join(', ')}`)
    lines.push(`Último cambio: ${fmtDate(Math.max(...nodes.map((n) => n.updatedAt)))}`)
    const parents = new Set(nodes.map((n) => n.parentId))
    lines.push(parents.size === 1 ? `Ubicación: ${await whereIs(nodes[0].parentId)}` : `Ubicación: en ${parents.size} carpetas distintas`)
  }
  await useDialog.getState().confirm({ title: nodes.length === 1 ? nodes[0].name : 'Propiedades de la selección', description: lines.join('\n'), confirmLabel: 'Listo', info: true })
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

export async function nodeMenu(node: FsNode, ids: string[], at?: Point, surface = DESKTOP_SURFACE): Promise<MenuItem[]> {
  const many = ids.length > 1
  const items: MenuItem[] = []
  if (!many) {
    items.push({ label: 'Abrir', shortcut: 'Enter', onSelect: () => void dispatch('ui.open', { id: node.id }) })
    items.push({ label: 'Renombrar', shortcut: 'F2', onSelect: () => useUi.getState().setRenaming(node.id, surface) })
    items.push({ label: 'Etiquetar…', onSelect: () => void tagSelection([node.id]) })
    items.push({ label: 'Propiedades', onSelect: () => void showProperties([node.id]) })
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
  } else {
    // What a group of files needs done to it as a group. Before, several selected files only ever got Sky
    // and the trash: no way to put them in a folder together, tag them at once or see what they add up to.
    items.push({ type: 'label', label: `${ids.length} elementos seleccionados` })
    if (ids.length <= 6) {
      items.push({
        label: 'Abrir todos',
        onSelect: () => {
          for (const id of ids) void dispatch('ui.open', { id })
        },
      })
    }
    items.push({ label: 'Agrupar en una carpeta…', onSelect: () => void groupSelection(ids, surface) })
    items.push({ label: 'Etiquetar…', onSelect: () => void tagSelection(ids) })
    items.push({ label: 'Propiedades', onSelect: () => void showProperties(ids) })
    if (isAiConfigured()) {
      items.push(
        { type: 'separator' },
        { label: 'Pedir a Sky con estos archivos…', onSelect: () => void attachSelection(ids) },
        { label: 'Sintetizar en un documento', onSelect: () => void runTask(() => synthesizeFiles(ids)) },
        { label: 'Extraer pendientes', onSelect: () => void runTask(() => tasksFromFiles(ids)) },
      )
    }
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
