import { create } from 'zustand'
import { sessionSuffix } from '../system/session'
import type { Effort, ModelInfo } from './types'

export type ProviderId = 'groq' | 'anthropic' | 'openai' | 'openrouter' | 'ollama' | 'custom' | 'mock'

/** Model of each speed tier, used by the automatic router and by background chores. */
export interface ModelTiers {
  fast: string
  balanced: string
  deep: string
}

export interface ProviderPreset {
  id: ProviderId
  name: string
  tagline: string
  needsKey: boolean
  /** Where to create a key. */
  keyUrl?: string
  /** OpenAI-compatible base URL, when applicable. */
  baseUrl?: string
  models: ModelInfo[]
  /** Present when the provider offers models of clearly different speed, enabling "auto". */
  tiers?: ModelTiers
  modelHint: string
  /** Whether image input works for this provider's typical models. */
  vision: boolean
  devOnly?: boolean
}

export const AUTO_MODEL = 'auto'

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'groq',
    name: 'Groq',
    tagline: 'Gratis para empezar y casi instantáneo: 8B para el día a día, 70B solo para lo complejo.',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', tier: 'fast', vision: false },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', tier: 'deep', vision: false },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', tier: 'deep', vision: false },
      { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', tier: 'balanced', vision: false },
      { id: 'qwen/qwen3.6-27b', label: 'Qwen 3.6 27B', tier: 'balanced', vision: false },
    ],
    // The 8B model has by far the most generous free limits, so it carries everything but the heavy work.
    tiers: { fast: 'llama-3.1-8b-instant', balanced: 'llama-3.1-8b-instant', deep: 'llama-3.3-70b-versatile' },
    modelHint: 'llama-3.1-8b-instant',
    vision: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    tagline: 'El mejor criterio: lee PDF, imágenes y páginas web.',
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-opus-5', label: 'Claude Opus 5', tier: 'deep', vision: true },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', tier: 'balanced', vision: true },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'fast', vision: true },
    ],
    tiers: { fast: 'claude-haiku-4-5', balanced: 'claude-sonnet-5', deep: 'claude-opus-5' },
    modelHint: 'claude-opus-5',
    vision: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'Modelos GPT con tu propia llave.',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    models: [],
    modelHint: 'p. ej. gpt-5',
    vision: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    tagline: 'Cientos de modelos con una sola llave.',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [],
    modelHint: 'p. ej. anthropic/claude-sonnet-5',
    vision: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    tagline: 'Modelos en tu propia máquina, sin llave.',
    needsKey: false,
    baseUrl: 'http://localhost:11434/v1',
    models: [],
    modelHint: 'p. ej. llama3.1 o qwen2.5',
    vision: false,
  },
  {
    id: 'custom',
    name: 'Compatible con OpenAI',
    tagline: 'Cualquier servidor que hable el protocolo de OpenAI.',
    needsKey: false,
    baseUrl: '',
    models: [],
    modelHint: 'nombre del modelo',
    vision: false,
  },
  {
    id: 'mock',
    name: 'Simulador (desarrollo)',
    tagline: 'Imita el ciclo de herramientas sin conectarse a nada.',
    needsKey: false,
    models: [{ id: 'mock', label: 'Simulador', tier: 'fast', vision: false }],
    modelHint: 'mock',
    vision: false,
    devOnly: true,
  },
]

export const presetFor = (id: ProviderId): ProviderPreset => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]

export interface AiSettingsState {
  provider: ProviderId
  /** A model id, or "auto" to let Sky pick by task difficulty (tiered providers only). */
  model: string
  effort: Effort
  keys: Partial<Record<ProviderId, string>>
  baseUrls: Partial<Record<ProviderId, string>>
  /** Models discovered from the provider's /models endpoint, per provider. */
  discovered: Partial<Record<ProviderId, string[]>>
  setProvider: (id: ProviderId) => void
  setModel: (model: string) => void
  setEffort: (effort: Effort) => void
  setKey: (id: ProviderId, key: string) => void
  setBaseUrl: (id: ProviderId, url: string) => void
  setDiscovered: (id: ProviderId, models: string[]) => void
}

const KEY = `mesa:ai${sessionSuffix()}`

type Persisted = Pick<AiSettingsState, 'provider' | 'model' | 'effort' | 'keys' | 'baseUrls' | 'discovered'>

const DEFAULTS: Persisted = {
  provider: 'groq',
  model: AUTO_MODEL,
  effort: 'medium',
  keys: {},
  baseUrls: {},
  discovered: {},
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return { ...DEFAULTS, ...parsed, keys: parsed.keys ?? {}, baseUrls: parsed.baseUrls ?? {}, discovered: parsed.discovered ?? {} }
  } catch {
    return DEFAULTS
  }
}

function persist(state: AiSettingsState): void {
  const data: Persisted = {
    provider: state.provider,
    model: state.model,
    effort: state.effort,
    keys: state.keys,
    baseUrls: state.baseUrls,
    discovered: state.discovered,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* storage unavailable */
  }
}

/** Writes AI settings for an account that is not signed in yet (onboarding). */
export function persistAiSettingsFor(userId: string, data: Partial<Persisted>): void {
  try {
    localStorage.setItem(`mesa:ai:${userId}`, JSON.stringify({ ...DEFAULTS, ...data }))
  } catch {
    /* ignore */
  }
}

/** Sensible model when switching provider: auto for tiered providers, else the first known model. */
export function defaultModelFor(preset: ProviderPreset): string {
  return preset.tiers ? AUTO_MODEL : preset.models[0]?.id ?? ''
}

export const useAiSettings = create<AiSettingsState>((set, get) => ({
  ...load(),
  setProvider: (provider) => {
    set({ provider, model: defaultModelFor(presetFor(provider)) })
    persist(get())
  },
  setModel: (model) => {
    set({ model })
    persist(get())
  },
  setEffort: (effort) => {
    set({ effort })
    persist(get())
  },
  setKey: (id, key) => {
    set((s) => ({ keys: { ...s.keys, [id]: key.trim() } }))
    persist(get())
  },
  setBaseUrl: (id, url) => {
    set((s) => ({ baseUrls: { ...s.baseUrls, [id]: url.trim() } }))
    persist(get())
  },
  setDiscovered: (id, models) => {
    set((s) => ({ discovered: { ...s.discovered, [id]: models } }))
    persist(get())
  },
}))

/** A quicker, cheaper model for background chores (indexing, classification) when the provider offers one. */
export function fastModelFor(state: AiSettingsState = useAiSettings.getState()): string | undefined {
  const preset = presetFor(state.provider)
  if (preset.tiers) return preset.tiers.fast
  return undefined
}

/** True when the selected provider has what it needs to make a request. */
export function isAiConfigured(state: AiSettingsState = useAiSettings.getState()): boolean {
  const preset = presetFor(state.provider)
  if (!state.model.trim()) return false
  if (state.model === AUTO_MODEL && !preset.tiers) return false
  if (preset.needsKey && !state.keys[state.provider]) return false
  if (state.provider === 'custom' && !state.baseUrls.custom) return false
  return true
}
