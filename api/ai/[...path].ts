import { corsHeaders, errorResponse, originAllowed } from '../_lib/relay.js'

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
/** A conversation with a document inline is large; a request of this size is not a conversation. */
const MAX_BODY_BYTES = 8 * 1024 * 1024

/* ---------- a budget, because a shared key on a public site is spendable ---------- */

/**
 * The origin check turns away anything that is not this desktop, but headers can be forged, so the key also
 * gets a ceiling: so many requests per address per minute and per hour. The counters live in the memory of one
 * edge instance, so the real ceiling is this times the number of instances — a brake, not a gate. SECURITY.md
 * says so plainly. A person who wants no ceiling at all pastes their own key in Ajustes and never comes here.
 */
const PER_MINUTE = Number(process.env.AI_RELAY_PER_MINUTE ?? 20)
const PER_HOUR = Number(process.env.AI_RELAY_PER_HOUR ?? 200)
const MINUTE = 60_000
const HOUR = 3_600_000

interface Spend {
  minute: number[]
  hour: number[]
}

const spending = new Map<string, Spend>()

function caller(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'desconocido'
}

/** Returns the seconds to wait when the caller is over budget, or 0 when there is room. */
function overBudget(key: string): number {
  const now = Date.now()
  if (spending.size > 5000) spending.clear() // the instance is being churned; start the window over
  const spend = spending.get(key) ?? { minute: [], hour: [] }
  spend.minute = spend.minute.filter((t) => now - t < MINUTE)
  spend.hour = spend.hour.filter((t) => now - t < HOUR)
  if (spend.minute.length >= PER_MINUTE) return Math.ceil((MINUTE - (now - spend.minute[0])) / 1000)
  if (spend.hour.length >= PER_HOUR) return Math.ceil((HOUR - (now - spend.hour[0])) / 1000)
  spend.minute.push(now)
  spend.hour.push(now)
  spending.set(key, spend)
  return 0
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (request.method !== 'POST' && request.method !== 'GET') return errorResponse(request, 405, 'Método no permitido.')
  if (!originAllowed(request)) return errorResponse(request, 403, 'Esta ruta solo atiende al escritorio de este sitio.')

  const key = process.env.GROQ_API_KEY?.trim()
  if (!key) {
    return errorResponse(request, 503, 'Este despliegue no tiene configurada la llave incluida. Agrega tu propia llave en Ajustes › Inteligencia.')
  }

  const path = new URL(request.url).pathname.replace(/^\/api\/ai\/?/, '').replace(/\/+$/, '')
  if (!ALLOWED.has(path)) return errorResponse(request, 404, 'Ruta no disponible.')

  const wait = overBudget(caller(request))
  if (wait) {
    const headers = corsHeaders(request)
    headers.set('Content-Type', 'application/json; charset=utf-8')
    headers.set('Retry-After', String(wait))
    return new Response(
      JSON.stringify({ error: { message: `El modelo incluido está muy pedido ahora mismo. Vuelve a intentar en ${wait} s, o pon tu propia llave en Ajustes › Inteligencia para no depender de este límite.` } }),
      { status: 429, headers },
    )
  }

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
