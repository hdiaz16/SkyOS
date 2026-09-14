import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { useToasts } from '../kernel/commands'
import { useWindows } from '../state/windows'
import { CATALOG, catalogFor } from './catalog'
import {
  accountFromIdToken,
  authorize,
  canonicalResource,
  chooseScopes,
  discoverAuthorizationServer,
  discoverProtectedResource,
  obtainClient,
  parseChallenge,
  redeem,
  refresh,
  type AuthorizationServerMetadata,
  type Preregistered,
} from './auth'
import { readPending, takeRedirectResult } from './popup'
import { mcpStore } from './store'
import { StreamableHttp, type TransportState } from './transport'
import { McpError, type CallToolResult, type ListToolsResult, type McpServerRecord, type McpTool, type OAuthTokens } from './types'

/**
 * One place that owns every MCP connection: records in the user's database, live transports in memory,
 * tokens renewed before they expire, tools cached per the server's ttl. The panel and the assistant only
 * talk to this module.
 */

const DEFAULT_TOOLS_TTL_MS = 5 * 60_000
const REFRESH_MARGIN_MS = 60_000
const KEEPALIVE_MS = 5 * 60_000
const RENEW_WINDOW_MS = 15 * 60_000

interface McpState {
  servers: McpServerRecord[]
  /** What each busy server is doing right now, for the panel. */
  busy: Record<string, string | undefined>
  /** Name of the app whose authorization page the tab is about to leave for. */
  leaving?: string
  loaded: boolean
}

export const useMcp = create<McpState>(() => ({ servers: [], busy: {}, loaded: false }))

/** A beat for the departure notice to be read before the tab leaves. */
const DEPARTURE_MS = 1100

/* ---------- records ---------- */

async function reload(): Promise<McpServerRecord[]> {
  const servers = await mcpStore.servers.list()
  useMcp.setState({ servers, loaded: true })
  return servers
}

function setBusy(id: string, message?: string): void {
  useMcp.setState((s) => ({ busy: { ...s.busy, [id]: message } }))
}

async function patch(id: string, changes: Partial<McpServerRecord>): Promise<McpServerRecord | undefined> {
  const next = await mcpStore.servers.patch(id, changes)
  await reload()
  return next
}

/** The stored record for a catalog app, created on first use so the catalog never needs seeding. */
async function ensureRecord(id: string): Promise<McpServerRecord> {
  const existing = await mcpStore.servers.get(id)
  if (existing) return existing
  const entry = catalogFor(id)
  if (!entry) throw new McpError('not_connected', 'Ese servidor no existe.')
  const record: McpServerRecord = { id, name: entry.name, url: entry.url, catalogId: id, status: 'disconnected', updatedAt: Date.now() }
  await mcpStore.servers.save(record)
  await reload()
  return record
}

export const serverRecord = (id: string): McpServerRecord | undefined => useMcp.getState().servers.find((s) => s.id === id)

/* ---------- transports ---------- */

const transports = new Map<string, StreamableHttp>()

function transportFor(record: McpServerRecord): StreamableHttp {
  const key = `${record.id}|${record.url}`
  let t = transports.get(key)
  if (!t) {
    for (const k of [...transports.keys()]) if (k.startsWith(`${record.id}|`)) transports.delete(k)
    t = new StreamableHttp(record.url, { era: record.era, protocolVersion: record.protocolVersion, serverInfo: record.serverInfo }, (state: TransportState) => {
      void mcpStore.servers.patch(record.id, { era: state.era, protocolVersion: state.protocolVersion, serverInfo: state.serverInfo }).then(() => reload())
    })
    transports.set(key, t)
  }
  return t
}

/* ---------- authorization plumbing ---------- */

const asCache = new Map<string, AuthorizationServerMetadata>()

async function authorizationServer(issuer: string): Promise<AuthorizationServerMetadata> {
  const cached = asCache.get(issuer)
  if (cached) return cached
  const as = await discoverAuthorizationServer(issuer)
  asCache.set(issuer, as)
  return as
}

function preregisteredFor(record: McpServerRecord): Preregistered | undefined {
  if (record.manualClient?.clientId) return record.manualClient
  return record.catalogId ? catalogFor(record.catalogId)?.preregistered?.() : undefined
}

async function markAttention(record: McpServerRecord, message: string): Promise<void> {
  await patch(record.id, { status: 'attention', attention: message })
}

