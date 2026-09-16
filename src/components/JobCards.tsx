import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, Check, X } from 'lucide-react'
import { useJobs, type JobCard } from '../system/jobs'
import { cn } from '../lib/utils'

const AUTO_DISMISS_MS = 9000

/** Cards that say a background job finished. They leave on their own unless the pointer rests on them. */
export function JobCards() {
  const cards = useJobs((s) => s.cards)
  return (
    <div className="pointer-events-none absolute right-5 bottom-24 z-[300000] flex w-[min(320px,calc(100vw-40px))] flex-col items-stretch gap-2">
      <AnimatePresence initial={false}>
        {cards.map((c) => (
          <Card key={c.id} card={c} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function Card({ card }: { card: JobCard }) {
  const dismiss = useJobs((s) => s.dismissCard)
  const [hold, setHold] = useState(false)

  const error = card.kind === 'error'

  // What went wrong waits for the ✕. The only trace of interrupted work used to vanish nine seconds after
  // boot — exactly while the desktop is still coming up — and it is written down nowhere else.
  useEffect(() => {
    if (hold || error) return
    const timer = window.setTimeout(() => dismiss(card.id), AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [hold, error, card.id, dismiss])
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 16, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      // Keyboard focus holds the card too: reading it with Tab used to be a race against the timer.
      onFocusCapture={() => setHold(true)}
      onBlurCapture={() => setHold(false)}
      role="status"
      className="glass pointer-events-auto flex items-start gap-3 rounded-2xl p-3 shadow-win"
    >
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', error ? 'bg-danger/15 text-danger' : 'bg-accent-soft text-accent')}>
        {error ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{card.title}</p>
        {card.detail && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-3">{card.detail}</p>}
        {card.open && (
          <button
            type="button"
            onClick={() => {
              card.open?.()
              dismiss(card.id)
            }}
            className="mt-2 rounded-full bg-accent px-3 py-1 text-[12px] font-medium text-white transition hover:brightness-110"
          >
            Abrir
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={() => dismiss(card.id)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}
