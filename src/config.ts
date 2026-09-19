/**
 * Build-time configuration. Values come from `.env.local` (ignored by git); see `.env.example`.
 *
 * Sky arrives working: a deployment carries an included model so nobody has to paste a key to start. On a
 * server (Vercel) that key lives in the deployment's environment and requests travel through `/api/ai`, so the
 * browser never sees it. Running from a plain file or a local dev server there is no such server, so a key in
 * `.env.local` is used instead; anything shipped to a browser can be read, so treat that one as a starter with
 * limits, not a secret. A person's own key always wins over both and goes straight to their provider.
 */
const env = import.meta.env as Record<string, string | undefined>

export const DEFAULT_GROQ_KEY = env.VITE_GROQ_KEY?.trim() ?? ''

const hasLocalKey = DEFAULT_GROQ_KEY.startsWith('gsk_')

/** Path of the server-side model relay that ships with the deployment (see api/ai). */
export const AI_PROXY_URL = '/api/ai'

/**
 * Whether requests may ride on the deployment's own key. In a build served by a server that is the relay;
 * in development it is the key in `.env.local`. `VITE_AI_PROXY` forces the relay on for `vercel dev`.
 */
export const hasAiProxy = env.VITE_AI_PROXY === '1' || (import.meta.env.PROD && !hasLocalKey)

export const hasSharedGroqKey = hasLocalKey || hasAiProxy

/** Where Groq requests go when they ride on the included key: the relay, or Groq itself with a local key. */
export const sharedGroqBaseUrl = (): string => (hasAiProxy ? AI_PROXY_URL : 'https://api.groq.com/openai/v1')

/**
 * Base URL of the CORS relay for connected apps. A deployment serves it at `/api` next to the site; in
 * development the `bridge/` folder does the same job at whatever URL `VITE_BRIDGE_URL` names.
 */
export const BRIDGE_URL = (env.VITE_BRIDGE_URL?.trim() ?? '').replace(/\/+$/, '') || (import.meta.env.PROD ? '/api' : '')

export const hasBridge = BRIDGE_URL !== ''

/**
 * Where AI providers that refuse browser-direct calls are repeated from — Z.ai answers a preflight with no CORS
 * headers, so a page can never talk to it straight. In development it is the bridge the person named
 * (`VITE_BRIDGE_URL`); a deployment serves the same route itself at `/api/ai/proxy`, so GLM works on the
 * published site with nothing to configure.
 */
export const AI_BRIDGE_URL = BRIDGE_URL

/**
 * Where accounts are verified. Both values are meant to be public — the URL of the project and its publishable
 * key, which is what a browser is supposed to hold — and without them SkyOS falls back to local profiles on
 * this device, which is what a copy without a server gets.
 */
export const ACCOUNTS_URL = (env.VITE_SUPABASE_URL?.trim() ?? '').replace(/\/+$/, '')
export const ACCOUNTS_KEY = env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

/**
 * Whether this deployment can send email: its own SMTP in Supabase. With it, entering is a code typed from the
 * inbox and the email is verified; without it, entering is a password and the email is a name nobody checked —
 * and only while the project does not insist on confirming emails it has no way to deliver (account.ts looks).
 */
export const ACCOUNTS_MAIL = env.VITE_ACCOUNTS_MAIL === '1'

/** Public https origin where SkyOS is served; enables Client ID Metadata Documents for MCP authorization. */
export const APP_ORIGIN = (env.VITE_APP_ORIGIN?.trim() ?? '').replace(/\/+$/, '')

/** OneDrive sync signs in with the person's own Microsoft Entra app (single-page application); no MCP exists for personal accounts. */
export const MS_OAUTH = {
  clientId: env.VITE_MS_CLIENT_ID?.trim() ?? '',
}

/**
 * Authorization servers that will not register a client on their own — checked against the metadata each one
 * publishes, 19 September 2026: Google, Spotify, GitHub, Slack and Box have no registration endpoint and take
 * no Client ID Metadata Documents. For them, whoever deploys SkyOS registers one OAuth client, once, and from
 * then on connecting is a click for everybody; without it the card says so instead of asking the person for a
 * client id. A secret only where the server refuses public clients (GitHub, Slack, Box). Anything with the
 * VITE_ prefix ends up in the browser bundle, so on a public site it is public — prefer client types that need none.
 */
export type RegistrarKey = 'google' | 'spotify' | 'github' | 'slack' | 'box'

export interface ShippedClient {
  clientId: string
  clientSecret?: string
}

const shipped = (id: string | undefined, secret?: string): ShippedClient | undefined => {
  const clientId = id?.trim() ?? ''
  return clientId ? { clientId, clientSecret: secret?.trim() || undefined } : undefined
}

export const OAUTH_CLIENTS: Record<RegistrarKey, ShippedClient | undefined> = {
  google: shipped(env.VITE_GOOGLE_CLIENT_ID, env.VITE_GOOGLE_CLIENT_SECRET),
  spotify: shipped(env.VITE_SPOTIFY_CLIENT_ID),
  github: shipped(env.VITE_GITHUB_CLIENT_ID, env.VITE_GITHUB_CLIENT_SECRET),
  slack: shipped(env.VITE_SLACK_CLIENT_ID, env.VITE_SLACK_CLIENT_SECRET),
  box: shipped(env.VITE_BOX_CLIENT_ID, env.VITE_BOX_CLIENT_SECRET),
}
