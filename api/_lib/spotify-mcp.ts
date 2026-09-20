import { corsHeaders, originAllowed } from './relay.js'

/**
 * Spotify's own MCP server is a closed pilot: it answers a valid token of this application with «RBAC: access
 * denied» (probed 19 September 2026). The Web API takes that same token, so this is a small MCP server of our
 * own that speaks Web API on the other side. Any MCP client talks to it like to a remote server: 401 with the
 * resource metadata, OAuth at accounts.spotify.com, then tools/list and tools/call. It keeps no state: every
 * request carries its own Bearer, which travels to api.spotify.com and nowhere else.
 *
 * Development Mode (Spotify, February 2026) keeps search at ten results, and drops the follow endpoints, the
 * «several» endpoints, new releases and categories; nothing here depends on those.
 */

const API = 'https://api.spotify.com/v1'
const AUTHORIZATION_SERVER = 'https://accounts.spotify.com'
const RESOURCE_PATH = '/api/mcp/spotify'
const METADATA_PATH = `/.well-known/oauth-protected-resource${RESOURCE_PATH}`

/** Everything the tools below need; the consent page asks for all of it once. */
export const SCOPES: readonly string[] = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
]

/** Revisions with the initialize handshake that this server answers; the stateless 2026 era needs no handshake. */
const LEGACY_VERSIONS: readonly string[] = ['2025-11-25', '2025-06-18', '2025-03-26']
const DEFAULT_VERSION = '2025-06-18'
const EXPOSE: readonly string[] = ['WWW-Authenticate', 'Mcp-Session-Id', 'MCP-Protocol-Version']
const SERVER_INFO = { name: 'Spotify vía SkyOS', title: 'Spotify', version: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7) }

type Json = Record<string, unknown>

interface RpcRequest {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: Json
}

export interface Deps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
}

interface Ctx {
  deps: Deps
  token: string
}

interface Tool {
  name: string
  title: string
  description: string
  inputSchema: Json
  annotations?: Json
  run: (ctx: Ctx, args: Json) => Promise<Json>
}

/* ---------- the two ways Spotify says no ---------- */

/** The token is not good any more: the client renews it, or asks the person again. */
class Unauthorized extends Error {}

/** Wrong arguments; said back to the model, never sent to Spotify. */
class BadArgs extends Error {}

/* ---------- HTTP plumbing ---------- */

/** The address people reach this function at, behind Vercel's proxy. */
function publicOrigin(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(/:$/, '')
  return `${proto}://${host}`
}

function baseHeaders(request: Request): Headers {
  return originAllowed(request) ? corsHeaders(request, EXPOSE) : new Headers({ Vary: 'Origin' })
}

function json(request: Request, status: number, body: unknown): Response {
  const headers = baseHeaders(request)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

function metadata(request: Request): Response {
  const origin = publicOrigin(request)
  const body = {
    resource: `${origin}${RESOURCE_PATH}`,
    resource_name: SERVER_INFO.name,
    authorization_servers: [AUTHORIZATION_SERVER],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
  })
}

function challenge(request: Request, error?: string, description?: string): Response {
  let value = `Bearer resource_metadata="${publicOrigin(request)}${METADATA_PATH}"`
  if (error) value += `, error="${error}"`
  if (description) value += `, error_description="${description.replace(/["\\]/g, "'")}"`
  const headers = baseHeaders(request)
  headers.set('WWW-Authenticate', value)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  const body = { error: error ?? 'unauthorized', error_description: description ?? 'Hace falta un token de Spotify.' }
  return new Response(JSON.stringify(body), { status: 401, headers })
}

function bearer(request: Request): string | undefined {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')
  return m?.[1]
}

const rpcResult = (id: number | string, result: Json): Json => ({
  jsonrpc: '2.0',
  id,
  result: { ...result, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO } },
})

const rpcError = (id: number | string | null, code: number, message: string): Json => ({ jsonrpc: '2.0', id, error: { code, message } })

/* ---------- MCP ---------- */

const defaultDeps: Deps = { fetch: (input, init) => globalThis.fetch(input, init) }

