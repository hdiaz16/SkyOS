import Dexie, { type Table } from 'dexie'
import type { FsNode } from './types'
import type { Widget } from './widgets'
import { readSession } from '../system/session'
import type { McpServerRecord, OAuthClient } from '../mcp/types'
import type { ConversationRow } from '../ai/conversation'

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
  /** Meaning vector of the file's text, computed on the device; absent until the local model has run. */
  embedding?: number[]
  /** Hash of the content the vector was computed from. */
  embeddedHash?: string
}

/** Text pulled out of a PDF or Office file by the extraction worker, keyed by file. */
export interface ExtractRow {
  nodeId: string
  /** Size and modification time of the content the text came from. */
  hash: string
  text: string
  chars: number
  pages?: number
  updatedAt: number
  /** Set when the file could not be read, so it is not retried on every pass. */
  failed?: boolean
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
  /** One row per MCP server the person has touched (catalog apps and custom ones), keyed by id. */
  mcpServers!: Table<McpServerRecord, string>
  /** OAuth client registrations, one per authorization server issuer. */
  oauthClients!: Table<OAuthClient, string>
  /** The conversation with Sky (turns, model history, rolling summary); a single row. */
  conversation!: Table<ConversationRow, string>
  /** Extracted text of documents, so search and summaries never reopen the binary. */
  extracts!: Table<ExtractRow, string>

  constructor(name: string) {
    super(name)
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
    this.version(3).stores({
      mcpServers: 'id, updatedAt',
      oauthClients: 'issuer',
    })
    this.version(4).stores({
      conversation: 'id',
    })
    this.version(5).stores({
      extracts: 'nodeId, updatedAt',
    })
  }
}

/** The signed-in user's database. Each account has its own; nothing is shared between them. */
export const db = new MesaDB(readSession()?.dbName ?? 'mesa')
