import { seedIfEmpty } from '../kernel/seed'
import { widgets } from '../kernel/widgets'
import { useAuth } from './auth'
import { users } from './users'

let done: Promise<void> | null = null

/**
 * Runs once per fresh account, inside the user's own stores: welcome content plus the widgets that
 * make the desktop useful from the first second (weather for their place, recent files).
 */
export function firstBoot(): Promise<void> {
  done ??= (async () => {
    await seedIfEmpty()
    const user = useAuth.getState().current
    if (!user?.setupPending) return
    if ((await widgets.list()).length === 0) {
      const loc = user.profile.location
      await widgets.create('weather', loc ? { config: { place: loc.place, lat: loc.lat, lon: loc.lon } } : {})
      await widgets.create('recent')
    }
    await users.markSetupDone(user.id)
    await useAuth.getState().refreshCurrent()
  })()
  return done
}
