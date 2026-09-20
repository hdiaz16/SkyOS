import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Blocks, Plus, Sparkles } from 'lucide-react'
import { USER_WIDGET_TYPES, WIDGET_META, type WidgetType } from '../kernel/widgets'
import { dispatch, useToasts } from '../kernel/commands'
import { cn } from '../lib/utils'

/**
 * Where the widgets live to be seen: every kind Sky ships, one line each, and a press that puts it on the desk —
 * plus the door to the ones that do not exist yet, which Sky builds to order in HTML. Until now the only ways
 * in were the right-click menu on the desktop and typing «widget» into the bar, and nobody found either.
 */
export function WidgetGallery({ onAsk }: { onAsk: (text: string) => void }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-widget-gallery]')) setOpen(false)
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

  const add = async (type: WidgetType) => {
    try {
      await dispatch('widgets.create', { type })
      useToasts.getState().push({ message: `${WIDGET_META[type].label} ya está en el escritorio`, kind: 'info' })
    } catch (err) {
      useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo agregar el widget', kind: 'error' })
    }
  }

  return (
    <div className="relative" data-widget-gallery>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Widgets"
        title="Widgets"
        className={cn(
          'group relative flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface-2 hover:text-ink active:translate-y-0 active:scale-95',
          open && 'bg-surface-2',
        )}
      >
        <Blocks className="h-5 w-5" strokeWidth={1.6} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            style={{ transformOrigin: 'bottom center' }}
            className="glass absolute bottom-full left-1/2 mb-3 w-[300px] -translate-x-1/2 rounded-xl p-2 shadow-win"
          >
            <p className="px-2 pb-1.5 pt-1 text-[10.5px] font-medium uppercase tracking-wide text-ink-3">Widgets</p>
            <div className="flex flex-col gap-0.5">
              {USER_WIDGET_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => void add(t)} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink">{WIDGET_META[t].label}</span>
                    <span className="block text-[11px] leading-snug text-ink-3">{WIDGET_META[t].description}</span>
                  </span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                </button>
              ))}
            </div>
            <div className="mt-2 border-t border-line px-1 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onAsk('Hazme un widget que ')
                }}
                className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-surface-2"
              >
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">Otro, a tu medida</span>
                  <span className="block text-[11px] leading-snug text-ink-3">Sky lo hace en HTML, en un marco aislado: dile qué quieres ver y cómo.</span>
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
