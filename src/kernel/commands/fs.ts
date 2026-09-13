import { registerCommand } from '../commands'
import { fs } from '../fs'
import { ROOT_ID, extOf, type FsNode } from '../types'
import { useWindows } from '../../state/windows'
import { FILE_TYPE_IDS, fileTypeById } from '../../lib/fileTypes'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

registerCommand<{ parentId?: string; name?: string }, FsNode>({
  id: 'fs.createFolder',
  title: 'Nueva carpeta',
  description: 'Crea una carpeta vacía dentro de otra carpeta. Usa "root" como parentId para el escritorio.',
  params: {
    parentId: { type: 'string', description: 'Carpeta destino. "root" es el escritorio.' },
    name: { type: 'string', description: 'Nombre de la carpeta.' },
  },
  async run({ parentId = ROOT_ID, name = 'Nueva carpeta' }) {
    const node = await fs.createFolder(parentId, name)
    return { result: node, label: `Carpeta "${node.name}" creada`, undo: () => fs.trash([node.id]) }
  },
})

registerCommand<{ parentId?: string; type?: string; name?: string; content?: string }, FsNode>({
  id: 'fs.createFile',
  title: 'Nuevo archivo',
  description:
    'Crea un archivo de texto de un tipo dado (note = Markdown, text, csv, json, html, script) con contenido opcional.',
  params: {
    parentId: { type: 'string', description: 'Carpeta destino. "root" es el escritorio.' },
    type: { type: 'string', description: 'Tipo de archivo.', enum: FILE_TYPE_IDS },
    name: { type: 'string', description: 'Nombre. Si no tiene extensión se agrega la del tipo.' },
    content: { type: 'string', description: 'Contenido inicial. Si se omite se usa una plantilla mínima.' },
  },
  async run({ parentId = ROOT_ID, type, name, content }) {
    const ft = fileTypeById(type)
    const base = (name ?? ft.defaultName).trim() || ft.defaultName
    const finalName = extOf(base) ? base : `${base}.${ft.ext}`
    const blob = new Blob([content ?? ft.template], { type: ft.mime })
    const node = await fs.createFile(parentId, finalName, blob, ft.mime)
    return { result: node, label: `Se creó "${node.name}"`, undo: () => fs.trash([node.id]) }
  },
})

registerCommand<{ id: string; name: string }, string>({
  id: 'fs.rename',
  title: 'Renombrar',
  description: 'Cambia el nombre de un archivo o carpeta.',
  params: {
    id: { type: 'string', description: 'Id del elemento.', required: true },
    name: { type: 'string', description: 'Nuevo nombre.', required: true },
  },
  async run({ id, name }) {
    const before = await fs.get(id)
    if (!before) throw new Error('El elemento ya no existe')
    if (before.name === name.trim()) return { result: before.name }
    const after = await fs.rename(id, name)
    return {
      result: after,
      label: `"${before.name}" ahora se llama "${after}"`,
      undo: async () => {
        await fs.rename(id, before.name)
      },
    }
  },
})

registerCommand<{ ids: string[]; targetParentId: string }, void>({
  id: 'fs.move',
  title: 'Mover',
  description: 'Mueve uno o varios elementos a otra carpeta.',
  params: {
    ids: { type: 'array', items: { type: 'string', description: 'Id' }, description: 'Ids a mover.', required: true },
    targetParentId: { type: 'string', description: 'Carpeta destino. "root" es el escritorio.', required: true },
  },
  async run({ ids, targetParentId }) {
    const previous = await fs.move(ids, targetParentId)
    const moved = Object.keys(previous)
    if (!moved.length) return { result: undefined }
    const target = targetParentId === ROOT_ID ? 'el escritorio' : `"${(await fs.get(targetParentId))?.name ?? 'carpeta'}"`
    const first = await fs.get(moved[0])
    const label =
      moved.length === 1
        ? `"${first?.name ?? 'Elemento'}" movido a ${target}`
        : `${moved.length} elementos movidos a ${target}`
    return {
      result: undefined,
      label,
      undo: async () => {
        for (const id of moved) await fs.move([id], previous[id])
      },
    }
  },
})

