import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../../system/auth'
import { users } from '../../system/users'
import { PERMISSION_KEYS, browserDecision, permissionPossible } from '../../lib/permissions'
import { PermissionSwitches } from './PermissionSwitches'

/**
 * The one moment the desktop offers its three permissions: shortly after entering, as switches, each with what
 * it is for and nothing else, and one more that moves the three. The microphone can wait for the first dictate
 * and the address of the network already gives a city, but the offer puts the three in one place instead of
 * three prompts scattered across features. Whatever is left off here is not asked again by this card — the same
 * switches live in Ajustes › Cuenta — and what the browser owns is changed in the browser, not here.
 */

/** Long enough for the desktop to settle and the greeting to finish; short enough to still feel like part of arriving. */
const OFFER_DELAY_MS = 5000

export function Permissions() {
  const user = useAuth((s) => s.current)
  const offered = !!user?.profile.permissionsOffered
  const [visible, setVisible] = useState(false)

  const close = async () => {
    setVisible(false)
    const current = useAuth.getState().current
    if (!current) return
    await users.updateProfile(current.id, { permissionsOffered: true })
    await useAuth.getState().refreshCurrent()
  }

  // Nothing to offer — unsupported here, or everything already on — means the card never shows.
  useEffect(() => {
    if (offered || !user) return
    let alive = true
    const t = window.setTimeout(() => {
      void (async () => {
        const keys = PERMISSION_KEYS.filter(permissionPossible)
        const decisions = await Promise.all(keys.map(browserDecision))
        if (!alive) return
        const prefs = useAuth.getState().current?.profile.permissions ?? {}
        const pending = keys.filter((k, i) => !(prefs[k] ?? decisions[i] === 'granted'))
        if (pending.length === 0) void close()
        else setVisible(true)
      })()
    }, OFFER_DELAY_MS)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offered, user?.id])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="permissions"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          className="glass absolute bottom-24 left-5 z-[290000] flex w-[min(360px,calc(100vw-40px))] flex-col gap-3 rounded-2xl p-4 shadow-win"
        >
          <div>
            <p className="text-[13.5px] font-medium text-ink">Tus permisos, como quieras</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">Enciende los que quieras usar, uno por uno o todos. Se cambian después en Ajustes › Cuenta; los guarda tu navegador, no Sky.</p>
          </div>
          <PermissionSwitches onAllOn={() => void close()} />
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
