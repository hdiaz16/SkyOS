import { AUTO_MODEL, presetFor, type AiSettingsState } from './settings'
import type { Attachment } from './types'

/**
 * Picks a model tier from the shape of the request, without an extra model call.
 * Simple, one-step desktop actions go to the fast tier; open-ended or multi-step work to the deep one.
 */

export type Tier = 'fast' | 'balanced' | 'deep'

export const TIER_LABELS: Record<Tier, string> = { fast: 'rápido', balanced: 'equilibrado', deep: 'profundo' }

const SIMPLE_VERBS =
  /^(abre|abrir|cierra|cerrar|minimiza|muestra|pon|coloca|agrega|añade|quita|crea|crear|nueva?|renombra|mueve|borra|elimina|manda|envía|cambia|activa|desactiva|ordena|acomoda|limpia|busca|encuentra|lista|cu[aá]nt[oa]s?|qu[eé] hora|qu[eé] d[ií]a|vac[ií]a|restaura)\b/i

const COMPLEX_HINTS =
  /\b(analiza|anal[ií]zalo|compara|planea|planifica|propón|propon|redacta|escribe (un|una|el|la)|resume|resúmelo|explica|investiga|organiza (todo|mi|el escritorio)|clasifica|revisa|corrige|traduce|convierte|extrae|genera|diseña|para cada|todos los|todas las|y luego|después|despu[eé]s|además|paso a paso|estrategia|informe|reporte|plantilla|widget personalizado|html)\b/i

export interface RouteInput {
  prompt: string
  attachments?: Attachment[]
  historyLength?: number
  /** Text-only jobs (summaries, transformations) skip the desktop snapshot and lean deeper. */
  textOnly?: boolean
}

export function estimateTier(input: RouteInput): Tier {
  const text = input.prompt.trim()
  const words = text.split(/\s+/).filter(Boolean).length
  if (input.attachments?.length) return 'deep'
  if (input.textOnly) return words > 60 ? 'deep' : 'balanced'
  if (COMPLEX_HINTS.test(text) || words > 45 || text.split(/[.;\n]/).filter((s) => s.trim()).length >= 3) return 'deep'
  if (words <= 12 && SIMPLE_VERBS.test(text)) return 'fast'
  if ((input.historyLength ?? 0) >= 6) return 'balanced'
  return 'balanced'
}

export interface Route {
  model: string
  tier: Tier | null
  auto: boolean
}

/** The concrete model to call for this request under the current settings. */
export function resolveModel(state: AiSettingsState, input: RouteInput, forceTier?: Tier): Route {
  const preset = presetFor(state.provider)
  if (state.model !== AUTO_MODEL || !preset.tiers) return { model: state.model, tier: null, auto: false }
  const tier = forceTier ?? estimateTier(input)
  return { model: preset.tiers[tier], tier, auto: true }
}

/** Short human label for a model id, e.g. "Claude Haiku 4.5" or the raw id when unknown. */
export function modelLabel(state: AiSettingsState, model: string): string {
  const preset = presetFor(state.provider)
  return preset.models.find((m) => m.id === model)?.label ?? model
}
