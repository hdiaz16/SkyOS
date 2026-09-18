import type { AiProvider } from '../types'
import { baseUrlFor, presetFor, resolveKey, useAiSettings, usesRelay, usesSharedKey, type AiSettingsState } from '../settings'
import type { ProviderId } from '../settings'
import { createAnthropicProvider } from './anthropic'
import { createOpenAICompatProvider, listModels } from './openaiCompat'
import { createMockProvider } from './mock'

let cache: { key: string; provider: AiProvider } | null = null

/** Builds (and memoizes) the provider for the current settings. Returns null when nothing usable is configured. */
export function getProvider(state: AiSettingsState = useAiSettings.getState()): AiProvider | null {
  const preset = presetFor(state.provider)
  const apiKey = resolveKey(state)
  const baseUrl = baseUrlFor(state)
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
        baseUrl && (!preset.needsKey || apiKey || usesRelay(state))
          ? createOpenAICompatProvider({ id: state.provider, name: preset.name, baseUrl, apiKey: apiKey || undefined, shared: usesSharedKey(state), vision: preset.vision })
          : null
  }
  cache = provider ? { key, provider } : null
  return provider
}

const discovering = new Map<ProviderId, Promise<void>>()

/**
 * Providers whose tiers are read from their own model list (autoTiers) need that list in hand before
 * anything can be routed. Asked for once per provider per session, single-flight; a failure is not stored,
 * so the next attempt tries again and the person can always refresh by hand in Ajustes.
 */
export async function ensureDiscovered(state: AiSettingsState = useAiSettings.getState(), provider: ProviderId = state.provider): Promise<void> {
  const preset = presetFor(provider)
  if (!preset.autoTiers || state.discovered[provider]?.length) return
  const inflight = discovering.get(provider)
  if (inflight) return inflight
  const run = (async () => {
    try {
      const ids = await listModels(baseUrlFor(state, provider), resolveKey(state, provider), usesSharedKey(state, provider))
      useAiSettings.getState().setDiscovered(provider, ids)
    } catch {
      // Nothing stored: the next request, or the button in Ajustes, tries again.
    }
  })().finally(() => discovering.delete(provider))
  discovering.set(provider, run)
  return run
}
