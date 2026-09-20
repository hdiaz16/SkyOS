import { describe, expect, it } from 'vitest'
import { SCOPES, spotifyMcp, TOOL_NAMES, type Deps } from './spotify-mcp.js'

const ENDPOINT = 'https://skyos.test/api/mcp/spotify'

const post = (body: unknown, token?: string, headers: Record<string, string> = {}): Request =>
  new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  })

const call = (name: string, args: unknown, id = 7): Request => post({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, 'tok')

interface Answer {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

interface Seen {
  url: string
  method: string
  auth: string | null
  body: unknown
}

function fakeSpotify(...answers: Answer[]): Deps & { seen: Seen[] } {
  const seen: Seen[] = []
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers)
    seen.push({ url, method: init?.method ?? 'GET', auth: headers.get('Authorization'), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const a = answers.shift() ?? { status: 200, body: {} }
    return new Response(a.status === 204 ? null : JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { 'Content-Type': 'application/json', ...(a.headers ?? {}) } })
  }
  return { fetch, seen }
}

interface Rpc {
  result?: { content?: Array<{ type: string; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean; tools?: Array<Record<string, unknown>>; protocolVersion?: string; serverInfo?: { name: string }; _meta?: Record<string, unknown> }
  error?: { code: number; message: string }
}

const rpc = async (res: Response): Promise<Rpc> => (await res.json()) as Rpc

const TRACK = {
  name: 'Dancing Queen',
  artists: [{ name: 'ABBA' }],
  album: { name: 'Arrival' },
  duration_ms: 230000,
  uri: 'spotify:track:0GjEhVFGZW8afUYGChu3Rr',
  id: '0GjEhVFGZW8afUYGChu3Rr',
  external_urls: { spotify: 'https://open.spotify.com/track/0GjEhVFGZW8afUYGChu3Rr' },
}

describe('el servidor MCP de Spotify: quién puede hablarle', () => {
  it('publica los metadatos del recurso con su propio origen y los scopes de las herramientas', async () => {
    const res = await spotifyMcp(new Request(`${ENDPOINT}?prm=1`), fakeSpotify())
    expect(res.status).toBe(200)
    const doc = (await res.json()) as { resource: string; authorization_servers: string[]; scopes_supported: string[] }
    expect(doc.resource).toBe(ENDPOINT)
    expect(doc.authorization_servers).toEqual(['https://accounts.spotify.com'])
    expect(doc.scopes_supported).toEqual(SCOPES)
  })

  it('sin token reta con la ruta de los metadatos, como cualquier servidor MCP', async () => {
    const res = await spotifyMcp(post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), fakeSpotify())
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer resource_metadata="https://skyos.test/.well-known/oauth-protected-resource/api/mcp/spotify"')
  })

  it('un token que Spotify ya no acepta vuelve como reto invalid_token, para que el cliente renueve', async () => {
    const spotify = fakeSpotify({ status: 401, body: { error: { status: 401, message: 'The access token expired' } } })
    const res = await spotifyMcp(call('profile', {}), spotify)
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain('error="invalid_token"')
    expect(res.headers.get('WWW-Authenticate')).toContain('The access token expired')
  })

  it('GET sin metadatos es 405, OPTIONS es 204', async () => {
    expect((await spotifyMcp(new Request(ENDPOINT), fakeSpotify())).status).toBe(405)
    expect((await spotifyMcp(new Request(ENDPOINT, { method: 'OPTIONS', headers: { Origin: 'https://skyos.test' } }), fakeSpotify())).status).toBe(204)
  })
})

describe('el servidor MCP de Spotify: el protocolo', () => {
  it('initialize responde la versión pedida si la conoce, y la suya si no', async () => {
    const known = await rpc(await spotifyMcp(post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {} } }, 'tok'), fakeSpotify()))
    expect(known.result?.protocolVersion).toBe('2025-03-26')
    expect(known.result?.serverInfo?.name).toBe('Spotify vía SkyOS')
    const odd = await rpc(await spotifyMcp(post({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2020-01-01' } }, 'tok'), fakeSpotify()))
    expect(odd.result?.protocolVersion).toBe('2025-06-18')
  })

  it('una notificación se acepta con 202 y sin cuerpo', async () => {
    const res = await spotifyMcp(post({ jsonrpc: '2.0', method: 'notifications/initialized' }, 'tok'), fakeSpotify())
    expect(res.status).toBe(202)
    expect(await res.text()).toBe('')
  })

  it('tools/list trae cada herramienta con su esquema, y el serverInfo viaja en _meta para la era sin handshake', async () => {
    const out = await rpc(await spotifyMcp(post({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } }, 'tok'), fakeSpotify()))
    const tools = out.result?.tools ?? []
    expect(tools.map((t) => t.name)).toEqual(TOOL_NAMES)
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['search', 'now_playing', 'play', 'my_playlists', 'saved_tracks']))
    for (const t of tools) expect((t.inputSchema as { type: string }).type).toBe('object')
    const info = out.result?._meta?.['io.modelcontextprotocol/serverInfo'] as { name: string } | undefined
    expect(info?.name).toBe('Spotify vía SkyOS')
  })

  it('un método desconocido es -32601 y un lote JSON-RPC se rechaza', async () => {
    const out = await rpc(await spotifyMcp(post({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, 'tok'), fakeSpotify()))
    expect(out.error?.code).toBe(-32601)
    expect((await spotifyMcp(post([{ jsonrpc: '2.0', id: 5, method: 'ping' }], 'tok'), fakeSpotify())).status).toBe(400)
  })
})

