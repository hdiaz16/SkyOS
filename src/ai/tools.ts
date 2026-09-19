import { execute, listCommands, type CommandDef } from '../kernel/commands'
import { paramsToJsonSchema } from './schema'
import type { ToolSpec } from './types'
import { executeMcpTool, isMcpToolName, mcpToolSpecs, type ToolContext } from '../mcp/tools'

/** Tool names may only contain letters, digits, underscores and dashes, so "fs.move" becomes "fs_move". */
export const toolNameFor = (commandId: string) => commandId.replace(/\./g, '_')

function aiCommands(): CommandDef<unknown, unknown>[] {
  return listCommands().filter((c) => c.ai !== false)
}

export function commandIdForTool(name: string): string | undefined {
  return aiCommands().find((c) => toolNameFor(c.id) === name)?.id
}

/**
 * Every AI-visible command, exposed as a tool. Order is stable (registration order) to keep prompt caches
 * warm. The list is the same on every turn on purpose: picking tools per request used to sound frugal, but
 * a tool list that changes between turns changes the request prefix, and the provider's prompt cache — the
 * one that bills the repeated part at a fraction — never gets to hit. Claude Code, Codex and opencode all
 * carry their whole tool manual every turn for exactly this reason.
 */
export function commandTools(only?: string[]): ToolSpec[] {
  return aiCommands()
    .filter((c) => !only || only.includes(c.id))
    .map((c) => ({
      name: toolNameFor(c.id),
      description: c.description,
      inputSchema: paramsToJsonSchema(c.params),
    }))
}

/**
 * Every tool the model may use: Sky's commands plus the tools of the connected apps.
 * `only` restricts to those commands and leaves the apps out (one-shot jobs).
 */
export function allTools(only?: string[], context?: ToolContext): ToolSpec[] {
  return only ? commandTools(only) : [...commandTools(), ...mcpToolSpecs(context)]
}

export interface ToolExecution {
  content: string
  isError: boolean
  label?: string
  entryId?: string
  undoable: boolean
}

const MAX_RESULT_CHARS = 60000

function serialize(value: unknown): string {
  if (value === undefined || value === null) return JSON.stringify({ ok: true })
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n…[recortado]` : text
}

/** Runs a tool call through the command bus under the AI source, so it is journaled and undoable like any user action. */
export async function executeTool(name: string, input: Record<string, unknown>, runId: string): Promise<ToolExecution> {
  if (isMcpToolName(name)) return executeMcpTool(name, input, runId)
  const id = commandIdForTool(name)
  if (!id) return { content: `Herramienta desconocida: ${name}`, isError: true, undoable: false }
  try {
    const { result, entry } = await execute(id, input, { source: 'ai', runId })
    return {
      content: serialize(result),
      isError: false,
      label: entry?.label,
      entryId: entry?.id,
      undoable: !!entry?.undo,
    }
  } catch (err) {
    return { content: err instanceof Error ? err.message : 'Error desconocido', isError: true, undoable: false }
  }
}
