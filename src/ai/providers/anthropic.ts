import Anthropic from '@anthropic-ai/sdk'
import { AiError, fileBlock, type AiProvider, type ChatMessage, type ChatRequest, type Part, type StopReason, type StreamEvent } from '../types'

interface ModelCaps {
  effort: boolean
  fallbacks: boolean
}

const CAPS: Record<string, ModelCaps> = {
  'claude-opus-5': { effort: true, fallbacks: true },
  'claude-fable-5-1': { effort: true, fallbacks: true },
  'claude-sonnet-5': { effort: true, fallbacks: false },
  'claude-haiku-4-5': { effort: false, fallbacks: false },
}

const capsFor = (model: string): ModelCaps => CAPS[model] ?? { effort: false, fallbacks: false }

type BetaParams = Parameters<Anthropic['beta']['messages']['stream']>[0]
type BetaBlockParam = Anthropic.Beta.BetaContentBlockParam
type BetaMessageParam = Anthropic.Beta.BetaMessageParam
type BetaToolUnion = Anthropic.Beta.BetaToolUnion

function toBlocks(parts: Part[]): BetaBlockParam[] {
  const blocks: BetaBlockParam[] = []
  for (const part of parts) {
    switch (part.type) {
      case 'text':
        if (part.text.trim()) blocks.push({ type: 'text', text: part.text })
        break
      case 'image':
        blocks.push({ type: 'image', source: { type: 'base64', media_type: part.mediaType, data: part.data } })
        break
      case 'file':
        blocks.push({ type: 'text', text: fileBlock(part) })
        break
      case 'document':
        blocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: part.data },
          ...(part.title ? { title: part.title } : {}),
        })
        break
      case 'tool_call':
        blocks.push({ type: 'tool_use', id: part.id, name: part.name, input: part.input })
        break
      case 'tool_result':
        blocks.push({
          type: 'tool_result',
          tool_use_id: part.toolCallId,
          content: part.content,
          ...(part.isError ? { is_error: true } : {}),
        })
        break
    }
  }
  return blocks
}

function toMessages(messages: ChatMessage[], model: string): BetaMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.raw?.provider === 'anthropic' && m.raw.model === model) {
      return { role: 'assistant', content: m.raw.content as BetaBlockParam[] }
    }
    const content = toBlocks(m.parts)
    return { role: m.role, content: content.length ? content : [{ type: 'text', text: '…' }] }
  })
}

function mapStop(reason: Anthropic.Beta.BetaStopReason | null): StopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn'
    case 'tool_use':
      return 'tool_use'
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens'
    case 'refusal':
      return 'refusal'
    case 'pause_turn':
      return 'pause_turn'
    default:
      return 'other'
  }
}

function friendlyError(err: unknown): AiError {
  if (err instanceof Anthropic.AuthenticationError) return new AiError('La llave de API de Anthropic no es válida.')
  if (err instanceof Anthropic.PermissionDeniedError) return new AiError('Esta llave no tiene permiso para usar ese modelo.')
  if (err instanceof Anthropic.NotFoundError) return new AiError('El modelo indicado no existe.')
  if (err instanceof Anthropic.RateLimitError) return new AiError('Límite de uso alcanzado. Intenta en unos segundos.', true)
  if (err instanceof Anthropic.BadRequestError) return new AiError(`Anthropic rechazó la petición: ${err.message}`)
  if (err instanceof Anthropic.APIConnectionError) return new AiError('No hay conexión con Anthropic.', true)
  if (err instanceof Anthropic.APIError) return new AiError(`Error de Anthropic (${err.status ?? '?'}): ${err.message}`, true)
  return new AiError(err instanceof Error ? err.message : 'Error desconocido')
}

function safeJson(text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  try {
    const value = JSON.parse(text) as unknown
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function createAnthropicProvider(apiKey: string): AiProvider {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 })

  return {
    id: 'anthropic',
    name: 'Anthropic',
    capabilities: { vision: true, documents: true, serverWebFetch: true, effort: true },

    async *chat(req: ChatRequest): AsyncIterable<StreamEvent> {
      const caps = capsFor(req.model)
      const tools: BetaToolUnion[] = (req.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      }))
      if (req.serverTools?.includes('web_fetch')) tools.push({ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 })
      if (req.serverTools?.includes('web_search')) tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 3 })

      const params: BetaParams = {
        model: req.model,
        max_tokens: req.maxTokens ?? 32000,
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: toMessages(req.messages, req.model),
        ...(tools.length ? { tools } : {}),
        ...(caps.effort && req.effort ? { output_config: { effort: req.effort } } : {}),
        // Server-side refusal fallbacks: on a policy decline the API re-runs on a fallback model in the same call.
        ...(caps.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      }

      const pending = new Map<number, { id: string; name: string; json: string }>()
      const stream = client.beta.messages.stream(params, { signal: req.signal })

      try {
        for await (const event of stream) {
          switch (event.type) {
            case 'content_block_start':
              if (event.content_block.type === 'tool_use') {
                pending.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: '' })
              } else if (event.content_block.type === 'server_tool_use') {
                yield { type: 'server_tool', name: event.content_block.name, input: event.content_block.input }
              }
              break
            case 'content_block_delta':
              if (event.delta.type === 'text_delta') yield { type: 'text', delta: event.delta.text }
              else if (event.delta.type === 'input_json_delta') {
                const buf = pending.get(event.index)
                if (buf) buf.json += event.delta.partial_json
              }
              break
            case 'content_block_stop': {
              const buf = pending.get(event.index)
              if (buf) {
                pending.delete(event.index)
                yield { type: 'tool_call', call: { type: 'tool_call', id: buf.id, name: buf.name, input: safeJson(buf.json) } }
              }
              break
            }
          }
        }

        const final = await stream.finalMessage()
        const parts: Part[] = []
        for (const block of final.content) {
          if (block.type === 'text') parts.push({ type: 'text', text: block.text })
          else if (block.type === 'tool_use') {
            parts.push({ type: 'tool_call', id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> })
          }
        }
        const stopReason = mapStop(final.stop_reason)
        yield {
          type: 'done',
          stopReason,
          usage: {
            inputTokens: final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
            cacheReadTokens: final.usage.cache_read_input_tokens ?? undefined,
          },
          assistant: {
            role: 'assistant',
            parts,
            raw: { provider: 'anthropic', model: req.model, content: final.content },
          },
          ...(stopReason === 'refusal' ? { refusal: final.stop_details?.explanation ?? undefined } : {}),
        }
      } catch (err) {
        if (err instanceof Anthropic.APIUserAbortError || req.signal?.aborted) {
          yield {
            type: 'done',
            stopReason: 'aborted',
            usage: { inputTokens: 0, outputTokens: 0 },
            assistant: { role: 'assistant', parts: [] },
          }
          return
        }
        yield { type: 'error', error: friendlyError(err) }
      }
    },
  }
}
