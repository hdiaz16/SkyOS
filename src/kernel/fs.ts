import { nanoid } from 'nanoid'
import { db } from './db'
import { blobs } from './blobs'
import { ROOT_ID, fileKind, mimeFor, type FsNode } from './types'

const now = () => Date.now()

/** Accents are decoration, not identity: whoever types "reunion" is looking for «Reunión con dirección.md». */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function sortNodes(a: FsNode, b: FsNode): number {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })
}

async function requireNode(id: string): Promise<FsNode> {
  const node = await db.nodes.get(id)
  if (!node) throw new Error('El elemento ya no existe')
  return node
}

async function subtreeIds(id: string): Promise<string[]> {
  const out: string[] = [id]
  const queue = [id]
  while (queue.length) {
    const cur = queue.shift()!
    const children = await db.nodes.where('parentId').equals(cur).primaryKeys()
    for (const c of children) {
      out.push(c)
      queue.push(c)
    }
  }
  return out
}

/**
 * The folder something is about to be created in. Creating into an id that is gone, into a file, or into
 * something already in the trash used to succeed quietly and leave the new file nowhere: it existed, and no
 * window could reach it.
 */
async function requireFolder(parentId: string): Promise<void> {
  if (parentId === ROOT_ID) return
  const node = await db.nodes.get(parentId)
  if (!node) throw new Error('Esa carpeta ya no existe')
  if (node.kind !== 'folder') throw new Error('Eso no es una carpeta')
  if (node.trashedAt !== null) throw new Error('Esa carpeta está en la papelera')
}

async function isSameOrDescendant(ancestorId: string, nodeId: string): Promise<boolean> {
  let cur: string | undefined = nodeId
  while (cur && cur !== ROOT_ID) {
    if (cur === ancestorId) return true
    const n: FsNode | undefined = await db.nodes.get(cur)
    cur = n?.parentId
  }
  return false
}