/** A token good for at least a minute, renewed if needed. Undefined when the server never asked for one. */
async function validToken(record: McpServerRecord): Promise<string | undefined> {
  const tokens = record.auth?.tokens
  if (!record.auth || !tokens) return undefined
  if (!tokens.expiresAt || tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) return tokens.accessToken
  return (await renew(record)).accessToken
}

async function renew(record: McpServerRecord): Promise<OAuthTokens> {
  const auth = record.auth
  if (!auth?.tokens) throw new McpError('auth_required', `${record.name} no está autorizado.`)
  try {
    const as = await authorizationServer(auth.issuer)
    const client = await mcpStore.clients.get(auth.issuer)
    if (!client) throw new McpError('auth_required', 'Se perdió el registro del cliente; vuelve a conectar la app.')
    const tokens = await refresh(as, client, auth.resource, auth.tokens)
    await patch(record.id, { auth: { ...auth, tokens }, status: 'connected', attention: undefined })
    return tokens
  } catch (err) {
    if (err instanceof McpError && err.code === 'auth_required') {
      await markAttention(record, 'La sesión ya no se pudo renovar. Vuelve a conectar la app.')
      throw new McpError('auth_required', `La sesión de ${record.name} caducó. Vuelve a conectarla en Apps conectadas.`)
    }
    throw err
  }
}

/* ---------- tools ---------- */

const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

/** Tools whose x-mcp-header annotations break the rules must be dropped (spec: Streamable HTTP clients MUST reject them). */
function headerParams(tool: McpTool): Record<string, string> | null {
  const out: Record<string, string> = {}
  const seen = new Set<string>()
  const walk = (schema: Record<string, unknown>, path: string[]): boolean => {
    const props = schema.properties as Record<string, Record<string, unknown>> | undefined
    if (!props) return true
    for (const [key, prop] of Object.entries(props)) {
      const header = prop['x-mcp-header']
      if (header !== undefined) {
        if (typeof header !== 'string' || !HEADER_TOKEN.test(header) || seen.has(header.toLowerCase())) return false
        if (!['string', 'integer', 'boolean'].includes(String(prop.type))) return false
        seen.add(header.toLowerCase())
        out[[...path, key].join('.')] = header
      }
      if (prop.type === 'object' && prop.properties && !walk(prop, [...path, key])) return false
    }
    return true
  }
  return walk(tool.inputSchema, []) ? out : null
}

