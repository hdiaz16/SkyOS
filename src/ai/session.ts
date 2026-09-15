import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { runAgent, type ToolEvent } from './agent'
import type { Tier } from './router'
import type { Attachment, ChatMessage, Usage } from './types'
import { conversationStore, MAIN_THREAD, type StoredTurn } from './conversation'
import { trimHistory } from './history'
import { useNetwork, whenOnline } from '../system/network'

export interface Turn {
  id: string
  role: 'user' | 'assistant'
  text: string
  attachments?: Attachment[]
  toolEvents: ToolEvent[]
  status: 'streaming' | 'done' | 'error' | 'stopped' | 'queued'
  statusMessage?: string
  /** Wall time of the whole answer, tools included. */
  latencyMs?: number
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
  /** Which conversation is on screen: the everyday one, or a project's own. */
  thread: string
  /** The project's name when this thread belongs to one, so the panel can say whose head Sky is in. */
  threadName: string | null
  loaded: boolean
  controller: AbortController | null
  pending: PendingAttachment[]
  setOpen: (open: boolean) => void
  /** Restores the conversation saved for this account. Safe to call more than once. */
  load: () => Promise<void>
  /** Puts away the thread on screen and brings up another one. Does nothing while Sky is answering. */
  switchThread: (thread: string, name: string | null) => Promise<void>
  /** Adds a message from Sky without calling the model (greetings, system notes). Opens the panel. */
  say: (text: string) => void
  attach: (part: Attachment, label: string) => void
  detach: (id: string) => void
  clearPending: () => void
  send: (prompt: string, attachments?: Attachment[]) => Promise<void>
  stop: () => void
  clear: () => void
  /** Messages written without network; they go out, in order, when it is back. */
  queue: QueuedSend[]
  flushQueue: () => Promise<void>
}

