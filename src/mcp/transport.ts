import { BRIDGE_URL, hasBridge } from '../config'
import {
  CLIENT_INFO,
  LEGACY_VERSIONS,
  MODERN_VERSION,
  McpError,
  RPC,
  type Era,
  type JsonRpcError,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcResponse,
  type ServerInfo,
} from './types'

/**
 * Streamable HTTP, dual-era. Every message is a POST; the answer is a JSON object or a request-scoped SSE
 * stream. Modern servers (2026-07-28) are stateless and want `_meta` plus mirrored headers; legacy servers
 * (2025-*) want an `initialize` handshake and an `Mcp-Session-Id`. The era is detected on first contact
 * and remembered by the caller.
 */

export interface RequestOptions {
  /** `params.name` for tools/call, mirrored into the Mcp-Name header. */
  name?: string
  /** Values mirrored into Mcp-Param-* headers (x-mcp-header). */
  paramHeaders?: Record<string, string | number | boolean>
  token?: string
  signal?: AbortSignal
}

export interface TransportState {
  era?: Era
  protocolVersion?: string
  serverInfo?: ServerInfo
}

type Listener = (state: TransportState) => void

const REQUEST_TIMEOUT_MS = 60_000

/** Header values must be visible ASCII; anything else travels Base64-encoded with the spec's sentinel. */
function headerValue(value: string): string {
  const plain = /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/.test(value)
  if (plain && !(value.startsWith('=?base64?') && value.endsWith('?='))) return value
  const bytes = new TextEncoder().encode(value)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `=?base64?${btoa(bin)}?=`
}

function isRecognizedModernError(err: JsonRpcError | undefined): boolean {
  return !!err && (err.code === RPC.unsupportedVersion || err.code === RPC.headerMismatch || err.code === RPC.missingCapability)
}

export class StreamableHttp {
  private readonly url: string
  private state: TransportState
  private readonly onChange: Listener
  private sessionId?: string
  private nextId = 1
  private viaProxy = false
  private initializing: Promise<void> | null = null

  constructor(url: string, initial: TransportState, onChange: Listener) {
    this.url = url
    this.state = { ...initial }
    this.onChange = onChange
  }

  get era(): Era | undefined {
    return this.state.era
  }

  get serverInfo(): ServerInfo | undefined {
    return this.state.serverInfo
  }

  /** Forgets the session so the next request starts from scratch (after a 404 or a URL change). */
  reset(): void {
    this.sessionId = undefined
  }

  private update(patch: TransportState): void {
    this.state = { ...this.state, ...patch }
    this.onChange(this.state)
  }

  /* ---------- HTTP ---------- */

