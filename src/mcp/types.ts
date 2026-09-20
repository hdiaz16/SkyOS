/**
 * Model Context Protocol (MCP) client types. Sky speaks the 2026-07-28 revision (stateless, per-request
 * metadata) and falls back to the 2025 revisions (initialize handshake + session) for servers that have
 * not migrated yet. Spec: https://modelcontextprotocol.io/specification/2026-07-28
 */

export type JsonRpcId = number | string

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: JsonRpcId | null
  result?: Record<string, unknown>
  error?: JsonRpcError
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export const MODERN_VERSION = '2026-07-28'
/** Revisions that still use the initialize handshake, newest first. */
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const
export type Era = 'modern' | 'legacy'

/** JSON-RPC error codes reserved by the MCP specification. */
export const RPC = {
  invalidParams: -32602,
  methodNotFound: -32601,
  headerMismatch: -32020,
  missingCapability: -32021,
  unsupportedVersion: -32022,
} as const

export const CLIENT_INFO = { name: 'SkyOS', title: 'SkyOS', version: '0.4.0' } as const

export interface McpTool {
  name: string
  title?: string
  description?: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource_link'; uri: string; name?: string; description?: string; mimeType?: string }
  | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string; blob?: string } }

export interface CallToolResult {
  /** Absent on legacy servers; treated as "complete". */
  resultType?: 'complete' | 'input_required'
  content?: ToolContent[]
  structuredContent?: unknown
  isError?: boolean
  /** Multi round-trip requests (2026-07-28): the server needs more input before it can finish. */
  inputRequests?: Record<string, unknown>
  requestState?: string
}

export interface ListToolsResult {
  tools: McpTool[]
  nextCursor?: string
  ttlMs?: number
  cacheScope?: 'public' | 'private'
}

export interface ServerInfo {
  name: string
  title?: string
  version?: string
}

/* ---------- OAuth ---------- */

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  /** Milliseconds since epoch; undefined when the token does not expire. */
  expiresAt?: number
  scope?: string
  /** OpenID Connect id_token, when the authorization server issued one; used only to greet by name. */
  idToken?: string
}

export type ClientRegistration = 'preregistered' | 'cimd' | 'dcr'

/** Credentials for one authorization server. Keyed by issuer: a client id never travels to another issuer. */
export interface OAuthClient {
  issuer: string
  clientId: string
  clientSecret?: string
  registration: ClientRegistration
  registeredAt: number
}

export interface ServerAuth {
  issuer: string
  /** Canonical resource identifier sent as the RFC 8707 `resource` parameter. */
  resource: string
  scopes: string[]
  tokens?: OAuthTokens
}

/* ---------- stored server ---------- */

export type ServerStatus = 'disconnected' | 'connected' | 'attention'

export interface McpServerRecord {
  /** Catalog id (e.g. "notion") or "custom-<nanoid>". */
  id: string
  name: string
  url: string
  catalogId?: string
  /** Learned on first contact; re-probed when the cached assumption fails. */
  era?: Era
  protocolVersion?: string
  auth?: ServerAuth
  serverInfo?: ServerInfo
  tools?: McpTool[]
  toolsFetchedAt?: number
  toolsTtlMs?: number
  account?: { name?: string; email?: string }
  /** OAuth client registered by hand for this server's authorization server (Google and the like). */
  manualClient?: { clientId: string; clientSecret?: string }
  status: ServerStatus
  /** Why the person has to act (renewal refused, more permissions needed). */
  attention?: string
  connectedAt?: number
  updatedAt: number
}

export type McpErrorCode =
  | 'auth_required'
  | 'forbidden'
  | 'cancelled'
  | 'not_configured'
  | 'not_connected'
  | 'unsupported'
  | 'network'
  | 'protocol'
  | 'rpc'

/** Errors the panel and the assistant can show as they are. */
export class McpError extends Error {
  readonly code: McpErrorCode
  readonly status?: number
  /** Raw WWW-Authenticate header, when the server challenged us. */
  readonly challenge?: string
  /** The server's own words from a refusal body («RBAC: access denied»), when it sent any. */
  readonly detail?: string
  readonly rpc?: JsonRpcError

  constructor(code: McpErrorCode, message: string, extra: { status?: number; challenge?: string; detail?: string; rpc?: JsonRpcError } = {}) {
    super(message)
    this.name = 'McpError'
    this.code = code
    this.status = extra.status
    this.challenge = extra.challenge
    this.detail = extra.detail
    this.rpc = extra.rpc
  }
}
