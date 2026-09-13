import { nanoid } from 'nanoid'
import type { AiProvider, ChatRequest, Part, StreamEvent, ToolCallPart } from '../types'

/**
 * Development-only provider. It never leaves the browser and exercises the whole agent loop:
 * streaming text, a tool call derived from the prompt, and a final summary.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function* stream(text: string): AsyncIterable<StreamEvent> {
  for (const word of text.split(' ')) {
    await sleep(25)
    yield { type: 'text', delta: `${word} ` }
  }
}

function planFromPrompt(prompt: string): ToolCallPart | null {
  const p = prompt.toLowerCase()
  const name = (re: RegExp) => prompt.match(re)?.[1]?.trim()
  if (/carpeta/.test(p)) {
    return { type: 'tool_call', id: nanoid(8), name: 'fs_createFolder', input: { name: name(/carpeta (?:llamada |que se llame |para |de )?"?([^"]+?)"?$/i) ?? 'Nueva carpeta' } }
  }
  if (/nota/.test(p)) {
    return { type: 'tool_call', id: nanoid(8), name: 'fs_createFile', input: { type: 'note', name: name(/nota (?:llamada |sobre |para |de )?"?([^"]+?)"?$/i) ?? 'Nota' } }
  }
  if (/reloj|widget|temporizador|tareas|clima|divisas|d[oó]lar|recientes/.test(p)) {
    const type = /clima/.test(p)
      ? 'weather'
      : /divisas|d[oó]lar/.test(p)
        ? 'currency'
        : /recientes/.test(p)
          ? 'recent'
          : /reloj/.test(p)
            ? 'clock'
            : /temporizador/.test(p)
              ? 'timer'
              : /tareas/.test(p)
                ? 'todo'
                : 'note'
    return { type: 'tool_call', id: nanoid(8), name: 'widgets_create', input: { type } }
  }
  if (/oscuro|claro|tema/.test(p)) return { type: 'tool_call', id: nanoid(8), name: 'ui_theme', input: { theme: /oscuro|noche/.test(p) ? 'dark' : 'light' } }
  if (/limpia|ordena/.test(p)) return { type: 'tool_call', id: nanoid(8), name: 'ui_cleanDesktop', input: {} }
  if (/cu[aá]ntos|qu[eé] tengo|lista/.test(p)) return { type: 'tool_call', id: nanoid(8), name: 'fs_list', input: { parentId: 'root' } }
  return null
}

export function createMockProvider(): AiProvider {
  return {
    id: 'mock',
    name: 'Simulador',
    capabilities: { vision: false, documents: false, serverWebFetch: false, effort: false },

    async *chat(req: ChatRequest): AsyncIterable<StreamEvent> {
      const last = req.messages[req.messages.length - 1]
      const hasToolResults = last.parts.some((p) => p.type === 'tool_result')

      // Background jobs ask for JSON only; answer with an empty result so nothing is invented.
      if (/únicamente con JSON/i.test(req.system) && !req.tools?.length) {
        yield { type: 'text', delta: '[]' }
        yield { type: 'done', stopReason: 'end_turn', usage: { inputTokens: 5, outputTokens: 1 }, assistant: { role: 'assistant', parts: [{ type: 'text', text: '[]' }] } }
        return
      }

      if (hasToolResults) {
        const result = last.parts.find((p) => p.type === 'tool_result')
        const text = result?.type === 'tool_result' && result.isError ? `No pude completarlo: ${result.content}` : 'Listo, ya quedó hecho en tu escritorio.'
        yield* stream(text)
        yield { type: 'done', stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 10 }, assistant: { role: 'assistant', parts: [{ type: 'text', text }] } }
        return
      }

      // The actual request is the last text part; earlier parts carry the desktop snapshot.
      const texts = last.parts.filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
      const prompt = texts[texts.length - 1]?.text ?? ''

      // Text-only jobs (transformations, summaries, editor help) get a visibly simulated answer, never a tool call.
      if (!req.tools?.length) {
        const text = `Resultado simulado para: ${prompt.replace(/\s+/g, ' ').slice(0, 120)}…\n\nConfigura un proveedor real en Ajustes para obtener texto de verdad.`
        yield* stream(text)
        yield { type: 'done', stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 30 }, assistant: { role: 'assistant', parts: [{ type: 'text', text }] } }
        return
      }

      const call = planFromPrompt(prompt)
      if (!call) {
        const text = `Soy el simulador de Sky. Entendí: "${prompt.slice(0, 80)}". Configura un proveedor real en Ajustes para respuestas de verdad.`
        yield* stream(text)
        yield { type: 'done', stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 20 }, assistant: { role: 'assistant', parts: [{ type: 'text', text }] } }
        return
      }
      const intro = 'Voy a hacerlo.'
      yield* stream(intro)
      yield { type: 'tool_call', call }
      yield {
        type: 'done',
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
        assistant: { role: 'assistant', parts: [{ type: 'text', text: intro }, call] },
      }
    },
  }
}
