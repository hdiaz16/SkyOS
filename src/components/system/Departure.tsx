import { AnimatePresence, motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { useMcp } from '../../mcp/manager'

/**
 * Shown for a moment before the tab leaves for a provider's authorization page. The providers do not let
 * their sign-in live inside another site, so Sky says where it is taking the person and promises the way back.
 */
export function Departure() {
  const leaving = useMcp((s) => s.leaving)
  return (
    <AnimatePresence>
      {leaving && (
        <motion.div
          key="leaving"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-surface/80 backdrop-blur-xl"
        >
          <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.4 }} className="flex flex-col items-center gap-3 px-6 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <p className="font-display text-[24px] font-bold tracking-tight text-ink">Te llevo a {leaving}</p>
            <p className="max-w-[380px] text-[14px] leading-relaxed text-ink-2">Autoriza a Sky en su página. En cuanto termines vuelves aquí, con la app conectada.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
