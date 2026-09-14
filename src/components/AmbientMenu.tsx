import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Headphones, VolumeX } from 'lucide-react'
import { AMBIENTS, useAmbient } from '../system/ambient'
import { cn } from '../lib/utils'

/** Focus audio from the dock: pick a soundscape, set how loud, done. Nothing plays until you ask. */
export function AmbientMenu() {
  const kind = useAmbient((s) => s.kind)
  const volume = useAmbient((s) => s.volume)
  const set = useAmbient((s) => s.set)
  const setVolume = useAmbient((s) => s.setVolume)
  const [open, setOpen] = useState(false)
  const playing = kind !== 'off'

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-ambient]')) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" data-ambient>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Audio de enfoque"
        title="Audio de enfoque"
        className={cn(
          'group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface-2 active:translate-y-0 active:scale-95',
          playing ? 'text-accent' : 'text-ink-2 hover:text-ink',
          open && 'bg-surface-2',
        )}
      >
        <Headphones className="h-5 w-5" strokeWidth={1.6} />
        {playing && <span className="absolute right-2 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            style={{ transformOrigin: 'bottom center' }}
            className="glass absolute bottom-full left-1/2 mb-3 w-[260px] -translate-x-1/2 rounded-xl p-2 shadow-win"
          >
            <p className="px-2 pb-1.5 pt-1 text-[10.5px] font-medium uppercase tracking-wide text-ink-3">Audio de enfoque</p>
            <div className="flex flex-col gap-0.5">
              {AMBIENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => set(kind === a.id ? 'off' : a.id)}
                  className={cn('flex flex-col rounded-lg px-2.5 py-1.5 text-left transition', kind === a.id ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                >
                  <span className={cn('text-[13px] font-medium', kind === a.id ? 'text-accent' : 'text-ink')}>{a.label}</span>
                  <span className="text-[11px] text-ink-3">{a.hint}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => set('off')}
                disabled={!playing}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink-2 transition hover:bg-surface-2 disabled:opacity-40"
              >
                <VolumeX className="h-3.5 w-3.5" />
                Silencio
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-line px-2 pt-2">
              <span className="text-[11px] text-ink-3">Volumen</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volumen del audio de enfoque"
                className="h-1 flex-1 accent-[var(--accent)]"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