interface QueuedSend {
  userId: string
  replyId: string
  prompt: string
  parts: Attachment[]
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
  // Turns still streaming or waiting for the network are not history yet.
  if (t.status === 'streaming' || t.status === 'queued') return null
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
function rowOf(state: Pick<SessionState, 'turns' | 'history' | 'summary'>) {
  return { turns: state.turns.map(toStored).filter((t): t is StoredTurn => !!t), history: state.history, summary: state.summary ?? undefined }
}

function persist(state: Pick<SessionState, 'turns' | 'history' | 'summary' | 'thread'>): void {
  window.clearTimeout(persistTimer)
  const thread = state.thread
  persistTimer = window.setTimeout(() => {
    void conversationStore.save(thread, rowOf(state))
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
    const older = history.slice(0, history.length - trimHistory(history, HISTORY_KEEP).length)
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
      // Written without Sky's voice on top: this text travels as memory in every later turn, and with the
      // desktop prompt it could come back as «Claro, aquí va el resumen…» and carry that forever.
      systemOverride: 'Resumes una conversación para conservarla como memoria. Devuelves solo el resumen, en español, sin encabezados ni comentarios.',
      withoutState: true,
      tools: [],
      tier: 'fast',
      maxTokens: 600,
    })
    const text = result.text.trim()
    const current = get()
    // Fold only what is still there: the person may have kept talking while the summary was being written.
    if (!text || current.history.length <= HISTORY_KEEP) return
    set({ summary: text, history: trimHistory(current.history, HISTORY_KEEP) })
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
  thread: MAIN_THREAD,
  threadName: null,
  loaded: false,
  controller: null,
  pending: [],

  setOpen: (open) => set({ open }),

  switchThread: async (thread, name) => {
    const state = get()
    if (state.thread === thread || state.running) return
    // What is on screen goes to its own row right now: a switch must not lose the last thing that was said.
    window.clearTimeout(persistTimer)
    await conversationStore.save(state.thread, rowOf(state))
    const row = await conversationStore.load(thread).catch(() => undefined)
    set({
      thread,
      threadName: name,
      turns: row ? row.turns.map((t) => ({ id: t.id, role: t.role, text: t.text, status: t.status, error: t.error, model: t.model, tier: t.tier, usage: t.usage, toolEvents: [] })) : [],
      history: row?.history ?? [],
      summary: row?.summary ?? null,
      pending: [],
    })
  },

  load: async () => {
    if (get().loaded) return
    try {
      const row = await conversationStore.load(get().thread)
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
    set((s) => ({ open: true, turns: [...s.turns, turn], history: trimHistory([...s.history, message], MAX_HISTORY_MESSAGES) }))
    persist(get())
  },

  attach: (part, label) => set((s) => ({ pending: [...s.pending.slice(-(MAX_PENDING - 1)), { id: nanoid(6), label, part }] })),
  detach: (id) => set((s) => ({ pending: s.pending.filter((p) => p.id !== id) })),
  clearPending: () => set({ pending: [] }),

  queue: [],

  flushQueue: async () => {
    while (get().queue.length && useNetwork.getState().online && !get().running) {
      const [item, ...rest] = get().queue
      set((s) => ({ queue: rest, turns: s.turns.filter((t) => t.id !== item.userId && t.id !== item.replyId) }))
      await get().send(item.prompt, item.parts)
    }
  },

  send: async (prompt, attachments) => {
    const parts = attachments ?? get().pending.map((p) => p.part)
    // Asking something while Sky is still answering used to lose the message: the box had already been
    // cleared by whoever called. Now it waits its turn, visible, like the ones held back by the network.
    if (get().running) {
      const userTurn: Turn = { id: nanoid(6), role: 'user', text: prompt, attachments: parts, toolEvents: [], status: 'done' }
      const replyId = nanoid(6)
      const waiting: Turn = { id: replyId, role: 'assistant', text: 'En cuanto termine con lo anterior.', toolEvents: [], status: 'queued' }
      set((s) => ({ open: true, pending: [], turns: [...s.turns, userTurn, waiting], queue: [...s.queue, { userId: userTurn.id, replyId, prompt, parts }] }))
      return
    }
    const userTurn: Turn = { id: nanoid(6), role: 'user', text: prompt, attachments: parts, toolEvents: [], status: 'done' }
    const replyId = nanoid(6)

    // No network: the message waits in the conversation and leaves on its own when the connection is back.
    if (!useNetwork.getState().online) {
      const waiting: Turn = { id: replyId, role: 'assistant', text: 'Sin conexión por ahora. Lo envío en cuanto vuelva la red.', toolEvents: [], status: 'queued' }
      set((s) => ({ open: true, pending: [], turns: [...s.turns, userTurn, waiting], queue: [...s.queue, { userId: userTurn.id, replyId, prompt, parts }] }))
      void whenOnline().then(() => get().flushQueue())
      return
    }

    const controller = new AbortController()
    const startedAt = Date.now()
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
        history: trimHistory(result.messages, MAX_HISTORY_MESSAGES),
        turns: patchTurn(s.turns, replyId, {
          text: result.text,
          status: result.stopReason === 'aborted' ? 'stopped' : 'done',
          runId: result.runId,
          model: result.model,
          tier: result.tier,
          usage: result.usage,
          latencyMs: Date.now() - startedAt,
          statusMessage: undefined,
        }),
      }))
      persist(get())
      void condense(get, set)
      // Whatever was asked while this was running has waited long enough.
      void get().flushQueue()
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
      void get().flushQueue()
    }
  },

  stop: () => {
    get().controller?.abort()
  },

  clear: () => {
    // Only the thread on screen: emptying the project you are in must not touch the everyday conversation.
    const thread = get().thread
    get().controller?.abort()
    // The queue belongs to the conversation that is being emptied: leaving it behind means a message the
    // person threw away comes back and gets sent when the network returns.
    set({ turns: [], history: [], summary: null, running: false, controller: null, queue: [] })
    window.clearTimeout(persistTimer)
    void conversationStore.clear(thread)
  },
}))
