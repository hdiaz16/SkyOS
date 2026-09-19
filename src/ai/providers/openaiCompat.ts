import { AiError, fileBlock, sharedKeyBusy, type AiProvider, type ChatMessage, type ChatRequest, type Part, type StopReason, type StreamEvent, type ToolCallPart } from '../types'

/**
 * Adapter for any server that speaks the OpenAI chat-completions protocol:
 * OpenAI, OpenRouter, Ollama, LM Studio, vLLM and similar.
 */

interface Config {
  id: string
  name: string
  baseUrl: string
  apiKey?: string
  /** The key is Sky's included one: failures read as Sky being busy, never as a key or model problem. */
  shared?: boolean
  vision?: boolean
}

type OaContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>

interface OaToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type OaMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: OaContent }
  | { role: 'assistant'; content: string | null; tool_calls?: OaToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

function toMessages(system: string, messages: ChatMessage[]): OaMessage[] {
  const out: OaMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = m.parts.filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text').map((p) => p.text).join('\n')
      const calls = m.parts.filter((p): p is ToolCallPart => p.type === 'tool_call')
      out.push({
        role: 'assistant',
        content: text || null,
        ...(calls.length
          ? { tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) }
          : {}),
      })
      continue
    }
    const results = m.parts.filter((p): p is Extract<Part, { type: 'tool_result' }> => p.type === 'tool_result')
    for (const r of results) out.push({ role: 'tool', tool_call_id: r.toolCallId, content: r.content })
    const content: Exclude<OaContent, string> = []
    for (const p of m.parts) {
      if (p.type === 'text' && p.text.trim()) content.push({ type: 'text', text: p.text })
      else if (p.type === 'image') content.push({ type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.data}` } })
      else if (p.type === 'file') content.push({ type: 'text', text: fileBlock(p) })
      else if (p.type === 'document') content.push({ type: 'text', text: `[Se adjuntó un PDF (${p.title ?? 'documento'}) que este proveedor no puede leer.]` })
    }
    if (content.length) out.push({ role: 'user', content: content.length === 1 && content[0].type === 'text' ? content[0].text : content })
  }
  return out
}

interface Delta {
  content?: string | null
  tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
}

interface Chunk {
  choices?: Array<{ delta?: Delta; finish_reason?: string | null }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

function mapFinish(reason: string | null | undefined, sawTools: boolean): StopReason {
  if (reason === 'tool_calls' || sawTools) return 'tool_use'
  if (reason === 'length') return 'max_tokens'
  if (reason === 'content_filter') return 'refusal'
  return 'end_turn'
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text || '{}') as unknown
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * The words for a fetch that never left the browser. Offline and refused-by-the-provider look identical
 * from here (TypeError), and they are different problems: one is the person's network, the other is a
 * provider that does not accept calls from a web page — «revisa tu red» was a lie for that one, and it
 * sent people hunting for a break that was not theirs.
 */
function connectionError(name: string): AiError {
  if (!navigator.onLine) return new AiError('No hay conexión a internet. Revisa tu red e inténtalo de nuevo.', true)
  return new AiError(`${name} no respondió a esta página. Puede ser un corte puntual, o que el proveedor no acepte llamadas directas desde un navegador (CORS); el detalle técnico quedó en la consola.`, true)
}

/** Asks an OpenAI-compatible server which models it serves. Chat-capable ids only, sorted. */
export async function listModels(baseUrl: string, apiKey?: string, shared = false): Promise<string[]> {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  let res: Response
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, { headers })
  } catch (err) {
    // Unwrapped, the browser's own words reached the toast — «Failed to fetch», in English, inside an
    // interface that speaks Spanish without jargon.
    console.warn('[ia] no se pudo consultar la lista de modelos:', err)
    throw connectionError(new URL(baseUrl).host)
  }
  if (!res.ok) throw shared ? sharedKeyBusy() : new AiError(res.status === 401 ? 'La llave no es válida.' : `El servidor respondió ${res.status}.`)
  const data = (await res.json()) as { data?: Array<{ id: string }>; models?: Array<{ name: string }> }
  const ids = data.data?.map((m) => m.id) ?? data.models?.map((m) => m.name) ?? []
  const skip = /whisper|tts|orpheus|guard|embedding|safeguard|moderation|dall-e|image|audio|realtime|transcri/i
  return ids.filter((id) => !skip.test(id)).sort()
}

/** Milliseconds the server asked us to wait: Retry-After (seconds or a date) or a rate-limit reset like "1m26.4s" / "712ms". */
function retryAfterFrom(headers: Headers): number | undefined {
  const retryAfter = headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000)
    const at = Date.parse(retryAfter)
    if (!Number.isNaN(at)) return Math.max(0, at - Date.now())
  }
  const reset = headers.get('x-ratelimit-reset-tokens') ?? headers.get('x-ratelimit-reset-requests')
  if (!reset) return undefined
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const
  let ms = 0
  for (const m of reset.matchAll(/([\d.]+)\s*(ms|s|m|h)/g)) ms += Number(m[1]) * unit[m[2] as keyof typeof unit]
  return ms || undefined
}

export function createOpenAICompatProvider(cfg: Config): AiProvider {
  const base = cfg.baseUrl.replace(/\/+$/, '')

  return {
    id: cfg.id,
    name: cfg.name,
    capabilities: { vision: cfg.vision ?? true, documents: false, serverWebFetch: false, effort: false },

    async *chat(req: ChatRequest): AsyncIterable<StreamEvent> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
      if (cfg.id === 'openrouter') {
        headers['HTTP-Referer'] = window.location.origin
        headers['X-Title'] = 'Sky'
      }
      const body = {
        model: req.model,
        stream: true,
        messages: toMessages(req.system, req.messages),
        ...(req.tools?.length
          ? {
              tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
              tool_choice: 'auto',
            }
          : {}),
        max_tokens: req.maxTokens ?? 8000,
        // gpt-oss reasons before answering; the person's effort setting decides how much.
        ...(/gpt-oss/.test(req.model) && req.effort ? { reasoning_effort: req.effort } : {}),
      }

      let res: Response
      try {
        res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: req.signal })
      } catch (err) {
        if (req.signal?.aborted) {
          yield { type: 'done', stopReason: 'aborted', usage: { inputTokens: 0, outputTokens: 0 }, assistant: { role: 'assistant', parts: [] } }
          return
        }
        console.warn(`[ai] ${cfg.name} inalcanzable:`, err)
        yield { type: 'error', error: connectionError(cfg.name) }
        return
      }

      if (!res.ok || !res.body) {
        const retryAfterMs = retryAfterFrom(res.headers)
        const transient = res.status === 429 || res.status >= 500
        const detail = await res.text().catch(() => '')
        // Diagnostics stay in the console; what the person reads is decided below.
        console.warn(`[ai] ${cfg.name} ${res.status} (${req.model}, ${Math.round(JSON.stringify(body).length / 1024)} KB enviados): ${detail.slice(0, 400)}`)
        if (cfg.shared) {
          yield { type: 'error', error: sharedKeyBusy(res.status, retryAfterMs) }
          return
        }
        const msg =
          res.status === 401
            ? `La llave de ${cfg.name} no es válida.`
            : res.status === 404
              ? `El modelo "${req.model}" no existe en ${cfg.name}.`
            : res.status === 429
              ? `${cfg.name} está limitando las solicitudes de «${req.model}» ahora mismo. Espera un momento e inténtalo de nuevo; en Automático, Sky suele escalar sola al siguiente modelo.`
                : res.status >= 500
                  ? `${cfg.name} no está respondiendo ahora mismo. Inténtalo en un momento.`
                  : `${cfg.name} no aceptó la petición (${res.status}).`
        yield { type: 'error', error: new AiError(msg, transient, { status: res.status, retryAfterMs }) }
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let text = ''
      let finish: string | null | undefined
      const calls = new Map<number, { id: string; name: string; args: string }>()
      let usage = { inputTokens: 0, outputTokens: 0 }

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') continue
            let chunk: Chunk
            try {
              chunk = JSON.parse(data) as Chunk
            } catch {
              continue
            }
            if (chunk.error?.message) throw new AiError(chunk.error.message)
            if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 }
            const choice = chunk.choices?.[0]
            if (!choice) continue
            if (choice.finish_reason) finish = choice.finish_reason
            const delta = choice.delta
            if (!delta) continue
            if (delta.content) {
              text += delta.content
              yield { type: 'text', delta: delta.content }
            }
            for (const tc of delta.tool_calls ?? []) {
              const cur = calls.get(tc.index) ?? { id: tc.id ?? `call_${tc.index}`, name: '', args: '' }
              if (tc.id) cur.id = tc.id
              if (tc.function?.name) cur.name += tc.function.name
              if (tc.function?.arguments) cur.args += tc.function.arguments
              calls.set(tc.index, cur)
            }
          }
        }
      } catch (err) {
        if (req.signal?.aborted) {
          yield { type: 'done', stopReason: 'aborted', usage, assistant: { role: 'assistant', parts: [] } }
          return
        }
        yield { type: 'error', error: err instanceof AiError ? err : new AiError(err instanceof Error ? err.message : 'Error de red', true) }
        return
      }

      const parts: Part[] = []
      if (text) parts.push({ type: 'text', text })
      const toolParts: ToolCallPart[] = [...calls.values()].map((c) => ({ type: 'tool_call', id: c.id, name: c.name, input: safeJson(c.args) }))
      for (const call of toolParts) {
        yield { type: 'tool_call', call }
        parts.push(call)
      }
      yield {
        type: 'done',
        stopReason: mapFinish(finish, toolParts.length > 0),
        usage,
        assistant: { role: 'assistant', parts },
      }
    },
  }
}
