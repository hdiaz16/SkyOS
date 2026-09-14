/**
 * Build-time configuration. Values come from `.env.local` (ignored by git); see `.env.example`.
 *
 * A shared Groq key lets every new account start working immediately; each person can later paste their
 * own key or switch provider in Ajustes. Anything shipped to a browser can be read by whoever runs it, so
 * treat this key as a starter with limits, not a secret.
 */
const env = import.meta.env as Record<string, string | undefined>

export const DEFAULT_GROQ_KEY = env.VITE_GROQ_KEY?.trim() ?? ''

export const hasSharedGroqKey = DEFAULT_GROQ_KEY.startsWith('gsk_')

/** Base URL of the Sky bridge: a small stateless server that holds OAuth secrets and proxies APIs without CORS. */
export const BRIDGE_URL = (env.VITE_BRIDGE_URL?.trim() ?? '').replace(/\/+$/, '')

export const hasBridge = /^https?:\/\//.test(BRIDGE_URL)

/** Public https origin where SkyOS is served; enables Client ID Metadata Documents for MCP authorization. */
export const APP_ORIGIN = (env.VITE_APP_ORIGIN?.trim() ?? '').replace(/\/+$/, '')

/**
 * Google's MCP servers do not register clients dynamically, so a Google Cloud OAuth client can be shipped
 * here (shared by everyone using this deployment) or pasted per person in Apps conectadas › Avanzado.
 */
/** OneDrive sync signs in with the person's own Microsoft Entra app (single-page application); no MCP exists for personal accounts. */
export const MS_OAUTH = {
  clientId: env.VITE_MS_CLIENT_ID?.trim() ?? '',
}

export const GOOGLE_OAUTH = {
  clientId: env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '',
  clientSecret: env.VITE_GOOGLE_CLIENT_SECRET?.trim() || undefined,
}
