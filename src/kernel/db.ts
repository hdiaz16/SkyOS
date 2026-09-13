import Dexie, { type Table } from 'dexie'
import type { FsNode } from './types'
import type { Widget } from './widgets'

export interface BlobRow {
  id: string
  data: Blob
}

/** Model-written summary of a text file, used for search by meaning. */
export interface FileIndexRow {
  nodeId: string
  /** Hash of the content that produced this entry, to skip unchanged files. */
  hash: string
  summary: string
  keywords: string[]
  updatedAt: number
}

/** A saved natural-language routine the user can trigger by name. */
export interface FlowRow {
  id: string
  name: string
  slug: string
  instructions: string
  createdAt: number
  updatedAt: number
  uses: number
}

export class MesaDB extends Dexie {
  nodes!: Table<FsNode, string>
  blobs!: Table<BlobRow, string>
  widgets!: Table<Widget, string>
  fileIndex!: Table<FileIndexRow, string>
  flows!: Table<FlowRow, string>

  constructor() {
    super('mesa')
    this.version(1).stores({
      nodes: 'id, parentId, name, kind, updatedAt',
      blobs: 'id',
    })
    this.version(2).stores({
      nodes: 'id, parentId, name, kind, updatedAt, *tags',
      blobs: 'id',
      widgets: 'id, type, updatedAt',
      fileIndex: 'nodeId, updatedAt',
      flows: 'id, &slug, updatedAt',
    })
  }
}

export const db = new MesaDB()
