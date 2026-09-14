import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { runAgent, type ToolEvent } from './agent'
import type { Tier } from './router'
import type { Attachment, ChatMessage, Usage } from './types'
import { conversationStore, type StoredTurn } from './conversation'

export interface Turn {
  id: string
  role: 'user' | 'assistant'
  text: string
  attachments?: Attachment[]
  toolEvents: ToolEvent[]
  status: 'streaming' | 'done' | 'error' | 'stopped'
  statusMessage?: string
  runId?: string
  error?: string
  /** Which model answered and, when routed automatically, at what tier. */
  model?: string
  tier?: Tier | null
  usage?: Usage
}

/** Something the user picked to send with the next message: a capture, an image, a PDF. */
export interface PendingAttachment {
  id: string
  label: string
  part: Attachment
}

interface SessionState {
  open: boolean
  running: boolean
  turns: Turn[]
  history: ChatMessage[]
  /** Compact memory of turns that fell out of the history window. */
  summary: string | null
  loaded: boolean
  controller: AbortController | null
  pending: PendingAttachment[]
  setOpen: (open: boolean) => void
  /** Restores the conversation saved for this account. Safe to call more than once. */
  load: () => Promise<void>
  /** Adds a message from Sky without calling the model (greetings, system notes). Opens the panel. */
  say: (text: string) => void
  attach: (part: Attachment, label: string) => void
  detach: (id: string) => void
  clearPending: () => void
  send: (prompt: string, attachments?: Attachment[]) => Promise<void>
  stop: () => void
  clear: () => void
}

const MAX_HISTORY_MESSAGES = 24
const MAX_PENDING = 12
/** Messages kept verbatim once the older part has been folded into the summary. */
const HISTORY_KEEP = 10
/** History length that triggers folding. */
const SUMMARY_TRIGGER = 18
const MEMORY_LEAD = 'Resumen de la conversación previa con esta persona; úsalo para dar continuidad, sin repetirlo:'

const memoryFor = (summary: string | null) => (summary ? `${MEMORY_LEAD}\n${summary}` : undefined)

function toStored(t: Turn): StoredTurn | null {
  if (t.status === 'streaming') return null
  return {
    id: t.id,
    role: t.role,
    text: t.text,
    status: t.status,
    error: t.error,
    model: t.model,
    tier: t.tier,
    usage: t.usage,
    actions: t.toolEvents.map((e) => e.result?.label).filter((l): l is string => !!l),
  }
}

let persistTimer: number | undefined
/** Writes the conversation to the user's database shortly after it changes. */
function persist(state: Pick<SessionState, 'turns' | 'history' | 'summary'>): void {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    void conversationStore.save({ turns: state.turns.map(toStored).filter((t): t is StoredTurn => !!t), history: state.history, summary: state.summary ?? undefined })
  }, 300)
}

type Get = () => SessionState
type Set = (patch: Partial<SessionState>) => void

let condensing = false
/**
 * Keeps the model's context short without losing the thread: once the history grows past the trigger, the
 * older part is folded into a summary written by the fast model and only the last turns stay verbatim.
 */
async function condense(get: Get, set: Set): Promise<void> {
  const { history, summary, running } = get()
  if (condensing || running || history.length <= SUMMARY_TRIGGER) return
  condensing = true
  try {
    const older = history.slice(0, history.length - HISTORY_KEEP)
    const transcript = older
      .map((m) => {
        const text = m.parts
          .map((p) => (p.type === 'text' ? p.text : p.type === 'tool_result' ? `[resultado: ${p.content.slice(0, 200)}]` : p.type === 'tool_call' ? `[acción: ${p.name}]` : '[adjunto]'))
          .join(' ')
        return `${m.role === 'user' ? 'Persona' : 'Sky'}: ${text.slice(0, 1500)}`
      })
      .join('\n')
    const result = await runAgent({
      prompt: `${summary ? `Resumen previo:\n${summary}\n\n` : ''}Conversación a resumir:\n${transcript}\n\nEscribe un resumen breve (máximo 12 líneas) con lo que la persona quiere, lo que ya se hizo, los nombres de archivos, carpetas y apps mencionados y cualquier preferencia expresada. Solo el resumen.`,
      withoutState: true,
      tools: [],
      tier: 'fast',
      maxTokens: 600,
    })
    const text = result.text.trim()
    const current = get()
    // Fold only what is still there: the person may have kept talking while the summary was being written.
    if (!text || current.history.length <= HISTORY_KEEP) return
    set({ summary: text, history: current.history.slice(-HISTORY_KEEP) })
    persist(get())
  } catch {
    // Without a summary the history simply stays at its cap; nothing is lost but tokens.
  } finally {
    condensing = false
  }
}

function patchTurn(turns: Turn[], id: string, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)): Turn[] {
  return turns.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t))
}