registerCommand<{ ids: string[] }, void>({
  id: 'fs.trash',
  title: 'Mover a la papelera',
  description: 'Envía elementos a la papelera. Se pueden restaurar después.',
  params: {
    ids: { type: 'array', items: { type: 'string', description: 'Id' }, description: 'Ids a enviar a la papelera.', required: true },
  },
  async run({ ids }) {
    if (!ids.length) return { result: undefined }
    const first = await fs.get(ids[0])
    await fs.trash(ids)
    const wm = useWindows.getState()
    for (const id of ids) wm.closeForNode(id)
    const label =
      ids.length === 1
        ? `"${first?.name ?? 'Elemento'}" enviado a la papelera`
        : `${ids.length} elementos enviados a la papelera`
    return { result: undefined, label, undo: () => fs.restore(ids) }
  },
})

registerCommand<{ ids: string[] }, void>({
  id: 'fs.restore',
  title: 'Restaurar',
  description: 'Saca elementos de la papelera y los devuelve a su carpeta original.',
  params: {
    ids: { type: 'array', items: { type: 'string', description: 'Id' }, description: 'Ids a restaurar.', required: true },
  },
  async run({ ids }) {
    if (!ids.length) return { result: undefined }
    const first = await fs.get(ids[0])
    await fs.restore(ids)
    const label =
      ids.length === 1 ? `"${first?.name ?? 'Elemento'}" restaurado` : `${ids.length} elementos restaurados`
    return { result: undefined, label, undo: () => fs.trash(ids) }
  },
})

registerCommand<{ ids: string[] }, void>({
  id: 'fs.purge',
  title: 'Eliminar definitivamente',
  description: 'Borra elementos para siempre. No se puede deshacer.',
  ai: false,
  params: {
    ids: { type: 'array', items: { type: 'string', description: 'Id' }, description: 'Ids a borrar.', required: true },
  },
  async run({ ids }) {
    await fs.purge(ids)
    return { result: undefined, label: `${ids.length} ${plural(ids.length, 'elemento eliminado', 'elementos eliminados')}` }
  },
})

registerCommand<Record<string, never>, number>({
  id: 'fs.emptyTrash',
  title: 'Vaciar papelera',
  description: 'Borra todo lo que hay en la papelera. No se puede deshacer.',
  ai: false,
  params: {},
  async run() {
    const n = await fs.emptyTrash()
    return { result: n, label: n ? `Papelera vaciada (${n})` : 'La papelera ya estaba vacía' }
  },
})

registerCommand<{ parentId?: string; files: File[] }, FsNode[]>({
  id: 'fs.import',
  title: 'Importar archivos',
  description: 'Importa archivos del dispositivo del usuario.',
  ai: false,
  params: {},
  async run({ parentId = ROOT_ID, files }) {
    const created: FsNode[] = []
    for (const file of files) created.push(await fs.createFile(parentId, file.name, file, file.type))
    if (!created.length) return { result: created }
    const label =
      created.length === 1 ? `"${created[0].name}" importado` : `${created.length} archivos importados`
    return { result: created, label, undo: () => fs.trash(created.map((n) => n.id)) }
  },
})

registerCommand<{ id: string; content: string }, void>({
  id: 'fs.writeText',
  title: 'Escribir contenido',
  description: 'Reemplaza el contenido completo de un archivo de texto.',
  params: {
    id: { type: 'string', description: 'Id del archivo.', required: true },
    content: { type: 'string', description: 'Nuevo contenido completo.', required: true },
  },
  async run({ id, content }) {
    const node = await fs.get(id)
    if (!node) throw new Error('El archivo ya no existe')
    const before = await fs.readText(id)
    await fs.writeText(id, content)
    return {
      result: undefined,
      label: `"${node.name}" actualizado`,
      undo: () => fs.writeText(id, before),
    }
  },
})
