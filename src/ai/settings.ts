import { create } from 'zustand'
import { sessionSuffix } from '../system/session'
import { AI_BRIDGE_URL, DEFAULT_GROQ_KEY, hasAiProxy, hasSharedGroqKey, sharedGroqBaseUrl } from '../config'
import type { Effort, ModelInfo } from './types'

export type ProviderId = 'groq' | 'anthropic' | 'openai' | 'gemini' | 'glm' | 'openrouter' | 'ollama' | 'custom' | 'mock'

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
  /** Tiers are not written here: they are read from the provider's own model list each time it changes. */
  autoTiers?: boolean
  modelHint: string
  /** Whether image input works for this provider's typical models. */
  vision: boolean
  /** The provider sends no CORS headers, so a page can never call it straight: with `VITE_BRIDGE_URL`
   *  named, its requests ride the local bridge (bridge/); without it, the error says so honestly. */
  relay?: boolean
  devOnly?: boolean
}

export const AUTO_MODEL = 'auto'

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'groq',
    name: 'Groq',
    tagline: 'Gratis para empezar y casi instantáneo: GPT-OSS 20B para el día a día, 120B solo para lo complejo.',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    // Verified against the account on 2026-09-13; the Llama 3.x ids are no longer served there.
    models: [
      { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', tier: 'fast', vision: false },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', tier: 'deep', vision: false },
      { id: 'qwen/qwen3.6-27b', label: 'Qwen 3.6 27B', tier: 'balanced', vision: false },
      { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B', tier: 'balanced', vision: false },
      { id: 'groq/compound-mini', label: 'Compound Mini (con búsqueda web)', tier: 'balanced', vision: false, tools: false },
    ],
    // The 20B model carries everything but the heavy work; it is the cheapest on the free tier.
    tiers: { fast: 'openai/gpt-oss-20b', balanced: 'openai/gpt-oss-20b', deep: 'openai/gpt-oss-120b' },
    modelHint: 'openai/gpt-oss-20b',
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
    id: 'gemini',
    name: 'Google Gemini',
    tagline: 'Gemini con tu llave de AI Studio: rápido, con visión, y el relevo natural cuando Groq está saturado.',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'fast', vision: true },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'deep', vision: true },
    ],
    tiers: { fast: 'gemini-2.5-flash', balanced: 'gemini-2.5-flash', deep: 'gemini-2.5-pro' },
    modelHint: 'gemini-2.5-flash',
    vision: true,
  },
  {
    id: 'glm',
    name: 'GLM (Z.ai)',
    tagline: 'Los modelos GLM de Z.ai con tu propia llave: buen criterio para código y trabajo largo. El Flash es gratis y carga lo cotidiano; la lista de modelos llega viva del proveedor.',
    needsKey: true,
    keyUrl: 'https://z.ai/manage-apikey/apikey',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    // No models are written here: what Z.ai serves today is asked to Z.ai itself, so new generations
    // (and retirements) arrive without anyone editing this file.
    models: [],
    // Z.ai answers a preflight with no CORS headers: a page can never call it straight. With the bridge
    // named (VITE_BRIDGE_URL), requests repeat from Node, where that refusal does not apply.
    relay: true,
    autoTiers: true,
    modelHint: 'p. ej. glm-4.6',
    // The eyes are a separate family (-v): a request carrying an image switches to it when the live list
    // offers one (router.ts), so the talkers can stay text-only.
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

/** The other jobs that cannot hold a conversation: embeddings, guardrails, video, audio. */
const NOT_CHAT_CORE = /embed|rerank|guard|video|realtime|audio|tts|stt|asr|image|moderation/i
/** The names of the models with eyes: glm-4.5v, qwen2.5-vl-72b, gemma-3-vision, llava-v1.6. */
const VISION = /(^|[-_.\d])(v(ision)?|vl)([-_.\d]|$)/i
/** Ids that cannot take a chat: the core jobs above, plus the vision-only ones (tiers want talkers). */
const NOT_CHAT = new RegExp(`${NOT_CHAT_CORE.source}|${VISION.source}`, 'i')
/** The names providers give their small, cheap models: Air, Mini, Flash, Turbo and friends. */
const CHEAP = /(^|[-_.])(air|airx|mini|flash|flashx|lite|small|nano|turbo|haste|swift)($|[-_.\d])/i
/** The family providers give away free (Z.ai's glm-*-flash costs nothing): the everyday workhorse. */
const FLASH = /flash/i

/** The version inside a model id, so generations can be compared: glm-4.6 → 4.6. Zero when there is none. */
const versionOf = (id: string): number => {
  const nums = [...id.matchAll(/\d+(?:\.\d+)*/g)].map((m) => parseFloat(m[0]))
  return nums.length ? Math.max(...nums) : 0
}

/**
 * The provider's model with eyes, for requests that carry an image: the newest generation naming itself
 * vision (glm-4.5v, glm-4.6v…), ignoring the other non-chat jobs. Null when the list has none, and then
 * the image travels with the model the tiers chose — the provider answers for what its model cannot see.
 */
export function inferVisionModel(ids: string[]): string | null {
  const candidates = ids.filter((id) => VISION.test(id) && !NOT_CHAT_CORE.test(id))
  if (!candidates.length) return null
  return candidates.sort((a, b) => versionOf(b) - versionOf(a))[0]
}

/**
 * Tiers read from the names the provider itself lists, so nothing is written down to go stale: the Flash
 * family —the one providers serve for free— carries the everyday work, fast and balanced both, and only the
 * genuinely hard escalates to the full model; its cheap markers (Air and friends) play the same part when
 * there is no Flash. When nothing is listed, there are no tiers and the person picks by hand.
 */
export function inferTiers(ids: string[]): ModelTiers | null {
  const usable = ids.filter((id) => !NOT_CHAT.test(id))
  if (!usable.length) return null
  const byVersion = [...usable].sort((a, b) => versionOf(b) - versionOf(a))
  const cheap = byVersion.find((id) => FLASH.test(id)) ?? byVersion.find((id) => CHEAP.test(id))
  const full = byVersion.filter((id) => !CHEAP.test(id))
  const deep = full[0] ?? byVersion[0]
  const balanced = cheap ?? full[1] ?? deep
  const fast = cheap ?? balanced
  return { fast, balanced, deep }
}

/** The tiers a request routes with: the provider's own when it has them, else the ones inferred from its live list. */
export function effectiveTiers(state: AiSettingsState = useAiSettings.getState(), preset: ProviderPreset = presetFor(state.provider)): ModelTiers | undefined {
  if (preset.tiers) return preset.tiers
  if (!preset.autoTiers) return undefined
  return inferTiers(state.discovered[preset.id] ?? []) ?? undefined
}

/**
 * Models that read the depth setting: the Claude ones that declare it (providers/anthropic.ts, CAPS) and the
 * gpt-oss family, which turns it into reasoning_effort (providers/openaiCompat.ts). Haiku and the rest ignore it.
 */
const READS_EFFORT = /^claude-(opus|sonnet|fable)|gpt-oss/

/**
 * Whether «Profundidad» changes anything for what is chosen. The setting travels on every request, so drawing
 * the control only for Anthropic left it stuck on «media» on Groq — the provider everyone starts on, and one
 * where it does change how Sky thinks.
 */
export function usesEffort(state: AiSettingsState = useAiSettings.getState()): boolean {
  const preset = presetFor(state.provider)
  const tiers = effectiveTiers(state, preset)
  const models = state.model === AUTO_MODEL && tiers ? [tiers.fast, tiers.balanced, tiers.deep] : [state.model]
  return models.some((m) => READS_EFFORT.test(m))
}

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

/**
 * Sky's included Groq key never enters the settings state or localStorage: it is resolved at request time
 * (`resolveKey`), so no screen can display it and what each person stores is only ever their own.
 * Older accounts that had it persisted are cleaned on load.
 */
function withoutSharedKey(keys: Partial<Record<ProviderId, string>>): Partial<Record<ProviderId, string>> {
  if (!keys.groq || keys.groq !== DEFAULT_GROQ_KEY) return keys
  const own = { ...keys }
  delete own.groq
  return own
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Persisted>
    const state: Persisted = {
      ...DEFAULTS,
      ...parsed,
      keys: withoutSharedKey(parsed.keys ?? {}),
      baseUrls: parsed.baseUrls ?? {},
      discovered: parsed.discovered ?? {},
    }
    // Accounts created before the key stopped being persisted get their storage cleaned right away.
    if (hasSharedGroqKey && parsed.keys?.groq === DEFAULT_GROQ_KEY) localStorage.setItem(KEY, JSON.stringify(state))
    return state
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
  return preset.tiers || preset.autoTiers ? AUTO_MODEL : preset.models[0]?.id ?? ''
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
    set((s) => {
      const keys = { ...s.keys }
      if (key.trim()) keys[id] = key.trim()
      else delete keys[id]
      return { keys }
    })
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
  return effectiveTiers(state)?.fast
}

/** True when the selected provider has what it needs to make a request. */
export function isAiConfigured(state: AiSettingsState = useAiSettings.getState()): boolean {
  const preset = presetFor(state.provider)
  if (!state.model.trim()) return false
  if (state.model === AUTO_MODEL && !effectiveTiers(state)) return false
  // Riding on the deployment's relay needs no key in the browser at all.
  if (preset.needsKey && !resolveKey(state) && !usesRelay(state)) return false
  if (state.provider === 'custom' && !state.baseUrls.custom) return false
  return true
}

/** True when this request would travel through the deployment's own relay instead of carrying a key. */
export const usesRelay = (state: AiSettingsState = useAiSettings.getState(), provider: ProviderId = state.provider): boolean =>
  provider === 'groq' && hasAiProxy && !state.keys.groq

/** Where requests to a provider go: what the person configured, the relay for the included key, or the preset. */
export function baseUrlFor(state: AiSettingsState | undefined = undefined, provider?: ProviderId): string {
  const s = state ?? useAiSettings.getState()
  const id = provider ?? s.provider
  return resolveBaseUrl(s, id)
}

function resolveBaseUrl(state: AiSettingsState, provider: ProviderId): string {
  const own = state.baseUrls[provider]
  if (own) return own
  if (provider === 'groq' && !state.keys.groq) return sharedGroqBaseUrl()
  const preset = presetFor(provider)
  if (preset.relay && preset.baseUrl && AI_BRIDGE_URL) {
    // The provider path is appended by whoever calls, and it travels whole inside target=: the query value
    // accepts the extra path after the encoded base.
    return `${AI_BRIDGE_URL}/ai/proxy?target=${encodeURIComponent(preset.baseUrl)}`
  }
  return preset.baseUrl ?? ''
}

/** True when requests to this provider would ride on Sky's included key rather than the person's own. */
export function usesSharedKey(state: AiSettingsState = useAiSettings.getState(), provider: ProviderId = state.provider): boolean {
  return provider === 'groq' && hasSharedGroqKey && !state.keys.groq
}

/** The key that actually travels to the provider: the person's own, or Sky's included one for Groq. Never for display. */
export function resolveKey(state: AiSettingsState = useAiSettings.getState(), provider: ProviderId = state.provider): string {
  return state.keys[provider] || (usesSharedKey(state, provider) ? DEFAULT_GROQ_KEY : '')
}
