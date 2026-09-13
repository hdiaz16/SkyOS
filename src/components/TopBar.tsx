import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useClock } from '../lib/hooks'
import { cn } from '../lib/utils'
import { Calendar } from './Calendar'

function greetingFor(hour: number): string {
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function TopBar() {
  const now = useClock()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const time = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const rawDate = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/\./g, '')
  const date = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[100000] flex h-11 items-center justify-between px-5">
      <div className="text-[13px] text-ink-2">
        <span className="font-medium text-ink">{greetingFor(now.getHours())}</span>
        <span className="hidden md:inline"> · {date}</span>
      </div>

      <div className="pointer-events-auto relative">
        <button
          type="button"
          data-clock
          onClick={() => setCalendarOpen((o) => !o)}
          title="Calendario"
          className={cn(
            'rounded-lg px-2 py-1 text-[13px] font-medium tabular-nums text-ink transition hover:bg-surface-2',
            calendarOpen && 'bg-surface-2',
          )}
        >
          {time}
        </button>
        <AnimatePresence>{calendarOpen && <Calendar onClose={() => setCalendarOpen(false)} />}</AnimatePresence>
      </div>
    </div>
  )
}
