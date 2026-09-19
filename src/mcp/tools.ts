import { nanoid } from 'nanoid'
import { useJournal } from '../kernel/commands'
import { allowed, DECLINED } from '../kernel/consent'
import type { ToolExecution } from '../ai/tools'
import type { JsonSchema, ToolSpec } from '../ai/types'
import { mcp, useMcp } from './manager'
import { McpError, type CallToolResult, type McpServerRecord, type McpTool, type ToolContent } from './types'
import { catalogFor } from './catalog'

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
export const MIN_MCP_BUDGET_BYTES = 2_000

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
  /** Whole manual, or the commands the request is about (see ai/tools.ts). */
  strategy?: 'full' | 'compact'
  /** Internal tools a compact request may carry, search included. */
  maxTools?: number
  /** Commands the model asked for by name through the search tool; they ride on top of the routed ones. */
  extraIds?: string[]
}

/** Lowercase, accent-free text for matching people's words loosely. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** True when the (normalized) text contains any of the words. */
export function mentions(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(normalize(w)))
}

function serverWords(server: McpServerRecord): string[] {
  const catalog = server.catalogId ? catalogFor(server.catalogId) : undefined
  return [server.id, server.name, ...(catalog?.keywords ?? [])].map(normalize).filter((word) => word.length > 2)
}

function mentionedServer(server: McpServerRecord, text: string): boolean {
  const normalized = normalize(text)
  return serverWords(server).some((word) => normalized.includes(word))
}

/**
 * Chooses an app only when the current request names it (or names its vocabulary). A bare follow-up can
 * continue with an app from the last turns. No incidental desktop text ever participates in this decision.
 */
export function relevantServers(context?: ToolContext): McpServerRecord[] {
  if (!context) return []
  const servers = connectedServers().sort((a, b) => a.id.localeCompare(b.id))
  const direct = servers.filter((server) => mentionedServer(server, context.prompt))
  if (direct.length) {
    const prompt = normalize(context.prompt)
    const explicitlyNamed = direct.filter((server) => [normalize(server.id), normalize(server.name)].some((name) => prompt.includes(name)))
    // A shared word such as "mensaje" must not pull Gmail and Slack together. Several apps are allowed
    // only when the person named several of them (for example, "Gmail y GitHub").
    return explicitlyNamed.length > 1 ? explicitlyNamed : direct.slice(0, 1)
  }
  const isFollowUp = /^(y |tambien |también |ahora |hazlo|hazla|abrelo|ábrelo|envialo|envíalo|continua|continúa)/i.test(context.prompt.trim())
  if (!isFollowUp) return []
  const continued = servers.filter((server) => mentionedServer(server, context.recent ?? '') || normalize(context.recent ?? '').includes(`mcp_${sanitize(server.id)}__`))
  // Continuity is intentionally singular: unclear references should not flood the next request with apps.
  return continued.slice(0, 1)
}

/** Stable schemas within one selected app; unrelated connected apps do not travel. */
export function mcpToolSpecs(context?: ToolContext): ToolSpec[] {
  const specs: ToolSpec[] = []
  const selected = new Set(relevantServers(context).map((server) => server.id))
  for (const [name, { server, tool }] of targets()) {
    if (!selected.has(server.id)) continue
    const text = short(tool.description || tool.title || tool.name, MAX_DESCRIPTION)
    specs.push({ name, description: `[${server.name}] ${text}`, inputSchema: schemaOf(tool) })
  }
  specs.sort((a, b) => a.name.localeCompare(b.name))
  const budget = context?.budgetBytes ?? DEFAULT_MCP_BUDGET_BYTES
  const out: ToolSpec[] = []
  let used = 0
  for (const spec of specs) {
    const size = JSON.stringify(spec).length
    if (used + size > budget && out.length) break
    out.push(spec)
    used += size
  }
  return out
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
    // A write in someone else's house never happens on the model's word alone.
    if (tool.annotations?.readOnlyHint !== true) {
      const ok = await allowed('external', {
        title: `¿${server.name}: ${tool.title ?? tool.name}?`,
        detail: `Ocurre en ${server.name}, fuera de este equipo: desde aquí no se puede deshacer.`,
      })
      if (!ok) return { content: DECLINED, isError: true, undoable: false }
    }
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
