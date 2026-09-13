import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { widgets, type Widget } from '../../kernel/widgets'
import { useToasts } from '../../kernel/commands'
import { cn } from '../../lib/utils'

const PRESETS = [5, 15, 25, 45]

function format(total: number): string {
  const s = Math.max(0, Math.round(total))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function TimerWidget({ widget }: { widget: Widget }) {
  const total = typeof widget.config.seconds === 'number' && widget.config.seconds > 0 ? widget.config.seconds : 25 * 60
  const endsAt = typeof widget.config.endsAt === 'number' ? widget.config.endsAt : null
  const paused = typeof widget.config.remaining === 'number' ? widget.config.remaining : null
  const label = typeof widget.config.label === 'string' ? widget.config.label : ''

  const [now, setNow] = useState(() => Date.now())
  const finished = useRef(false)

  useEffect(() => {
    if (!endsAt) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [endsAt])

  const remaining = endsAt ? Math.max(0, (endsAt - now) / 1000) : paused ?? total
  const running = !!endsAt && remaining > 0

  useEffect(() => {
    if (endsAt && remaining <= 0 && !finished.current) {
      finished.current = true
      useToasts.getState().push({ message: `${label || 'Temporizador'}: tiempo terminado`, kind: 'info' })
      void widgets.setConfig(widget.id, { endsAt: null, remaining: 0 })
    }
    if (!endsAt) finished.current = false
  }, [endsAt, remaining, label, widget.id])

  const start = () => void widgets.setConfig(widget.id, { endsAt: Date.now() + remaining * 1000, remaining: undefined })
  const pause = () => void widgets.setConfig(widget.id, { endsAt: null, remaining })
  const reset = (seconds = total) => void widgets.setConfig(widget.id, { seconds, endsAt: null, remaining: undefined })

  const progress = total > 0 ? 1 - remaining / total : 0
  const done = !running && paused === 0

  return (
    <div className="flex h-full flex-col items-center justify-between gap-2">
      <div className="relative flex flex-1 items-center justify-center">
        <svg viewBox="0 0 100 100" className="h-[92px] w-[92px] -rotate-90">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress)}`}
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <span className={cn('absolute text-[20px] font-medium tabular-nums', done ? 'text-accent' : 'text-ink')}>{format(remaining)}</span>
      </div>
      <div className="flex items-center gap-1">
        {PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => reset(m * 60)}
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[11px] transition',
              total === m * 60 ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
            )}
          >
            {m}m
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={running ? pause : start}
          disabled={remaining <= 0}
          aria-label={running ? 'Pausar' : 'Iniciar'}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow-soft transition hover:brightness-110 disabled:opacity-40"
        >
          {running ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        </button>
        <button
          type="button"
          onClick={() => reset()}
          aria-label="Reiniciar"
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
