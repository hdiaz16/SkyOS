import { db } from '../kernel/db'
import type { Tier } from './router'
import type { ChatMessage, Part, Usage } from './types'

/**
 * The conversation survives reloads: turns for the panel and the model-facing history live in the user's
 * database, alongside a rolling summary of what fell out of the window. Heavy parts (images, PDFs) are
 * replaced by a note so the store stays light; the files themselves are still on the desktop.
 *
 * There is one thread for everyday talk and one per project, because a project is a different conversation:
 * what was decided about the proposal has no business turning up while you are sorting photos. They are rows
 * in the same table, told apart by their id.
 */

/** The everyday thread, the one you get when no project is in front. */
export const MAIN_THREAD = 'main'

/** The thread that belongs to a project folder. */
export const threadOf = (folderId: string): string => `proyecto:${folderId}`

export interface StoredTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  status: 'done' | 'error' | 'stopped'
  error?: string
  model?: string
  tier?: Tier | null
  usage?: Usage
  /** Labels of what Sky did in that turn (tool results themselves are not kept). */
  actions?: string[]
}

/** A message written with no network, still waiting for it. Its attachments travel light, like the history's. */
export interface StoredQueued {
  userId: string
  replyId: string
  prompt: string
  parts: Part[]
}

export interface ConversationRow {
  /** `main`, or `proyecto:<id de la carpeta>`. */
  id: string
  turns: StoredTurn[]
  history: ChatMessage[]
  /** What was written without connection and has not left yet. */
  queue?: StoredQueued[]
  /** Compact memory of older turns, written by the model when the history is trimmed. */
  summary?: string
  updatedAt: number
}

const MAX_TURNS_KEPT = 80

function lightPart(p: Part): Part {
  if (p.type === 'image') return { type: 'text', text: '[imagen adjunta en un turno anterior]' }
  if (p.type === 'document') return { type: 'text', text: `[documento adjunto: ${p.title ?? 'PDF'}]` }
  if (p.type === 'file') return { type: 'text', text: `[archivo adjunto en un turno anterior: ${p.name}]` }
  return p
}

/** History without binary payloads, ready to be stored or replayed. */
export function lightHistory(history: ChatMessage[]): ChatMessage[] {
  return history.map((m) => ({ ...m, parts: m.parts.map(lightPart) }))
}

export const conversationStore = {
  load: (id: string): Promise<ConversationRow | undefined> => db.conversation.get(id),

  async save(id: string, row: Omit<ConversationRow, 'id' | 'updatedAt'>): Promise<void> {
    await db.conversation.put({
      id,
      turns: row.turns.slice(-MAX_TURNS_KEPT),
      history: lightHistory(row.history),
      summary: row.summary,
      queue: row.queue?.length ? row.queue.map((q) => ({ ...q, parts: q.parts.map(lightPart) })) : undefined,
      updatedAt: Date.now(),
    })
  },

  clear: (id: string): Promise<void> => db.conversation.delete(id),
}