export const fs = {
  get: (id: string) => db.nodes.get(id),

  async list(parentId: string): Promise<FsNode[]> {
    const rows = await db.nodes.where('parentId').equals(parentId).toArray()
    return rows.filter((n) => n.trashedAt === null).sort(sortNodes)
  },

  /** What was thrown away, not what was inside it: a file that went in with its folder is not its own entry. */
  async listTrash(): Promise<FsNode[]> {
    const rows = await db.nodes.filter((n) => n.trashedAt !== null).toArray()
    const inside = new Set(rows.map((n) => n.id))
    return rows.filter((n) => !inside.has(n.parentId)).sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))
  },

  /** Everything in the trash, tops and contents alike: a folder there is one line and may be three hundred files. */
  async trashCount(): Promise<number> {
    return db.nodes.filter((n) => n.trashedAt !== null).count()
  },

  /** Ancestors from the top-level folder down to the node itself. */
  async path(id: string): Promise<FsNode[]> {
    const chain: FsNode[] = []
    let cur = id
    while (cur !== ROOT_ID) {
      const n = await db.nodes.get(cur)
      if (!n) break
      chain.unshift(n)
      cur = n.parentId
    }
    return chain
  },

  async uniqueName(parentId: string, name: string, excludeId?: string): Promise<string> {
    const siblings = await db.nodes.where('parentId').equals(parentId).toArray()
    const taken = new Set(
      siblings.filter((n) => n.trashedAt === null && n.id !== excludeId).map((n) => n.name.toLowerCase()),
    )
    if (!taken.has(name.toLowerCase())) return name
    const dot = name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    for (let i = 2; ; i++) {
      const candidate = `${base} ${i}${ext}`
      if (!taken.has(candidate.toLowerCase())) return candidate
    }
  },

  async createFolder(parentId: string, name: string): Promise<FsNode> {
    await requireFolder(parentId)
    const t = now()
    const node: FsNode = {
      id: nanoid(10),
      parentId,
      name: await fs.uniqueName(parentId, name.trim() || 'Nueva carpeta'),
      kind: 'folder',
      mime: '',
      size: 0,
      createdAt: t,
      updatedAt: t,
      trashedAt: null,
    }
    await db.nodes.add(node)
    return node
  },

  async createFile(parentId: string, name: string, blob: Blob, mime = ''): Promise<FsNode> {
    await requireFolder(parentId)
    const t = now()
    const cleanName = name.trim() || 'Archivo'
    const node: FsNode = {
      id: nanoid(10),
      parentId,
      name: await fs.uniqueName(parentId, cleanName),
      kind: 'file',
      mime: mimeFor(cleanName, mime || blob.type),
      size: blob.size,
      createdAt: t,
      updatedAt: t,
      contentAt: t,
      trashedAt: null,
    }
    await blobs.put(node.id, blob)
    await db.nodes.add(node)
    return node
  },

  createText(parentId: string, name: string, content: string): Promise<FsNode> {
    return fs.createFile(parentId, name, new Blob([content], { type: mimeFor(name) }))
  },

  readBlob: (id: string) => blobs.get(id),

  async readText(id: string): Promise<string> {
    const blob = await blobs.get(id)
    // Returning '' for "the bytes are not there" is how an editor ends up showing an empty document and then
    // saving that emptiness over whatever was really in the file.
    if (!blob) throw new Error('No pude leer el contenido de este archivo')
    return blob.text()
  },

  /** Returns the stamp the file now carries, so whoever wrote can tell its own version from someone else's. */
  async writeBlob(id: string, blob: Blob): Promise<number> {
    const stamp = now()
    await blobs.put(id, blob)
    await db.nodes.update(id, { size: blob.size, updatedAt: stamp, contentAt: stamp })
    return stamp
  },

  async writeText(id: string, content: string): Promise<number> {
    const node = await requireNode(id)
    // Text written over a folder used to go through: the folder ended up with bytes hanging off it and a size,
    // and the toast said «"Trabajo" actualizado». Over a PNG it replaced the image and the viewer stopped
    // opening it. fs.read already refuses the mirror image of this; this side was missing.
    const kind = fileKind(node)
    if (kind !== 'text' && kind !== 'canvas') {
      throw new Error(node.kind === 'folder' ? 'Eso es una carpeta, no un archivo de texto' : 'Eso no es un archivo de texto')
    }
    return fs.writeBlob(id, new Blob([content], { type: node.mime || 'text/plain' }))
  },

  async rename(id: string, name: string): Promise<string> {
    const clean = name.trim()
    if (!clean) throw new Error('El nombre no puede estar vacío')
    if (clean.includes('/') || clean.includes('\\')) throw new Error('El nombre no puede contener barras')
    const node = await requireNode(id)
    const unique = await fs.uniqueName(node.parentId, clean, id)
    await db.nodes.update(id, { name: unique, updatedAt: now() })
    return unique
  },

  /**
   * Moves nodes into a folder. Returns where each one came from, parent and name: a move can have to rename
   * to fit («notas 2.md»), and undo has to give back both or it leaves something other than what was there.
   */
  async move(ids: string[], targetParentId: string): Promise<Record<string, { parentId: string; name: string }>> {
    if (targetParentId !== ROOT_ID) {
      const target = await requireNode(targetParentId)
      if (target.kind !== 'folder') throw new Error('El destino no es una carpeta')
    }
    // Everything is checked before anything moves. Half a move is the worst outcome: some files travelled,
    // the rest did not, and because the call ended in an error there is no journal entry to put them back.
    const going: FsNode[] = []
    for (const id of new Set(ids)) {
      const node = await requireNode(id)
      if (node.parentId === targetParentId) continue
      if (node.kind === 'folder' && (await isSameOrDescendant(id, targetParentId))) {
        throw new Error(`No puedes mover "${node.name}" dentro de sí misma`)
      }
      going.push(node)
    }
    const previous: Record<string, { parentId: string; name: string }> = {}
    for (const node of going) {
      previous[node.id] = { parentId: node.parentId, name: node.name }
      // Without excludeId, a repeated id in the list met itself already moved and renamed itself on the spot.
      const name = await fs.uniqueName(targetParentId, node.name, node.id)
      await db.nodes.update(node.id, { parentId: targetParentId, name, updatedAt: now() })
    }
    return previous
  },

  /**
   * A folder goes to the trash with everything inside it. Marking only the folder left its children alive:
   * unreachable, but still counted, still searchable, still fed to Sky as if they were on the desk. They all
   * carry the same timestamp, which is how restoring knows what went in together.
   */
  async trash(ids: string[]): Promise<void> {
    const t = now()
    const all = new Set<string>()
    for (const id of ids) for (const sub of await subtreeIds(id)) all.add(sub)
    await db.transaction('rw', db.nodes, async () => {
      for (const id of all) await db.nodes.update(id, { trashedAt: t })
    })
  },

  /**
   * Restores nodes out of the trash. Returns the ids that fell to the desk because their folder was still in
   * the trash: the toast needs to say where they ended up, or the person looks for them where they are not.
   */
  async restore(ids: string[]): Promise<string[]> {
    const fellToDesk: string[] = []
    await db.transaction('rw', db.nodes, async () => {
      for (const id of ids) {
        const node = await db.nodes.get(id)
        if (!node) continue
        let parentId = node.parentId
        if (parentId !== ROOT_ID) {
          const parent = await db.nodes.get(parentId)
          if (!parent || parent.trashedAt !== null) {
            parentId = ROOT_ID
            fellToDesk.push(id)
          }
        }
        const name = await fs.uniqueName(parentId, node.name, id)
        const stamp = node.trashedAt
        await db.nodes.update(id, { trashedAt: null, parentId, name })
        // Whatever went in with it comes back with it, and only that: something thrown away before this
        // folder arrived stays where the person left it.
        if (node.kind === 'folder' && stamp !== null) {
          for (const sub of await subtreeIds(id)) {
            if (sub === id) continue
            const child = await db.nodes.get(sub)
            if (child?.trashedAt === stamp) await db.nodes.update(sub, { trashedAt: null })
          }
        }
      }
    })
    return fellToDesk
  },

  async purge(ids: string[]): Promise<void> {
    const all = new Set<string>()
    for (const id of ids) for (const sub of await subtreeIds(id)) all.add(sub)
    const list = [...all]
    await Promise.all(list.map((id) => blobs.remove(id)))
    await db.nodes.bulkDelete(list)
  },

  async emptyTrash(): Promise<number> {
    const trashed = await fs.listTrash()
    await fs.purge(trashed.map((n) => n.id))
    return trashed.length
  },

  /** Replaces a node's tags with a clean, deduplicated, lowercase set (max 8). */
  async setTags(id: string, tags: string[]): Promise<string[]> {
    const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t && t.length <= 32))].slice(0, 8)
    await db.nodes.update(id, { tags: clean })
    return clean
  },

  async search(query: string, limit = 12): Promise<FsNode[]> {
    const q = norm(query.trim())
    if (!q) return []
    const rows = await db.nodes
      .filter((n) => n.trashedAt === null && (norm(n.name).includes(q) || (n.tags ?? []).some((t) => norm(t).includes(q))))
      .toArray()
    rows.sort((a, b) => {
      const as = norm(a.name).startsWith(q) ? 0 : 1
      const bs = norm(b.name).startsWith(q) ? 0 : 1
      return as - bs || sortNodes(a, b)
    })
    return rows.slice(0, limit)
  },

  /** What there is, and separately what is in the trash: counting both as one answered «tienes 132 archivos»
   *  to someone who could see 92 on their desktop. */
  async stats(): Promise<{ files: number; folders: number; bytes: number; trashed: number }> {
    const rows = await db.nodes.toArray()
    let files = 0
    let folders = 0
    let bytes = 0
    let trashed = 0
    for (const n of rows) {
      if (n.trashedAt !== null) {
        trashed++
        continue
      }
      if (n.kind === 'folder') folders++
      else {
        files++
        bytes += n.size
      }
    }
    return { files, folders, bytes, trashed }
  },

  engine: blobs.engine,
}
