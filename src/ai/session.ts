import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { runAgent, type ToolEvent } from './agent'
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
}

interface SessionState {
  open: boolean
  running: boolean
  turns: Turn[]
  history: ChatMessage[]
  controller: AbortController | null
  setOpen: (open: boolean) => void
  send: (prompt: string, attachments?: Attachment[]) => Promise<void>
  stop: () => void
  clear: () => void
}

const MAX_HISTORY_MESSAGES = 24

function patchTurn(turns: Turn[], id: string, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)): Turn[] {
  return turns.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t))
}

/** The conversation behind the command bar: what the user asked, what Mesa said and did. */
export const useSession = create<SessionState>((set, get) => ({
  open: false,
  running: false,
  turns: [],
  history: [],
  controller: null,

  setOpen: (open) => set({ open }),

  send: async (prompt, attachments) => {
    if (get().running) return
    const controller = new AbortController()
    const userTurn: Turn = { id: nanoid(6), role: 'user', text: prompt, attachments, toolEvents: [], status: 'done' }
    const replyId = nanoid(6)
    const reply: Turn = { id: replyId, role: 'assistant', text: '', toolEvents: [], status: 'streaming' }
    set((s) => ({ open: true, running: true, controller, turns: [...s.turns, userTurn, reply] }))

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
        attachments,
        history: get().history,
        signal: controller.signal,
        onEvent: (e) => {
          switch (e.type) {
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
