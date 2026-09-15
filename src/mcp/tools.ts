import { nanoid } from 'nanoid'
import { useJournal } from '../kernel/commands'
import type { ToolExecution } from '../ai/tools'
import type { JsonSchema, ToolSpec } from '../ai/types'
import { catalogFor } from './catalog'
import { mcp, useMcp } from './manager'
import { McpError, type CallToolResult, type McpServerRecord, type McpTool, type ToolContent } from './types'

/**
 * Connected apps as tools for the assistant. Names are prefixed with the server so two servers can both
 * offer `search`; order follows the panel so prompt caches stay warm.
 */

const PREFIX = 'mcp_'
const MAX_NAME = 64
const MAX_DESCRIPTION = 420
const MAX_PROP_DESCRIPTION = 170
const MAX_ENUM = 12
const MAX_DEPTH = 2
const MAX_RESULT_CHARS = 60_000
/** Bytes of compacted tool definitions a request may carry; the agent halves it when a provider says "too large". */
export const DEFAULT_MCP_BUDGET_BYTES = 7_000
/** Score bonus for a catalog app's featured tools, so they win the budget over exotic ones. */
const FEATURED_BONUS = 4
export const MIN_MCP_BUDGET_BYTES = 2_000
/** Tools every app conversation needs, whatever the wording. */
const CORE_TOOL_WORDS = ['search', 'fetch', 'get', 'list', 'find', 'query', 'read', 'create', 'update', 'send']

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')

/** Short stable hash so a truncated name still maps to one tool. */
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36).slice(0, 5)
}

export function toolNameFor(server: McpServerRecord, tool: McpTool): string {
  const base = `${PREFIX}${sanitize(server.id)}__${sanitize(tool.name)}`
  if (base.length <= MAX_NAME) return base
  return `${base.slice(0, MAX_NAME - 6)}_${hash(base)}`
}

interface Target {
  server: McpServerRecord
  tool: McpTool
}

function connectedServers(): McpServerRecord[] {
  return useMcp.getState().servers.filter((s) => s.status !== 'disconnected' && s.tools?.length)
}

function targets(): Map<string, Target> {
  const map = new Map<string, Target>()
  for (const server of connectedServers()) for (const tool of server.tools ?? []) map.set(toolNameFor(server, tool), { server, tool })
  return map
}

export const isMcpToolName = (name: string): boolean => name.startsWith(PREFIX)

function short(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

/**
 * A schema the model can still follow, at a fraction of the size: types, properties, required, short
 * descriptions and small enums survive; examples, defaults, titles, unions and deep nesting do not.
 * Servers like Notion ship 60 KB schemas for one tool; free-tier models allow ~8k tokens a minute.
 */
function compactSchema(schema: unknown, depth = 0): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return { type: 'string' }
  const s = schema as Record<string, unknown>
  const union = (s.anyOf ?? s.oneOf) as unknown[] | undefined
  if (s.type === undefined && Array.isArray(union) && union.length) return compactSchema(union.find((u) => (u as { type?: unknown }).type !== 'null') ?? union[0], depth)
  const type = Array.isArray(s.type) ? ((s.type as unknown[]).find((t) => t !== 'null') ?? 'string') : (s.type ?? 'string')
  const out: Record<string, unknown> = { type }
  if (typeof s.description === 'string' && s.description) out.description = short(s.description, MAX_PROP_DESCRIPTION)
  if (Array.isArray(s.enum) && s.enum.length <= MAX_ENUM) out.enum = s.enum
  if (type === 'object') {
    if (depth >= MAX_DEPTH) return out
    const props = s.properties as Record<string, unknown> | undefined
    if (props) out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, compactSchema(v, depth + 1)]))
    if (Array.isArray(s.required) && s.required.length) out.required = s.required
  }
  if (type === 'array') out.items = compactSchema(s.items, depth + 1)
  return out
}

function schemaOf(tool: McpTool): JsonSchema {
  const schema = compactSchema(tool.inputSchema)
  schema.type = 'object'
  if (!schema.properties) schema.properties = {}
  return schema as unknown as JsonSchema
}

/** What the request is about, so only the relevant apps' tools travel with it. */
export interface ToolContext {
  prompt: string
  /** Text of recent turns, for continuity ("y ahora ábrela" after a Notion search). */
  recent?: string
  /** Bytes of tool definitions the request may carry (see DEFAULT_MCP_BUDGET_BYTES). */
  budgetBytes?: number
}

