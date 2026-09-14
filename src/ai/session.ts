import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { runAgent, type ToolEvent } from './agent'
import type { Tier } from './router'
import type { Attachment, ChatMessage } from './types'

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
  controller: AbortController | null
  pending: PendingAttachment[]
  setOpen: (open: boolean) => void
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
const MAX_PENDING = 4

function patchTurn(turns: Turn[], id: string, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)): Turn[] {
  return turns.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t))
}

/** The conversation behind the command bar: what the user asked, what Sky said and did. */
export const useSession = create<SessionState>((set, get) => ({
  open: false,
  running: false,
  turns: [],
  history: [],
  controller: null,
  pending: [],

  setOpen: (open) => set({ open }),

  say: (text) => {
    const turn: Turn = { id: nanoid(6), role: 'assistant', text, toolEvents: [], status: 'done' }
    const message: ChatMessage = { role: 'assistant', parts: [{ type: 'text', text }] }
    set((s) => ({ open: true, turns: [...s.turns, turn], history: [...s.history, message].slice(-MAX_HISTORY_MESSAGES) }))
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
          statusMessage: undefined,
        }),
      }))
    } catch (err) {
      if (frame !== null) cancelAnimationFrame(frame)
      flush()
      const message = err instanceof Error ? err.message : 'Algo salió mal'
      set((s) => ({
        running: false,
        controller: null,
        turns: patchTurn(s.turns, replyId, { status: 'error', error: message, statusMessage: undefined }),
      }))
    }
  },

  stop: () => {
    get().controller?.abort()
  },

  clear: () => {
    get().controller?.abort()
    set({ turns: [], history: [], running: false, controller: null })
  },
}))
