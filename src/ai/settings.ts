import { create } from 'zustand'
import type { Effort, ModelInfo } from './types'

export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'ollama' | 'custom' | 'mock'

export interface ProviderPreset {
  id: ProviderId
  name: string
  needsKey: boolean
  /** OpenAI-compatible base URL, when applicable. */
  baseUrl?: string
  models: ModelInfo[]
  modelHint: string
  devOnly?: boolean
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    needsKey: true,
    models: [
      { id: 'claude-opus-5', label: 'Claude Opus 5', tier: 'deep', vision: true },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', tier: 'balanced', vision: true },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'fast', vision: true },
    ],
    modelHint: 'claude-opus-5',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    needsKey: true,
    baseUrl: 'https://api.openai.com/v1',
    models: [],
    modelHint: 'p. ej. gpt-5',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    needsKey: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [],
    modelHint: 'p. ej. anthropic/claude-sonnet-5',
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    needsKey: false,
    baseUrl: 'http://localhost:11434/v1',
    models: [],
    modelHint: 'p. ej. llama3.1 o qwen2.5',
  },
  {
    id: 'custom',
    name: 'Compatible con OpenAI',
    needsKey: false,
    baseUrl: '',
    models: [],
    modelHint: 'nombre del modelo',
  },
  {
    id: 'mock',
    name: 'Simulador (desarrollo)',
    needsKey: false,
    models: [{ id: 'mock', label: 'Simulador', tier: 'fast', vision: false }],
    modelHint: 'mock',
    devOnly: true,
  },
]

export const presetFor = (id: ProviderId): ProviderPreset => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]

export interface AiSettingsState {
  provider: ProviderId
  model: string
  effort: Effort
  keys: Partial<Record<ProviderId, string>>
  baseUrls: Partial<Record<ProviderId, string>>
  setProvider: (id: ProviderId) => void
  setModel: (model: string) => void
  setEffort: (effort: Effort) => void
  setKey: (id: ProviderId, key: string) => void
  setBaseUrl: (id: ProviderId, url: string) => void
}

const KEY = 'mesa:ai'

type Persisted = Pick<AiSettingsState, 'provider' | 'model' | 'effort' | 'keys' | 'baseUrls'>

const DEFAULTS: Persisted = {
  provider: 'anthropic',
  model: 'claude-opus-5',
  effort: 'medium',
  keys: {},
  baseUrls: {},
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return { ...DEFAULTS, ...parsed, keys: parsed.keys ?? {}, baseUrls: parsed.baseUrls ?? {} }
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
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* storage unavailable */
  }
}

export const useAiSettings = create<AiSettingsState>((set, get) => ({
  ...load(),
  setProvider: (provider) => {
    const preset = presetFor(provider)
    const model = preset.models[0]?.id ?? get().model
    set({ provider, model })
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
}))

/** True when the selected provider has what it needs to make a request. */
export function isAiConfigured(state: AiSettingsState = useAiSettings.getState()): boolean {
  const preset = presetFor(state.provider)
  if (!state.model.trim()) return false
  if (preset.needsKey && !state.keys[state.provider]) return false
  if (state.provider === 'custom' && !state.baseUrls.custom) return false
  return true
}
