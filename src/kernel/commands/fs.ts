import { registerCommand } from '../commands'
import { fs } from '../fs'
import { ROOT_ID, extOf, type FsNode } from '../types'
import { useWindows } from '../../state/windows'
import { FILE_TYPE_IDS, fileTypeById } from '../../lib/fileTypes'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** Words that make these commands relevant; without one of them in the request, their tools stay home. */
const TRASH_WORDS = ['papelera', 'basura', 'restaura', 'restaurar', 'recupera', 'recuperar', 'vacia', 'vacía', 'vaciar', 'definitivamente', 'para siempre', 'purga', 'purgar', 'borrado', 'borrados', 'eliminado', 'eliminados']

registerCommand<{ parentId?: string; name?: string }, FsNode>({
  id: 'fs.createFolder',
  risk: 'write',
  title: 'Nueva carpeta',
  description: 'Crea una carpeta.',
  params: {
    parentId: { type: 'string', description: 'Carpeta destino. "root" es el escritorio.' },
    name: { type: 'string', description: 'Nombre de la carpeta.' },
  },
  async run({ parentId = ROOT_ID, name = 'Nueva carpeta' }) {
    const node = await fs.createFolder(parentId, name)
    return { result: node, label: `Carpeta "${node.name}" creada`, undo: { commandId: 'fs.trash', params: { ids: [node.id] } } }
  },
})

registerCommand<{ parentId?: string; type?: string; name?: string; content?: string }, FsNode>({
  id: 'fs.createFile',
  risk: 'write',
  title: 'Nuevo archivo',
  description:
    'Crea un archivo con contenido opcional. note = Markdown; también text, csv, json, html, script.',
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
    return { result: node, label: `Se creó "${node.name}"`, undo: { commandId: 'fs.trash', params: { ids: [node.id] } } }
  },
})

registerCommand<{ id: string; name: string }, string>({
  id: 'fs.rename',
  risk: 'write',
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
      undo: { commandId: 'fs.rename', params: { id, name: before.name } },
    }
  },
})

registerCommand<{ ids: string[]; targetParentId: string }, void>({
  id: 'fs.move',
  risk: 'write',
  scale: ({ ids }) => ids?.length ?? 1,
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
    return { result: undefined, label, undo: { commandId: 'fs.moveBack', params: { previous } } }
  },
})

registerCommand<{ previous: Record<string, string> }, void>({
  id: 'fs.moveBack',
  risk: 'write',
  scale: ({ previous }) => Object.keys(previous ?? {}).length,
  title: 'Devolver a su carpeta',
  description: 'Devuelve elementos a la carpeta en la que estaban.',
  // The written inverse of fs.move: each element goes home on its own, which a single destination cannot say.
  ai: false,
  params: {},
  async run({ previous }) {
    let moved = 0
    for (const [id, parentId] of Object.entries(previous ?? {})) {
      if (!(await fs.get(id))) continue
      await fs.move([id], parentId)
      moved++
    }
    if (!moved) throw new Error('eso ya no existe')
    return { result: undefined }
  },
})

registerCommand<{ ids: string[] }, void>({
  id: 'fs.trash',
  risk: 'write',
  scale: ({ ids }) => ids?.length ?? 1,
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
    return { result: undefined, label, undo: { commandId: 'fs.restore', params: { ids } } }
  },
})

registerCommand<{ ids: string[] }, void>({
  id: 'fs.restore',
  risk: 'write',
  scale: ({ ids }) => ids?.length ?? 1,
  keywords: TRASH_WORDS,
  title: 'Restaurar',
  description: 'Saca elementos de la papelera y los devuelve a su carpeta original.',
  params: {
    ids: { type: 'array', items: { type: 'string', description: 'Id' }, description: 'Ids a restaurar.', required: true },
  },
  async run({ ids }) {
    if (!ids.length) return { result: undefined }
    // Emptying the trash leaves entries pointing at nothing. An undo that quietly restores zero files is worse
    // than one that says it came too late.
    const present = (await Promise.all(ids.map((id) => fs.get(id)))).filter((n) => !!n)
    if (!present.length) throw new Error('ya no está en la papelera')
    const alive = present.map((n) => n.id)
    await fs.restore(alive)
    const label =
      alive.length === 1 ? `"${present[0].name}" restaurado` : `${alive.length} elementos restaurados`
    return { result: undefined, label, undo: { commandId: 'fs.trash', params: { ids: alive } } }
  },
})

registerCommand<{ ids: string[] }, void>({
  id: 'fs.purge',
  risk: 'destructive',
  scale: ({ ids }) => ids?.length ?? 1,
  keywords: TRASH_WORDS,
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
  risk: 'destructive',
  keywords: TRASH_WORDS,
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
  risk: 'write',
  scale: ({ files }) => files?.length ?? 1,
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
    return { result: created, label, undo: { commandId: 'fs.trash', params: { ids: created.map((n) => n.id) } } }
  },
})

registerCommand<{ id: string; content: string }, void>({
  id: 'fs.writeText',
  risk: 'write',
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
      undo: { commandId: 'fs.writeText', params: { id, content: before } },
    }
  },
})

registerCommand<{ id: string; tags: string[] }, string[]>({
  id: 'fs.setTags',
  risk: 'write',
  title: 'Etiquetar',
  description: 'Asigna etiquetas a un archivo o carpeta (palabras clave cortas, en minúsculas). Reemplaza las anteriores.',
  params: {
    id: { type: 'string', description: 'Id del elemento.', required: true },
    tags: { type: 'array', items: { type: 'string', description: 'Etiqueta' }, description: 'Etiquetas nuevas.', required: true },
  },
  async run({ id, tags }) {
    const node = await fs.get(id)
    if (!node) throw new Error('El elemento ya no existe')
    const before = node.tags ?? []
    const after = await fs.setTags(id, tags)
    return {
      result: after,
      label: after.length ? `"${node.name}" etiquetado: ${after.join(', ')}` : `Etiquetas de "${node.name}" eliminadas`,
      undo: { commandId: 'fs.setTags', params: { id, tags: before } },
    }
  },
})
