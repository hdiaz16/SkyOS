import { registerCommand } from '../commands'
import { widgets } from '../widgets'
import { useAuth } from '../../system/auth'
import { users } from '../../system/users'
import { geocode } from '../../lib/weather'
import type { UserLocation } from '../../system/db'

/** The person's own details that Sky may update on request. */

async function saveLocation(location: UserLocation | undefined): Promise<void> {
  const user = useAuth.getState().current
  if (!user) throw new Error('No hay nadie con sesión iniciada.')
  await users.updateProfile(user.id, { location }, user.profile)
  await useAuth.getState().refreshCurrent()
}

/** Words that make these commands relevant; without one of them in the request, their tools stay home. */
const LOCATION_WORDS = ['ubicacion', 'ubicación', 'vivo en', 'estoy en', 'ciudad', 'lugar', 'clima', 'donde estoy', 'dónde estoy', 'me mude', 'me mudé', 'zona horaria']

registerCommand<{ place: string }, { place: string; lat: number; lon: number }>({
  id: 'user.setLocation',
  risk: 'write',
  keywords: LOCATION_WORDS,
  title: 'Cambiar ubicación',
  description:
    'Guarda la ciudad o lugar donde vive o está la persona (sirve para el clima, la hora y las referencias locales). Los widgets de clima sin lugar propio la siguen. Úsalo cuando diga dónde está o pida cambiar su ubicación.',
  params: { place: { type: 'string', description: 'Ciudad o lugar, p. ej. "Monterrey" o "Ciudad de México".', required: true } },
  async run({ place }) {
    const user = useAuth.getState().current
    if (!user) throw new Error('No hay nadie con sesión iniciada.')
    const found = await geocode(place.trim())
    if (!found) throw new Error(`No encontré «${place}». Prueba con la ciudad y el país.`)
    const previous = user.profile.location
    await saveLocation({ lat: found.lat, lon: found.lon, place: found.name })
    // Weather widgets pinned to a place of their own start following the profile again.
    for (const w of await widgets.list()) {
      if (w.type === 'weather' && w.config.place) await widgets.setConfig(w.id, { place: undefined, lat: undefined, lon: undefined })
    }
    return {
      result: { place: found.name, lat: found.lat, lon: found.lon },
      label: `Ubicación: ${found.name}`,
      undo: { commandId: 'user.restoreLocation', params: { location: previous ?? null } },
    }
  },
})

registerCommand<{ location: UserLocation | null }, void>({
  id: 'user.restoreLocation',
  risk: 'write',
  title: 'Devolver la ubicación',
  description: 'Vuelve a la ubicación anterior sin volver a buscarla.',
  // The written inverse of user.setLocation: the old place travels with the entry instead of being looked up again.
  ai: false,
  params: {},
  async run({ location }) {
    await saveLocation(location ?? undefined)
    return { result: undefined }
  },
})
