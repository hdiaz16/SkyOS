import { db } from './db'
import { currentSession } from '../system/session'

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

/** Each account keeps its bytes in its own OPFS folder; the pre-accounts desktop lives at the root. */
const STORAGE_DIR = currentSession()?.storageDir ?? 'sin-sesion'

let dirPromise: Promise<FileSystemDirectoryHandle> | null = null

function userDir(): Promise<FileSystemDirectoryHandle> {
  dirPromise ??= (async () => {
    let dir = await navigator.storage.getDirectory()
    for (const segment of STORAGE_DIR.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(segment, { create: true })
    return dir
  })()
  return dirPromise
}

const opfsStore: BlobStore = {
  engine: 'opfs',
  async put(id, blob) {
    const dir = await userDir()
    const handle = await dir.getFileHandle(id, { create: true })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
  },
  async get(id) {
    try {
      const dir = await userDir()
      const handle = await dir.getFileHandle(id)
      return await handle.getFile()
    } catch {
      return null
    }
  },
  async remove(id) {
    try {
      const dir = await userDir()
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
