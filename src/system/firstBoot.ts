import { seedIfEmpty } from '../kernel/seed'
import { widgets } from '../kernel/widgets'
import { useSession } from '../ai/session'
import { speak } from '../ai/speech'
import { useAuth } from './auth'
import { users } from './users'
import type { UserRow } from './db'

let done: Promise<void> | null = null

/**
 * What Sky says the first time the desktop appears. Nothing was asked beyond a name, so this is where Sky
 * explains itself: who it is, what it already did, and one concrete thing to try right now. Short on purpose,
 * because the point is that the person tries something, not that they read.
 */
export function greetingFor(user: UserRow): string {
  const first = user.name.trim().split(' ')[0]
  const place = user.profile.location ? ` Te puse el clima de ${user.profile.location.place.split(',')[0]} arriba a la derecha.` : ''
  return `Hola, ${first}. Soy Sky.${place} Vivo en la barra de abajo y hago cosas de verdad con tus archivos: arrastra aquí un PDF o un Word y dime "resúmelo", o pídeme "crea una nota con mis pendientes". Todo lo local se puede deshacer, así que prueba sin miedo.`
}

/**
 * Runs once per fresh account, inside the user's own stores: welcome content, the widgets that make the
 * desktop useful from the first second, and Sky introducing itself.
 */
export function firstBoot(): Promise<void> {
  done ??= (async () => {
    await seedIfEmpty()
    const user = useAuth.getState().current
    if (!user?.setupPending) return
    const existing = await widgets.list()
    if (existing.length === 0) {
      // No place of its own: the weather follows the profile, so a later "vivo en…" updates it too.
      await widgets.create('weather')
      await widgets.create('recent')
    } else {
      // An adopted legacy desktop may carry the old demo widgets; currency only appears when someone adds it.
      for (const w of existing) if (w.type === 'currency') await widgets.remove(w.id)
    }
    await users.markSetupDone(user.id)
    await useAuth.getState().refreshCurrent()

    // Let the desktop finish fading in before Sky speaks.
    const text = greetingFor(user)
    window.setTimeout(() => {
      useSession.getState().say(text)
      if (user.profile.voice !== false) void speak(text)
    }, 1600)
  })()
  return done
}
