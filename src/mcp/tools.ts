import { nanoid } from 'nanoid'
import { useJournal } from '../kernel/commands'
import type { ToolExecution } from '../ai/tools'
import type { JsonSchema, ToolSpec } from '../ai/types'
import { mcp, useMcp } from './manager'
import { McpError, type CallToolResult, type McpServerRecord, type McpTool, type ToolContent } from './types'

/**
 * Connected apps as tools for the assistant. Names are prefixed with the server so two servers can both
 * offer `search`; order follows the panel so prompt caches stay warm.
 */

const PREFIX = 'mcp_'
const MAX_NAME = 64
const MAX_DESCRIPTION = 1500
const MAX_RESULT_CHARS = 60_000

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

function schemaOf(tool: McpTool): JsonSchema {
  const schema = { ...tool.inputSchema } as Record<string, unknown>
  if (schema.type !== 'object') schema.type = 'object'
  if (!schema.properties) schema.properties = {}
  return schema as unknown as JsonSchema
}

/** Every tool of every connected app, ready for the model. */
export function mcpToolSpecs(): ToolSpec[] {
  const specs: ToolSpec[] = []
  for (const [name, { server, tool }] of targets()) {
    const text = tool.description || tool.title || tool.name
    specs.push({ name, description: `[${server.name}] ${text}`.slice(0, MAX_DESCRIPTION), inputSchema: schemaOf(tool) })
  }
  return specs
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

/** Runs an MCP tool for the assistant. Writes are journaled so the conversation lists them like any other action. */
export async function executeMcpTool(name: string, input: Record<string, unknown>, runId: string): Promise<ToolExecution> {
  const target = targets().get(name)
  if (!target) return { content: `Herramienta desconocida: ${name}`, isError: true, undoable: false }
  const { server, tool } = target
  try {
    const result: CallToolResult = await mcp.callTool(server.id, tool.name, input)
    if (result.resultType === 'input_required') {
      return { content: `${server.name} necesita más información para «${tool.title ?? tool.name}» y Sky aún no puede pedirla en medio de una acción. Pide a la persona los datos que faltan y vuelve a intentarlo con argumentos completos.`, isError: true, undoable: false }
    }
    const content = contentToText(result.content, result.structuredContent)
    if (result.isError) return { content, isError: true, undoable: false }
    const readOnly = tool.annotations?.readOnlyHint === true
    if (readOnly) return { content, isError: false, undoable: false }
    const entry = { id: nanoid(8), commandId: `mcp.${server.id}.${tool.name}`, label: `${server.name} · ${tool.title ?? tool.name}`, at: Date.now(), source: 'ai' as const, runId, undone: false }
    useJournal.getState().push(entry)
    return { content, isError: false, label: entry.label, entryId: entry.id, undoable: false }
  } catch (err) {
    const message = err instanceof McpError || err instanceof Error ? err.message : 'Error desconocido'
    return { content: message, isError: true, undoable: false }
  }
}