  private async send(body: unknown, headers: Record<string, string>, signal?: AbortSignal): Promise<Response> {
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
    const proxied = () => fetch(`${BRIDGE_URL}/mcp/proxy?target=${encodeURIComponent(this.url)}`, init)
    if (this.viaProxy) return proxied()
    try {
      return await fetch(this.url, init)
    } catch (err) {
      // AbortSignal.timeout aborts with a TimeoutError, not an AbortError: only checking for the latter sent
      // every slow server down the CORS path and left the app marked as if the browser had refused the call.
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        throw new McpError('network', 'El servidor tardó demasiado en responder.')
      }
      // A TypeError here is the browser refusing the cross-origin call (or no network); the bridge adds the CORS headers.
      if (!hasBridge) {
        throw new McpError('network', 'El navegador no pudo conectar con el servidor MCP (CORS o red). Para servidores sin CORS, configura el puente de Sky.')
      }
      this.viaProxy = true
      try {
        return await proxied()
      } catch {
        throw new McpError('network', `No hay conexión con el puente de Sky (${BRIDGE_URL}).`)
      }
    }
  }

  /** Reads one JSON object or an SSE stream until the response to `id` arrives. */
  private async readResponse(res: Response, id: JsonRpcId): Promise<JsonRpcResponse> {
    const type = res.headers.get('content-type') ?? ''
    if (type.includes('text/event-stream')) {
      if (!res.body) throw new McpError('protocol', 'El servidor abrió un stream vacío.')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
          const raw = buffer.slice(0, sep)
          buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '')
          const data = raw
            .split(/\r?\n/)
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).replace(/^ /, ''))
            .join('\n')
          if (!data) continue
          let msg: JsonRpcMessage
          try {
            msg = JSON.parse(data) as JsonRpcMessage
          } catch {
            continue
          }
          if ('id' in msg && msg.id === id && ('result' in msg || 'error' in msg)) {
            void reader.cancel().catch(() => undefined)
            return msg as JsonRpcResponse
          }
          // Notifications (progress, log messages) and legacy server requests are not needed by Sky yet.
        }
      }
      throw new McpError('protocol', 'El servidor cerró el stream sin responder.')
    }
    const text = await res.text()
    if (!text) throw new McpError('protocol', 'El servidor respondió sin contenido.')
    try {
      return JSON.parse(text) as JsonRpcResponse
    } catch {
      throw new McpError('protocol', 'El servidor no respondió JSON-RPC válido.')
    }
  }

  private async parseError(res: Response): Promise<JsonRpcError | undefined> {
    try {
      const data = (await res.clone().json()) as JsonRpcResponse
      return data?.error
    } catch {
      return undefined
    }
  }

  /* ---------- modern (2026-07-28) ---------- */

  private modernHeaders(method: string, opts: RequestOptions): Record<string, string> {
    const h: Record<string, string> = { 'MCP-Protocol-Version': MODERN_VERSION, 'Mcp-Method': method }
    if (opts.name) h['Mcp-Name'] = headerValue(opts.name)
    for (const [k, v] of Object.entries(opts.paramHeaders ?? {})) h[`Mcp-Param-${k}`] = headerValue(String(v))
    if (opts.token) h.Authorization = `Bearer ${opts.token}`
    return h
  }

  private async requestModern<T>(method: string, params: Record<string, unknown>, opts: RequestOptions): Promise<T> {
    const id = this.nextId++
    const body = {
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
          'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }
    const res = await this.send(body, this.modernHeaders(method, opts), opts.signal)
    this.throwOnAuth(res)
    if (res.status === 400) {
      const err = await this.parseError(res)
      if (err?.code === RPC.unsupportedVersion) {
        const supported = ((err.data as { supported?: string[] } | undefined)?.supported ?? []).filter((v): v is (typeof LEGACY_VERSIONS)[number] =>
          (LEGACY_VERSIONS as readonly string[]).includes(v),
        )
        if (!supported.length) throw new McpError('unsupported', 'El servidor no habla ninguna versión de MCP que Sky conozca.', { rpc: err })
        this.update({ era: 'legacy', protocolVersion: supported[0] })
        return this.requestLegacy(method, params, opts)
      }
      if (isRecognizedModernError(err)) throw new McpError('protocol', err?.message ?? 'El servidor rechazó la petición.', { status: 400, rpc: err })
      // Anything else on 400 is a legacy server complaining about the missing handshake.
      this.update({ era: 'legacy' })
      return this.requestLegacy(method, params, opts)
    }
    if (res.status === 404 || res.status === 405) {
      const err = await this.parseError(res)
      if (err?.code === RPC.methodNotFound) throw new McpError('rpc', err.message, { status: res.status, rpc: err })
      // Legacy servers answer an unknown session (we sent none) with 404 and no modern error body.
      this.update({ era: 'legacy' })
      return this.requestLegacy(method, params, opts)
    }
    if (!res.ok) throw await this.httpError(res)
    const msg = await this.readResponse(res, id)
    if (this.state.era !== 'modern') this.update({ era: 'modern', protocolVersion: MODERN_VERSION })
    const info = (msg.result?._meta as Record<string, unknown> | undefined)?.['io.modelcontextprotocol/serverInfo'] as ServerInfo | undefined
    if (info && info.name !== this.state.serverInfo?.name) this.update({ serverInfo: info })
    return this.unwrap<T>(msg)
  }

  /* ---------- legacy (2025-03-26 … 2025-11-25) ---------- */

  private legacyHeaders(opts: RequestOptions, withSession = true): Record<string, string> {
    const h: Record<string, string> = {}
    if (this.state.protocolVersion) h['MCP-Protocol-Version'] = this.state.protocolVersion
    if (withSession && this.sessionId) h['Mcp-Session-Id'] = this.sessionId
    if (opts.token) h.Authorization = `Bearer ${opts.token}`
    return h
  }

  private async initialize(opts: RequestOptions): Promise<void> {
    const id = this.nextId++
    const preferred = this.state.protocolVersion && (LEGACY_VERSIONS as readonly string[]).includes(this.state.protocolVersion) ? this.state.protocolVersion : LEGACY_VERSIONS[0]
    const body = {
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: { protocolVersion: preferred, capabilities: {}, clientInfo: CLIENT_INFO },
    }
    const headers: Record<string, string> = {}
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`
    const res = await this.send(body, headers, opts.signal)
    this.throwOnAuth(res)
    if (!res.ok) throw await this.httpError(res)
    const session = res.headers.get('mcp-session-id')
    const msg = await this.readResponse(res, id)
    const result = this.unwrap<{ protocolVersion?: string; serverInfo?: ServerInfo }>(msg)
    const version = result.protocolVersion ?? preferred
    if (!(LEGACY_VERSIONS as readonly string[]).includes(version)) throw new McpError('unsupported', `El servidor habla MCP ${version}, que Sky no conoce.`)
    this.sessionId = session ?? undefined
    this.update({ era: 'legacy', protocolVersion: version, serverInfo: result.serverInfo ?? this.state.serverInfo })
    // The handshake ends with a notification; servers acknowledge it with 202 and nothing else.
    await this.send({ jsonrpc: '2.0', method: 'notifications/initialized' }, this.legacyHeaders(opts), opts.signal).catch(() => undefined)
  }

  private async requestLegacy<T>(method: string, params: Record<string, unknown>, opts: RequestOptions, retried = false): Promise<T> {
    if (!this.sessionId || !this.state.protocolVersion) {
      this.initializing ??= this.initialize(opts).finally(() => {
        this.initializing = null
      })
      await this.initializing
    }
    const id = this.nextId++
    const res = await this.send({ jsonrpc: '2.0', id, method, params }, this.legacyHeaders(opts), opts.signal)
    this.throwOnAuth(res)
    if (res.status === 404 && !retried) {
      // The session expired server-side; start a new one and try once more.
      this.sessionId = undefined
      return this.requestLegacy(method, params, opts, true)
    }
    if (!res.ok) throw await this.httpError(res)
    return this.unwrap<T>(await this.readResponse(res, id))
  }

  /* ---------- shared ---------- */

  private throwOnAuth(res: Response): void {
    if (res.status === 401) throw new McpError('auth_required', 'El servidor pide autorización.', { status: 401, challenge: res.headers.get('www-authenticate') ?? undefined })
    if (res.status === 403) throw new McpError('forbidden', 'El servidor no permite esta operación con los permisos actuales.', { status: 403, challenge: res.headers.get('www-authenticate') ?? undefined })
  }

  private async httpError(res: Response): Promise<McpError> {
    const err = await this.parseError(res)
    if (res.status === 429) return new McpError('rpc', 'El servidor está limitando las solicitudes; intenta en unos segundos.', { status: 429, rpc: err })
    return new McpError('protocol', err?.message ?? `El servidor respondió ${res.status}.`, { status: res.status, rpc: err })
  }

  private unwrap<T>(msg: JsonRpcResponse): T {
    if (msg.error) throw new McpError('rpc', msg.error.message || 'El servidor devolvió un error.', { rpc: msg.error })
    return (msg.result ?? {}) as T
  }

  /** Sends a request and returns its result, choosing the era the server understands. */
  async request<T>(method: string, params: Record<string, unknown> = {}, opts: RequestOptions = {}): Promise<T> {
    if (this.state.era === 'legacy') return this.requestLegacy<T>(method, params, opts)
    return this.requestModern<T>(method, params, opts)
  }
}