export async function spotifyMcp(request: Request, deps: Deps = defaultDeps): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, EXPOSE) })
  if (request.method === 'GET' && url.searchParams.get('prm') === '1') return metadata(request)
  if (request.method !== 'POST') {
    const headers = baseHeaders(request)
    headers.set('Allow', 'POST, OPTIONS')
    return new Response(null, { status: 405, headers })
  }

  let message: RpcRequest | RpcRequest[]
  try {
    message = (await request.json()) as RpcRequest | RpcRequest[]
  } catch {
    return json(request, 400, rpcError(null, -32700, 'El cuerpo no es JSON.'))
  }
  if (Array.isArray(message)) return json(request, 400, rpcError(null, -32600, 'Este servidor no acepta lotes JSON-RPC.'))
  if (!message || typeof message.method !== 'string') return json(request, 400, rpcError(message?.id ?? null, -32600, 'Falta el método.'))

  const token = bearer(request)
  if (!token) return challenge(request)
  const id = message.id
  // A notification (no id) wants nothing back but a nod.
  if (id === undefined || id === null) return new Response(null, { status: 202, headers: baseHeaders(request) })
  const params = message.params ?? {}

  try {
    switch (message.method) {
      case 'initialize':
        return json(request, 200, rpcResult(id, initializeResult(params)))
      case 'ping':
        return json(request, 200, rpcResult(id, {}))
      case 'tools/list':
        return json(request, 200, rpcResult(id, { tools: TOOLS.map(publicTool) }))
      case 'tools/call':
        return json(request, 200, rpcResult(id, await callTool({ deps, token }, params)))
      default:
        return json(request, 200, rpcError(id, -32601, `Método no soportado: ${message.method}`))
    }
  } catch (err) {
    if (err instanceof Unauthorized) return challenge(request, 'invalid_token', err.message)
    return json(request, 200, rpcResult(id, failure(err instanceof Error ? err.message : 'Spotify no respondió.')))
  }
}

function initializeResult(params: Json): Json {
  const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_VERSION
  return {
    protocolVersion: LEGACY_VERSIONS.includes(asked) ? asked : DEFAULT_VERSION,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
    instructions:
      'El Spotify de la persona que conectó: buscar música, leer y editar sus playlists y su biblioteca, ver y controlar lo que suena. Controlar la reproducción requiere una cuenta Premium y un dispositivo con Spotify abierto. Las búsquedas devuelven hasta diez resultados.',
  }
}

const publicTool = (t: Tool): Json => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })

const success = (out: Json): Json => ({ content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out })
const failure = (text: string): Json => ({ content: [{ type: 'text', text }], isError: true })

async function callTool(ctx: Ctx, params: Json): Promise<Json> {
  const name = typeof params.name === 'string' ? params.name : ''
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) return failure(`No conozco la herramienta «${name}».`)
  const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Json) : {}
  try {
    return success(await tool.run(ctx, args))
  } catch (err) {
    if (err instanceof Unauthorized) throw err
    return failure(err instanceof Error ? err.message : 'Spotify no respondió.')
  }
}

/* ---------- Web API ---------- */

interface CallOptions {
  query?: Record<string, string | number | undefined>
  body?: unknown
}

