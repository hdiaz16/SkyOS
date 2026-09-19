import { useEffect, useState, type ComponentType } from 'react'
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Droplets, MapPin, Moon, Sun, Wind } from 'lucide-react'
import { widgets, type Widget } from '../../kernel/widgets'
import { useDialog } from '../../state/dialog'
import { useAuth } from '../../system/auth'
import { users } from '../../system/users'
import { approximateLocation, currentPosition, describeCode, fetchWeather, geocode, reverseGeocode, type Weather, type WeatherKind } from '../../lib/weather'
import { rememberSun } from '../../lib/daylight'
import { cn } from '../../lib/utils'

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>

const ICONS: Record<WeatherKind, { day: IconType; night: IconType }> = {
  clear: { day: Sun, night: Moon },
  partly: { day: CloudSun, night: CloudMoon },
  cloudy: { day: Cloud, night: Cloud },
  fog: { day: CloudFog, night: CloudFog },
  drizzle: { day: CloudDrizzle, night: CloudDrizzle },
  rain: { day: CloudRain, night: CloudRain },
  snow: { day: CloudSnow, night: CloudSnow },
  storm: { day: CloudLightning, night: CloudLightning },
}

function WeatherIcon({ kind, isDay, className, strokeWidth }: { kind: WeatherKind; isDay: boolean; className?: string; strokeWidth?: number }) {
  const Icon = ICONS[kind][isDay ? 'day' : 'night']
  return <Icon className={className} strokeWidth={strokeWidth} />
}

type State = { status: 'loading' } | { status: 'ok'; weather: Weather; label: string } | { status: 'needs-place'; reason: string } | { status: 'error'; message: string }

const dayName = (iso: string, i: number) => (i === 0 ? 'Hoy' : new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', ''))

export function WeatherWidget({ widget }: { widget: Widget }) {
  // The person's own place, captured at onboarding, is the default when the widget has none of its own.
  const home = useAuth((s) => s.current?.profile.location)
  const own = typeof widget.config.place === 'string' && widget.config.place.length > 0
  const place = own ? (widget.config.place as string) : home?.place ?? ''
  const lat = typeof widget.config.lat === 'number' ? widget.config.lat : own ? undefined : home?.lat
  const lon = typeof widget.config.lon === 'number' ? widget.config.lon : own ? undefined : home?.lon
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        let coords = lat !== undefined && lon !== undefined ? { lat, lon } : null
        let label = place
        if (!coords && place) {
          const found = await geocode(place)
          if (!found) throw new Error(`No encontré "${place}"`)
          coords = { lat: found.lat, lon: found.lon }
          label = found.name
          void widgets.setConfig(widget.id, { lat: found.lat, lon: found.lon, place: found.name })
        }
        if (!coords) {
          try {
            coords = await currentPosition()
            const name = await reverseGeocode(coords.lat, coords.lon)
            label = label || name
            // The browser knows where the person is; keep it in the profile so Sky and the other widgets know too.
            const user = useAuth.getState().current
            if (user && !user.profile.location) {
              await users.updateProfile(user.id, { location: { lat: coords.lat, lon: coords.lon, place: name } }, user.profile)
              await useAuth.getState().refreshCurrent()
            }
          } catch {
            // No permission, no GPS: the network address still places the person well enough for weather.
            const near = await approximateLocation()
            if (!near) {
              if (alive) setState({ status: 'needs-place', reason: 'No pude averiguar dónde estás' })
              return
            }
            coords = { lat: near.lat, lon: near.lon }
            label = label || near.name
          }
        }
        const weather = await fetchWeather(coords.lat, coords.lon)
        // The backdrop follows the real sun where the person is; this is where the desk learns it.
        rememberSun(weather.sunrise, weather.sunset)
        if (alive) setState({ status: 'ok', weather, label: label || 'Tu ubicación' })
      } catch (err) {
        // Without network the browser rejects with its own TypeError, and «Failed to fetch» ended up printed
        // in the middle of a widget that speaks Spanish. The currency widget already knew this.
        if (alive) {
          setState({
            status: 'error',
            message: err instanceof TypeError ? 'Sin conexión para consultar el clima' : err instanceof Error ? err.message : 'Error al cargar el clima',
          })
        }
      }
    }
    void load()
    const id = window.setInterval(load, 15 * 60 * 1000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [widget.id, place, lat, lon])

  const choosePlace = async () => {
    const answer = await useDialog.getState().ask({
      title: '¿De qué lugar quieres el clima?',
      placeholder: 'Monterrey, Ciudad de México, Madrid…',
      confirmLabel: 'Buscar',
      initialValue: place,
    })
    if (!answer) return
    setState({ status: 'loading' })
    await widgets.setConfig(widget.id, { place: answer, lat: undefined, lon: undefined })
  }

  if (state.status === 'loading') return <p className="flex h-full items-center justify-center text-[12px] text-ink-3">Consultando el cielo…</p>

  if (state.status === 'needs-place' || state.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-[12px] text-ink-2">{state.status === 'error' ? state.message : state.reason}</p>
        <button
          type="button"
          onClick={() => void choosePlace()}
          className="flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[12px] font-medium text-accent transition hover:brightness-95"
        >
          <MapPin className="h-3.5 w-3.5" />
          Elegir lugar
        </button>
      </div>
    )
  }

  const { weather, label } = state
  const today = describeCode(weather.code)

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => void choosePlace()}
            title="Cambiar lugar"
            className="flex max-w-full items-center gap-1 truncate text-[12px] text-ink-2 transition hover:text-ink"
          >
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-[34px] font-medium leading-none tabular-nums text-ink">{Math.round(weather.temperature)}°</span>
            <span className="text-[12px] text-ink-2">{today.text}</span>
          </div>
        </div>
        <WeatherIcon kind={today.kind} isDay={weather.isDay} className="h-10 w-10 shrink-0 text-accent" strokeWidth={1.4} />
      </div>

      <div className="flex items-center gap-3 text-[11px] text-ink-3">
        <span className="flex items-center gap-1">
          <Droplets className="h-3 w-3" /> {Math.round(weather.humidity)}%
        </span>
        <span className="flex items-center gap-1">
          <Wind className="h-3 w-3" /> {Math.round(weather.wind)} km/h
        </span>
      </div>

      <ul className="mt-1 grid grid-cols-4 gap-1 border-t border-line pt-2">
        {weather.days.slice(0, 4).map((d, i) => {
          const desc = describeCode(d.code)
          return (
            <li key={d.date} className={cn('flex flex-col items-center gap-0.5 rounded-lg py-1', i === 0 && 'bg-surface-2')}>
              <span className="text-[10px] capitalize text-ink-3">{dayName(d.date, i)}</span>
              <WeatherIcon kind={desc.kind} isDay className="h-4 w-4 text-ink-2" strokeWidth={1.6} />
              <span className="text-[11px] tabular-nums text-ink">
                {Math.round(d.max)}° <span className="text-ink-3">{Math.round(d.min)}°</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
