import { corsHeaders, errorResponse } from '../_lib/relay.js'

/**
 * Sky's included model, without handing the key to the browser.
 *
 * The desktop calls `/api/ai/chat/completions` (and `/models`, `/audio/transcriptions`) with no credentials;
 * this function repeats the call against Groq with the key that lives in the deployment's environment, and
 * streams the answer back. So nobody can read the key from the page, and a person who pastes their own key in
 * Ajustes bypasses this route entirely and talks to their provider directly.
 */

export const config = { runtime: 'edge' }

const UPSTREAM = 'https://api.groq.com/openai/v1'
/** Endpoints the desktop actually uses. Anything else is not ours to relay. */
const ALLOWED = new Set(['chat/completions', 'models', 'audio/transcriptions'])
const MAX_BODY_BYTES = 25 * 1024 * 1024

/** Only the page this function ships with may spend the key. */
function sameSite(request: Request): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return true // same-origin navigations and non-CORS clients send no Origin
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (request.method !== 'POST' && request.method !== 'GET') return errorResponse(request, 405, 'Método no permitido.')
  if (!sameSite(request)) return errorResponse(request, 403, 'Esta ruta solo atiende al escritorio de este sitio.')

  const key = process.env.GROQ_API_KEY?.trim()
  if (!key) {
    return errorResponse(request, 503, 'Este despliegue no tiene configurada la llave incluida. Agrega tu propia llave en Ajustes › Inteligencia.')
  }

  const path = new URL(request.url).pathname.replace(/^\/api\/ai\/?/, '').replace(/\/+$/, '')
  if (!ALLOWED.has(path)) return errorResponse(request, 404, 'Ruta no disponible.')

  const headers = new Headers({ Authorization: `Bearer ${key}` })
  const contentType = request.headers.get('Content-Type')
  if (contentType) headers.set('Content-Type', contentType)
  const accept = request.headers.get('Accept')
  if (accept) headers.set('Accept', accept)

  let body: ArrayBuffer | undefined
  if (request.method === 'POST') {
    body = await request.arrayBuffer()
    if (body.byteLength > MAX_BODY_BYTES) return errorResponse(request, 413, 'La petición es demasiado grande.')
  }

  let upstream: Response
  try {
    upstream = await fetch(`${UPSTREAM}/${path}`, { method: request.method, headers, body, signal: request.signal })
  } catch {
    return errorResponse(request, 502, 'No se pudo contactar al proveedor.')
  }

  const out = corsHeaders(request)
  for (const name of ['Content-Type', 'Retry-After', 'X-RateLimit-Remaining-Tokens', 'X-RateLimit-Reset-Tokens']) {
    const value = upstream.headers.get(name)
    if (value !== null) out.set(name, value)
  }
  out.set('Cache-Control', 'no-store')
  return new Response(upstream.body, { status: upstream.status, headers: out })
}