describe('el servidor MCP de Spotify: las herramientas', () => {
  it('search lleva el token a la Web API, recorta a diez y resume cada canción', async () => {
    const spotify = fakeSpotify({ body: { tracks: { total: 1, items: [TRACK] } } })
    const out = await rpc(await spotifyMcp(call('search', { q: 'abba dancing queen', type: 'track', limit: 50 }), spotify))
    const sent = new URL(spotify.seen[0].url)
    expect(sent.origin + sent.pathname).toBe('https://api.spotify.com/v1/search')
    expect(sent.searchParams.get('q')).toBe('abba dancing queen')
    expect(sent.searchParams.get('limit')).toBe('10')
    expect(spotify.seen[0].auth).toBe('Bearer tok')
    const results = out.result?.structuredContent?.results as Array<Record<string, unknown>>
    expect(results[0]).toMatchObject({ name: 'Dancing Queen', artists: 'ABBA', album: 'Arrival', duration: '3:50', uri: TRACK.uri })
    expect(JSON.parse(out.result?.content?.[0].text ?? '{}')).toEqual(out.result?.structuredContent)
  })

  it('now_playing con la sala en silencio (204) lo dice en vez de fallar', async () => {
    const out = await rpc(await spotifyMcp(call('now_playing', {}), fakeSpotify({ status: 204 })))
    expect(out.result?.structuredContent).toMatchObject({ playing: false })
    expect(out.result?.isError).toBeUndefined()
  })

  it('un 403 de Spotify es un error de herramienta legible, no un error HTTP', async () => {
    const spotify = fakeSpotify({ status: 403, body: { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } } })
    const res = await spotifyMcp(call('pause', {}), spotify)
    expect(res.status).toBe(200)
    const out = await rpc(res)
    expect(out.result?.isError).toBe(true)
    expect(out.result?.content?.[0].text).toContain('Premium')
  })

  it('valida ids y URIs antes de llamar a Spotify, y entiende los enlaces de open.spotify.com', async () => {
    const bad = fakeSpotify()
    const refused = await rpc(await spotifyMcp(call('play', { uri: 'javascript:alert(1)' }), bad))
    expect(refused.result?.isError).toBe(true)
    expect(bad.seen).toHaveLength(0)

    const good = fakeSpotify({ body: { snapshot_id: 'snap' } })
    const out = await rpc(await spotifyMcp(call('add_to_playlist', { playlist_id: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', uris: ['https://open.spotify.com/intl-es/track/0GjEhVFGZW8afUYGChu3Rr', 'spotify:track:4uLU6hMCjMI75M1A2tKUQC'] }), good))
    expect(good.seen[0].url).toBe('https://api.spotify.com/v1/playlists/37i9dQZF1DXcBWIGoYBM5M/tracks')
    expect(good.seen[0].body).toEqual({ uris: ['spotify:track:0GjEhVFGZW8afUYGChu3Rr', 'spotify:track:4uLU6hMCjMI75M1A2tKUQC'] })
    expect(out.result?.structuredContent).toMatchObject({ ok: true, added: 2, snapshot_id: 'snap' })
  })

  it('create_playlist pregunta primero quién es la persona y crea la lista privada por defecto', async () => {
    const spotify = fakeSpotify(
      { body: { id: 'ana' } },
      { status: 201, body: { name: 'Mías', id: 'p1', uri: 'spotify:playlist:p1', tracks: { total: 0 }, owner: { display_name: 'Ana' }, public: false, external_urls: { spotify: 'https://open.spotify.com/playlist/p1' } } },
    )
    const out = await rpc(await spotifyMcp(call('create_playlist', { name: 'Mías' }), spotify))
    expect(spotify.seen[0].url).toBe('https://api.spotify.com/v1/me')
    expect(spotify.seen[1]).toMatchObject({ url: 'https://api.spotify.com/v1/users/ana/playlists', method: 'POST', body: { name: 'Mías', public: false } })
    expect(out.result?.structuredContent).toMatchObject({ name: 'Mías', owner: 'Ana', tracks: 0 })
  })

  it('una herramienta que no existe se dice, sin tocar Spotify', async () => {
    const spotify = fakeSpotify()
    const out = await rpc(await spotifyMcp(call('recommendations', {}), spotify))
    expect(out.result?.isError).toBe(true)
    expect(spotify.seen).toHaveLength(0)
  })
})