async function spotify<T = Json>(ctx: Ctx, method: string, path: string, opts: CallOptions = {}): Promise<T | undefined> {
  const url = new URL(`${API}${path}`)
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const headers: Record<string, string> = { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await ctx.deps.fetch(url.toString(), { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
  if (res.status === 204) return undefined
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    data = undefined
  }
  const said = messageOf(data)
  if (res.status === 401) throw new Unauthorized(said ?? 'Spotify no aceptó el token.')
  if (!res.ok) throw new Error(describeFailure(res.status, said, res.headers.get('Retry-After')))
  return data as T | undefined
}

function messageOf(data: unknown): string | undefined {
  const error = (data as { error?: unknown } | undefined)?.error
  if (typeof error === 'string') return error
  const message = (error as { message?: unknown } | undefined)?.message
  return typeof message === 'string' ? message : undefined
}

function describeFailure(status: number, said: string | undefined, retryAfter: string | null): string {
  const detail = said ? ` (${said})` : ''
  if (status === 403 && /premium/i.test(said ?? '')) return 'Spotify solo permite controlar la reproducción con una cuenta Premium.'
  if (status === 403) return `Spotify no permitió la operación${detail}. En modo desarrollo solo entran las personas dadas de alta en el panel de Spotify de la app.`
  if (status === 404 && /device/i.test(said ?? '')) return 'No hay ningún dispositivo con Spotify abierto. Abre Spotify en algún dispositivo y vuelve a intentar.'
  if (status === 404) return `Spotify no encontró eso${detail}.`
  if (status === 429) return `Spotify está limitando las solicitudes; intenta en ${retryAfter ?? 'unos'} segundos.`
  return `Spotify respondió ${status}${detail}.`
}

/* ---------- arguments ---------- */

const ID = /^[A-Za-z0-9]{1,64}$/
const URI = /^spotify:(?:track|episode|album|playlist|artist|show):[A-Za-z0-9]{1,64}$/
const OPEN_URL = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|episode|album|playlist|artist|show)\/([A-Za-z0-9]+)/

function str(v: unknown, name: string, max = 500): string {
  if (typeof v !== 'string' || !v.trim()) throw new BadArgs(`Falta «${name}».`)
  return v.trim().slice(0, max)
}

const optStr = (v: unknown, max = 500): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback
}

function id(v: unknown, name: string): string {
  const s = str(v, name, 200)
  const open = OPEN_URL.exec(s)
  if (open) return open[2]
  if (URI.test(s)) return s.split(':')[2]
  if (ID.test(s)) return s
  throw new BadArgs(`«${name}» no parece un id de Spotify.`)
}

/** A Spotify URI, also accepted as an open.spotify.com link. */
function uri(v: unknown, name: string): string {
  const s = str(v, name, 300)
  const open = OPEN_URL.exec(s)
  if (open) return `spotify:${open[1]}:${open[2]}`
  if (URI.test(s)) return s
  throw new BadArgs(`«${name}» no es un URI de Spotify (spotify:track:… o un enlace de open.spotify.com).`)
}

function list(v: unknown, name: string, max: number, one: (item: unknown, name: string) => string): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : []
  const out = raw.filter((x) => typeof x === 'string' && x.trim()).map((x) => one(x, name))
  if (!out.length) throw new BadArgs(`Falta «${name}».`)
  return out.slice(0, max)
}

/* ---------- views: what a person (or a model) wants to read ---------- */

