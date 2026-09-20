/**
 * The bridge, as a function that runs next to the site.
 *
 * SkyOS talks to apps through their remote MCP servers and MCP's own OAuth flow, straight from the browser.
 * Some of those servers answer without CORS headers, so the browser refuses to read them; this relay repeats
 * the request from the server side and streams the answer back. It stores nothing, logs nothing and only sees
 * a token while forwarding it. Same rules as `bridge/`, written for the Web runtime (no Node APIs).
 */

export interface RelayPolicy {
  /** Noun used in error messages, for example "el servidor MCP". */
  label: string
  /** Methods the route accepts; omit to accept any. */
  methods?: readonly string[]
  /** Request headers copied from the browser when present. */
  requestHeaders: readonly string[]
  /** Header prefixes copied wholesale (MCP mirrors body fields into Mcp-* headers). */
  requestPrefixes?: readonly string[]
  /** Upstream response headers relayed back. */
  responseHeaders: readonly string[]
  /** Relayed headers the browser may read cross-origin. */
  exposeHeaders?: readonly string[]
  /** Give up if upstream stays silent; omit for long-lived streams. */
  timeoutMs?: number
}

export const MCP_POLICY: RelayPolicy = {
  label: 'el servidor MCP',
  requestHeaders: ['Authorization', 'Content-Type', 'Accept', 'Last-Event-ID'],
  requestPrefixes: ['mcp-'],
  responseHeaders: ['Content-Type', 'Mcp-Session-Id', 'MCP-Protocol-Version', 'WWW-Authenticate', 'Cache-Control'],
  exposeHeaders: ['Mcp-Session-Id', 'MCP-Protocol-Version', 'WWW-Authenticate'],
}

export const OAUTH_POLICY: RelayPolicy = {
  label: 'el servidor OAuth',
  methods: ['GET', 'POST'],
  requestHeaders: ['Content-Type', 'Accept', 'Authorization'],
  responseHeaders: ['Content-Type'],
  timeoutMs: 30_000,
}

/**
 * AI providers that refuse browser-direct calls — Z.ai answers a preflight with no CORS headers — so the desktop
 * repeats its `/chat/completions` and `/models` calls from here, with the person's own key in Authorization.
 * No timeout: answers stream token by token. Same policy as `bridge/src/proxy.ts`.
 */
export const AI_POLICY: RelayPolicy = {
  label: 'el proveedor de IA',
  methods: ['GET', 'POST'],
  requestHeaders: ['Authorization', 'Content-Type', 'Accept'],
  responseHeaders: ['Content-Type', 'Retry-After'],
}

/**
 * Where a person's AI key may be carried. The MCP relay has to accept any public https server, because MCP
 * servers are anybody's; an AI key is different — it only ever needs to reach the providers that refuse
 * browsers, and a relay that carries Authorization to any address someone names is a gift to whoever forges
 * an Origin. A self-hosted desktop adds hosts in AI_RELAY_HOSTS, comma separated.
 */
const AI_RELAY_HOSTS: ReadonlySet<string> = new Set(['api.z.ai', 'open.bigmodel.cn'])

export function aiTargetAllowed(url: URL): boolean {
  const extra = (process.env.AI_RELAY_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const host = url.hostname.toLowerCase()
  return AI_RELAY_HOSTS.has(host) || extra.includes(host)
}

const USER_AGENT = 'skyos-bridge/1.0'
/** A tool call is a few kilobytes; anything of this size is not one. */
const MAX_RELAY_BYTES = 4 * 1024 * 1024
const MAX_REDIRECTS = 5
const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])
const BODYLESS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

/* ---------- where the browser is allowed to send us ---------- */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** Networks that never leave the machine or the datacenter; cloud metadata lives in one of them. */
const PRIVATE_V4: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0a80000, 16],
]

function ipv4(host: string): number | undefined {
  const m = IPV4.exec(host)
  if (!m) return undefined
  let value = 0
  for (let i = 1; i <= 4; i++) {
    const n = Number(m[i])
    if (n > 255) return undefined
    value = value * 256 + n
  }
  return value
}

const inRange = (ip: number, network: number, prefix: number) => ((ip & (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0)) >>> 0) === network

/** True for names and addresses that point back at us or at a private network. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  const v4 = ipv4(host)
  if (v4 !== undefined) return PRIVATE_V4.some(([n, p]) => inRange(v4, n, p))
  // Anything with a colon is IPv6: allow only plain public addresses, refuse what we cannot read.
  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true
    const head = host.split(':')[0] ?? ''
    const first = Number.parseInt(head || '0', 16)
    if (!Number.isFinite(first)) return true
    if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return true
    if (head === '' || head === '0') return true // ::ffff:a.b.c.d and friends
    return false
  }
  return false
}

/* ---------- who may use these routes ---------- */

