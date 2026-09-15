import { registerCommand, type ParamSpec } from '../commands'
import { fs } from '../fs'
import { ROOT_ID, extOf, type FsNode } from '../types'
import { appendBlocks, CANVAS_EXT, CANVAS_MIME, emptyCanvas, isBlockKind, parseCanvas, serializeCanvas, type BlockKind, type CanvasBlock, type CanvasDoc, type NewBlock } from '../canvas'
import { useWindows } from '../../state/windows'

/**
 * Text-to-UI: Sky builds and edits canvases (.canvas) from a sentence. Every change is journaled and undoable.
 */

const CANVAS_WORDS = [
  'lienzo', 'lienzos', 'canvas', 'pizarra', 'tablero', 'diagrama', 'diagramas', 'mermaid', 'esquema', 'mapa mental', 'mind map', 'flujo',
  'organigrama', 'cronograma', 'gantt', 'bloque', 'bloques', 'dashboard', 'panel visual', 'kanban', 'secuencia', 'arquitectura', 'visual',
]

const BLOCK_HELP =
  'Cada bloque: kind "markdown" (notas, listas, tablas GFM), "mermaid" (flowchart, sequenceDiagram, gantt, mindmap, pie, classDiagram, stateDiagram…; solo el código del diagrama, sin ```), o "html" (componente aislado con su CSS y JS inline, sin recursos externos). title opcional; w y h en píxeles opcionales (por defecto 360×240 nota, 520×360 diagrama, 420×300 html).'

interface BlockInput {
  kind: BlockKind
  content: string
  title?: string
  w?: number
  h?: number
}

const blocksParam: ParamSpec = {
  type: 'array',
  description: `Bloques a colocar. ${BLOCK_HELP}`,
  items: { type: 'object', description: 'Bloque {kind, content, title?, w?, h?}.' },
}

const validBlocks = (blocks: unknown): NewBlock[] =>
  (Array.isArray(blocks) ? blocks : []).filter((b): b is BlockInput => !!b && typeof b === 'object' && isBlockKind((b as BlockInput).kind) && typeof (b as BlockInput).content === 'string')

async function readCanvas(id: string): Promise<{ node: FsNode; doc: CanvasDoc }> {
  const node = await fs.get(id)
  if (!node || node.kind !== 'file' || extOf(node.name) !== CANVAS_EXT) throw new Error('Ese archivo no es un lienzo (.canvas)')
  return { node, doc: parseCanvas(await fs.readText(id)) }
}

const write = (id: string, doc: CanvasDoc) => fs.writeText(id, serializeCanvas(doc))

const plural = (n: number) => `${n} bloque${n === 1 ? '' : 's'}`

registerCommand<{ name?: string; parentId?: string; blocks?: BlockInput[]; open?: boolean }, { id: string; name: string; blockIds: string[] }>({
  id: 'canvas.create',
  risk: 'write',
  title: 'Crear lienzo',
  description: `Crea un lienzo (.canvas): un tablero libre donde conviven notas en Markdown, tablas, diagramas Mermaid y bloques HTML, y lo abre. Úsalo cuando pidan un plan visual, un esquema, un diagrama, un tablero o un "lienzo"; entrega los bloques ya listos. ${BLOCK_HELP}`,
  params: {
    name: { type: 'string', description: 'Nombre del lienzo (sin extensión está bien).' },
    parentId: { type: 'string', description: 'Carpeta destino; "root" es el escritorio. Por defecto la carpeta activa o el escritorio.' },
    blocks: blocksParam,
    open: { type: 'boolean', description: 'Abrirlo en una ventana (por defecto sí).' },
  },
  keywords: CANVAS_WORDS,
  async run({ name, parentId = ROOT_ID, blocks, open = true }) {
    const base = (name ?? 'Lienzo').trim() || 'Lienzo'
    const finalName = extOf(base) === CANVAS_EXT ? base : `${base}.${CANVAS_EXT}`
    const { doc, ids } = appendBlocks(emptyCanvas(), validBlocks(blocks))
    const node = await fs.createFile(parentId, finalName, new Blob([serializeCanvas(doc)], { type: CANVAS_MIME }), CANVAS_MIME)
    if (open) useWindows.getState().open('canvas', { title: node.name, props: { nodeId: node.id } })
    return { result: { id: node.id, name: node.name, blockIds: ids }, label: `Lienzo "${node.name}" creado`, undo: { commandId: 'fs.trash', params: { ids: [node.id] } } }
  },
})

