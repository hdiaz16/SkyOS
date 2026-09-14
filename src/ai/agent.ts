import { nanoid } from 'nanoid'
import { getProvider } from './providers'
import { AUTO_MODEL, isAiConfigured, presetFor, PROVIDERS, useAiSettings, type AiSettingsState, type ProviderId } from './settings'
import { resolveModel, type Tier } from './router'
import { buildStateSnapshot, buildSystemPrompt } from './context'
import { allTools, executeTool, type ToolExecution } from './tools'
import { DEFAULT_MCP_BUDGET_BYTES, MIN_MCP_BUDGET_BYTES } from '../mcp/tools'
import { AiError, type Attachment, type ChatMessage, type ServerTool, type StopReason, type ToolCallPart, type Usage } from './types'

export interface ToolEvent {
  call: ToolCallPart
  result?: ToolExecution
}

export type AgentEvent =
  | { type: 'model'; model: string; tier: Tier | null }
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
  /** When the model is "auto", force this tier instead of estimating it. */
  tier?: Tier
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
  model: string
  tier: Tier | null
  /** Tokens the whole run cost, summed over every model request. */
  usage: Usage
}

const MAX_ITERATIONS = 16
const MAX_RETRIES = 2
/** Old tool results in history keep only their head: the model already acted on them. */
const HISTORY_RESULT_CHARS = 1500
/** Fresh tool results per provider: metered free tiers get a tight cap, the rest can read whole documents. */
const RESULT_CHARS = { metered: 6000, roomy: 60_000 }

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[recortado: ${text.length - max} caracteres más]`
}
const BASE_BACKOFF_MS = 1500
const MAX_WAIT_MS = 20_000

/** Sibling models of the same provider, each with its own rate-limit quota, most capable first, none tried yet. */
function nextModel(settings: AiSettingsState, current: string, tried: Set<string>, needsTools: boolean): string | undefined {
  const preset = presetFor(settings.provider)
  const order = [preset.tiers?.deep, preset.tiers?.balanced, preset.tiers?.fast, ...preset.models.map((m) => m.id)].filter((id): id is string => !!id)
  return order.find((id) => id !== current && !tried.has(id) && (!needsTools || preset.models.find((m) => m.id === id)?.tools !== false))
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(t)
        resolve()
      },
      { once: true },
    )
  })
}

/**
 * Older turns keep their words but not the desktop snapshot they carried (stale and expensive), and their
 * tool results are trimmed to a head: the model already acted on them.
 */
function slimHistory(m: ChatMessage): ChatMessage {
  if (m.role !== 'user') return m
  const parts = m.parts
    .filter((p) => !(p.type === 'text' && p.text.startsWith('<estado>')))
    .map((p) => (p.type === 'tool_result' ? { ...p, content: clip(p.content, HISTORY_RESULT_CHARS) } : p))
  return parts.length ? { ...m, parts } : m
}

/**
 * One request from the user, resolved to completion: the model streams text, calls tools through the
 * command bus, receives their results and continues until it has nothing more to do.
 */
/**
 * Another provider the person set up with their own key, to lean on when the current one is out of breath.
 * The included Groq key is what we are escaping, so only personal keys count.
 */
function alternateProvider(current: AiSettingsState, exclude: Set<ProviderId>): AiSettingsState | undefined {
  for (const preset of PROVIDERS) {
    if (exclude.has(preset.id) || preset.devOnly || !preset.needsKey || !current.keys[preset.id]) continue
    const model = preset.tiers ? AUTO_MODEL : (current.discovered[preset.id]?.[0] ?? preset.models[0]?.id ?? '')
    const candidate: AiSettingsState = { ...current, provider: preset.id, model }
    if (isAiConfigured(candidate) && getProvider(candidate)) return candidate
  }
  return undefined
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentResult> {
  const settings = useAiSettings.getState()
  let provider = getProvider(settings)
  if (!provider) throw new AiError('Configura un proveedor de IA en Ajustes para empezar.')
  // The provider actually answering; it changes if the first one cannot keep up and another is configured.
  let active = settings
  const triedProviders = new Set<ProviderId>([settings.provider])

  const runId = nanoid(8)
  const emit = (e: AgentEvent) => opts.onEvent?.(e)
  const recent = (opts.history ?? [])
    .slice(-4)
    .flatMap((m) => m.parts)
    .map((p) => (p.type === 'text' ? p.text : p.type === 'tool_call' ? p.name : ''))
    .join(' ')
  // Free tiers cap tokens per minute; other providers can carry far more app tooling per request.
  let mcpBudget = settings.provider === 'groq' ? DEFAULT_MCP_BUDGET_BYTES : DEFAULT_MCP_BUDGET_BYTES * 5
  const buildTools = () => (opts.tools && opts.tools.length === 0 ? [] : allTools(opts.tools, { prompt: opts.prompt, recent, budgetBytes: mcpBudget }))
  let tools = buildTools()
  const base = await buildSystemPrompt()
  const system = opts.extraSystem ? `${base}\n\n${opts.extraSystem}` : base

  const route = opts.model
    ? { model: opts.model, tier: null, auto: false }
    : resolveModel(settings, { prompt: opts.prompt, attachments: opts.attachments, historyLength: opts.history?.length, textOnly: opts.withoutState }, opts.tier)
  emit({ type: 'model', model: route.model, tier: route.tier })

  const userParts: ChatMessage['parts'] = []
  if (!opts.withoutState) userParts.push({ type: 'text', text: await buildStateSnapshot() })
  for (const a of opts.attachments ?? []) userParts.push(a)
  userParts.push({ type: 'text', text: opts.prompt })

  const messages: ChatMessage[] = [...(opts.history ?? []).map(slimHistory), { role: 'user', parts: userParts }]
  const resultCap = () => (active.provider === 'groq' ? RESULT_CHARS.metered : RESULT_CHARS.roomy)
  const usage: Usage = { inputTokens: 0, outputTokens: 0 }
  let model = route.model
  const tried = new Set<string>([route.model])
  const toolEvents: ToolEvent[] = []
  let text = ''
  let stopReason: StopReason = 'other'

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let assistant: ChatMessage | null = null
    const calls: ToolCallPart[] = []
    let refusal: string | undefined

    // One model request, with patience: in automatic mode a model whose minute is used up hands over to a
    // sibling with its own quota; otherwise a transient failure waits as long as the provider asked and retries.
    let attempt = 0
    for (;;) {
      let streamed = false
      calls.length = 0
      try {
        for await (const ev of provider.chat({
          model,
          system,
          messages,
          tools,
          serverTools: provider.capabilities.serverWebFetch ? opts.serverTools : undefined,
          effort: active.effort,
          maxTokens: opts.maxTokens,
          signal: opts.signal,
        })) {
          switch (ev.type) {
            case 'text':
              streamed = true
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
              usage.inputTokens += ev.usage.inputTokens
              usage.outputTokens += ev.usage.outputTokens
              break
            case 'error':
              throw ev.error
          }
        }
        break
      } catch (err) {
        if (!(err instanceof AiError) || streamed || opts.signal?.aborted) throw err
        // "Request too large": carry fewer, smaller app tools and try again before anything else.
        if (err.status === 413 && mcpBudget > MIN_MCP_BUDGET_BYTES) {
          mcpBudget = Math.max(MIN_MCP_BUDGET_BYTES, Math.floor(mcpBudget / 2))
          tools = buildTools()
          emit({ type: 'status', message: 'Ajustando la petición…' })
          continue
        }
        if (!err.retryable) throw err
        const next = route.auto ? nextModel(active, model, tried, tools.length > 0) : undefined
        if (next) {
          tried.add(model)
          model = next
          attempt = 0
          emit({ type: 'model', model, tier: route.tier })
          continue
        }
        if (attempt >= MAX_RETRIES) {
          // Out of options here: hand the conversation to another provider the person configured, quietly.
          const alt = alternateProvider(active, triedProviders)
          const altProvider = alt ? getProvider(alt) : null
          if (alt && altProvider) {
            triedProviders.add(alt.provider)
            active = alt
            provider = altProvider
            model = resolveModel(alt, { prompt: opts.prompt, attachments: opts.attachments, historyLength: opts.history?.length, textOnly: opts.withoutState }, opts.tier).model
            tried.clear()
            tried.add(model)
            attempt = 0
            emit({ type: 'status', message: `Cambiando a ${presetFor(alt.provider).name}…` })
            emit({ type: 'model', model, tier: route.tier })
            continue
          }
          throw err
        }
        attempt++
        emit({ type: 'status', message: 'Sky está esperando su turno…' })
        await pause(Math.min(err.retryAfterMs ?? BASE_BACKOFF_MS * 2 ** attempt, MAX_WAIT_MS), opts.signal)
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
      results.push({ type: 'tool_result', toolCallId: call.id, content: clip(result.content, resultCap()), isError: result.isError })
    }
    if (opts.signal?.aborted) {
      stopReason = 'aborted'
      break
    }
    messages.push({ role: 'user', parts: results })
    if (text) text += '\n\n'
  }

  return { runId, text: text.trim(), stopReason, messages, toolEvents, model, tier: route.tier, usage }
}