/**
 * Only the desktop this function ships with. A browser sends `Sec-Fetch-Site: same-origin` on its own — page
 * code cannot set it — and `Origin` on anything that is not a plain navigation, so requiring one of the two
 * turns away the plain `curl` that would otherwise use these routes as an open proxy. It does not turn away
 * someone who deliberately forges both: that is what the budget in the AI route is for, and it is written down
 * in SECURITY.md rather than dressed up as authentication.
 *
 * A self-hosted desktop on another domain declares it in RELAY_ALLOWED_ORIGINS, comma separated.
 */
export function originAllowed(request: Request): boolean {
  const origin = request.headers.get('Origin')
  const site = request.headers.get('Sec-Fetch-Site')
  const extra = (process.env.RELAY_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (origin && extra.includes(origin)) return true
  if (origin) {
    try {
      if (new URL(origin).host === new URL(request.url).host) return true
    } catch {
      return false
    }
    return false
  }
  return site === 'same-origin'
}

export class RelayError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** The destination named in `?target=`, checked: absolute, https, public, no credentials. */
export function resolveTarget(raw: string | null): URL {
  if (!raw?.trim()) throw new RelayError(400, 'Falta el parámetro "target" con la URL absoluta del destino.')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new RelayError(400, 'El parámetro "target" debe ser una URL absoluta válida.')
  }
  if (url.username || url.password) throw new RelayError(400, 'El destino no puede llevar credenciales en la URL.')
  if (url.protocol !== 'https:') throw new RelayError(400, 'Solo se permiten destinos https.')
  if (isPrivateHost(url.hostname)) throw new RelayError(400, 'El destino apunta a una dirección local o privada.')
  url.hash = ''
  return url
}

/* ---------- forwarding ---------- */

function pick(source: Headers, names: readonly string[], prefixes: readonly string[] = []): Headers {
  const out = new Headers()
  for (const name of names) {
    const value = source.get(name)
    if (value !== null) out.set(name, value)
  }
  for (const [name, value] of source) {
    if (prefixes.some((p) => name.toLowerCase().startsWith(p))) out.set(name, value)
  }
  return out
}

interface Hop {
  url: URL
  method: string
  headers: Headers
  body: ArrayBuffer | undefined
}

/** RFC 9110 redirect semantics, with every new destination checked again and the token dropped off-origin. */
function nextHop(current: Hop, status: number, location: string): Hop {
  const url = resolveTarget(new URL(location, current.url).toString())
  const headers = new Headers(current.headers)
  if (url.origin !== current.url.origin) headers.delete('Authorization')
  if (status === 303 || ((status === 301 || status === 302) && current.method === 'POST')) {
    headers.delete('Content-Type')
    return { url, method: 'GET', headers, body: undefined }
  }
  return { url, method: current.method, headers, body: current.body }
}

async function send(first: Hop, signal: AbortSignal, label: string): Promise<Response> {
  let hop = first
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let response: Response
    try {
      response = await fetch(hop.url, { method: hop.method, headers: hop.headers, body: hop.body, redirect: 'manual', signal })
    } catch {
      throw new RelayError(502, `No se pudo contactar ${label}.`)
    }
    const location = response.headers.get('Location')
    if (!REDIRECTS.has(response.status) || !location) return response
    await response.body?.cancel()
    hop = nextHop(hop, response.status, location)
  }
  throw new RelayError(502, `${label} redirigió demasiadas veces.`)
}

/** Headers that let the browser read the answer; the relay only ever serves the site it ships with. */
export function corsHeaders(request: Request, expose?: readonly string[]): Headers {
  const headers = new Headers()
  const origin = request.headers.get('Origin')
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', request.headers.get('Access-Control-Request-Headers') ?? '*')
  headers.set('Access-Control-Max-Age', '600')
  if (expose?.length) headers.set('Access-Control-Expose-Headers', expose.join(', '))
  return headers
}

export const errorResponse = (request: Request, status: number, message: string): Response => {
  const headers = corsHeaders(request)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify({ error: { message } }), { status, headers })
}

/**
 * Repeats the browser's request against `?target=` and streams the answer back. `targetAllowed` narrows the
 * destinations further than "any public https server" for the routes that carry a person's own key.
 */
/* ---------- the secrets the browser never holds ---------- */

/**
 * Token endpoints whose owners refuse public clients and want a client secret with the code exchange. The
 * desktop knows only the client id; the secret lives here, in the deployment's environment, and is added to the
 * request on its way through — so nobody can read it from the page, which is where a VITE_ variable would put
 * it. Only for the deployment's own client: a request naming another client id travels as it came.
 */
