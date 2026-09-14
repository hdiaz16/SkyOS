import { seedIfEmpty } from '../kernel/seed'
import { widgets } from '../kernel/widgets'
import { useSession } from '../ai/session'
import { speak } from '../ai/speech'
import { useAuth } from './auth'
import { users } from './users'
import type { UserProfile, UserRow } from './db'

let done: Promise<void> | null = null

const PURPOSE_LINE: Record<UserProfile['purpose'], string> = {
  work: 'me quieres sobre todo para tu trabajo',
  study: 'me quieres sobre todo para estudiar',
  personal: 'me quieres para tus proyectos personales',
  mixed: 'me quieres para un poco de todo',
}

const AUTONOMY_LINE: Record<UserProfile['autonomy'], string> = {
  ask: 'te preguntaré antes de mover tus cosas',
  act: 'actuaré y te avisaré qué hice; todo se puede deshacer',
  manual: 'solo haré lo que me pidas',
}

/** What Sky says the first time the desktop appears: it knows who it is talking to. */
export function greetingFor(user: UserRow): string {
  const first = user.name.trim().split(' ')[0]
  const p = user.profile
  const place = p.location ? ` Veo que estás en ${p.location.place.split(',')[0]}; ya te puse el clima en el escritorio.` : ''
  return `Hola, ${first}. Mi nombre es Sky. Sé que ${PURPOSE_LINE[p.purpose]} y que ${AUTONOMY_LINE[p.autonomy]}.${place} Estoy aquí abajo, en la barra: pídeme lo que necesites, con texto o con tu voz.`
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
