import { registerCommand } from '../commands'
import { useAuth } from '../../system/auth'
import { users } from '../../system/users'
import { geocode } from '../../lib/weather'
import type { UserLocation } from '../../system/db'

/** The person's own details that Sky may update on request. */

async function saveLocation(location: UserLocation | undefined): Promise<void> {
  const user = useAuth.getState().current
  if (!user) throw new Error('No hay nadie con sesión iniciada.')
  await users.updateProfile(user.id, { location })
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
    'Guarda la ciudad o lugar donde vive o está la persona (sirve para el clima, la hora y las referencias locales). Los widgets de clima sin lugar propio la siguen; los que tienen un lugar elegido a mano se quedan con el suyo. Úsalo cuando diga dónde está o pida cambiar su ubicación.',
  params: { place: { type: 'string', description: 'Ciudad o lugar, p. ej. "Monterrey" o "Ciudad de México".', required: true } },
  async run({ place }) {
    const user = useAuth.getState().current
    if (!user) throw new Error('No hay nadie con sesión iniciada.')
    const found = await geocode(place.trim())
    if (!found) throw new Error(`No encontré «${place}». Prueba con la ciudad y el país.`)
    const previous = user.profile.location
    await saveLocation({ lat: found.lat, lon: found.lon, place: found.name })
    // A weather widget pinned to a place by hand keeps it. Clearing them all meant that saying «me mudé a
    // Monterrey» quietly turned the Madrid widget into another Monterrey one, and undoing the move did not
    // bring it back — the inverse only restores the profile.
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
