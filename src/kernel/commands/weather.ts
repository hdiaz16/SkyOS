import { registerCommand } from '../commands'
import { useAuth } from '../../system/auth'
import { approximateLocation, describeCode, fetchWeather, geocode } from '../../lib/weather'

/**
 * El escritorio enseñaba el clima en un widget y Sky, al preguntarle qué tiempo haría mañana, contestaba que no
 * tenía datos: no había ninguna herramienta que lo consultara. La hay, y usa el mismo Open-Meteo que el widget,
 * así que lo que Sky dice y lo que se ve arriba a la derecha vienen del mismo sitio.
 */

/** Words that make this command relevant; without one of them in the request, its tool stays home. */
const WEATHER_WORDS = [
  'clima',
  'tiempo',
  'temperatura',
  'grados',
  'calor',
  'frio',
  'frío',
  'llueve',
  'llover',
  'lloverá',
  'llovera',
  'lluvia',
  'paraguas',
  'sol',
  'soleado',
  'nublado',
  'nieve',
  'viento',
  'humedad',
  'pronostico',
  'pronóstico',
  'abrigo',
  'salir a correr',
]

const WEEKDAY = new Intl.DateTimeFormat('es-MX', { weekday: 'long' })

/** El día en palabras, para que el modelo no tenga que restar fechas: «hoy», «mañana», «el jueves». */
export function dayLabel(date: string, today: Date = new Date()): string {
  const day = new Date(`${date}T00:00:00`)
  if (Number.isNaN(day.getTime())) return date
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((day.getTime() - from.getTime()) / 86_400_000)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  if (diff === 2) return 'pasado mañana'
  if (diff < 0) return date
  const name = WEEKDAY.format(day)
  return `el ${name}`
}

interface Forecast {
  place: string
  now: { temperature: number; sky: string; humidity: number; wind: number }
  days: Array<{ when: string; date: string; min: number; max: number; sky: string }>
}

/** Dónde mirar: lo que pidan, si no donde vive la persona, si no lo que diga la red. */
async function where(place?: string): Promise<{ name: string; lat: number; lon: number }> {
  const asked = place?.trim()
  if (asked) {
    const found = await geocode(asked)
    if (!found) throw new Error(`No encontré «${asked}». Prueba con la ciudad y el país.`)
    return { name: found.name, lat: found.lat, lon: found.lon }
  }
  const mine = useAuth.getState().current?.profile.location
  if (mine) return { name: mine.place ?? 'tu ubicación', lat: mine.lat, lon: mine.lon }
  const near = await approximateLocation()
  if (near) return { name: near.name, lat: near.lat, lon: near.lon }
  throw new Error('No sé dónde estás. Pregunta de qué ciudad quiere el clima, o guárdala con user.setLocation.')
}

registerCommand<{ place?: string; days?: number }, Forecast>({
  id: 'weather.forecast',
  keywords: WEATHER_WORDS,
  title: 'Consultar el clima',
  description:
    'El tiempo de ahora y el pronóstico de los próximos días, donde está la persona o en la ciudad que se indique. Temperaturas en °C, viento en km/h, humedad en %. Cada día viene con su nombre ya resuelto («hoy», «mañana», «el jueves»). Úsalo siempre que pregunten por el clima, la lluvia, la temperatura, el viento o si hace falta paraguas o abrigo: nunca lo contestes de memoria, porque el modelo no sabe qué día es hoy ni dónde está la persona.',
  params: {
    place: { type: 'string', description: 'Ciudad o lugar. Omítelo para el sitio donde está la persona.' },
    days: { type: 'number', description: 'Cuántos días de pronóstico devolver, de 1 a 7. Por defecto 4 (hoy y los tres siguientes).' },
  },
  async run({ place, days = 4 }) {
    const spot = await where(place)
    const weather = await fetchWeather(spot.lat, spot.lon)
    const wanted = Math.min(7, Math.max(1, Math.round(days)))
    const today = new Date()
    return {
      result: {
        place: spot.name,
        now: {
          temperature: Math.round(weather.temperature),
          sky: describeCode(weather.code).text,
          humidity: Math.round(weather.humidity),
          wind: Math.round(weather.wind),
        },
        days: weather.days.slice(0, wanted).map((d) => ({
          when: dayLabel(d.date, today),
          date: d.date,
          min: Math.round(d.min),
          max: Math.round(d.max),
          sky: describeCode(d.code).text,
        })),
      },
    }
  },
})