registerCommand<{ id: string; blocks: BlockInput[] }, { blockIds: string[] }>({
  id: 'canvas.addBlocks',
  risk: 'write',
  title: 'Añadir bloques a un lienzo',
  description: `Coloca bloques nuevos en un lienzo existente (el archivo activo, normalmente); se acomodan solos en filas. ${BLOCK_HELP}`,
  params: {
    id: { type: 'string', description: 'Id del archivo .canvas.', required: true },
    blocks: { ...blocksParam, required: true },
  },
  keywords: CANVAS_WORDS,
  async run({ id, blocks }) {
    const { node, doc } = await readCanvas(id)
    const items = validBlocks(blocks)
    if (!items.length) throw new Error('No hay bloques válidos que añadir')
    const next = appendBlocks(doc, items)
    await write(id, next.doc)
    return {
      result: { blockIds: next.ids },
      label: `${plural(items.length)} en "${node.name}"`,
      undo: { commandId: 'canvas.apply', params: { id, remove: next.ids } },
    }
  },
})

registerCommand<{ id: string; remove?: string[]; put?: CanvasBlock[] }, void>({
  id: 'canvas.apply',
  risk: 'write',
  title: 'Rehacer bloques de un lienzo',
  description: 'Quita bloques por id y devuelve otros tal como estaban.',
  // The written inverse of every canvas edit: taking blocks out and putting blocks back is all three of them.
  ai: false,
  params: {},
  async run({ id, remove, put }) {
    const gone = new Set(remove ?? [])
    const back = new Map((put ?? []).map((b) => [b.id, b]))
    const current = parseCanvas(await fs.readText(id))
    const blocks = current.blocks.filter((b) => !gone.has(b.id)).map((b) => back.get(b.id) ?? b)
    for (const b of back.values()) if (!blocks.some((x) => x.id === b.id)) blocks.push(b)
    await write(id, { version: 1, blocks })
    return { result: undefined }
  },
})

registerCommand<{ id: string; blockId: string; content?: string; title?: string; kind?: BlockKind }, void>({
  id: 'canvas.updateBlock',
  risk: 'write',
  title: 'Cambiar un bloque del lienzo',
  description: 'Reemplaza el contenido, el título o el tipo de un bloque existente (ids con canvas.read).',
  params: {
    id: { type: 'string', description: 'Id del archivo .canvas.', required: true },
    blockId: { type: 'string', description: 'Id del bloque.', required: true },
    content: { type: 'string', description: 'Nuevo contenido completo.' },
    title: { type: 'string', description: 'Nuevo título.' },
    kind: { type: 'string', description: 'Nuevo tipo.', enum: ['markdown', 'mermaid', 'html'] },
  },
  keywords: CANVAS_WORDS,
  async run({ id, blockId, content, title, kind }) {
    const { node, doc } = await readCanvas(id)
    const before = doc.blocks.find((b) => b.id === blockId)
    if (!before) throw new Error('Ese bloque ya no está en el lienzo')
    const after: CanvasBlock = {
      ...before,
      ...(content !== undefined ? { content } : {}),
      ...(title !== undefined ? { title: title.trim() || undefined } : {}),
      ...(kind && isBlockKind(kind) ? { kind } : {}),
    }
    await write(id, { version: 1, blocks: doc.blocks.map((b) => (b.id === blockId ? after : b)) })
    return {
      result: undefined,
      label: `Bloque actualizado en "${node.name}"`,
      undo: { commandId: 'canvas.apply', params: { id, put: [before] } },
    }
  },
})

registerCommand<{ id: string; blockId: string }, void>({
  id: 'canvas.removeBlock',
  risk: 'write',
  title: 'Quitar un bloque del lienzo',
  description: 'Quita un bloque del lienzo (ids con canvas.read).',
  params: {
    id: { type: 'string', description: 'Id del archivo .canvas.', required: true },
    blockId: { type: 'string', description: 'Id del bloque.', required: true },
  },
  keywords: CANVAS_WORDS,
  async run({ id, blockId }) {
    const { node, doc } = await readCanvas(id)
    const removed = doc.blocks.find((b) => b.id === blockId)
    if (!removed) throw new Error('Ese bloque ya no está en el lienzo')
    await write(id, { version: 1, blocks: doc.blocks.filter((b) => b.id !== blockId) })
    return {
      result: undefined,
      label: `Bloque quitado de "${node.name}"`,
      undo: { commandId: 'canvas.apply', params: { id, put: [removed] } },
    }
  },
})

registerCommand<{ id: string }, { name: string; blocks: Array<{ id: string; kind: BlockKind; title?: string; content: string }> }>({
  id: 'canvas.read',
  title: 'Leer lienzo',
  description: 'Devuelve los bloques de un lienzo (id, tipo, título y contenido) para modificarlos, resumirlos o continuar el trabajo.',
  params: { id: { type: 'string', description: 'Id del archivo .canvas.', required: true } },
  keywords: CANVAS_WORDS,
  async run({ id }) {
    const { node, doc } = await readCanvas(id)
    return { result: { name: node.name, blocks: doc.blocks.map((b) => ({ id: b.id, kind: b.kind, ...(b.title ? { title: b.title } : {}), content: b.content })) } }
  },
})
