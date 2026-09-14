import { AnimatePresence, motion } from 'motion/react'
import { useUi } from '../state/ui'
import { snapGeometry } from '../state/windows'

/** While a window is dragged to an edge, the place it would take lights up softly. */
export function SnapPreview() {
  const target = useUi((s) => s.snapPreview)
  const g = target ? snapGeometry(target) : null
  return (
    <AnimatePresence>
      {g && (
        <motion.div
          key={target}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
          className="pointer-events-none absolute z-[99999] rounded-2xl border-2 border-accent/50 bg-accent-soft/60"
          aria-hidden
        />
      )}
    </AnimatePresence>
  )
}
