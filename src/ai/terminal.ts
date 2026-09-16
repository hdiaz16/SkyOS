import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { runAgent } from './agent'
import type { ChatMessage } from './types'

export type LineKind = 'input' | 'output' | 'tool' | 'error' | 'system'

export interface TerminalLine {
  id: string
  kind: LineKind
  text: string
}

interface TerminalState {
  lines: TerminalLine[]
  history: ChatMessage[]
  running: boolean
  controller: AbortController | null
  run: (input: string) => Promise<void>
  /** A line the terminal writes by itself, without asking the model anything. */
  note: (text: string) => void
  stop: () => void
  clear: () => void
}

const WELCOME: TerminalLine = {
  id: 'welcome',
  kind: 'system',
  text: 'Terminal de Sky. Escribe lo que quieras saber o hacer con el sistema en lenguaje natural. "help" para ideas, "clear" para limpiar.',
}

const HELP = [
  'Ejemplos:',
  '  ¿cuántos archivos tengo y cuánto ocupan?',
  '  lista las carpetas vacías',
  '  mueve todo lo que diga factura a Facturas 2026',
  '  cierra las ventanas que no estoy usando',
  '  ¿qué widgets hay en el escritorio?',
].join('\n')

const EXTRA_SYSTEM = [
  'Estás en la Terminal de Sky, una consola de texto plano.',
  'Responde conciso, sin Markdown ni emojis, en líneas cortas; usa listas con guiones cuando ayude.',
  'Después de usar herramientas, resume el resultado en una o dos líneas.',
].join(' ')

const MAX_HISTORY = 30

function compact(value: unknown, max = 160): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** Console-style session: every request and every tool call is printed as a line. */
export const useTerminal = create<TerminalState>((set, get) => ({
  lines: [WELCOME],
  history: [],
  running: false,
  controller: null,

  run: async (input) => {
    const text = input.trim()
    if (!text || get().running) return
    const add = (kind: LineKind, body: string) => set((s) => ({ lines: [...s.lines.slice(-400), { id: nanoid(6), kind, text: body }] }))
    add('input', text)

    if (text === 'clear') {
      // Wiping the screen and keeping the conversation left the model answering «¿de qué hablábamos?» with
      // what was there before, and made an empty-looking terminal keep paying for that invisible history.
      get().clear()
      return
    }
    if (text === 'help') {
      add('system', HELP)
      return
    }

    const controller = new AbortController()
    set({ running: true, controller })

    // Text streams into the current output line; a tool call closes it so later text starts a new one.
    let outputId: string | null = null
    let streamed = false
    /** The one line that says what the wait is about. It is rewritten, not repeated, and goes when text starts. */
    let statusId: string | null = null
    const status = (message: string) => {
      if (!statusId) {
        statusId = nanoid(6)
        const id = statusId
        set((s) => ({ lines: [...s.lines, { id, kind: 'system', text: message }] }))
        return
      }
      const id = statusId
      set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, text: message } : l)) }))
    }
    const clearStatus = () => {
      if (!statusId) return
      const id = statusId
      statusId = null
      set((s) => ({ lines: s.lines.filter((l) => l.id !== id) }))
    }
    const append = (delta: string) => {
      streamed = true
      clearStatus()
      if (!outputId) {
        outputId = nanoid(6)
        const id = outputId
        set((s) => ({ lines: [...s.lines, { id, kind: 'output', text: delta }] }))
        return
      }
      const id = outputId
      set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, text: l.text + delta } : l)) }))
    }

    try {
      const result = await runAgent({
        prompt: text,
        extraSystem: EXTRA_SYSTEM,
        history: get().history,
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === 'text') append(e.delta)
          else if (e.type === 'tool_start') {
            outputId = null
            clearStatus()
            add('tool', `$ ${e.call.name} ${compact(e.call.input, 120)}`)
          } else if (e.type === 'tool_end') add(e.result.isError ? 'error' : 'tool', `  → ${e.result.label ?? compact(e.result.content)}`)
          // The only sign of life during a long wait — «Sky está esperando su turno…», «Cambiando a Anthropic…».
          // Without it a twenty-second wait on the shared key looked exactly like a terminal that had hung.
          else if (e.type === 'status') status(e.message)
        },
      })
      clearStatus()
      if (!streamed) add('system', result.stopReason === 'aborted' ? '(detenido)' : '(sin salida)')
      set({ running: false, controller: null, history: result.messages.slice(-MAX_HISTORY) })
    } catch (err) {
      clearStatus()
      add('error', err instanceof Error ? err.message : 'Error')
      set({ running: false, controller: null })
    }
  },

  note: (text) => set((s) => ({ lines: [...s.lines.slice(-400), { id: nanoid(6), kind: 'system', text }] })),

  stop: () => get().controller?.abort(),

  clear: () => {
    get().controller?.abort()
    set({ lines: [WELCOME], history: [], running: false, controller: null })
  },
}))
