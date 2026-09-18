import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BellRing, Check, Loader2, MapPin, Mic } from 'lucide-react'
import { useAuth } from '../../system/auth'
import { users } from '../../system/users'
import { currentPosition, geolocationPossible, reverseGeocode } from '../../lib/weather'
import type { UserLocation } from '../../system/db'
import { cn } from '../../lib/utils'

/**
 * The one moment the desktop asks for its three permissions: shortly after entering, each with what it is
 * for and nothing else. The microphone can wait for the first dictate and the address of the network already
 * gives a city, but the offer puts the three in one place instead of three prompts scattered across features.
 * Whatever is not granted here is not asked again — the features still ask the browser the first time they
 * are used — and what the browser owns is changed in the browser, not here.
 */

type RowKey = 'mic' | 'location' | 'notifications'
type RowStatus = 'idle' | 'asking' | 'granted' | 'denied'

/** Long enough for the desktop to settle and the greeting to finish; short enough to still feel like part of arriving. */
const OFFER_DELAY_MS = 5000

const DENIED_NOTE = 'El navegador lo tiene bloqueado; se cambia desde el candado de la barra de direcciones.'

/** Whether each permission can be asked for at all in this browser. */
const possible: Record<RowKey, boolean> = {
  mic: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext,
  location: geolocationPossible(),
  notifications: typeof Notification !== 'undefined',
}

/** Some browsers can tell beforehand; where they cannot, the row starts idle and the ask itself finds out. */
async function alreadyGranted(key: RowKey): Promise<boolean> {
  try {
    if (key === 'notifications') return Notification.permission === 'granted'
    const state = await navigator.permissions.query({ name: key === 'mic' ? 'microphone' : 'geolocation' })
    return state.state === 'granted'
  } catch {
    return false
  }
}

export function Permissions() {
  const user = useAuth((s) => s.current)
  const offered = !!user?.profile.permissionsOffered
  const [visible, setVisible] = useState(false)
  const [rows, setRows] = useState<Record<RowKey, RowStatus>>({ mic: 'idle', location: 'idle', notifications: 'idle' })

  const set = (key: RowKey, status: RowStatus) => setRows((r) => ({ ...r, [key]: status }))

  // Nothing to ask about — unsupported here, or already given to the browser — means the offer never shows.
  useEffect(() => {
    if (offered || !user) return
    let alive = true
    void (async () => {
      const granted = await Promise.all((Object.keys(possible) as RowKey[]).filter((k) => possible[k]).map((k) => alreadyGranted(k).then((g) => [k, g] as const)))
      if (!alive) return
      const next = { ...rows }
      for (const [k, g] of granted) next[k] = g ? 'granted' : 'idle'
      setRows(next)
      if (granted.every(([, g]) => g)) void close(next)
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

  const close = async (final: Record<RowKey, RowStatus> = rows) => {
    setVisible(false)
    const current = useAuth.getState().current
    if (!current) return
    // The microphone answer belongs to the profile too; the other two live only in the browser.
    const mic: Partial<typeof current.profile> = final.mic === 'granted' ? { microphone: 'granted' } : final.mic === 'denied' ? { microphone: 'denied' } : {}
    await users.updateProfile(current.id, { permissionsOffered: true, ...mic }, current.profile)
    await useAuth.getState().refreshCurrent()
  }

  const askMic = async () => {
    set('mic', 'asking')
    try {
      // Only the permission: the microphone is opened and released, so nothing keeps listening.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) track.stop()
      set('mic', 'granted')
    } catch {
      set('mic', 'denied')
    }
  }

  const askLocation = async () => {
    set('location', 'asking')
    try {
      const pos = await currentPosition()
      const place = await reverseGeocode(pos.lat, pos.lon)
      const location: UserLocation = { lat: pos.lat, lon: pos.lon, place: place || `${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}` }
      const current = useAuth.getState().current
      if (current) {
        await users.updateProfile(current.id, { location }, current.profile)
        await useAuth.getState().refreshCurrent()
      }
      set('location', 'granted')
    } catch {
      set('location', 'denied')
    }
  }

  const askNotifications = async () => {
    set('notifications', 'asking')
    const verdict = await Notification.requestPermission()
    set('notifications', verdict === 'granted' ? 'granted' : 'denied')
  }

  const askers: Record<RowKey, () => Promise<void>> = { mic: askMic, location: askLocation, notifications: askNotifications }

  const ROWS: Array<{ key: RowKey; icon: typeof Mic; title: string; why: string }> = [
    { key: 'mic', icon: Mic, title: 'Micrófono', why: 'Hablarme en lugar de escribir.' },
    { key: 'location', icon: MapPin, title: 'Ubicación exacta', why: 'El clima y la hora de donde estás, no los de tu red.' },
    { key: 'notifications', icon: BellRing, title: 'Notificaciones', why: 'Decirte que un trabajo terminó mientras miras otra pestaña.' },
  ]
  const offerable = ROWS.filter((r) => possible[r.key] && rows[r.key] !== 'granted')

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
            <p className="text-[13.5px] font-medium text-ink">Tres permisos, cuando quieras usarlos</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">Ninguno hace falta para empezar. Los guarda tu navegador, no Sky.</p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {offerable.map(({ key, icon: Icon, title, why }) => (
              <li key={key} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">{title}</p>
                  <p className="text-[12px] leading-relaxed text-ink-3">{why}</p>
                  {rows[key] === 'denied' && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{DENIED_NOTE}</p>}
                </div>
                {rows[key] === 'granted' ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                ) : rows[key] === 'asking' ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-ink-3" />
                ) : (
                  <button
                    type="button"
                    onClick={() => void askers[key]()}
                    className={cn('shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium transition', 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
                  >
                    Permitir
                  </button>
                )}
              </li>
            ))}
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
