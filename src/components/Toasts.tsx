import { AnimatePresence, motion } from 'motion/react'
import { Undo2, X } from 'lucide-react'
import { standingOf, undoEntry, useJournal, useToasts } from '../kernel/commands'
import { cn } from '../lib/utils'

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  const entries = useJournal((s) => s.entries)

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[300000] flex flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const entry = t.entryId ? entries.find((e) => e.id === t.entryId) : undefined
          const canUndo = !!entry && standingOf(entry) === 'undoable'
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              className={cn(
                'glass pointer-events-auto flex items-center gap-3 rounded-full py-2 pl-4 pr-2 text-[13px] shadow-win',
                t.kind === 'error' ? 'text-danger' : 'text-ink',
              )}
            >
              <span className="max-w-[420px] truncate">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.run()
                    dismiss(t.id)
                  }}
                  className="rounded-full bg-accent px-2.5 py-1 text-[12px] font-medium text-white transition hover:brightness-110"
                >
                  {t.action.label}
                </button>
              )}
              {canUndo && (
                <button
                  type="button"
                  onClick={() => {
                    void undoEntry(entry.id)
                    dismiss(t.id)
                  }}
                  className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent transition hover:brightness-95"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Deshacer
                </button>
              )}
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => dismiss(t.id)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
