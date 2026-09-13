import { useEffect, useState } from 'react'
import type { ClockZone, Widget } from '../../kernel/widgets'

function useTicker(ms: number): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return tick
}

function timeIn(zone: string, now: Date): { time: string; dayDelta: number; valid: boolean } {
  try {
    const time = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: zone })
    const there = new Date(now.toLocaleString('en-US', { timeZone: zone }))
    const here = new Date(now.toLocaleString('en-US'))
    const dayDelta = Math.round((startOfDay(there) - startOfDay(here)) / 86400000)
    return { time, dayDelta, valid: true }
  } catch {
    return { time: '--:--', dayDelta: 0, valid: false }
  }
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export function ClockWidget({ widget }: { widget: Widget }) {
  useTicker(15000)
  const now = new Date()
  const zones = (Array.isArray(widget.config.zones) ? widget.config.zones : []) as ClockZone[]

  return (
    <ul className="flex h-full flex-col justify-center gap-1.5">
      {zones.map((z, i) => {
        const t = timeIn(z.timeZone, now)
        return (
          <li key={`${z.timeZone}-${i}`} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] text-ink-2">
              {z.label}
              {!t.valid && <span className="ml-1 text-[10px] text-danger">zona inválida</span>}
            </span>
            <span className="flex items-baseline gap-1.5 tabular-nums">
              <span className="text-[18px] font-medium text-ink">{t.time}</span>
              {t.dayDelta !== 0 && <span className="text-[10px] text-ink-3">{t.dayDelta > 0 ? '+1 d' : '-1 d'}</span>}
            </span>
          </li>
        )
      })}
      {zones.length === 0 && <li className="text-[12px] text-ink-3">Sin zonas configuradas</li>}
    </ul>
  )
}
