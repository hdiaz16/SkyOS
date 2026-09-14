import type { ChatMessage, Part } from './types'

/**
 * Conversation history has a grammar every provider enforces: a tool result must answer a call in the message
 * right before it, every call must get its result in the message right after, and the exchange must start with
 * the person's words. Cutting the history to size, folding it into a summary or switching providers can break
 * that grammar; these two helpers keep it whole.
 */

type ToolCall = Extract<Part, { type: 'tool_call' }>
type ToolResult = Extract<Part, { type: 'tool_result' }>

/** A user message that carries the person's own words or attachments, not only tool results. */
const isPrompt = (m: ChatMessage): boolean => m.role === 'user' && m.parts.some((p) => p.type !== 'tool_result')

const callIds = (m: ChatMessage | undefined): Set<string> =>
  new Set(m?.role === 'assistant' ? m.parts.filter((p): p is ToolCall => p.type === 'tool_call').map((p) => p.id) : [])

const resultIds = (m: ChatMessage | undefined): Set<string> =>
  new Set(m?.role === 'user' ? m.parts.filter((p): p is ToolResult => p.type === 'tool_result').map((p) => p.toolCallId) : [])

/** Keeps at most `max` messages, cutting only where an exchange starts, so no result is left without its call. */
export function trimHistory(history: ChatMessage[], max: number): ChatMessage[] {
  if (history.length <= max) return history
  let start = history.length - max
  while (start < history.length && !isPrompt(history[start])) start++
  return history.slice(start)
}

/** Repairs a history so every result has its call, every call has its result, and the first word is the person's. */
export function sanitizeHistory(history: ChatMessage[]): ChatMessage[] {
  // Results without a call in the previous assistant message go.
  const paired: ChatMessage[] = []
  for (const m of history) {
    if (m.role !== 'user') {
      paired.push(m)
      continue
    }
    const calls = callIds(paired[paired.length - 1])
    const parts = m.parts.filter((p) => p.type !== 'tool_result' || calls.has(p.toolCallId))
    if (!parts.length) continue
    paired.push(parts.length === m.parts.length ? m : { ...m, parts })
  }

  // Calls without a result in the next user message go too; the vendor replay is dropped with them.
  const answered: ChatMessage[] = []
  for (let i = 0; i < paired.length; i++) {
    const m = paired[i]
    if (m.role === 'assistant' && m.parts.some((p) => p.type === 'tool_call')) {
      const results = resultIds(paired[i + 1])
      const parts = m.parts.filter((p) => p.type !== 'tool_call' || results.has(p.id))
      if (parts.length !== m.parts.length) {
        if (parts.length) answered.push({ role: 'assistant', parts })
        continue
      }
    }
    answered.push(m)
  }

  const first = answered.findIndex(isPrompt)
  return first === -1 ? [] : first === 0 ? answered : answered.slice(first)
}
