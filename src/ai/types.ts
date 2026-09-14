/**
 * Provider-neutral chat model. Every provider adapter translates to and from these shapes,
 * so the agent, the session store and the UI never depend on a vendor SDK.
 */

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export interface TextPart {
  type: 'text'
  text: string
}

export interface ImagePart {
  type: 'image'
  mediaType: ImageMediaType
  /** Base64 without the data: prefix. */
  data: string
}

export interface DocumentPart {
  type: 'document'
  mediaType: 'application/pdf'
  data: string
  title?: string
}

/** A text file attached from the desktop: its content travels inline, so every provider can read it. */
export interface FilePart {
  type: 'file'
  name: string
  text: string
  nodeId?: string
}

/** How a file attachment is shown to the model. */
export const fileBlock = (p: FilePart): string => `<archivo nombre="${p.name}">\n${p.text}\n</archivo>`

export interface ToolCallPart {
  type: 'tool_call'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultPart {
  type: 'tool_result'
  toolCallId: string
  content: string
  isError?: boolean
}

export type Part = TextPart | ImagePart | DocumentPart | FilePart | ToolCallPart | ToolResultPart
export type Attachment = ImagePart | DocumentPart | FilePart

export interface ChatMessage {
  role: 'user' | 'assistant'
  parts: Part[]
  /**
   * Vendor-specific content of an assistant turn, kept so it can be replayed byte-for-byte
   * (thinking blocks and tool calls must go back unchanged to the model that produced them).
   */
  raw?: { provider: string; model: string; content: unknown }
}

export interface JsonSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export interface ToolSpec {
  name: string
  description: string
  inputSchema: JsonSchema
}

export type ServerTool = 'web_fetch' | 'web_search'
export type Effort = 'low' | 'medium' | 'high'

export interface ChatRequest {
  model: string
  system: string
  messages: ChatMessage[]
  tools?: ToolSpec[]
  serverTools?: ServerTool[]
  maxTokens?: number
  effort?: Effort
  signal?: AbortSignal
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause_turn' | 'aborted' | 'other'

export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
}

export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCallPart }
  | { type: 'server_tool'; name: string; input: unknown }
  | { type: 'done'; stopReason: StopReason; usage: Usage; assistant: ChatMessage; refusal?: string }
  | { type: 'error'; error: Error }

export interface ModelInfo {
  id: string
  label: string
  /** Rough speed and depth so the UI can explain the choice. */
  tier: 'fast' | 'balanced' | 'deep'
  vision: boolean
  /** False for models that cannot call tools (Groq's compound systems). */
  tools?: boolean
}

export interface ProviderCapabilities {
  vision: boolean
  documents: boolean
  serverWebFetch: boolean
  effort: boolean
}

export interface AiProvider {
  id: string
  name: string
  capabilities: ProviderCapabilities
  chat: (request: ChatRequest) => AsyncIterable<StreamEvent>
}

/** Errors the UI can show verbatim to the user. */
export class AiError extends Error {
  readonly retryable: boolean
  readonly status?: number
  /** How long the provider asked us to wait before trying again, when it said. */
  readonly retryAfterMs?: number

  constructor(message: string, retryable = false, extra: { status?: number; retryAfterMs?: number } = {}) {
    super(message)
    this.name = 'AiError'
    this.retryable = retryable
    this.status = extra.status
    this.retryAfterMs = extra.retryAfterMs
  }
}

/**
 * What the person reads when a request riding on Sky's included key does not get through. That key is an
 * implementation detail: whatever the cause (quota, rate limit, a revoked key), the useful message is that
 * Sky is busy right now and that their own key in Ajustes is the way around it. Never "failed", never details.
 */
export const SHARED_KEY_BUSY = 'Sky está atendiendo muchas solicitudes en este momento. Intenta de nuevo en un momento o, si prefieres, agrega tu propia llave en Ajustes › Inteligencia.'

export const sharedKeyBusy = (status?: number, retryAfterMs?: number): AiError =>
  new AiError(SHARED_KEY_BUSY, status === undefined || status === 429 || status >= 500, { status, retryAfterMs })