/** Lowercase, accent-free text for matching people's words loosely. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** True when the (normalized) text contains any of the words. */
export function mentions(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(normalize(w)))
}

/** Words of the server's name and, for catalog apps, its keyword list. */
function keywordsFor(server: McpServerRecord): string[] {
  const own = server.name.toLowerCase().split(/\s+/)
  const entry = server.catalogId ? catalogFor(server.catalogId) : undefined
  return [...own, ...(entry?.keywords ?? [])]
}

/** Spanish request words → the English their tools are named in. Stems, so plurals and conjugations match. */
const SYNONYMS: Array<[RegExp, string[]]> = [
  [/^busc|^encuentr|^encontr/, ['search', 'find', 'query']],
  [/^recient|^ultim|^últim/, ['recent', 'latest']],
  [/^pagin|^págin/, ['page', 'pages']],
  [/^document|^archiv/, ['document', 'file', 'files']],
  [/^cre|^nuev|^agreg|^añad|^anad/, ['create', 'new', 'add']],
  [/^actualiz|^edit|^cambi|^modific/, ['update', 'edit']],
  [/^borr|^elimin|^quit/, ['delete', 'remove']],
  [/^lee|^leer|^abr|^muestr|^ver$|^ve$/, ['read', 'get', 'fetch', 'open']],
  [/^list|^cuál|^cual|^qué|^que$/, ['list']],
  [/^correo|^mail|^email/, ['mail', 'email', 'message']],
  [/^envi|^mand/, ['send']],
  [/^respond|^contest/, ['reply']],
  [/^tare|^pendient/, ['task', 'todo']],
  [/^proyect/, ['project']],
  [/^event|^reuni|^cita|^agend|^calendar/, ['event', 'calendar']],
  [/^coment/, ['comment']],
  [/^usuari|^person|^equip/, ['user', 'member', 'team']],
  [/^canal/, ['channel']],
  [/^mensaj/, ['message']],
  [/^canci|^music|^músic|^tema/, ['track', 'song', 'music']],
  [/^playlist|^lista/, ['playlist']],
  [/^artist/, ['artist']],
  [/^repo|^repositor/, ['repo', 'repository']],
  [/^issue|^incidenc|^error/, ['issue']],
  [/^pull|^pr$/, ['pull']],
  [/^complet|^termin|^cerr/, ['complete', 'close']],
  [/^favorit/, ['favorite']],
  [/^compart/, ['shared', 'share']],
  [/^privad/, ['private']],
  [/^base|^tabla/, ['database', 'data source', 'table']],
]

/** The request's words plus their English counterparts, as the tool vocabulary is English. */
function requestWords(prompt: string): string[] {
  const words = prompt.split(/\W+/).filter((w) => w.length > 2)
  const out = new Set(words.filter((w) => w.length > 3))
  for (const w of words) for (const [re, en] of SYNONYMS) if (re.test(w)) for (const e of en) out.add(e)
  return [...out]
}

/** Relevance of one tool to the request: words shared with its name weigh most, then its description, then core verbs. */
function toolScore(tool: McpTool, prompt: string): number {
  const name = normalize(tool.name.replace(/[-_]/g, ' '))
  const text = normalize(`${tool.title ?? ''} ${tool.description ?? ''}`)
  let score = CORE_TOOL_WORDS.some((w) => name.includes(w)) ? 2 : 0
  for (const word of requestWords(prompt)) {
    if (name.includes(word)) score += 3
    else if (text.includes(word)) score += 1
  }
  return score
}

/**
 * The tools the model should see for this request. Requests stay small (free tiers allow about 8k tokens a
 * minute): a connected app contributes tools only when the request, or the conversation just before it,
 * is about that app; tools are compacted, ranked by relevance and added until the byte budget is spent.
 * Without a context, everything.
 */
