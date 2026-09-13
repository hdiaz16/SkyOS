import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function Calendar({ onClose }: { onClose: () => void }) {
  const today = new Date()
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() })

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-calendar]') && !t.closest('[data-clock]')) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const first = new Date(view.y, view.m, 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
    const d = i - offset + 1
    return d >= 1 && d <= days ? d : null
  })
  const isThisMonth = view.y === today.getFullYear() && view.m === today.getMonth()
  const rawMonth = first.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1)

  const shift = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1)
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }

  return (
    <motion.div
      data-calendar
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.99, transition: { duration: 0.1 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 38 }}
      style={{ transformOrigin: 'top right' }}
      className="glass pointer-events-auto absolute right-0 top-full mt-2 w-[280px] rounded-2xl p-3 shadow-win"
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => shift(-1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-medium text-ink">{monthLabel}</span>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => shift(1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="py-1 text-[11px] font-medium text-ink-3">
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          const isToday = isThisMonth && d === today.getDate()
          return (
            <span
              key={i}
              className={cn(
                'mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[12px] tabular-nums',
                d === null && 'invisible',
                isToday ? 'bg-accent font-semibold text-white' : 'text-ink hover:bg-surface-2',
              )}
            >
              {d}
            </span>
          )
        })}
      </div>

      {!isThisMonth && (
        <button
          type="button"
          onClick={() => setView({ y: today.getFullYear(), m: today.getMonth() })}
          className="mt-2 w-full rounded-lg py-1.5 text-[12px] text-accent transition hover:bg-accent-soft"
        >
          Volver a hoy
        </button>
      )}
    </motion.div>
  )
}
