import { Sparkles } from 'lucide-react'
import { useUi } from '../state/ui'
import { useClock } from '../lib/hooks'

export function TopBar() {
  const now = useClock()
  const setPalette = useUi((s) => s.setPalette)
  const time = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const rawDate = now.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
  const date = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[100000] flex h-11 items-center px-4">
      <div className="flex w-24 shrink-0 items-center gap-2 text-[13px] font-semibold tracking-tight text-ink md:w-40">
        <svg viewBox="0 0 64 64" className="h-4 w-4" aria-hidden>
          <rect x="6" y="18" width="52" height="8" rx="3" fill="currentColor" />
          <rect x="12" y="26" width="6" height="24" rx="2" fill="currentColor" />
          <rect x="46" y="26" width="6" height="24" rx="2" fill="currentColor" />
        </svg>
        Mesa
      </div>

      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="glass pointer-events-auto flex h-8 w-[380px] max-w-full items-center gap-2.5 rounded-full px-3.5 text-[13px] text-ink-2 shadow-soft transition hover:text-ink active:scale-[0.99]"
        >
          <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
          <span className="flex-1 text-left">Busca o pide algo…</span>
          <span className="rounded-md border border-line px-1.5 py-px font-mono text-[10px] text-ink-3">Ctrl K</span>
        </button>
      </div>

      <div className="flex w-24 shrink-0 items-center justify-end gap-3 whitespace-nowrap text-[12px] text-ink-2 md:w-40">
        <span className="hidden md:inline">{date}</span>
        <span className="font-medium tabular-nums text-ink">{time}</span>
      </div>
    </div>
  )
}
