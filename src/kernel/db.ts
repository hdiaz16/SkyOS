import Dexie, { type Table } from 'dexie'
import type { FsNode } from './types'

export interface BlobRow {
  id: string
  data: Blob
}

export class MesaDB extends Dexie {
  nodes!: Table<FsNode, string>
  blobs!: Table<BlobRow, string>

  constructor() {
    super('mesa')
    this.version(1).stores({
      nodes: 'id, parentId, name, kind, updatedAt',
      blobs: 'id',
    })
  }
}

export const db = new MesaDB()