const SECRET_ENDPOINTS: Array<{ host: string; path: RegExp; env: string; id: string }> = [
  { host: 'github.com', path: /^\/login\/oauth\/access_token$/, env: 'GITHUB_CLIENT_SECRET', id: 'VITE_GITHUB_CLIENT_ID' },
  { host: 'slack.com', path: /^\/api\/oauth\.v2\.(?:user\.)?access$/, env: 'SLACK_CLIENT_SECRET', id: 'VITE_SLACK_CLIENT_ID' },
  { host: 'api.box.com', path: /^\/oauth2\/token$/, env: 'BOX_CLIENT_SECRET', id: 'VITE_BOX_CLIENT_ID' },
  { host: 'oauth2.googleapis.com', path: /^\/token$/, env: 'GOOGLE_CLIENT_SECRET', id: 'VITE_GOOGLE_CLIENT_ID' },
  { host: 'accounts.spotify.com', path: /^\/api\/token$/, env: 'SPOTIFY_CLIENT_SECRET', id: 'VITE_SPOTIFY_CLIENT_ID' },
]

/**
 * Grants that carry a person's consent: the code from the authorization page or the refresh token it produced.
 * A `client_credentials` grant carries nobody's, and a relay that signed it would hand the deployment's own token
 * —an enterprise token, with Box— to whoever names the public client id.
 */
const CONSENT_GRANTS: ReadonlySet<string> = new Set(['authorization_code', 'refresh_token'])

const bytesOf = (text: string): ArrayBuffer => {
  const bytes = new TextEncoder().encode(text)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * Adds the deployment's client secret to a code exchange that lacks one. `GITHUB_CLIENT_SECRET` and the like,
 * without the VITE_ prefix; a `VITE_…_SECRET` left over from an earlier deployment still counts, so nothing
 * breaks the day the prefix goes.
 */
export function withClientSecret(url: URL, body: ArrayBuffer | undefined, contentType: string | null, env: Record<string, string | undefined> = process.env): ArrayBuffer | undefined {
  if (!body || !/application\/x-www-form-urlencoded/i.test(contentType ?? '')) return body
  const rule = SECRET_ENDPOINTS.find((r) => r.host === url.hostname && r.path.test(url.pathname))
  if (!rule) return body
  const secret = env[rule.env]?.trim() || env[`VITE_${rule.env}`]?.trim()
  if (!secret) return body
  const form = new URLSearchParams(new TextDecoder().decode(body))
  if (form.has('client_secret')) return body
  if (!CONSENT_GRANTS.has(form.get('grant_type') ?? '')) return body
  const ours = env[rule.id]?.trim()
  if (ours && form.get('client_id') !== ours) return body
  form.set('client_secret', secret)
  return bytesOf(form.toString())
}

/** Changes the body on its way through — the OAuth relay uses it to add a secret the browser never had. */
export type BodyRewrite = (url: URL, body: ArrayBuffer | undefined, contentType: string | null) => ArrayBuffer | undefined

export async function relay(request: Request, policy: RelayPolicy, targetAllowed?: (url: URL) => boolean, rewrite?: BodyRewrite): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, policy.exposeHeaders) })
  if (!originAllowed(request)) return errorResponse(request, 403, 'Esta ruta solo atiende al escritorio de este sitio.')
  try {
    const method = request.method.toUpperCase()
    if (policy.methods && !policy.methods.includes(method)) throw new RelayError(405, `Método no permitido para ${policy.label}.`)

    const url = resolveTarget(new URL(request.url).searchParams.get('target'))
    if (targetAllowed && !targetAllowed(url)) throw new RelayError(400, `Este relevo no lleva llaves a ${url.hostname}.`)
    const headers = pick(request.headers, policy.requestHeaders, policy.requestPrefixes ?? [])
    headers.set('User-Agent', USER_AGENT)
    const body = BODYLESS.has(method) ? undefined : await request.arrayBuffer().then((b) => (b.byteLength ? b : undefined))
    if (body && body.byteLength > MAX_RELAY_BYTES) throw new RelayError(413, 'La petición es demasiado grande.')
    const sent = rewrite ? rewrite(url, body, headers.get('Content-Type')) : body

    const signal = policy.timeoutMs === undefined ? request.signal : AbortSignal.any([request.signal, AbortSignal.timeout(policy.timeoutMs)])
    const upstream = await send({ url, method, headers, body: sent }, signal, policy.label)

    const out = corsHeaders(request, policy.exposeHeaders)
    for (const [name, value] of pick(upstream.headers, policy.responseHeaders)) out.set(name, value)
    return new Response(upstream.body, { status: upstream.status, headers: out })
  } catch (err) {
    if (err instanceof RelayError) return errorResponse(request, err.status, err.message)
    return errorResponse(request, 500, `Error inesperado al hablar con ${policy.label}.`)
  }
}