const clock = (ms: unknown): string | undefined => (typeof ms === 'number' ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}` : undefined)
const link = (o: Json): unknown => (o.external_urls as Json | undefined)?.spotify
const names = (arr: unknown): string | undefined => (Array.isArray(arr) ? arr.map((a) => (a as Json).name).filter(Boolean).join(', ') : undefined)
const rows = (arr: unknown): Json[] => (Array.isArray(arr) ? arr.filter((x): x is Json => !!x && typeof x === 'object') : [])

const trackView = (t: Json): Json => ({ name: t.name, artists: names(t.artists), album: (t.album as Json | undefined)?.name, duration: clock(t.duration_ms), uri: t.uri, id: t.id, url: link(t) })
const artistView = (a: Json): Json => ({ name: a.name, genres: a.genres, followers: (a.followers as Json | undefined)?.total, uri: a.uri, id: a.id, url: link(a) })
const albumView = (a: Json): Json => ({ name: a.name, artists: names(a.artists), release_date: a.release_date, total_tracks: a.total_tracks, uri: a.uri, id: a.id, url: link(a) })
const playlistView = (p: Json): Json => ({ name: p.name, description: p.description || undefined, owner: (p.owner as Json | undefined)?.display_name, tracks: (p.tracks as Json | undefined)?.total, public: p.public, uri: p.uri, id: p.id, url: link(p) })
const deviceView = (d: Json): Json => ({ name: d.name, type: d.type, id: d.id, active: d.is_active, volume: d.volume_percent })
const withTrack = (item: Json, extra: Record<string, unknown>): Json => ({ ...extra, ...trackView((item.track as Json | undefined) ?? {}) })

const SEARCH_TYPES = ['track', 'artist', 'album', 'playlist'] as const
const VIEW: Record<(typeof SEARCH_TYPES)[number], (o: Json) => Json> = { track: trackView, artist: artistView, album: albumView, playlist: playlistView }

const readOnly = { readOnlyHint: true, openWorldHint: true }
const acts = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }

const TRACK_FIELDS = 'total,items(added_at,track(name,uri,id,duration_ms,external_urls,artists(name),album(name)))'

/* ---------- the tools ---------- */

const TOOLS: Tool[] = [
  {
    name: 'search',
    title: 'Buscar en Spotify',
    description: 'Busca canciones, artistas, álbumes o playlists por texto. Devuelve hasta diez resultados con su URI para reproducir o guardar.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Qué buscar: título, artista, «artista canción»…' },
        type: { type: 'string', enum: [...SEARCH_TYPES], default: 'track' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
      },
      required: ['q'],
    },
    annotations: readOnly,
    async run(ctx, args) {
      const q = str(args.q, 'q', 200)
      const type = oneOf(args.type, SEARCH_TYPES, 'track')
      const limit = int(args.limit, 5, 1, 10)
      const data = (await spotify(ctx, 'GET', '/search', { query: { q, type, limit } })) ?? {}
      const bucket = (data[`${type}s`] as Json | undefined) ?? {}
      return { query: q, type, total: bucket.total, results: rows(bucket.items).map(VIEW[type]) }
    },
  },
  {
    name: 'profile',
    title: 'Mi perfil de Spotify',
    description: 'Quién es la persona conectada: nombre, país y si su cuenta es Premium (hace falta para controlar la reproducción).',
    inputSchema: { type: 'object', properties: {} },
    annotations: readOnly,
    async run(ctx) {
      const me = (await spotify(ctx, 'GET', '/me')) ?? {}
      return { name: me.display_name, id: me.id, email: me.email, country: me.country, plan: me.product, followers: (me.followers as Json | undefined)?.total, url: link(me) }
    },
  },
  {
    name: 'now_playing',
    title: 'Qué está sonando',
    description: 'Lo que suena ahora en el Spotify de la persona: canción, artista, progreso, dispositivo y si está en pausa.',
    inputSchema: { type: 'object', properties: {} },
    annotations: readOnly,
    async run(ctx) {
      const state = await spotify(ctx, 'GET', '/me/player')
      if (!state) return { playing: false, note: 'No hay nada sonando ni ningún dispositivo activo.' }
      const item = state.item as Json | undefined
      return {
        playing: state.is_playing,
        track: item ? trackView(item) : undefined,
        progress: clock(state.progress_ms),
        device: state.device ? deviceView(state.device as Json).name : undefined,
        shuffle: state.shuffle_state,
        repeat: state.repeat_state,
      }
    },
  },
  {
    name: 'play',
    title: 'Reproducir',
    description: 'Reproduce una canción (uri), un álbum, artista o playlist (context_uri), o reanuda lo que estaba en pausa si no se indica nada. Requiere Premium y un dispositivo con Spotify abierto.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'spotify:track:… o enlace de open.spotify.com de una canción' },
        context_uri: { type: 'string', description: 'spotify:album:…, spotify:playlist:… o spotify:artist:…' },
        device_id: { type: 'string', description: 'Dispositivo donde reproducir (ver devices); por defecto el activo' },
      },
    },
    annotations: acts,
    async run(ctx, args) {
      const body: Json = {}
      if (args.uri !== undefined) body.uris = [uri(args.uri, 'uri')]
      if (args.context_uri !== undefined) body.context_uri = uri(args.context_uri, 'context_uri')
      await spotify(ctx, 'PUT', '/me/player/play', { query: { device_id: optStr(args.device_id, 64) }, body: Object.keys(body).length ? body : undefined })
      return { ok: true, action: Object.keys(body).length ? 'play' : 'resume' }
    },
  },
  {
    name: 'pause',
    title: 'Pausar',
    description: 'Pausa la reproducción. Requiere Premium.',
    inputSchema: { type: 'object', properties: {} },
    annotations: acts,
    async run(ctx) {
      await spotify(ctx, 'PUT', '/me/player/pause')
      return { ok: true, action: 'pause' }
    },
  },
  {
    name: 'next_track',
    title: 'Siguiente canción',
    description: 'Salta a la siguiente canción. Requiere Premium.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { ...acts, idempotentHint: false },
    async run(ctx) {
      await spotify(ctx, 'POST', '/me/player/next')
      return { ok: true, action: 'next' }
    },
  },
  {
    name: 'previous_track',
    title: 'Canción anterior',
    description: 'Vuelve a la canción anterior. Requiere Premium.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { ...acts, idempotentHint: false },
    async run(ctx) {
      await spotify(ctx, 'POST', '/me/player/previous')
      return { ok: true, action: 'previous' }
    },
  },
  {
    name: 'queue_add',
    title: 'Añadir a la cola',
    description: 'Pone una canción a continuación en la cola de reproducción. Requiere Premium.',
    inputSchema: { type: 'object', properties: { uri: { type: 'string' } }, required: ['uri'] },
    annotations: { ...acts, idempotentHint: false },
    async run(ctx, args) {
      const target = uri(args.uri, 'uri')
      await spotify(ctx, 'POST', '/me/player/queue', { query: { uri: target } })
      return { ok: true, queued: target }
    },
  },
  {
    name: 'devices',
    title: 'Dispositivos',
    description: 'Los dispositivos donde la persona tiene Spotify abierto, y cuál está activo.',
    inputSchema: { type: 'object', properties: {} },
    annotations: readOnly,
    async run(ctx) {
      const data = (await spotify(ctx, 'GET', '/me/player/devices')) ?? {}
      return { devices: rows(data.devices).map(deviceView) }
    },
  },
  {
    name: 'my_playlists',
    title: 'Mis playlists',
    description: 'Las playlists de la persona (propias y seguidas), con su id y URI.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 }, offset: { type: 'integer', minimum: 0, default: 0 } } },
    annotations: readOnly,
    async run(ctx, args) {
      const data = (await spotify(ctx, 'GET', '/me/playlists', { query: { limit: int(args.limit, 20, 1, 50), offset: int(args.offset, 0, 0, 100000) } })) ?? {}
      return { total: data.total, playlists: rows(data.items).map(playlistView) }
    },
  },
  {
    name: 'playlist_items',
    title: 'Canciones de una playlist',
    description: 'Las canciones de una playlist, por su id o URI.',
    inputSchema: {
      type: 'object',
      properties: { playlist_id: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 50 }, offset: { type: 'integer', minimum: 0, default: 0 } },
      required: ['playlist_id'],
    },
    annotations: readOnly,
    async run(ctx, args) {
      const playlist = id(args.playlist_id, 'playlist_id')
      const data = (await spotify(ctx, 'GET', `/playlists/${playlist}/tracks`, { query: { fields: TRACK_FIELDS, limit: int(args.limit, 50, 1, 50), offset: int(args.offset, 0, 0, 100000) } })) ?? {}
      return { total: data.total, items: rows(data.items).map((item) => withTrack(item, { added_at: item.added_at })) }
    },
  },
  {
    name: 'create_playlist',
    title: 'Crear playlist',
    description: 'Crea una playlist nueva para la persona, privada salvo que se pida pública.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, description: { type: 'string' }, public: { type: 'boolean', default: false } },
      required: ['name'],
    },
    annotations: { ...acts, idempotentHint: false },
    async run(ctx, args) {
      const me = (await spotify(ctx, 'GET', '/me')) ?? {}
      const owner = id(me.id, 'me')
      const body = { name: str(args.name, 'name', 100), description: optStr(args.description, 300), public: args.public === true }
      const created = (await spotify(ctx, 'POST', `/users/${owner}/playlists`, { body })) ?? {}
      return playlistView(created)
    },
  },
  {
    name: 'add_to_playlist',
    title: 'Añadir a una playlist',
    description: 'Añade canciones (URIs o enlaces) a una playlist de la persona.',
    inputSchema: {
      type: 'object',
      properties: { playlist_id: { type: 'string' }, uris: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 } },
      required: ['playlist_id', 'uris'],
    },
    annotations: { ...acts, idempotentHint: false },
    async run(ctx, args) {
      const playlist = id(args.playlist_id, 'playlist_id')
      const uris = list(args.uris, 'uris', 100, uri)
      const data = (await spotify(ctx, 'POST', `/playlists/${playlist}/tracks`, { body: { uris } })) ?? {}
      return { ok: true, added: uris.length, snapshot_id: data.snapshot_id }
    },
  },
  {
    name: 'saved_tracks',
    title: 'Canciones guardadas',
    description: 'Las canciones que la persona guardó en su biblioteca (Me gusta), las más recientes primero.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 }, offset: { type: 'integer', minimum: 0, default: 0 } } },
    annotations: readOnly,
    async run(ctx, args) {
      const data = (await spotify(ctx, 'GET', '/me/tracks', { query: { limit: int(args.limit, 20, 1, 50), offset: int(args.offset, 0, 0, 100000) } })) ?? {}
      return { total: data.total, tracks: rows(data.items).map((item) => withTrack(item, { added_at: item.added_at })) }
    },
  },
  {
    name: 'save_tracks',
    title: 'Guardar canciones',
    description: 'Guarda canciones en la biblioteca de la persona (Me gusta), por id, URI o enlace.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 } }, required: ['ids'] },
    annotations: acts,
    async run(ctx, args) {
      const ids = list(args.ids, 'ids', 50, id)
      await spotify(ctx, 'PUT', '/me/tracks', { body: { ids } })
      return { ok: true, saved: ids.length }
    },
  },
  {
    name: 'remove_saved_tracks',
    title: 'Quitar canciones guardadas',
    description: 'Quita canciones de la biblioteca de la persona, por id, URI o enlace.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 } }, required: ['ids'] },
    annotations: { ...acts, destructiveHint: true },
    async run(ctx, args) {
      const ids = list(args.ids, 'ids', 50, id)
      await spotify(ctx, 'DELETE', '/me/tracks', { body: { ids } })
      return { ok: true, removed: ids.length }
    },
  },
  {
    name: 'top_items',
    title: 'Lo que más escucho',
    description: 'Las canciones o artistas que la persona más ha escuchado en las últimas semanas, seis meses o desde siempre.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['tracks', 'artists'], default: 'tracks' },
        time_range: { type: 'string', enum: ['short_term', 'medium_term', 'long_term'], default: 'medium_term', description: 'short_term ≈ 4 semanas, medium_term ≈ 6 meses, long_term = desde siempre' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
    },
    annotations: readOnly,
    async run(ctx, args) {
      const type = oneOf(args.type, ['tracks', 'artists'] as const, 'tracks')
      const time_range = oneOf(args.time_range, ['short_term', 'medium_term', 'long_term'] as const, 'medium_term')
      const data = (await spotify(ctx, 'GET', `/me/top/${type}`, { query: { time_range, limit: int(args.limit, 10, 1, 50) } })) ?? {}
      return { type, time_range, items: rows(data.items).map(type === 'tracks' ? trackView : artistView) }
    },
  },
  {
    name: 'recently_played',
    title: 'Escuchado recientemente',
    description: 'Las últimas canciones que la persona escuchó, con la hora.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 } } },
    annotations: readOnly,
    async run(ctx, args) {
      const data = (await spotify(ctx, 'GET', '/me/player/recently-played', { query: { limit: int(args.limit, 20, 1, 50) } })) ?? {}
      return { items: rows(data.items).map((item) => withTrack(item, { played_at: item.played_at })) }
    },
  },
]

/** The tool names, for the catalog and the tests. */
export const TOOL_NAMES: readonly string[] = TOOLS.map((t) => t.name)
