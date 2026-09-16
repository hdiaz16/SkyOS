import { motion } from 'motion/react'
import { RefreshCw } from 'lucide-react'
import type { Stale } from '../../system/auth'
import { Backdrop } from '../Backdrop'

/**
 * This tab has stopped because the session changed somewhere else — another account was opened, or this one
 * signed out. Nothing was lost: what was on screen belongs to the previous session and it is saved; reloading
 * continues with whoever is signed in now.
 *
 * What it says matters as much as what it does. Explaining the stop as "so as not to mix two people's
 * information" reads as an accident that nearly happened, and to whoever is alone at their computer it reads
 * as something worse. What happened is simply that the session changed.
 */
export function SessionEnded({ reason }: { reason: Stale }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <Backdrop />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
        className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center"
      >
        <div className="max-w-[420px]">
          <p className="text-[17px] text-ink">{reason === 'switched' ? 'Entraste con otra cuenta en otra pestaña' : 'Cerraste sesión en otra pestaña'}</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            Aquí seguía abierta la sesión anterior. Todo lo que hiciste quedó guardado: recarga y sigues donde estabas, con la cuenta que tienes abierta ahora.
          </p>
        </div>
        <button
          type="button"
          autoFocus
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-white shadow-soft transition hover:brightness-110"
        >
          <RefreshCw className="h-4 w-4" />
          Continuar aquí
        </button>
      </motion.div>
    </div>
  )
}
