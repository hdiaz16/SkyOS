import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BellRing, Check, Loader2, MapPin, Mic } from 'lucide-react'
import { useAuth } from '../../system/auth'
import { users } from '../../system/users'
import { currentPosition, geolocationPossible, reverseGeocode } from '../../lib/weather'
import { DENIED_NOTE, DISMISSED_NOTE, locationOutcome, microphoneOutcome, notificationOutcome, requestNotifications, type PermissionOutcome } from '../../lib/permissions'
import type { UserLocation } from '../../system/db'
import { cn } from '../../lib/utils'

/**
 * The one moment the desktop asks for its three permissions: shortly after entering, each with what it is
 * for and nothing else. The microphone can wait for the first dictate and the address of the network already
 * gives a city, but the offer puts the three in one place instead of three prompts scattered across features.
 * Whatever is not granted here is not asked again — the features still ask the browser the first time they
 * are used — and what the browser owns is changed in the browser, not here.
 *
 * The browser answers more than yes or no: a prompt closed without an answer, a microphone that is not there, a
 * position that did not arrive in time. Only a real «no» is settled; the rest can be tried again, and each row
 * says which is which instead of calling everything «bloqueado» — and an ask that never answered no longer
 * leaves the row spinning.
 */

type RowKey = 'mic' | 'location' | 'notifications'
type RowStatus = 'idle' | 'asking' | PermissionOutcome['status']

interface Row {
  status: RowStatus
  /** What to tell under the row when it is neither granted nor waiting. */
  note?: string
}

const KEYS: RowKey[] = ['mic', 'location', 'notifications']

/** Long enough for the desktop to settle and the greeting to finish; short enough to still feel like part of arriving. */
const OFFER_DELAY_MS = 5000

/** Whether each permission can be asked for at all in this browser. */
const possible: Record<RowKey, boolean> = {
  mic: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext,
  location: geolocationPossible(),
  notifications: typeof Notification !== 'undefined',
}

const settled = (outcome: PermissionOutcome): Row => ({
  status: outcome.status,
  note: outcome.status === 'denied' ? DENIED_NOTE : outcome.status === 'dismissed' ? DISMISSED_NOTE : outcome.status === 'failed' ? outcome.note : undefined,
})

/**
 * What the browser already decided, where it can say so beforehand. Something it has blocked is shown as
 * blocked from the start — pressing Permitir on it would do nothing visible — and something granted is not
 * offered. Where the browser cannot say (Firefox and the microphone), the ask itself finds out.
 */
async function knownStatus(key: RowKey): Promise<Row> {
  try {
    if (key === 'notifications') {
      const p = Notification.permission
      return p === 'granted' ? { status: 'granted' } : p === 'denied' ? settled({ status: 'denied' }) : { status: 'idle' }
    }
    const state = await navigator.permissions.query({ name: key === 'mic' ? 'microphone' : 'geolocation' })
    return state.state === 'granted' ? { status: 'granted' } : state.state === 'denied' ? settled({ status: 'denied' }) : { status: 'idle' }
  } catch {
    return { status: 'idle' }
  }
}

const IDLE: Record<RowKey, Row> = { mic: { status: 'idle' }, location: { status: 'idle' }, notifications: { status: 'idle' } }

const TITLE: Record<number, string> = {
  1: 'Un permiso, cuando quieras usarlo',
  2: 'Dos permisos, cuando quieras usarlos',
  3: 'Tres permisos, cuando quieras usarlos',
}

