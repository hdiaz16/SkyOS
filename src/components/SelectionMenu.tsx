import { useEffect, useState, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Languages, Lightbulb, Sparkles, Table2 } from 'lucide-react'
import { useSession } from '../ai/session'
import { useToasts } from '../kernel/commands'
import { isAiConfigured, useAiSettings } from '../ai/settings'

const MIN_CHARS = 6
const MAX_CHARS = 6000

interface Picked {
  text: string
  /** Center x and top y of the selection, relative to the frame. */
  x: number
  y: number
  /** Frame width at the time, to keep the menu inside. */
  width: number
}

type Intent = 'summary' | 'translate' | 'explain' | 'table'

/** Rows and columns hiding in plain text: several lines with tabs, pipes, semicolons or repeated commas. */
function looksTabular(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return false
  const hits = lines.filter((l) => /\t|\||;|,.*,/.test(l)).length
  return hits >= Math.ceil(lines.length * 0.6)
}

function lead(intent: Intent, source: string): string {
  switch (intent) {
    case 'summary':
      return `Resume este fragmento de «${source}»:`
    case 'translate':
      return `Traduce al español este fragmento de «${source}» (si ya está en español, tradúcelo al inglés):`
    case 'explain':
      return `Explícame con claridad este fragmento de «${source}»:`
    case 'table':
      return `Convierte este fragmento de «${source}» en una tabla Markdown limpia, con encabezados claros:`
  }
}

/**
 * In-context help for any window: select text in a document, a page or a reply and a small menu floats right
 * above it with the things people ask most. Inputs and editors keep their own tools.
 */
export function SelectionMenu({ frameRef, source }: { frameRef: RefObject<HTMLDivElement | null>; source: string }) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const aiReady = isAiConfigured(useAiSettings())

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !aiReady) return

    const read = () => {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (!sel || sel.rangeCount === 0 || text.length < MIN_CHARS || !frame.contains(sel.anchorNode)) return null
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
      if (anchor?.closest('input, textarea, [contenteditable="true"], [data-no-selection-menu]')) return null
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (!rect.width && !rect.height) return null
      const box = frame.getBoundingClientRect()
      return { text, x: rect.left - box.left + rect.width / 2, y: rect.top - box.top, width: box.width }
    }

    const onUp = (e: Event) => {
      if (e.target instanceof HTMLElement && e.target.closest('[data-selection-menu]')) return
      // The selection settles after the event; read it a tick later.
      window.setTimeout(() => setPicked(read()), 0)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key === 'Shift') setPicked(read())
    }
    const hide = () => setPicked((p) => (p ? null : p))

    frame.addEventListener('mouseup', onUp)
    frame.addEventListener('keyup', onKeyUp)
    frame.addEventListener('scroll', hide, true)
    return () => {
      frame.removeEventListener('mouseup', onUp)
      frame.removeEventListener('keyup', onKeyUp)
      frame.removeEventListener('scroll', hide, true)
    }
  }, [frameRef, aiReady])

  const ask = (intent: Intent) => {
    if (!picked) return
    const text = picked.text.slice(0, MAX_CHARS)
    // A long selection used to leave silently cut, and Sky summarised the first third with the confidence of
    // having read all of it. The cut is said inside the message, so the answer cannot pretend otherwise, and
    // out loud, so the person knows what travelled.
    const cut = picked.text.length > MAX_CHARS
    const note = cut ? `\n\n(De la selección solo caben aquí los primeros ${MAX_CHARS} caracteres de ${picked.text.length}; no la viste entera.)` : ''
    if (cut) {
      useToasts.getState().push({ message: `La selección no cabe entera: le mando los primeros ${MAX_CHARS} caracteres.`, kind: 'info' })
    }
    setPicked(null)
    window.getSelection()?.removeAllRanges()
    useSession.getState().setOpen(true)
    void useSession.getState().send(`${lead(intent, source)}\n\n"""\n${text}\n"""${note}`)
  }

  return (
    <AnimatePresence>
      {picked && (
        <motion.div
          key="selection-menu"
          data-selection-menu
          initial={{ opacity: 0, y: 4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 3, scale: 0.98, transition: { duration: 0.1 } }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          style={{ left: Math.max(140, Math.min(picked.width - 140, picked.x)), top: Math.max(6, picked.y - 8) }}
          className="glass absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-xl p-1 shadow-win"
          onMouseDown={(e) => e.preventDefault()}
        >
          <Action icon={<Sparkles className="h-3.5 w-3.5" />} label="Resumir" onClick={() => ask('summary')} />
          <Action icon={<Languages className="h-3.5 w-3.5" />} label="Traducir" onClick={() => ask('translate')} />
          <Action icon={<Lightbulb className="h-3.5 w-3.5" />} label="Explicar" onClick={() => ask('explain')} />
          {looksTabular(picked.text) && <Action icon={<Table2 className="h-3.5 w-3.5" />} label="A tabla" onClick={() => ask('table')} />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Action({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink transition hover:bg-surface-2">
      {icon}
      {label}
    </button>
  )
}
