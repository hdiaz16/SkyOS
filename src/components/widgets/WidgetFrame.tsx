import { useEffect, useRef, useState, type ComponentType, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Pin, PinOff, X } from 'lucide-react'
import { widgets as widgetService, type Widget } from '../../kernel/widgets'
import { dispatch } from '../../kernel/commands'
import { useUi } from '../../state/ui'
import { cn } from '../../lib/utils'

interface Props {
  widget: Widget
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  children: ReactNode
  /** No body padding for content that manages its own layout (iframes). */
  flush?: boolean
}

type Geometry = Pick<Widget, 'x' | 'y' | 'w' | 'h'>

/** Title bar height: whatever else happens, this much of the widget stays where it can be grabbed. */
const GRAB = 36

/**
 * Inside the screen it wakes up on. Only the lower bounds were ever checked, so a smaller screen than last
 * time — or a widget Sky placed at x: 2000 — left it outside the visible area for good: you cannot drag what
 * you cannot see.
 */
function inside(g: Geometry): Geometry {
  const maxX = Math.max(0, window.innerWidth - GRAB * 2)
  const maxY = Math.max(44, window.innerHeight - GRAB)
  return { ...g, x: Math.min(Math.max(0, g.x), maxX), y: Math.min(Math.max(44, g.y), maxY) }
}

/**
 * Where a pinned widget sits on this screen. A pinned widget remembers its distance to the right edge, not its
 * x: the widgets live in a column on the right, and measured from the left that column drifted with every
 * change of window size — open the same desk on a smaller monitor and the weather had wandered into the middle
 * of the icons. Measured from the edge it holds, it stays in the same area whatever the width.
 */
function placed(widget: Widget, viewportWidth: number): Geometry {
  const base = { x: widget.x, y: widget.y, w: widget.w, h: widget.h }
  if (widget.anchorRight === undefined || widget.anchorRight === null) return base
  return { ...base, x: Math.max(0, viewportWidth - widget.anchorRight - widget.w) }
}

/** The viewport width, kept fresh so pinned widgets can follow the edge while the window is resized. */
function useViewportWidth(): number {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

/** Draggable, resizable tile that hosts a widget on the desktop. Geometry persists on release. */
export function WidgetFrame({ widget, icon: Icon, children, flush }: Props) {
  const viewportWidth = useViewportWidth()
  const pinned = widget.anchorRight !== undefined && widget.anchorRight !== null
  const stored: Geometry = placed(widget, viewportWidth)
  // While dragging we render the live geometry; once the stored one catches up we fall back to it.
  const [dragGeo, setDragGeo] = useState<Geometry | null>(null)
  const [interacting, setInteracting] = useState(false)
  const live = useRef<Geometry>(stored)
  const geo = dragGeo ?? stored

  // The live geometry is only an override while the stored one catches up with the last drag. It goes as soon as
  // the widget row changes, or the window is resized with nobody dragging. Before, it stayed on until the stored
  // geometry happened to equal it exactly — which, for a pinned widget, a resize made impossible — so a widget
  // that had been dragged once snapped back to that old place on every resize instead of following the edge.
  useEffect(() => {
    if (!interacting) setDragGeo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.x, widget.y, widget.w, widget.h, widget.anchorRight, viewportWidth])

  // On arrival, and whenever the window changes size, anything left outside is brought back within reach —
  // the same courtesy the desk already does for windows. A pinned widget only needs its height checked: its
  // horizontal place is computed from the edge every time.
  useEffect(() => {
    const fit = () => {
      const current = placed(widget, window.innerWidth)
      const next = inside(current)
      if (next.y !== current.y) void widgetService.place(widget.id, { y: next.y })
      if (!pinned && next.x !== current.x) void widgetService.place(widget.id, { x: next.x })
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, widget.x, widget.y, widget.w, widget.anchorRight])

  /** Pinned: keeps its distance to the right edge. Free: keeps its x and drifts with the width. */
  const togglePin = () => void dispatch('widgets.place', { id: widget.id, pinned: !pinned })

  /** Right-click on a widget used to open the browser's own menu — Recargar, Inspeccionar — inside SkyOS. */
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    useUi.getState().openMenu(e.clientX, e.clientY, [
      { label: pinned ? 'Soltar del borde' : 'Anclar al borde derecho', onSelect: togglePin },
      { type: 'separator' },
      { label: 'Quitar widget', danger: true, onSelect: () => void dispatch('widgets.remove', { id: widget.id }) },
    ])
  }

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
        live.current = inside(live.current)
        setDragGeo(live.current)
        const change = persist(live.current)
        // A pinned widget that was dragged keeps its pin: the new place is remembered as a new distance to the
        // edge, so it stays put on the next screen too.
        const anchored = pinned && change.x !== undefined ? { ...change, anchorRight: Math.max(0, window.innerWidth - live.current.x - live.current.w) } : change
        void widgetService.place(widget.id, anchored)
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
    // Growing to the right while pinned would push the widget past the edge it holds: the anchor shrinks by
    // what the width grew, so the left side moves and the right side stays.
    (g) => (pinned ? { w: g.w, h: g.h, anchorRight: Math.max(0, window.innerWidth - g.x - g.w) } : { w: g.w, h: g.h }),
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
      onContextMenu={onContextMenu}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cursor-hand flex h-9 shrink-0 select-none items-center gap-2 px-3" onPointerDown={startDrag}>
        <Icon className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">{widget.title}</span>
        <button
          type="button"
          aria-label={pinned ? 'Soltar del borde' : 'Anclar al borde derecho'}
          title={pinned ? 'Anclado al borde derecho: se queda en su zona aunque cambie el tamaño de la pantalla' : 'Anclar al borde derecho'}
          onClick={togglePin}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-md transition hover:bg-surface-2 hover:text-ink',
            pinned ? 'text-accent opacity-60 group-hover:opacity-100' : 'text-ink-3 opacity-0 group-hover:opacity-100',
          )}
        >
          {pinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
        </button>
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
