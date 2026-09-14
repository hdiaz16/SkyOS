import { markHandoff } from '../system/session'

/**
 * The browser half of an OAuth authorization: leave for the consent page in this same tab, receive the callback
 * parameters on /oauth/callback and hand them to the desktop that comes back. Provider-agnostic; the OAuth
 * logic lives in auth.ts.
 */

export const CALLBACK_PATH = '/oauth/callback'
const PENDING_KEY = 'mesa:oauth:pending'
const RESULT_KEY = 'mesa:oauth:result'
export const FLOW_TIMEOUT_MS = 10 * 60_000

/** Query parameters the authorization server sent back to the callback page. */
export type CallbackParams = Record<string, string>

export const redirectUri = (): string => `${window.location.origin}${CALLBACK_PATH}`

/** Whatever the flow needs to finish after the redirect, kept in sessionStorage for its duration only. */
export interface PendingFlow {
  serverId: string
  state: string
  codeVerifier: string
  redirectUri: string
  issuer: string
  issRequired: boolean
  tokenEndpoint: string
  clientId: string
  clientSecret?: string
  resource: string
  scopes: string[]
  startedAt: number
}

export function savePending(p: PendingFlow): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(p))
}

export function readPending(): PendingFlow | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    return raw ? (JSON.parse(raw) as PendingFlow) : null
  } catch {
    return null
  }
}

export function clearPending(): void {
  sessionStorage.removeItem(PENDING_KEY)
}

/**
 * Sends the whole tab to the authorization page. Providers do not allow their sign-in inside another site
 * and Sky never opens new windows, so the person leaves for a moment and comes back through
 * /oauth/callback, where `takeRedirectResult` picks the flow up. The promise never settles: the page is gone.
 */
export function authorizeInBrowser(url: string): Promise<CallbackParams> {
  window.location.assign(url)
  return new Promise<CallbackParams>(() => undefined)
}

/** True when this page load is the authorization server sending the person back. */
export const isCallbackPage = (): boolean => window.location.pathname === CALLBACK_PATH

/**
 * Runs on /oauth/callback: keeps the parameters for the desktop, which finishes the connection, and goes
 * back home as a hand-over so no splash plays.
 */
export function handleCallbackPage(): void {
  const params = Object.fromEntries(new URLSearchParams(window.location.search)) as CallbackParams
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(params))
  } catch {
    // Without sessionStorage the flow cannot be resumed; the desktop simply shows the app as not connected.
  }
  markHandoff('plain')
  window.location.replace('/')
}

/** Callback parameters left by a redirect-based flow, if any. Consumed on read. */
export function takeRedirectResult(): CallbackParams | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY)
    sessionStorage.removeItem(RESULT_KEY)
    return raw ? (JSON.parse(raw) as CallbackParams) : null
  } catch {
    return null
  }
}
