import { corsHeaders } from './_lib/relay.js'

/**
 * Roughly where the request comes from, read from the headers the edge network already adds. It costs no
 * permission prompt and no third party: the desktop uses it when the browser's own location is denied or
 * unavailable, so people are only ever asked to type their city as a last resort.
 */

export const config = { runtime: 'edge' }

const header = (request: Request, name: string): string | undefined => {
  const raw = request.headers.get(name)?.trim()
  if (!raw) return undefined
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export default function handler(request: Request): Response {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })

  const city = header(request, 'x-vercel-ip-city')
  const region = header(request, 'x-vercel-ip-country-region')
  const country = header(request, 'x-vercel-ip-country')
  const lat = Number(header(request, 'x-vercel-ip-latitude'))
  const lon = Number(header(request, 'x-vercel-ip-longitude'))

  const headers = corsHeaders(request)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  // The address moves with the person, so this answer belongs to one request only.
  headers.set('Cache-Control', 'no-store')

  if (!city || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ place: null }), { status: 200, headers })
  }
  const place = [city, region, country].filter(Boolean).join(', ')
  return new Response(JSON.stringify({ place, city, region, country, lat, lon }), { status: 200, headers })
}
