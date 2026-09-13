import type { AiProvider } from '../types'
import { presetFor, useAiSettings, type AiSettingsState } from '../settings'
import { createAnthropicProvider } from './anthropic'
import { createOpenAICompatProvider } from './openaiCompat'
import { createMockProvider } from './mock'

let cache: { key: string; provider: AiProvider } | null = null

/** Builds (and memoizes) the provider for the current settings. Returns null when nothing usable is configured. */
export function getProvider(state: AiSettingsState = useAiSettings.getState()): AiProvider | null {
  const preset = presetFor(state.provider)
  const apiKey = state.keys[state.provider] ?? ''
  const baseUrl = state.baseUrls[state.provider] || preset.baseUrl || ''
  const key = `${state.provider}|${apiKey}|${baseUrl}`
  if (cache?.key === key) return cache.provider

  let provider: AiProvider | null = null
  switch (state.provider) {
    case 'anthropic':
      provider = apiKey ? createAnthropicProvider(apiKey) : null
      break
    case 'mock':
      provider = import.meta.env.DEV ? createMockProvider() : null
      break
    default:
      provider =
        baseUrl && (!preset.needsKey || apiKey)
          ? createOpenAICompatProvider({ id: state.provider, name: preset.name, baseUrl, apiKey: apiKey || undefined, vision: preset.vision })
          : null
  }
  cache = provider ? { key, provider } : null
  return provider
}
