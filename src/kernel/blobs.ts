import { db } from './db'

export type BlobEngine = 'opfs' | 'indexeddb'

export interface BlobStore {
  engine: BlobEngine
  put(id: string, blob: Blob): Promise<void>
  get(id: string): Promise<Blob | null>
  remove(id: string): Promise<void>
}

function opfsSupported(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage.getDirectory === 'function' &&
      typeof FileSystemFileHandle !== 'undefined' &&
      'createWritable' in FileSystemFileHandle.prototype
    )
  } catch {
    return false
  }
}

const opfsStore: BlobStore = {
  engine: 'opfs',
  async put(id, blob) {
    const dir = await navigator.storage.getDirectory()
    const handle = await dir.getFileHandle(id, { create: true })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
  },
  async get(id) {
    try {
      const dir = await navigator.storage.getDirectory()
      const handle = await dir.getFileHandle(id)
      return await handle.getFile()
    } catch {
      return null
    }
  },
  async remove(id) {
    try {
      const dir = await navigator.storage.getDirectory()
      await dir.removeEntry(id)
    } catch {
      /* already gone */
    }
  },
}

const idbStore: BlobStore = {
  engine: 'indexeddb',
  async put(id, blob) {
    await db.blobs.put({ id, data: blob })
  },
  async get(id) {
    const row = await db.blobs.get(id)
    return row?.data ?? null
  },
  async remove(id) {
    await db.blobs.delete(id)
  },
}

export const blobs: BlobStore = opfsSupported() ? opfsStore : idbStore
