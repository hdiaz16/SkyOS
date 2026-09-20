import { GeoError, currentPosition, geolocationPossible, reverseGeocode } from './weather'
import type { UserLocation } from '../system/db'

/**
 * The three things Sky may use on this device, and what the browser answers when asked for them, said for a
 * person. The browser owns the real grants: it distinguishes «no» from «not now» and from «could not», and so
 * should the switch that asks. Only a real «no» is settled and has to be undone from the address bar;
 * everything else can be tried again. Before, all of it read as «bloqueado».
 */

export type PermissionKey = 'microphone' | 'location' | 'notifications'
export const PERMISSION_KEYS: PermissionKey[] = ['microphone', 'location', 'notifications']

export type PermissionOutcome = { status: 'granted' } | { status: 'denied' } | { status: 'dismissed' } | { status: 'failed'; note: string }

/** A granted position brings the place along; the other answers bring nothing. */
export type LocationOutcome = PermissionOutcome & { location?: UserLocation }

export const DENIED_NOTE = 'El navegador lo tiene bloqueado; se cambia desde el candado de la barra de direcciones.'
export const DISMISSED_NOTE = 'Cerraste la pregunta sin responder; cuando quieras, vuelve a intentarlo.'
/** Off on Sky's side while the browser would still allow it: a page cannot take a grant back. */
export const KEPT_BY_BROWSER_NOTE = 'El navegador lo sigue permitiendo; Sky no lo usará.'
/** The browser never showed its question: Chrome quiets prompts on sites where they were dismissed before. */
export const ASK_TIMEOUT_NOTE = 'El navegador no mostró la pregunta. Si tiene silenciadas las preguntas de este sitio, pulsa el icono junto a la dirección y permítelo desde ahí.'
export const ASK_TIMEOUT_MS = 25_000

/** Whether each permission can be asked for at all in this browser. */
export function permissionPossible(key: PermissionKey): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  if (key === 'microphone') return !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
  if (key === 'location') return geolocationPossible()
  return typeof Notification !== 'undefined'
}

export type BrowserDecision = 'granted' | 'denied' | 'prompt'

/**
 * What the browser already decided, where it can say so beforehand. Something it blocked is shown blocked from
 * the start — pressing the switch would do nothing visible — and something granted needs no asking. Where the
 * browser cannot say (Firefox and the microphone), the ask itself finds out.
 */
export async function browserDecision(key: PermissionKey): Promise<BrowserDecision> {
  try {
    if (key === 'notifications') {
      const p = Notification.permission
      return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt'
    }
    const state = await navigator.permissions.query({ name: key === 'microphone' ? 'microphone' : 'geolocation' })
    return state.state === 'granted' ? 'granted' : state.state === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'prompt'
  }
}

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

/** The note a switch shows under itself for an answer that was not a plain yes. */
export function outcomeNote(outcome: PermissionOutcome): string | undefined {
  if (outcome.status === 'denied') return DENIED_NOTE
  if (outcome.status === 'dismissed') return DISMISSED_NOTE
  if (outcome.status === 'failed') return outcome.note
  return undefined
}

/* ---------- the asks themselves ---------- */

/** Asks the browser for the microphone, then lets it go: only the permission is wanted, nothing keeps listening. */
export async function askMicrophone(): Promise<PermissionOutcome> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
    return { status: 'granted' }
  } catch (err) {
    return microphoneOutcome(err)
  }
}

/** Asks for the position. The name of the place is a nicety: without network for it, the position is still the permission. */
export async function askLocation(): Promise<LocationOutcome> {
  try {
    const pos = await currentPosition()
    const place = await reverseGeocode(pos.lat, pos.lon).catch(() => '')
    return { status: 'granted', location: { lat: pos.lat, lon: pos.lon, place: place || `${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}` } }
  } catch (err) {
    return locationOutcome(err)
  }
}

export async function askNotifications(): Promise<PermissionOutcome> {
  return notificationOutcome(await requestNotifications())
}

/** One door for the three, so the switches do not have to know which is which. */
export function askPermission(key: PermissionKey): Promise<LocationOutcome> {
  if (key === 'microphone') return askMicrophone()
  if (key === 'location') return askLocation()
  return askNotifications()
}
