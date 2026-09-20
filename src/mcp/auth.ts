import { APP_ORIGIN, BRIDGE_URL, hasBridge } from '../config'
import { mcpStore } from './store'
import { authorizeInBrowser, clearPending, redirectUri, savePending, type CallbackParams, type PendingFlow } from './popup'
import { McpError, type OAuthClient, type OAuthTokens } from './types'

/**
 * MCP authorization (spec 2026-07-28, "Authorization"): OAuth 2.1 for public clients.
 * Discovery through Protected Resource Metadata (RFC 9728) and Authorization Server Metadata
 * (RFC 8414 / OpenID Connect), client identity through Client ID Metadata Documents, Dynamic Client
 * Registration or pre-registered credentials, PKCE, RFC 8707 `resource`, RFC 9207 `iss` validation.
 */

/* ---------- fetch that can lean on the bridge when a server has no CORS ---------- */

async function relayFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BRIDGE_URL}/oauth/proxy?target=${encodeURIComponent(url)}`, init)
  } catch {
    throw new McpError('network', `No hay conexión con el puente de Sky (${BRIDGE_URL}).`)
  }
}

async function oauthFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    // The browser refused the cross-origin call (or there is no network); the bridge adds the CORS headers.
    if (!hasBridge) {
      throw new McpError('network', 'El navegador no pudo hablar con el servidor de autorización (CORS o red). Configura el puente de Sky para estos casos.')
    }
    return relayFetch(url, init)
  }
}

/**
 * Token endpoints whose owners want a client secret with the code exchange. The desktop never holds one: for
 * these the exchange goes through the relay on purpose, and the relay adds the deployment's secret on the way.
 */
const SERVER_SECRET_HOSTS: ReadonlySet<string> = new Set(['github.com', 'slack.com', 'api.box.com', 'oauth2.googleapis.com', 'accounts.spotify.com'])

/* ---------- challenge ---------- */

export interface Challenge {
  resourceMetadata?: string
  scope?: string
  error?: string
  errorDescription?: string
}

/** Parses `WWW-Authenticate: Bearer a="b", c="d"` into its parameters. */
export function parseChallenge(header: string | null | undefined): Challenge {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const m of header.matchAll(/([a-zA-Z_]+)\s*=\s*(?:"([^"]*)"|([^,\s]+))/g)) out[m[1]] = m[2] ?? m[3]
  return { resourceMetadata: out.resource_metadata, scope: out.scope, error: out.error, errorDescription: out.error_description }
}

/* ---------- discovery ---------- */

export interface ProtectedResourceMetadata {
  resource: string
  authorization_servers: string[]
  scopes_supported?: string[]
}

export interface AuthorizationServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  scopes_supported?: string[]
  code_challenge_methods_supported?: string[]
  client_id_metadata_document_supported?: boolean
  authorization_response_iss_parameter_supported?: boolean
  token_endpoint_auth_methods_supported?: string[]
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await oauthFetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Where to look for the resource metadata when the challenge did not say: next to the endpoint path, then at the root. */
function wellKnownResourceUrls(mcpUrl: string): string[] {
  const u = new URL(mcpUrl)
  const path = u.pathname.replace(/\/+$/, '')
  const urls = [`${u.origin}/.well-known/oauth-protected-resource`]
  if (path && path !== '/') urls.unshift(`${u.origin}/.well-known/oauth-protected-resource${path}`)
  return urls
}

export async function discoverProtectedResource(mcpUrl: string, challenge: Challenge): Promise<ProtectedResourceMetadata> {
  const candidates = challenge.resourceMetadata ? [challenge.resourceMetadata, ...wellKnownResourceUrls(mcpUrl)] : wellKnownResourceUrls(mcpUrl)
  for (const url of candidates) {
    const doc = await getJson<ProtectedResourceMetadata>(url).catch(() => null)
    if (doc?.authorization_servers?.length) return doc
  }
  throw new McpError('unsupported', 'El servidor pide autorización pero no publica cómo obtenerla (sin metadatos del recurso).')
}

/** RFC 8414 §3.1 and OpenID Connect Discovery, in the order the MCP spec requires. */
function metadataUrls(issuer: string): string[] {
  const u = new URL(issuer)
  const path = u.pathname.replace(/\/+$/, '')
  if (path && path !== '/') {
    return [
      `${u.origin}/.well-known/oauth-authorization-server${path}`,
      `${u.origin}/.well-known/openid-configuration${path}`,
      `${u.origin}${path}/.well-known/openid-configuration`,
    ]
  }
  return [`${u.origin}/.well-known/oauth-authorization-server`, `${u.origin}/.well-known/openid-configuration`]
}

export async function discoverAuthorizationServer(issuer: string): Promise<AuthorizationServerMetadata> {
  const expected = issuer.replace(/\/+$/, '')
  for (const url of metadataUrls(issuer)) {
    const doc = await getJson<AuthorizationServerMetadata>(url).catch(() => null)
    if (!doc?.authorization_endpoint || !doc.token_endpoint) continue
    // A document that claims another issuer is a spoof or a misconfiguration; either way it is not usable.
    if ((doc.issuer ?? '').replace(/\/+$/, '') !== expected) continue
    return doc
  }
  throw new McpError('unsupported', `No encontré los metadatos del servidor de autorización ${issuer}.`)
}

/* ---------- client identity ---------- */

/** Where this deployment's Client ID Metadata Document lives; only usable from a public https origin. */
export function clientMetadataUrl(): string | null {
  const origin = APP_ORIGIN || window.location.origin
  if (!/^https:\/\//.test(origin) || /localhost|127\.0\.0\.1/.test(origin)) return null
  return `${origin}/oauth/client-metadata.json`
}

const isLocalOrigin = () => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(window.location.origin)

export interface Preregistered {
  clientId: string
  clientSecret?: string
}

/**
 * Obtains a client id for an authorization server, in the spec's priority order: pre-registered credentials,
 * a Client ID Metadata Document, Dynamic Client Registration. Registrations are cached per issuer.
 */
export async function obtainClient(as: AuthorizationServerMetadata, preregistered?: Preregistered): Promise<OAuthClient> {
  const issuer = as.issuer
  if (preregistered?.clientId) {
    return mcpStore.clients.save({ issuer, clientId: preregistered.clientId, clientSecret: preregistered.clientSecret, registration: 'preregistered', registeredAt: Date.now() })
  }
  const cached = await mcpStore.clients.get(issuer)
  if (cached && cached.registration !== 'preregistered') return cached

  const cimd = clientMetadataUrl()
  if (as.client_id_metadata_document_supported && cimd) {
    return mcpStore.clients.save({ issuer, clientId: cimd, registration: 'cimd', registeredAt: Date.now() })
  }

  if (as.registration_endpoint) {
    const body = {
      client_name: 'SkyOS',
      client_uri: APP_ORIGIN || window.location.origin,
      redirect_uris: [redirectUri()],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: isLocalOrigin() ? 'native' : 'web',
    }
    const res = await oauthFetch(as.registration_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
    const data = (await res.json().catch(() => ({}))) as { client_id?: string; client_secret?: string; error?: string; error_description?: string }
    if (!res.ok || !data.client_id) {
      throw new McpError('unsupported', `El servidor de autorización no aceptó registrar a Sky${data.error_description ? `: ${data.error_description}` : data.error ? ` (${data.error})` : ''}.`)
    }
    return mcpStore.clients.save({ issuer, clientId: data.client_id, clientSecret: data.client_secret, registration: 'dcr', registeredAt: Date.now() })
  }

  // A person reading this does not know what a client id is, and should not have to: registering one is the job
  // of whoever administers the app or this SkyOS. A catalog app says so on its card before the button is pressed;
  // this is what a server added by URL gets.
  throw new McpError('not_configured', 'El servidor de autorización de esta app no deja que Sky se registre solo: hace falta un cliente que registre quien la administra. Si ya tienes uno, pégalo en Avanzado.')
}

/* ---------- PKCE and helpers ---------- */

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(new ArrayBuffer(bytes))
  crypto.getRandomValues(buf)
  return base64url(buf)
}

async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

/** RFC 8707 resource identifier for an MCP endpoint: no fragment, no trailing slash. */
export function canonicalResource(mcpUrl: string): string {
  const u = new URL(mcpUrl)
  u.hash = ''
  u.search = ''
  return u.toString().replace(/\/+$/, '')
}

/**
 * Scope selection (spec §"Scope Selection Strategy"): the challenge is authoritative, then the resource's
 * `scopes_supported`, then what the catalog suggests; on re-authorization keep what was granted before.
 */
export function chooseScopes(challenge: Challenge, prm: ProtectedResourceMetadata | null, preferred: string[] = [], previous: string[] = []): string[] {
  const fromChallenge = challenge.scope?.split(/\s+/).filter(Boolean) ?? []
  const base = fromChallenge.length ? fromChallenge : prm?.scopes_supported?.length ? prm.scopes_supported : preferred
  return [...new Set([...previous, ...base])]
}

/* ---------- authorization ---------- */

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  id_token?: string
  error?: string
  error_description?: string
}

function tokensFrom(t: TokenResponse, previous?: OAuthTokens): OAuthTokens {
  if (!t.access_token) throw new McpError('protocol', 'El servidor de autorización no devolvió un token de acceso.')
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? previous?.refreshToken,
    expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
    scope: t.scope ?? previous?.scope,
    idToken: t.id_token ?? previous?.idToken,
  }
}

async function tokenRequest(endpoint: string, fields: Record<string, string>, client: Pick<OAuthClient, 'clientId' | 'clientSecret'>): Promise<TokenResponse> {
  const body = new URLSearchParams({ ...fields, client_id: client.clientId })
  if (client.clientSecret) body.set('client_secret', client.clientSecret)
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  }
  const viaRelay = !client.clientSecret && hasBridge && SERVER_SECRET_HOSTS.has(new URL(endpoint).hostname)
  const res = viaRelay ? await relayFetch(endpoint, init) : await oauthFetch(endpoint, init)
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || !data.access_token) {
    const code = data.error === 'invalid_grant' || res.status === 401 ? 'auth_required' : 'protocol'
    throw new McpError(code, data.error_description ?? (data.error ? `El servidor respondió ${data.error}.` : `El servidor de tokens respondió ${res.status}.`), { status: res.status })
  }
  return data
}

export interface AuthorizeInput {
  serverId: string
  as: AuthorizationServerMetadata
  client: OAuthClient
  resource: string
  scopes: string[]
}

/** Runs the interactive part: builds the authorization URL, opens it, validates the response, redeems the code. */
export async function authorize(input: AuthorizeInput): Promise<OAuthTokens> {
  const { as, client } = input
  if (as.code_challenge_methods_supported && !as.code_challenge_methods_supported.includes('S256')) {
    throw new McpError('unsupported', 'El servidor de autorización no soporta PKCE (S256), que MCP exige.')
  }
  const pending: PendingFlow = {
    serverId: input.serverId,
    state: randomToken(16),
    codeVerifier: randomToken(48),
    redirectUri: redirectUri(),
    issuer: as.issuer,
    issRequired: as.authorization_response_iss_parameter_supported === true,
    tokenEndpoint: as.token_endpoint,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    resource: input.resource,
    scopes: input.scopes,
    startedAt: Date.now(),
  }
  savePending(pending)

  const url = new URL(as.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', client.clientId)
  url.searchParams.set('redirect_uri', pending.redirectUri)
  url.searchParams.set('state', pending.state)
  url.searchParams.set('code_challenge', await pkceChallenge(pending.codeVerifier))
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('resource', input.resource)
  if (input.scopes.length) url.searchParams.set('scope', input.scopes.join(' '))
  // Google only issues refresh tokens to web clients that ask for offline access explicitly.
  if (/google\.com/.test(as.issuer)) {
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
  }

  try {
    const params = await authorizeInBrowser(url.toString())
    return await redeem(pending, params)
  } catch (err) {
    clearPending()
    throw err
  }
}

/** The usual OAuth failures, said the way a person would say them. */
function oauthReason(code: string): string {
  switch (code) {
    case 'server_error':
    case 'temporarily_unavailable':
      return 'El proveedor tuvo un problema y no pudo autorizarte. Inténtalo otra vez en un momento.'
    case 'invalid_scope':
      return 'Esta app no concede alguno de los permisos que Sky pidió.'
    case 'invalid_client':
    case 'unauthorized_client':
      return 'El proveedor no reconoce a Sky como aplicación autorizada.'
    case 'invalid_request':
      return 'La petición de autorización no le pareció válida al proveedor.'
    default:
      return 'El proveedor no pudo completar la autorización.'
  }
}

/** Validates the callback (state, RFC 9207 iss) and exchanges the code for tokens. */
export async function redeem(pending: PendingFlow, params: CallbackParams): Promise<OAuthTokens> {
  clearPending()
  // RFC 9207: a present iss must match the issuer we recorded before redirecting; a required one must be present.
  if (params.iss !== undefined) {
    if (params.iss !== pending.issuer) throw new McpError('protocol', 'La respuesta de autorización no viene del servidor esperado.')
  } else if (pending.issRequired) {
    throw new McpError('protocol', 'La respuesta de autorización no identifica al servidor (falta iss).')
  }
  if (params.state !== pending.state) throw new McpError('protocol', 'La respuesta no corresponde a esta conexión. Inténtalo de nuevo.')
  if (params.error) {
    const cancelled = params.error === 'access_denied'
    if (cancelled) throw new McpError('cancelled', 'No autorizaste la conexión.')
    // Without a description the raw code used to reach the toast: «server_error», «invalid_scope». A code in
    // English is not something to read; the code stays in the console, where it is of use.
    if (!params.error_description) console.warn('[mcp] autorización rechazada:', params.error)
    throw new McpError('protocol', params.error_description ?? oauthReason(params.error))
  }
  if (!params.code) throw new McpError('protocol', 'El servidor de autorización no devolvió un código.')

  const t = await tokenRequest(
    pending.tokenEndpoint,
    {
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.codeVerifier,
      resource: pending.resource,
    },
    { clientId: pending.clientId, clientSecret: pending.clientSecret },
  )
  return tokensFrom(t)
}

/** Renews an access token with its refresh token. Throws auth_required when the server refuses. */
export async function refresh(as: AuthorizationServerMetadata, client: OAuthClient, resource: string, tokens: OAuthTokens): Promise<OAuthTokens> {
  if (!tokens.refreshToken) throw new McpError('auth_required', 'La sesión caducó y el servidor no dio forma de renovarla.')
  const t = await tokenRequest(as.token_endpoint, { grant_type: 'refresh_token', refresh_token: tokens.refreshToken, resource }, client)
  return tokensFrom(t, tokens)
}

/** Name and email from an OpenID Connect id_token, if the authorization server issued one. Not verified: display only. */
export function accountFromIdToken(idToken?: string): { name?: string; email?: string } | undefined {
  if (!idToken) return undefined
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { name?: string; email?: string; preferred_username?: string }
    const name = payload.name ?? payload.preferred_username
    return name || payload.email ? { name, email: payload.email } : undefined
  } catch {
    return undefined
  }
}