/** The conversation behind the command bar: what the user asked, what Sky said and did. */
export const useSession = create<SessionState>((set, get) => ({
  open: false,
  running: false,
  turns: [],
  history: [],
  summary: null,
  loaded: false,
  controller: null,
  pending: [],

  setOpen: (open) => set({ open }),

  load: async () => {
    if (get().loaded) return
    try {
      const row = await conversationStore.load()
      if (row) {
        const turns: Turn[] = row.turns.map((t) => ({ id: t.id, role: t.role, text: t.text, status: t.status, error: t.error, model: t.model, tier: t.tier, usage: t.usage, toolEvents: [] }))
        set({ turns, history: row.history, summary: row.summary ?? null })
      }
    } catch {
      // A conversation that cannot be read starts fresh; the files and settings are untouched.
    } finally {
      set({ loaded: true })
    }
  },

  say: (text) => {
    const turn: Turn = { id: nanoid(6), role: 'assistant', text, toolEvents: [], status: 'done' }
    const message: ChatMessage = { role: 'assistant', parts: [{ type: 'text', text }] }
    set((s) => ({ open: true, turns: [...s.turns, turn], history: [...s.history, message].slice(-MAX_HISTORY_MESSAGES) }))
    persist(get())
  },

  attach: (part, label) => set((s) => ({ pending: [...s.pending.slice(-(MAX_PENDING - 1)), { id: nanoid(6), label, part }] })),
  detach: (id) => set((s) => ({ pending: s.pending.filter((p) => p.id !== id) })),
  clearPending: () => set({ pending: [] }),

  send: async (prompt, attachments) => {
    if (get().running) return
    const parts = attachments ?? get().pending.map((p) => p.part)
    const controller = new AbortController()
    const userTurn: Turn = { id: nanoid(6), role: 'user', text: prompt, attachments: parts, toolEvents: [], status: 'done' }
    const replyId = nanoid(6)
    const reply: Turn = { id: replyId, role: 'assistant', text: '', toolEvents: [], status: 'streaming' }
    set((s) => ({ open: true, running: true, controller, pending: [], turns: [...s.turns, userTurn, reply] }))

    // Buffer text deltas and flush per animation frame to keep the UI smooth on fast streams.
    let pendingText = ''
    let frame: number | null = null
    const flush = () => {
      frame = null
      if (!pendingText) return
      const chunk = pendingText
      pendingText = ''
      set((s) => ({ turns: patchTurn(s.turns, replyId, (t) => ({ text: t.text + chunk, statusMessage: undefined })) }))
    }

    try {
      const result = await runAgent({
        prompt,
        attachments: parts,
        history: get().history,
        extraSystem: memoryFor(get().summary),
        signal: controller.signal,
        onEvent: (e) => {
          switch (e.type) {
            case 'model':
              set((s) => ({ turns: patchTurn(s.turns, replyId, { model: e.model, tier: e.tier }) }))
              break
            case 'text':
              pendingText += e.delta
              if (frame === null) frame = requestAnimationFrame(flush)
              break
            case 'status':
              set((s) => ({ turns: patchTurn(s.turns, replyId, { statusMessage: e.message }) }))
              break
            case 'tool_start':
              flush()
              set((s) => ({
                turns: patchTurn(s.turns, replyId, (t) => ({ toolEvents: [...t.toolEvents, { call: e.call }], statusMessage: undefined })),
              }))
              break
            case 'tool_end':
              set((s) => ({
                turns: patchTurn(s.turns, replyId, (t) => ({
                  toolEvents: t.toolEvents.map((te) => (te.call.id === e.call.id ? { call: e.call, result: e.result } : te)),
                })),
              }))
              break
          }
        },
      })
      if (frame !== null) cancelAnimationFrame(frame)
      flush()
      set((s) => ({
        running: false,
        controller: null,
        history: result.messages.slice(-MAX_HISTORY_MESSAGES),
        turns: patchTurn(s.turns, replyId, {
          text: result.text,
          status: result.stopReason === 'aborted' ? 'stopped' : 'done',
          runId: result.runId,
          model: result.model,
          tier: result.tier,
          usage: result.usage,
          statusMessage: undefined,
        }),
      }))
      persist(get())
      void condense(get, set)
    } catch (err) {
      if (frame !== null) cancelAnimationFrame(frame)
      flush()
      const message = err instanceof Error ? err.message : 'Algo salió mal'
      set((s) => ({
        running: false,
        controller: null,
        turns: patchTurn(s.turns, replyId, { status: 'error', error: message, statusMessage: undefined }),
      }))
      persist(get())
    }
  },

  stop: () => {
    get().controller?.abort()
  },

  clear: () => {
    get().controller?.abort()
    set({ turns: [], history: [], summary: null, running: false, controller: null })
    void conversationStore.clear()
  },
}))
