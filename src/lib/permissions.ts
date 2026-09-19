import { GeoError } from './weather'

/**
 * What a browser answers when asked for a permission, said for a person. The browser distinguishes «no» from
 * «not now» and from «could not», and so should the card that asks: only a real «no» is settled and has to be
 * undone from the address bar; everything else can be tried again. Before, all of it read as «bloqueado».
 */
export type PermissionOutcome = { status: 'granted' } | { status: 'denied' } | { status: 'dismissed' } | { status: 'failed'; note: string }

export const DENIED_NOTE = 'El navegador lo tiene bloqueado; se cambia desde el candado de la barra de direcciones.'
export const DISMISSED_NOTE = 'Cerraste la pregunta sin responder; cuando quieras, vuelve a intentarlo.'

/**
 * Asks for notifications whichever way this browser answers: modern ones return a promise, older Safari only
 * calls back, and a browser that refuses to ask at all throws. Nothing here is left hanging — an ask that never
 * answered used to leave the row spinning forever. Undefined means the browser could not even ask.
 */
export async function requestNotifications(): Promise<NotificationPermission | undefined> {
  try {
    return await new Promise<NotificationPermission>((resolve, reject) => {
      const maybe = Notification.requestPermission((v) => resolve(v)) as Promise<NotificationPermission> | undefined
      if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject)
    })
  } catch {
    return undefined
  }
}

/** granted, denied, or default — default is the prompt closed with no answer, which is not a refusal. */
export function notificationOutcome(verdict: NotificationPermission | undefined): PermissionOutcome {
  if (verdict === 'granted') return { status: 'granted' }
  if (verdict === 'denied') return { status: 'denied' }
  if (verdict === 'default') return { status: 'dismissed' }
  return { status: 'failed', note: 'El navegador no pudo preguntar ahora.' }
}

/** getUserMedia fails for more reasons than a refusal, and each one means something different to the person. */
export function microphoneOutcome(err: unknown): PermissionOutcome {
  const name = err instanceof Error ? err.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return { status: 'denied' }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return { status: 'failed', note: 'No encuentro un micrófono en este equipo.' }
  if (name === 'NotReadableError' || name === 'TrackStartError') return { status: 'failed', note: 'Otro programa tiene el micrófono ocupado; ciérralo y vuelve a intentarlo.' }
  if (name === 'AbortError') return { status: 'dismissed' }
  return { status: 'failed', note: 'El navegador no pudo abrir el micrófono ahora.' }
}

/** A position that did not arrive is not a refusal: only the browser saying no is. */
export function locationOutcome(err: unknown): PermissionOutcome {
  const reason = err instanceof GeoError ? err.reason : ''
  if (reason === 'denied') return { status: 'denied' }
  if (reason === 'timeout') return { status: 'failed', note: 'Tu posición tardó demasiado en llegar; vuelve a intentarlo.' }
  if (reason === 'unavailable') return { status: 'failed', note: 'El equipo no pudo calcular tu posición ahora.' }
  return { status: 'failed', note: 'No pude ubicarte ahora; vuelve a intentarlo.' }
}
