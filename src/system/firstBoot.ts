import { widgets } from '../kernel/widgets'
import { useSession } from '../ai/session'
import { speak } from '../ai/speech'
import { useAuth } from './auth'
import { users } from './users'
import type { UserRow } from './db'

let done: Promise<void> | null = null

/** A greeting that waited longer than this is not a greeting any more; it is an interruption. */
const STILL_A_WELCOME_MS = 90_000

/**
 * Sky says hello out loud. A browser refuses to speak on a page nobody has touched yet, and the desktop
 * arrives right after a reload, so the very first attempt is usually silenced — which is why the welcome
 * seemed to have lost its voice. When that happens it waits for the first click and speaks then, once, and
 * only while it still counts as a welcome. The "Escuchar" button under the message is always there anyway.
 */
async function greet(text: string): Promise<void> {
  if (await speak(text)) return
  const since = Date.now()
  const onTouch = () => {
    if (Date.now() - since < STILL_A_WELCOME_MS) void speak(text)
  }
  window.addEventListener('pointerdown', onTouch, { once: true, capture: true })
}

/**
 * What Sky says the first time the desktop appears — the only thing on an empty desktop, and the first thing
 * it says out loud. So it has to work read and heard: short sentences, present tense, and one open door.
 *
 * Not a product explaining itself and not a friend being breezy: someone who has just arrived, is paying
 * attention, and admits they do not know you yet. Curiosity is warmer than enthusiasm, and it invites an
 * answer instead of an acknowledgement.
 */
export function greetingFor(user: UserRow): string {
  const first = user.name.trim().split(' ')[0]
  const place = user.profile.location ? ` Vi que estás en ${user.profile.location.place.split(',')[0]}; te dejé el clima ahí arriba.` : ''
  return `Hola, ${first}. Soy Sky. Ya estoy aquí.${place} Todavía no sé nada de ti. Cuéntame en qué andas, o déjame un archivo por aquí y lo miramos juntos.`
}

/**
 * Runs once per fresh account, inside the user's own stores: welcome content, the widgets that make the
 * desktop useful from the first second, and Sky introducing itself.
 */
export function firstBoot(): Promise<void> {
  done ??= (async () => {
    const user = useAuth.getState().current
    if (!user?.setupPending) return
    const existing = await widgets.list()
    if (existing.length === 0) {
      // The only thing on a new desktop. No place of its own: the weather follows the profile, so a later
      // "vivo en…" updates it too. Recientes tiene poco que mostrar cuando todavía no hay nada.
      await widgets.create('weather')
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
      if (user.profile.voice !== false) void greet(text)
    }, 1600)
  })()
  return done
}
