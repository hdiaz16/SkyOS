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
    const res = await fetch(url)
    if (!res.ok) throw new Error()
    const d = (await res.json()) as { city?: string; locality?: string; principalSubdivision?: string; countryName?: string }
    const city = d.city || d.locality
    const region = d.principalSubdivision && d.principalSubdivision !== city ? d.principalSubdivision : d.countryName
    return [city, region].filter(Boolean).join(', ') || `${lat.toFixed(2)}, ${lon.toFixed(2)}`
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`
  }
}

export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Sin geolocalización'))
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    )
  })
}
