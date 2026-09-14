import { db } from '../kernel/db'
import type { Tier } from './router'
import type { ChatMessage, Part, Usage } from './types'

/**
 * The conversation survives reloads: turns for the panel and the model-facing history live in the user's
 * database, alongside a rolling summary of what fell out of the window. Heavy parts (images, PDFs) are
 * replaced by a note so the store stays light; the files themselves are still on the desktop.
 */

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

export interface ConversationRow {
  id: 'main'
  turns: StoredTurn[]
  history: ChatMessage[]
  /** Compact memory of older turns, written by the model when the history is trimmed. */
  summary?: string
  updatedAt: number
}

const MAX_TURNS_KEPT = 80

function lightPart(p: Part): Part {
  if (p.type === 'image') return { type: 'text', text: '[imagen adjunta en un turno anterior]' }
  if (p.type === 'document') return { type: 'text', text: `[documento adjunto: ${p.title ?? 'PDF'}]` }
  return p
}

/** History without binary payloads, ready to be stored or replayed. */
export function lightHistory(history: ChatMessage[]): ChatMessage[] {
  return history.map((m) => ({ ...m, parts: m.parts.map(lightPart) }))
}

export const conversationStore = {
  load: (): Promise<ConversationRow | undefined> => db.conversation.get('main'),

  async save(row: Omit<ConversationRow, 'id' | 'updatedAt'>): Promise<void> {
    await db.conversation.put({ id: 'main', turns: row.turns.slice(-MAX_TURNS_KEPT), history: lightHistory(row.history), summary: row.summary, updatedAt: Date.now() })
  },

  clear: (): Promise<void> => db.conversation.delete('main'),
}
