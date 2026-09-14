import { McpError } from './types'

/**
 * The browser half of an OAuth authorization: open the consent page in a popup (or a full redirect when
 * popups are blocked), receive the callback parameters on /oauth/callback, and hand them back to whoever
 * started the flow. Provider-agnostic; the OAuth logic lives in auth.ts.
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

function waitForPopup(popup: Window, state: string): Promise<CallbackParams> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      window.clearInterval(poll)
      window.clearTimeout(timer)
      fn()
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const data = e.data as { type?: string; params?: CallbackParams } | null
      if (data?.type !== 'sky:oauth' || !data.params) return
      if (data.params.state && data.params.state !== state) return
      finish(() => resolve(data.params ?? {}))
    }
    window.addEventListener('message', onMessage)
    // The popup posts its message and closes itself; a close without a message is the person giving up.
    const poll = window.setInterval(() => {
      if (popup.closed) window.setTimeout(() => finish(() => reject(new McpError('cancelled', 'Cerraste la ventana antes de terminar.'))), 400)
    }, 500)
    const timer = window.setTimeout(() => finish(() => reject(new McpError('cancelled', 'La conexión tardó demasiado; inténtalo de nuevo.'))), FLOW_TIMEOUT_MS)
  })
}

/**
 * Opens the authorization URL and resolves with the callback parameters. When popups are blocked the page
 * itself navigates away and the promise never settles; `takeRedirectResult` picks the flow up on return.
 */
export async function authorizeInBrowser(url: string, state: string): Promise<CallbackParams> {
  const w = 520
  const h = 720
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2))
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2))
  const popup = window.open(url, 'sky-oauth', `popup=yes,width=${w},height=${h},left=${left},top=${top}`)
  if (!popup) {
    window.location.assign(url)
    return new Promise<CallbackParams>(() => undefined)
  }
  return waitForPopup(popup, state)
}

/** True when this page load is the authorization server sending the person back. */
export const isCallbackPage = (): boolean => window.location.pathname === CALLBACK_PATH

/**
 * Runs on /oauth/callback: hands the parameters to the window that started the flow and closes, or,
 * after a full-page redirect, stores them and returns to the desktop, which finishes the connection.
 */
export function handleCallbackPage(): void {
  const params = Object.fromEntries(new URLSearchParams(window.location.search)) as CallbackParams
  const opener = window.opener as Window | null
  if (opener && !opener.closed) {
    opener.postMessage({ type: 'sky:oauth', params }, window.location.origin)
    window.close()
    document.body.textContent = 'Listo. Puedes cerrar esta ventana.'
    return
  }
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(params))
  } catch {
    // Without sessionStorage the flow cannot be resumed; the desktop simply shows the app as not connected.
  }
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
