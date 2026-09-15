/** Open-Meteo client: free, no key, CORS-enabled. */

export interface Place {
  name: string
  lat: number
  lon: number
}

export interface DayForecast {
  date: string
  code: number
  min: number
  max: number
}

export interface Weather {
  temperature: number
  code: number
  isDay: boolean
  humidity: number
  wind: number
  days: DayForecast[]
  fetchedAt: number
}

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

/** WMO weather interpretation codes → description and a coarse kind for icons. */
export function describeCode(code: number): { text: string; kind: WeatherKind } {
  if (code === 0) return { text: 'Despejado', kind: 'clear' }
  if (code === 1) return { text: 'Mayormente despejado', kind: 'clear' }
  if (code === 2) return { text: 'Parcialmente nublado', kind: 'partly' }
  if (code === 3) return { text: 'Nublado', kind: 'cloudy' }
  if (code === 45 || code === 48) return { text: 'Niebla', kind: 'fog' }
  if (code >= 51 && code <= 57) return { text: 'Llovizna', kind: 'drizzle' }
  if (code >= 61 && code <= 67) return { text: 'Lluvia', kind: 'rain' }
  if (code >= 71 && code <= 77) return { text: 'Nieve', kind: 'snow' }
  if (code >= 80 && code <= 82) return { text: 'Chubascos', kind: 'rain' }
  if (code === 85 || code === 86) return { text: 'Nieve', kind: 'snow' }
  if (code >= 95) return { text: 'Tormenta', kind: 'storm' }
  return { text: 'Variable', kind: 'partly' }
}

const cache = new Map<string, Weather>()
const TTL = 15 * 60 * 1000

export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.fetchedAt < TTL) return cached

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day,relative_humidity_2m,wind_speed_10m')
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '4')

  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo obtener el clima')
  const data = (await res.json()) as {
    current: { temperature_2m: number; weather_code: number; is_day: number; relative_humidity_2m: number; wind_speed_10m: number }
    daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] }
  }
  const weather: Weather = {
    temperature: data.current.temperature_2m,
    code: data.current.weather_code,
    isDay: data.current.is_day === 1,
    humidity: data.current.relative_humidity_2m,
    wind: data.current.wind_speed_10m,
    days: data.daily.time.map((date, i) => ({
      date,
      code: data.daily.weather_code[i],
      min: data.daily.temperature_2m_min[i],
      max: data.daily.temperature_2m_max[i],
    })),
    fetchedAt: Date.now(),
  }
  cache.set(key, weather)
  return weather
}

export async function geocode(name: string): Promise<Place | null> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', name)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'es')
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as { results?: Array<{ name: string; latitude: number; longitude: number; admin1?: string; country?: string }> }
  const r = data.results?.[0]
  if (!r) return null
  const region = r.admin1 && r.admin1 !== r.name ? `, ${r.admin1}` : r.country ? `, ${r.country}` : ''
  return { name: `${r.name}${region}`, lat: r.latitude, lon: r.longitude }
}

/** Coordinates → readable place name. Free, no key, CORS-enabled. Falls back to coordinates. */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error()
    const d = (await res.json()) as { city?: string; locality?: string; principalSubdivision?: string; countryName?: string }
    const city = d.city || d.locality
    const region = d.principalSubdivision && d.principalSubdivision !== city ? d.principalSubdivision : d.countryName
    return [city, region].filter(Boolean).join(', ') || `${lat.toFixed(2)}, ${lon.toFixed(2)}`
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`
  }
}

export type GeoReason = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout'

/** Why the browser could not give a position, so screens can react (offer a city box, explain the permission). */
export class GeoError extends Error {
  readonly reason: GeoReason

  constructor(reason: GeoReason, message: string) {
    super(message)
    this.name = 'GeoError'
    this.reason = reason
  }
}

/** True when asking the browser for a position can work at all (API present, secure origin). */
export function geolocationPossible(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext
}

/** How long to wait for a permission prompt nobody answers before giving up on top of the browser's own timeout. */
const PROMPT_GRACE_MS = 20000

export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new GeoError('unsupported', 'Este navegador no tiene geolocalización.'))
    if (!window.isSecureContext) return reject(new GeoError('insecure', 'La ubicación solo funciona en https o en localhost.'))
    // The browser's own timeout only starts counting once permission is granted; this one also covers a prompt left unanswered.
    const deadline = window.setTimeout(() => reject(new GeoError('timeout', 'El navegador no respondió a tiempo.')), timeoutMs + PROMPT_GRACE_MS)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(deadline)
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      (err) => {
        window.clearTimeout(deadline)
        const reason: GeoReason = err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable'
        reject(new GeoError(reason, err.message))
      },
      { timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    )
  })
}

export interface ApproximatePlace extends Place {
  /** How it was found: the browser's own position, an address lookup, or the network the site runs on. */
  source: 'browser' | 'lookup' | 'edge'
}

const TIMEOUT_MS = 4000

const named = (parts: Array<string | undefined>): string => parts.filter((p) => p && p.trim()).join(', ')

/**
 * Places that can answer "where is this browser" from its address alone. Ordered by how well they did on
 * real connections: the specialised lookups know Mexican IPv6 ranges that the edge network places hundreds of
 * kilometres away, so the deployment's own answer is the last resort rather than the first.
 */
const LOOKUPS: Array<() => Promise<ApproximatePlace | null>> = [
  async () => {
    const res = await fetch('https://ipwho.is/?fields=success,city,region,country,latitude,longitude', { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const d = (await res.json()) as { success?: boolean; city?: string; region?: string; country?: string; latitude?: number; longitude?: number }
    if (!d.success || typeof d.latitude !== 'number' || typeof d.longitude !== 'number') return null
    const name = named([d.city, d.region, d.country])
    return name ? { name, lat: d.latitude, lon: d.longitude, source: 'lookup' } : null
  },
  async () => {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const d = (await res.json()) as { city?: string; region?: string; country_name?: string; latitude?: number; longitude?: number }
    if (typeof d.latitude !== 'number' || typeof d.longitude !== 'number') return null
    const name = named([d.city, d.region, d.country_name])
    return name ? { name, lat: d.latitude, lon: d.longitude, source: 'lookup' } : null
  },
  async () => {
    const res = await fetch('/api/geo', { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const d = (await res.json()) as { place?: string | null; lat?: number; lon?: number }
    if (!d.place || typeof d.lat !== 'number' || typeof d.lon !== 'number') return null
    return { name: d.place, lat: d.lat, lon: d.lon, source: 'edge' }
  },
]

/** True when the browser has already been given permission, so asking it costs no prompt. */
async function locationAlreadyAllowed(): Promise<boolean> {
  if (!geolocationPossible()) return false
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted'
  } catch {
    // Safari and friends: no way to ask beforehand, so treat it as not granted and fall back to the address.
    return false
  }
}

/**
 * Where this browser is, without asking anything. If the person already granted the permission, that is the
 * exact answer; otherwise the address gives a city. Null only when nothing knows, which is when it is fair to
 * ask them to type it.
 */
export async function approximateLocation(): Promise<ApproximatePlace | null> {
  if (await locationAlreadyAllowed()) {
    try {
      const pos = await currentPosition(6000)
      return { name: await reverseGeocode(pos.lat, pos.lon), lat: pos.lat, lon: pos.lon, source: 'browser' }
    } catch {
      // permission says yes but the device could not fix a position; the address still can
    }
  }
  for (const lookup of LOOKUPS) {
    try {
      const place = await lookup()
      if (place) return place
    } catch {
      // this one is down or blocked; try the next
    }
  }
  return null
}
