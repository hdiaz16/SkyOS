import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useUi, type ContextMenuState } from '../state/ui'
import { cn } from '../lib/utils'

export function ContextMenu() {
  const menu = useUi((s) => s.contextMenu)
  const close = useUi((s) => s.closeMenu)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-context-menu]')) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [menu, close])

  return <AnimatePresence>{menu && <Menu key={`${menu.x}-${menu.y}`} menu={menu} />}</AnimatePresence>
}

/** Receives a snapshot of the menu so the exit animation still has data after the store clears it. */
function Menu({ menu }: { menu: ContextMenuState }) {
  const close = useUi((s) => s.closeMenu)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: menu.x, y: menu.y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8),
    })
  }, [menu])

  return (
    <motion.div
      ref={ref}
      data-context-menu
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.08 } }}
      transition={{ type: 'spring', stiffness: 600, damping: 38 }}
      style={{ left: pos.x, top: pos.y, transformOrigin: 'top left' }}
      className="glass fixed z-[200000] min-w-[200px] rounded-xl p-1 shadow-win"
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) =>
        item.type === 'separator' ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => {
              close()
              item.onSelect()
            }}
            className={cn(
              'flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
              item.danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-accent hover:text-white',
            )}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="text-[11px] opacity-60">{item.shortcut}</span>}
          </button>
        ),
      )}
    </motion.div>
  )
}
