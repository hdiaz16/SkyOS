import { registerCommand } from '../commands'
import { fs } from '../fs'
import { ROOT_ID, fileKind, type FileKind, type FsNode } from '../types'
import { formatBytes } from '../../lib/utils'
import { textOf } from '../../system/extract'

/** Compact node description for the model: no internal fields, sizes already formatted. */
export interface NodeSummary {
  id: string
  name: string
  kind: 'folder' | 'file'
  type?: FileKind
  size?: string
  updatedAt: string
}

/**
 * The clock the person is looking at. toISOString is UTC, so a file saved in Mexico at eight in the evening
 * reached the model as two in the morning of the next day: Sky answered that it had been edited today when it
 * was last night, and «lo que toqué ayer» came out sorted wrong.
 */
const localStamp = (ms: number): string => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function summarizeNode(n: FsNode): NodeSummary {
  return {
    id: n.id,
    name: n.name,
    kind: n.kind,
    type: n.kind === 'file' ? fileKind(n) : undefined,
    size: n.kind === 'file' ? formatBytes(n.size) : undefined,
    updatedAt: localStamp(n.updatedAt),
  }
}

async function folderName(id: string): Promise<string> {
  return id === ROOT_ID ? 'Escritorio' : (await fs.get(id))?.name ?? 'Carpeta'
}

registerCommand<{ parentId?: string }, { folder: string; items: NodeSummary[] }>({
  id: 'fs.list',
  title: 'Listar carpeta',
  description: 'Lista el contenido de una carpeta. Usa "root" para el escritorio.',
  params: { parentId: { type: 'string', description: 'Id de la carpeta. "root" es el escritorio.' } },
  async run({ parentId = ROOT_ID }) {
    // Any id used to pass: a deleted folder answered «está vacía» and a file answered the same thing about
    // itself. Both are things Sky then said out loud.
    if (parentId !== ROOT_ID) {
      const folder = await fs.get(parentId)
      if (!folder) throw new Error('Esa carpeta ya no existe')
      if (folder.kind !== 'folder') throw new Error('Eso es un archivo, no una carpeta; usa fs.read')
    }
    const items = await fs.list(parentId)
    return { result: { folder: await folderName(parentId), items: items.map(summarizeNode) } }
  },
})

interface TreeNode {
  id: string
  name: string
  files: number
  folders: TreeNode[]
}

async function buildTree(id: string, name: string, depth: number): Promise<TreeNode> {
  const children = await fs.list(id)
  const files = children.filter((c) => c.kind === 'file').length
  const folders =
    depth > 0
      ? await Promise.all(children.filter((c) => c.kind === 'folder').map((c) => buildTree(c.id, c.name, depth - 1)))
      : []
  return { id, name, files, folders }
}

registerCommand<{ depth?: number }, TreeNode>({
  id: 'fs.overview',
  title: 'Vista general',
  description: 'Árbol de carpetas desde el escritorio con el número de archivos de cada una. Úsalo antes de organizar.',
  params: { depth: { type: 'number', description: 'Profundidad máxima, de 1 a 4. Por defecto 3.' } },
  async run({ depth = 3 }) {
    return { result: await buildTree(ROOT_ID, 'Escritorio', Math.min(Math.max(depth, 1), 4)) }
  },
})

registerCommand<{ id: string; maxChars?: number }, unknown>({
  id: 'fs.read',
  title: 'Leer archivo',
  description:
    'Lee un archivo: texto tal cual, y PDF, Word, Excel o PowerPoint por su texto extraído. Imágenes y otros binarios devuelven solo metadatos.',
  params: {
    id: { type: 'string', description: 'Id del archivo.', required: true },
    maxChars: { type: 'number', description: 'Máximo de caracteres a devolver.' },
  },
  async run({ id, maxChars = 20000 }) {
    const node = await fs.get(id)
    if (!node) throw new Error('El archivo ya no existe')
    if (node.kind === 'folder') throw new Error('Es una carpeta; usa fs.list')
    const type = fileKind(node)
    const text = await textOf(node)
    if (text === null) {
      return { result: { name: node.name, type, size: formatBytes(node.size), note: 'Archivo binario (imagen u otro formato) sin texto que leer.' } }
    }
    const limit = Math.max(200, Math.min(maxChars, 200000))
    return {
      result: {
        name: node.name,
        type,
        chars: text.length,
        truncated: text.length > limit,
        content: text.slice(0, limit),
        ...(type !== 'text' ? { note: text.trim() ? 'Texto extraído del documento.' : 'El documento no tiene texto legible (quizá es un escaneo).' } : {}),
      },
    }
  },
})

registerCommand<{ query: string }, NodeSummary[]>({
  id: 'fs.find',
  title: 'Buscar por nombre',
  description: 'Busca archivos y carpetas cuyo nombre contenga el texto dado.',
  params: { query: { type: 'string', description: 'Texto a buscar en los nombres.', required: true } },
  async run({ query }) {
    return { result: (await fs.search(query, 30)).map(summarizeNode) }
  },
})

interface ReadManyItem {
  id: string
  name: string
  type: FileKind
  text?: string
  note?: string
}

registerCommand<{ ids: string[]; maxCharsEach?: number }, ReadManyItem[]>({
  id: 'fs.readMany',
  title: 'Leer varios archivos',
  description:
    'Lee hasta 12 archivos de una vez (texto y documentos). Prefiérelo a fs.read uno por uno para resumir o comparar una selección.',
  params: {
    ids: { type: 'array', items: { type: 'string', description: 'Id' }, description: 'Ids de los archivos.', required: true },
    maxCharsEach: { type: 'number', description: 'Máximo de caracteres por archivo.' },
  },
  async run({ ids, maxCharsEach = 4000 }) {
    const out: ReadManyItem[] = []
    // Twelve at a time, and the rest used to be dropped in silence: «resume estos 20 documentos» came back as a
    // summary of twelve, written as if it were of twenty. What was left out is named, so it can be asked for.
    for (const id of ids.slice(12)) {
      out.push({ id, name: '?', type: 'text', note: 'No lo leí: solo caben 12 por llamada. Pídelo en otra tanda.' })
    }
    for (const id of ids.slice(0, 12)) {
      const node = await fs.get(id)
      if (!node) {
        out.push({ id, name: '?', type: 'text', note: 'Ya no existe.' })
        continue
      }
      const type = fileKind(node)
      if (type === 'folder') {
        out.push({ id, name: node.name, type, note: 'Es una carpeta; usa fs.list.' })
        continue
      }
      const text = await textOf(node)
      if (text === null) {
        out.push({ id, name: node.name, type, note: `Archivo binario (${formatBytes(node.size)}) sin texto que leer.` })
        continue
      }
      out.push({ id, name: node.name, type, text: text.length > maxCharsEach ? `${text.slice(0, maxCharsEach)}\n…[recortado: ${text.length - maxCharsEach} caracteres más]` : text })
    }
    return { result: out }
  },
})

registerCommand<{ id: string }, unknown>({
  id: 'fs.info',
  title: 'Detalles',
  description: 'Metadatos de un archivo o carpeta y su ruta completa.',
  params: { id: { type: 'string', description: 'Id del elemento.', required: true } },
  async run({ id }) {
    const node = await fs.get(id)
    if (!node) throw new Error('El elemento ya no existe')
    const path = await fs.path(id)
    return {
      result: {
        ...summarizeNode(node),
        path: ['Escritorio', ...path.map((p) => p.name)].join(' / '),
        parentId: node.parentId,
        createdAt: localStamp(node.createdAt),
      },
    }
  },
})