export function Permissions() {
  const user = useAuth((s) => s.current)
  const offered = !!user?.profile.permissionsOffered
  const [visible, setVisible] = useState(false)
  const [rows, setRows] = useState<Record<RowKey, Row>>(IDLE)
  /** Whether the person pressed anything: only then does a card with nothing left to offer close itself. */
  const [touched, setTouched] = useState(false)

  const set = (key: RowKey, row: Row) => setRows((r) => ({ ...r, [key]: row }))

  // Nothing to ask about — unsupported here, or already given to the browser — means the offer never shows.
  useEffect(() => {
    if (offered || !user) return
    let alive = true
    void (async () => {
      const known = await Promise.all(KEYS.filter((k) => possible[k]).map((k) => knownStatus(k).then((row) => [k, row] as const)))
      if (!alive) return
      const next = { ...IDLE }
      for (const [k, row] of known) next[k] = row
      setRows(next)
      if (known.every(([, row]) => row.status === 'granted')) void close(next)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offered, user?.id])

  useEffect(() => {
    if (offered) return
    const t = window.setTimeout(() => setVisible(true), OFFER_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [offered])

  const close = async (final: Record<RowKey, Row> = rows) => {
    setVisible(false)
    const current = useAuth.getState().current
    if (!current) return
    // The microphone answer belongs to the profile too; the other two live only in the browser.
    const mic: Partial<typeof current.profile> = final.mic.status === 'granted' ? { microphone: 'granted' } : final.mic.status === 'denied' ? { microphone: 'denied' } : {}
    await users.updateProfile(current.id, { permissionsOffered: true, ...mic }, current.profile)
    await useAuth.getState().refreshCurrent()
  }

  // Everything granted after pressing Permitir: nothing is left to offer, so the card closes itself and saves
  // the answer. Before, it just vanished — the answer was never saved and the card came back at the next entry.
  useEffect(() => {
    if (!visible || !touched) return
    if (KEYS.filter((k) => possible[k]).every((k) => rows[k].status === 'granted')) void close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, visible, touched])

  const askMic = async () => {
    try {
      // Only the permission: the microphone is opened and released, so nothing keeps listening.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) track.stop()
      set('mic', { status: 'granted' })
    } catch (err) {
      set('mic', settled(microphoneOutcome(err)))
    }
  }

  const askLocation = async () => {
    try {
      const pos = await currentPosition()
      // The name of the place is a nicety: without network for it, the position is still the permission.
      const place = await reverseGeocode(pos.lat, pos.lon).catch(() => '')
      const location: UserLocation = { lat: pos.lat, lon: pos.lon, place: place || `${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}` }
      const current = useAuth.getState().current
      if (current) {
        await users.updateProfile(current.id, { location }, current.profile)
        await useAuth.getState().refreshCurrent()
      }
      set('location', { status: 'granted' })
    } catch (err) {
      set('location', settled(locationOutcome(err)))
    }
  }

  const askNotifications = async () => {
    set('notifications', settled(notificationOutcome(await requestNotifications())))
  }

  const askers: Record<RowKey, () => Promise<void>> = { mic: askMic, location: askLocation, notifications: askNotifications }

  const ask = (key: RowKey) => {
    setTouched(true)
    set(key, { status: 'asking' })
    void askers[key]()
  }

  const ROWS: Array<{ key: RowKey; icon: typeof Mic; title: string; why: string }> = [
    { key: 'mic', icon: Mic, title: 'Micrófono', why: 'Hablarme en lugar de escribir.' },
    { key: 'location', icon: MapPin, title: 'Ubicación exacta', why: 'El clima y la hora de donde estás, no los de tu red.' },
    { key: 'notifications', icon: BellRing, title: 'Notificaciones', why: 'Decirte que un trabajo terminó mientras miras otra pestaña.' },
  ]
  const offerable = ROWS.filter((r) => possible[r.key] && rows[r.key].status !== 'granted')

  return (
    <AnimatePresence>
      {visible && offerable.length > 0 && (
        <motion.div
          key="permissions"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          className="glass absolute bottom-24 left-5 z-[290000] flex w-[min(340px,calc(100vw-40px))] flex-col gap-3 rounded-2xl p-4 shadow-win"
        >
          <div>
            <p className="text-[13.5px] font-medium text-ink">{TITLE[offerable.length] ?? TITLE[3]}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">Ninguno hace falta para empezar. Los guarda tu navegador, no Sky.</p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {offerable.map(({ key, icon: Icon, title, why }) => {
              const row = rows[key]
              return (
                <li key={key} className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink">{title}</p>
                    <p className="text-[12px] leading-relaxed text-ink-3">{why}</p>
                    {row.note && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{row.note}</p>}
                  </div>
                  {row.status === 'granted' ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  ) : row.status === 'asking' ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-ink-3" />
                  ) : row.status === 'denied' ? null : (
                    <button
                      type="button"
                      onClick={() => ask(key)}
                      className={cn('shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium transition', 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
                    >
                      {row.status === 'idle' ? 'Permitir' : 'Reintentar'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void close()}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white shadow-soft transition hover:brightness-110"
            >
              Listo
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
