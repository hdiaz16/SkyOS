import { useRef, useState, type ComponentType, type PointerEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { widgets as widgetService, type Widget } from '../../kernel/widgets'
import { dispatch } from '../../kernel/commands'
import { cn } from '../../lib/utils'

interface Props {
  widget: Widget
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  children: ReactNode
  /** No body padding for content that manages its own layout (iframes). */
  flush?: boolean
}

type Geometry = Pick<Widget, 'x' | 'y' | 'w' | 'h'>

const same = (a: Geometry, b: Geometry) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** Draggable, resizable tile that hosts a widget on the desktop. Geometry persists on release. */
export function WidgetFrame({ widget, icon: Icon, children, flush }: Props) {
  const stored: Geometry = { x: widget.x, y: widget.y, w: widget.w, h: widget.h }
  // While dragging we render the live geometry; once the stored one catches up we fall back to it.
  const [dragGeo, setDragGeo] = useState<Geometry | null>(null)
  const [interacting, setInteracting] = useState(false)
  const live = useRef<Geometry>(stored)
  const geo = dragGeo && !same(dragGeo, stored) ? dragGeo : stored

  const track =
    (apply: (dx: number, dy: number, start: Geometry) => Geometry, persist: (g: Geometry) => Partial<Geometry>) => (e: PointerEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest('button, input, textarea, select, a')) return
      e.preventDefault()
      const sx = e.clientX
      const sy = e.clientY
      const start = geo
      setInteracting(true)
      const move = (ev: globalThis.PointerEvent) => {
        live.current = apply(ev.clientX - sx, ev.clientY - sy, start)
        setDragGeo(live.current)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setInteracting(false)
        void widgetService.place(widget.id, persist(live.current))
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

  const startDrag = track(
    (dx, dy, s) => ({ ...s, x: Math.max(0, s.x + dx), y: Math.max(44, s.y + dy) }),
    (g) => ({ x: g.x, y: g.y }),
  )
  const startResize = track(
    (dx, dy, s) => ({ ...s, w: Math.max(220, s.w + dx), h: Math.max(140, s.h + dy) }),
    (g) => ({ w: g.w, h: g.h }),
  )

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{ left: geo.x, top: geo.y, width: geo.w, height: geo.h }}
      className={cn(
        'glass group pointer-events-auto absolute flex flex-col overflow-hidden rounded-2xl shadow-soft transition-shadow hover:shadow-win',
        interacting && 'select-none shadow-win',
      )}
      onContextMenu={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cursor-hand flex h-9 shrink-0 select-none items-center gap-2 px-3" onPointerDown={startDrag}>
        <Icon className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">{widget.title}</span>
        <button
          type="button"
          aria-label="Quitar widget"
          onClick={() => void dispatch('widgets.remove', { id: widget.id })}
          className="flex h-5 w-5 items-center justify-center rounded-md text-ink-3 opacity-0 transition hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className={cn('relative min-h-0 flex-1', flush ? '' : 'px-3 pb-3', interacting && 'pointer-events-none')}>{children}</div>
      <div className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" onPointerDown={startResize} aria-hidden />
    </motion.div>
  )
}
