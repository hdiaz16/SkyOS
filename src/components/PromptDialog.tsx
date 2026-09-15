import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useDialog } from '../state/dialog'
import { cn } from '../lib/utils'

/** A single, calm question with a text field. Used when an action needs one line from the user. */
export function PromptDialog() {
  const request = useDialog((s) => s.request)
  return <AnimatePresence>{request && <Dialog key="dialog" />}</AnimatePresence>
}

function Dialog() {
  const request = useDialog((s) => s.request)!
  const close = useDialog((s) => s.close)
  const [value, setValue] = useState(request.initialValue ?? '')
  const confirming = !!request.confirm

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null)
    }
    window.addEventListener('keydown', onKey)
    // Whoever was working keeps their place: the dialog borrows the focus and gives it back.
    const before = document.activeElement as HTMLElement | null
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [close])

  const submit = () => {
    if (confirming) return close('sí')
    const v = value.trim()
    if (v) close(v)
  }

  return (
    <motion.div
      className="fixed inset-0 z-[250000] flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      onMouseDown={() => close(null)}
    >
      <div className="absolute inset-0 bg-black/10 dark:bg-black/40" />
      <motion.form
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.99, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        className="glass relative w-[460px] max-w-full rounded-2xl p-5 shadow-win"
      >
        <h2 className="text-[15px] font-medium text-ink">{request.title}</h2>
        {request.description && <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{request.description}</p>}
        {confirming ? null : request.multiline ? (
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
            }}
            placeholder={request.placeholder}
            rows={4}
            className="mt-3 w-full resize-none rounded-xl border border-line bg-surface-solid px-3 py-2 text-[14px] text-ink outline-none focus:border-accent"
          />
        ) : (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={request.placeholder}
            className="mt-3 h-10 w-full rounded-xl border border-line bg-surface-solid px-3 text-[14px] text-ink outline-none focus:border-accent"
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => close(null)}
            className="rounded-lg px-3 py-1.5 text-[13px] text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="submit"
            autoFocus={confirming}
            disabled={!confirming && !value.trim()}
            className={cn(
              'rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40',
              request.danger ? 'bg-danger' : 'bg-accent',
            )}
          >
            {request.confirmLabel ?? 'Continuar'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  )
}
