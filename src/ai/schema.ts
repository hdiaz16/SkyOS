import type { ParamSpec } from '../kernel/commands'
import type { JsonSchema } from './types'

function specToSchema(spec: ParamSpec): Record<string, unknown> {
  const base: Record<string, unknown> = { type: spec.type, description: spec.description }
  if (spec.enum) base.enum = spec.enum
  if (spec.type === 'array') base.items = spec.items ? specToSchema(spec.items) : { type: 'string' }
  if (spec.type === 'object') base.additionalProperties = true
  return base
}

/** Turns a command's parameter table into the JSON Schema a model expects for tool input. */
export function paramsToJsonSchema(params: Record<string, ParamSpec>): JsonSchema {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [name, spec] of Object.entries(params)) {
    properties[name] = specToSchema(spec)
    if (spec.required) required.push(name)
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}