export function mcpToolSpecs(context?: ToolContext): ToolSpec[] {
  const prompt = context ? normalize(`${context.prompt} ${context.recent ?? ''}`) : ''
  const candidates: Array<{ spec: ToolSpec; score: number }> = []
  for (const [name, { server, tool }] of targets()) {
    const alwaysOn = server.catalogId ? (catalogFor(server.catalogId)?.alwaysOn ?? false) : false
    if (context && !alwaysOn && !mentions(prompt, keywordsFor(server)) && !prompt.includes(`mcp_${sanitize(server.id).toLowerCase()}__`)) continue
    const text = short(tool.description || tool.title || tool.name, MAX_DESCRIPTION)
    const featured = server.catalogId ? (catalogFor(server.catalogId)?.featuredTools?.includes(tool.name) ?? false) : false
    candidates.push({ spec: { name, description: `[${server.name}] ${text}`, inputSchema: schemaOf(tool) }, score: toolScore(tool, prompt) + (featured ? FEATURED_BONUS : 0) })
  }
  if (!context) return candidates.map((c) => c.spec)
  candidates.sort((a, b) => b.score - a.score)
  const budget = context.budgetBytes ?? DEFAULT_MCP_BUDGET_BYTES
  const specs: ToolSpec[] = []
  let used = 0
  for (const { spec } of candidates) {
    const size = JSON.stringify(spec).length
    if (used + size > budget && specs.length) continue
    specs.push(spec)
    used += size
  }
  // Stable order keeps prompt caches warm between turns.
  return specs.sort((a, b) => a.name.localeCompare(b.name))
}

/** A one-line summary per connected app, for the state snapshot the model reads. */
export function connectedAppsSummary(): string[] {
  return connectedServers().map((s) => `- ${s.name}${s.account?.name ? ` (${s.account.name})` : ''}: ${s.tools?.length ?? 0} herramientas${s.status === 'attention' ? ' · necesita reconectarse' : ''}`)
}

function contentToText(content: ToolContent[] | undefined, structured: unknown): string {
  const parts: string[] = []
  for (const c of content ?? []) {
    switch (c.type) {
      case 'text':
        parts.push(c.text)
        break
      case 'image':
        parts.push(`[imagen ${c.mimeType}]`)
        break
      case 'audio':
        parts.push(`[audio ${c.mimeType}]`)
        break
      case 'resource_link':
        parts.push(`${c.name ?? c.uri}: ${c.uri}${c.description ? ` — ${c.description}` : ''}`)
        break
      case 'resource':
        parts.push(c.resource.text ?? `[recurso ${c.resource.uri}]`)
        break
    }
  }
  if (!parts.length && structured !== undefined) parts.push(JSON.stringify(structured))
  const text = parts.join('\n') || JSON.stringify({ ok: true })
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n…[recortado]` : text
}

/** Models like to send "" or null for optional parameters they do not need; servers reject that. Drop them. */
function withoutEmptyOptionals(tool: McpTool, input: Record<string, unknown>): Record<string, unknown> {
  const required = new Set((tool.inputSchema.required as string[] | undefined) ?? [])
  return Object.fromEntries(Object.entries(input).filter(([k, v]) => required.has(k) || (v !== '' && v !== null && v !== undefined)))
}

/** Runs an MCP tool for the assistant. Writes are journaled so the conversation lists them like any other action. */
export async function executeMcpTool(name: string, input: Record<string, unknown>, runId: string): Promise<ToolExecution> {
  const target = targets().get(name)
  if (!target) return { content: `Herramienta desconocida: ${name}`, isError: true, undoable: false }
  const { server, tool } = target
  try {
    const result: CallToolResult = await mcp.callTool(server.id, tool.name, withoutEmptyOptionals(tool, input))
    if (result.resultType === 'input_required') {
      return { content: `${server.name} necesita más información para «${tool.title ?? tool.name}» y Sky aún no puede pedirla en medio de una acción. Pide a la persona los datos que faltan y vuelve a intentarlo con argumentos completos.`, isError: true, undoable: false }
    }
    const content = contentToText(result.content, result.structuredContent)
    if (result.isError) return { content, isError: true, undoable: false }
    const readOnly = tool.annotations?.readOnlyHint === true
    if (readOnly) return { content, isError: false, undoable: false }
    // It happened in someone else's house: it belongs in the journal as history, never as something to undo.
    const entry = { id: nanoid(8), commandId: `mcp.${server.id}.${tool.name}`, label: `${server.name} · ${tool.title ?? tool.name}`, at: Date.now(), source: 'ai' as const, runId, external: true, undone: false }
    useJournal.getState().push(entry)
    return { content, isError: false, label: entry.label, entryId: entry.id, undoable: false }
  } catch (err) {
    const message = err instanceof McpError || err instanceof Error ? err.message : 'Error desconocido'
    return { content: message, isError: true, undoable: false }
  }
}
