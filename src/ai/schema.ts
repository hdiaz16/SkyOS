import type { ParamSpec } from '../kernel/commands'
import type { JsonSchema } from './types'

/**
 * A command's parameters, as the JSON Schema a model expects. Every request carries every tool's schema, so
 * what is written here is paid for on each message: parameters whose name already says everything travel
 * without a description, and the descriptions that remain are the ones that change what the model does.
 */

/** Names that need no explanation; their description is noise the model pays for on every request. */
const OBVIOUS = new Set(['id', 'ids', 'name', 'query', 'text', 'content', 'url', 'limit', 'title', 'folderId', 'parentId', 'nodeId'])

/** A description that only restates the name ("Id del elemento", "Nombre") teaches nothing. */
function worthKeeping(name: string, description: string): boolean {
  if (!description) return false
  if (!OBVIOUS.has(name)) return true
  const words = description.replace(/[.·:]/g, '').trim().split(/\s+/)
  // Kept when it says something beyond the obvious, like "root es el escritorio".
  return words.length > 4
}

function specToSchema(name: string, spec: ParamSpec): Record<string, unknown> {
  const base: Record<string, unknown> = { type: spec.type }
  if (worthKeeping(name, spec.description)) base.description = spec.description
  if (spec.enum) base.enum = spec.enum
  if (spec.type === 'array') base.items = spec.items ? specToSchema(name, spec.items) : { type: 'string' }
  if (spec.type === 'object') base.additionalProperties = true
  return base
}

/** Turns a command's parameter table into the JSON Schema a model expects for tool input. */
export function paramsToJsonSchema(params: Record<string, ParamSpec>): JsonSchema {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [name, spec] of Object.entries(params)) {
    properties[name] = specToSchema(name, spec)
    if (spec.required) required.push(name)
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}