/** Values for Mcp-Param-* headers, read at the exact property path of each annotated parameter. */
function paramHeadersFor(tool: McpTool, args: Record<string, unknown>): Record<string, string | number | boolean> {
  const mapping = headerParams(tool) ?? {}
  const out: Record<string, string | number | boolean> = {}
  for (const [path, header] of Object.entries(mapping)) {
    let cur: unknown = args
    for (const step of path.split('.')) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[step] : undefined
    if (cur === undefined || cur === null) continue
    if (typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean') out[header] = cur
  }
  return out
}

async function fetchTools(record: McpServerRecord, token: string | undefined): Promise<{ tools: McpTool[]; ttlMs: number }> {
  const t = transportFor(record)
  const tools: McpTool[] = []
  let cursor: string | undefined
  let ttlMs = DEFAULT_TOOLS_TTL_MS
  do {
    const page = await t.request<ListToolsResult>('tools/list', cursor ? { cursor } : {}, { token })
    for (const tool of page.tools ?? []) {
      if (headerParams(tool) === null) {
        console.warn(`[mcp] ${record.name}: herramienta ${tool.name} descartada por x-mcp-header inválido`)
        continue
      }
      tools.push(tool)
    }
    if (page.ttlMs) ttlMs = page.ttlMs
    cursor = page.nextCursor
  } while (cursor)
  return { tools, ttlMs }
}

/* ---------- public API ---------- */

export const mcp = {
  load: reload,

  catalog: CATALOG,

  /** Connects an app. Interactive: opens the provider's consent page when the server asks for it. */
  async connect(id: string, extraScopes: string[] = []): Promise<McpServerRecord> {
    let record = await ensureRecord(id)
    setBusy(id, 'Contactando al servidor…')
    try {
      const token = await validToken(record).catch(() => undefined)
      try {
        const { tools, ttlMs } = await fetchTools(record, token)
        return await finishConnect(record, tools, ttlMs)
      } catch (err) {
        if (!(err instanceof McpError) || (err.code !== 'auth_required' && err.code !== 'forbidden')) throw err
        setBusy(id, 'Esperando tu permiso…')
        const challenge = parseChallenge(err.challenge)
        const prm = await discoverProtectedResource(record.url, challenge).catch(() => null)
        const issuer = prm?.authorization_servers[0] ?? record.auth?.issuer
        if (!issuer) throw new McpError('unsupported', 'El servidor pide autorización pero no dice a quién pedírsela.')
        const as = await authorizationServer(issuer)
        const client = await obtainClient(as, preregisteredFor(record))
        const entry = record.catalogId ? catalogFor(record.catalogId) : undefined
        const resource = prm?.resource ?? canonicalResource(record.url)
        const scopes = chooseScopes(challenge, prm, entry?.preferredScopes, [...(record.auth?.scopes ?? []), ...extraScopes])
        useMcp.setState({ leaving: record.name })
        await new Promise((r) => window.setTimeout(r, DEPARTURE_MS))
        const tokens = await authorize({ serverId: record.id, as, client, resource, scopes })
        record = (await patch(record.id, { auth: { issuer, resource, scopes, tokens }, account: accountFromIdToken(tokens.idToken) ?? record.account })) ?? record
        setBusy(id, 'Leyendo herramientas…')
        transportFor(record).reset()
        const { tools, ttlMs } = await fetchTools(record, tokens.accessToken)
        return await finishConnect(record, tools, ttlMs)
      }
    } catch (err) {
      useMcp.setState({ leaving: undefined })
      throw err
    } finally {
      setBusy(id, undefined)
    }
  },

  /** Forgets the tokens (telling the authorization server when it offers revocation) and the tools. */
  async disconnect(id: string): Promise<void> {
    const record = await mcpStore.servers.get(id)
    if (!record) return
    const tokens = record.auth?.tokens
    if (record.auth && tokens) {
      try {
        const as = (await authorizationServer(record.auth.issuer)) as AuthorizationServerMetadata & { revocation_endpoint?: string }
        const client = await mcpStore.clients.get(record.auth.issuer)
        if (as.revocation_endpoint && client) {
          const body = new URLSearchParams({ token: tokens.refreshToken ?? tokens.accessToken, client_id: client.clientId })
          if (client.clientSecret) body.set('client_secret', client.clientSecret)
          await fetch(as.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }).catch(() => undefined)
        }
      } catch {
        // Revocation is a courtesy; the local session goes away regardless.
      }
    }
    transportFor(record).reset()
    await patch(id, { auth: record.auth ? { ...record.auth, tokens: undefined } : undefined, tools: undefined, toolsFetchedAt: undefined, status: 'disconnected', attention: undefined, account: undefined })
  },

  /** Re-reads the tool list when the cache is stale (or always, when forced). */
  async refreshTools(id: string, force = false): Promise<McpTool[]> {
    const record = await mcpStore.servers.get(id)
    if (!record || record.status === 'disconnected') return []
    const fresh = record.toolsFetchedAt && Date.now() - record.toolsFetchedAt < (record.toolsTtlMs ?? DEFAULT_TOOLS_TTL_MS)
    if (fresh && !force && record.tools) return record.tools
    const token = await validToken(record)
    const { tools, ttlMs } = await fetchTools(record, token)
    await patch(id, { tools, toolsFetchedAt: Date.now(), toolsTtlMs: ttlMs })
    return tools
  },

  /** Runs a tool on a connected server. Auth trouble becomes a clear message and a mark in the panel. */
  async callTool(id: string, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const record = serverRecord(id) ?? (await mcpStore.servers.get(id))
    if (!record || record.status === 'disconnected') throw new McpError('not_connected', `${record?.name ?? 'Esa app'} no está conectada. Conéctala en Apps conectadas.`)
    const tool = record.tools?.find((t) => t.name === name)
    const paramHeaders = tool ? paramHeadersFor(tool, args) : {}
    const run = async (token: string | undefined) => transportFor(record).request<CallToolResult>('tools/call', { name, arguments: args }, { name, token, paramHeaders })
    let token = await validToken(record)
    try {
      return await run(token)
    } catch (err) {
      if (!(err instanceof McpError)) throw err
      if (err.code === 'auth_required' && record.auth?.tokens?.refreshToken) {
        token = (await renew(record)).accessToken
        return run(token)
      }
      if (err.code === 'auth_required') {
        await markAttention(record, 'La sesión ya no es válida. Vuelve a conectar la app.')
        throw new McpError('auth_required', `La sesión de ${record.name} caducó. Pide a la persona que la vuelva a conectar en Apps conectadas.`)
      }
      if (err.code === 'forbidden') {
        const challenge = parseChallenge(err.challenge)
        const needed = challenge.scope ? ` Permisos necesarios: ${challenge.scope}.` : ''
        await markAttention(record, `Necesita más permisos.${needed} Vuelve a conectar la app para concederlos.`)
        throw new McpError('forbidden', `${record.name} necesita más permisos para eso.${needed} La persona debe reconectar la app en Apps conectadas.`)
      }
      throw err
    }
  },

  async addCustom(name: string, url: string): Promise<McpServerRecord> {
    const clean = url.trim()
    if (!/^https:\/\//.test(clean)) throw new McpError('not_configured', 'La URL del servidor debe empezar con https://')
    const record: McpServerRecord = { id: `custom-${nanoid(8)}`, name: name.trim() || new URL(clean).hostname, url: clean, status: 'disconnected', updatedAt: Date.now() }
    await mcpStore.servers.save(record)
    await reload()
    return record
  },

  /** URL, name or hand-registered client id changes; anything that alters where or as whom we connect drops the session. */
  async update(id: string, changes: Pick<Partial<McpServerRecord>, 'name' | 'url' | 'manualClient'>): Promise<void> {
    const record = await ensureRecord(id)
    const relocating = (changes.url && changes.url !== record.url) || changes.manualClient !== undefined
    if (relocating) transports.delete(`${record.id}|${record.url}`)
    await patch(id, {
      ...changes,
      ...(relocating ? { era: undefined, protocolVersion: undefined, auth: undefined, tools: undefined, status: 'disconnected' as const, attention: undefined } : {}),
    })
  },

  async remove(id: string): Promise<void> {
    await this.disconnect(id)
    await mcpStore.servers.remove(id)
    await reload()
  },

  /**
   * Boot: loads records, finishes a redirect-based authorization if one is pending, renews tokens that
   * are about to expire and keeps doing so while the desktop is open. Returns a stop function.
   */
  start(): () => void {
    void (async () => {
      await reload()
      await resumeRedirect()
      await keepAlive()
    })()
    const timer = window.setInterval(() => void keepAlive(), KEEPALIVE_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void keepAlive()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  },
}

async function finishConnect(record: McpServerRecord, tools: McpTool[], ttlMs: number): Promise<McpServerRecord> {
  const next = await patch(record.id, {
    tools,
    toolsFetchedAt: Date.now(),
    toolsTtlMs: ttlMs,
    status: 'connected',
    attention: undefined,
    connectedAt: record.connectedAt ?? Date.now(),
  })
  return next ?? record
}

async function keepAlive(): Promise<void> {
  const servers = await mcpStore.servers.list().catch(() => [])
  for (const s of servers) {
    if (s.status === 'disconnected') continue
    const tokens = s.auth?.tokens
    if (tokens?.refreshToken && tokens.expiresAt && tokens.expiresAt - Date.now() < RENEW_WINDOW_MS) await renew(s).catch(() => undefined)
    await mcp.refreshTools(s.id).catch(() => undefined)
  }
}

/** Back from the authorization page: the callback left its parameters behind; finish the flow where the person left off. */
async function resumeRedirect(): Promise<void> {
  const params = takeRedirectResult()
  const pending = readPending()
  if (!params || !pending) return
  const record = await mcpStore.servers.get(pending.serverId)
  if (!record) return
  const wm = useWindows.getState()
  const win = wm.open('settings', { singleton: true, props: { section: 'apps', app: record.id } })
  wm.setProps(win, { section: 'apps', app: record.id })
  try {
    const tokens = await redeem(pending, params)
    await patch(record.id, {
      auth: { issuer: pending.issuer, resource: pending.resource, scopes: pending.scopes, tokens },
      account: accountFromIdToken(tokens.idToken) ?? record.account,
    })
    const done = await mcp.connect(record.id)
    useToasts.getState().push({ message: `${done.name} conectado · ${done.tools?.length ?? 0} herramientas`, kind: 'info' })
  } catch (err) {
    useToasts.getState().push({ message: err instanceof Error ? err.message : `No se pudo conectar ${record.name}`, kind: 'error' })
  }
}
