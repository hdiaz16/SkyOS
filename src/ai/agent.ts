import { nanoid } from 'nanoid'
import { getProvider } from './providers'
import { useAiSettings } from './settings'
import { buildStateSnapshot, SYSTEM_PROMPT } from './context'
import { commandTools, executeTool, type ToolExecution } from './tools'
import { AiError, type Attachment, type ChatMessage, type ServerTool, type StopReason, type ToolCallPart } from './types'

export interface ToolEvent {
  call: ToolCallPart
  result?: ToolExecution
}

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; call: ToolCallPart }
  | { type: 'tool_end'; call: ToolCallPart; result: ToolExecution }
  | { type: 'status'; message: string }

export interface AgentRunOptions {
  prompt: string
  attachments?: Attachment[]
  /** Previous turns of the same conversation. */
  history?: ChatMessage[]
  /** Extra instructions for this run only (appended to the system prompt). */
  extraSystem?: string
  /** Restrict the tool surface to these command ids; omit for everything, [] for none. */
  tools?: string[]
  serverTools?: ServerTool[]
  /** Skip the desktop snapshot (for pure text tasks like summaries). */
  withoutState?: boolean
  /** Use a specific model instead of the configured one (e.g. a fast tier for indexing). */
  model?: string
  maxTokens?: number
  signal?: AbortSignal
  onEvent?: (event: AgentEvent) => void
}

export interface AgentResult {
  runId: string
  text: string
  stopReason: StopReason
  /** Full conversation including this exchange, ready to be passed back as history. */
  messages: ChatMessage[]
  toolEvents: ToolEvent[]
}

const MAX_ITERATIONS = 16

/**
 * One request from the user, resolved to completion: the model streams text, calls tools through the
 * command bus, receives their results and continues until it has nothing more to do.
 */
export async function runAgent(opts: AgentRunOptions): Promise<AgentResult> {
  const settings = useAiSettings.getState()
  const provider = getProvider(settings)
  if (!provider) throw new AiError('Configura un proveedor de IA en Ajustes para empezar.')

  const runId = nanoid(8)
  const emit = (e: AgentEvent) => opts.onEvent?.(e)
  const tools = opts.tools && opts.tools.length === 0 ? [] : commandTools(opts.tools)
  const system = opts.extraSystem ? `${SYSTEM_PROMPT}\n\n${opts.extraSystem}` : SYSTEM_PROMPT

  const userParts: ChatMessage['parts'] = []
  if (!opts.withoutState) userParts.push({ type: 'text', text: await buildStateSnapshot() })
  for (const a of opts.attachments ?? []) userParts.push(a)
  userParts.push({ type: 'text', text: opts.prompt })

  const messages: ChatMessage[] = [...(opts.history ?? []), { role: 'user', parts: userParts }]
  const toolEvents: ToolEvent[] = []
  let text = ''
  let stopReason: StopReason = 'other'

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let assistant: ChatMessage | null = null
    const calls: ToolCallPart[] = []
    let refusal: string | undefined

    for await (const ev of provider.chat({
      model: opts.model ?? settings.model,
      system,
      messages,
      tools,
      serverTools: provider.capabilities.serverWebFetch ? opts.serverTools : undefined,
      effort: settings.effort,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
    })) {
      switch (ev.type) {
        case 'text':
          text += ev.delta
          emit({ type: 'text', delta: ev.delta })
          break
        case 'tool_call':
          calls.push(ev.call)
          break
        case 'server_tool':
          emit({ type: 'status', message: ev.name === 'web_fetch' ? 'Leyendo la página…' : 'Buscando en la web…' })
          break
        case 'done':
          assistant = ev.assistant
          stopReason = ev.stopReason
          refusal = ev.refusal
          break
        case 'error':
          throw ev.error
      }
    }

    if (!assistant || stopReason === 'aborted') {
      stopReason = 'aborted'
      break
    }
    messages.push(assistant)

    if (stopReason === 'refusal') {
      const note = refusal ? `No puedo ayudar con eso: ${refusal}` : 'No puedo ayudar con esa petición.'
      text += (text ? '\n\n' : '') + note
      emit({ type: 'text', delta: note })
      break
    }
    if (stopReason === 'pause_turn') continue
    if (stopReason !== 'tool_use' || calls.length === 0) break

    const results: ChatMessage['parts'] = []
    for (const call of calls) {
      if (opts.signal?.aborted) break
      emit({ type: 'tool_start', call })
      const result = await executeTool(call.name, call.input, runId)
      toolEvents.push({ call, result })
      emit({ type: 'tool_end', call, result })
      results.push({ type: 'tool_result', toolCallId: call.id, content: result.content, isError: result.isError })
    }
    if (opts.signal?.aborted) {
      stopReason = 'aborted'
      break
    }
    messages.push({ role: 'user', parts: results })
    if (text) {
      text += '\n\n'
    }
  }

  return { runId, text: text.trim(), stopReason, messages, toolEvents }
}
