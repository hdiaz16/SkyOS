import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Sparkles } from 'lucide-react'
import { useWindows, MIN_H, MIN_W, type SnapTarget, type Win } from '../state/windows'
import { useUi } from '../state/ui'
import { cn } from '../lib/utils'
import { SelectionMenu } from './SelectionMenu'

interface Props {
  win: Win
  active: boolean
  children: ReactNode
}

/** Pointer this close to an edge while dragging means "snap there". */
const EDGE_PX = 10
const TOP_PX = 6

/** Springs: a settled placement lands with a little give; a drag follows the hand exactly. */
const SETTLE = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.8 }
const INSTANT = { duration: 0 }

function zoneFor(x: number, y: number): SnapTarget | null {
  if (y <= TOP_PX) return 'max'
  if (x <= EDGE_PX) return 'left'
  if (x >= window.innerWidth - EDGE_PX) return 'right'
  return null
}

/** Which sides a corner or an edge handle stretches. */
type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * The chrome around every app: a quiet header (three discreet dots, the title, a spark to ask Sky about what
 * is inside), drag to move with magnetic edges, every border and corner ready to resize, double-click to fill
 * the workspace.
 */
export function WindowFrame({ win, active, children }: Props) {
  const [interacting, setInteracting] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  // A placement made by the system (snap, arrange, stack) glides into place; once it lands, drags follow the hand instantly.
  const settling = !!win.settling

  /**
   * Moving and resizing follow the pointer until it is let go — even when it crosses the browser inside the
   * Navegador window or a canvas block, which are separate documents that would otherwise swallow the events
   * and leave the window stuck to the hand. Capturing the pointer keeps every move coming back here.
   */
  const track = (e: PointerEvent<HTMLElement>, onMove: (ev: globalThis.PointerEvent) => void, onUp?: (ev: globalThis.PointerEvent) => void) => {
    setInteracting(true)
    const target = e.currentTarget
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      // Some pointers cannot be captured (a pen leaving range); the window listeners below still work.
    }
    const done = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', done)
      target.removeEventListener('pointercancel', done)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', done)
      setInteracting(false)
      onUp?.(ev)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', done)
    target.addEventListener('pointercancel', done)
    // A capture that never took still has to end somewhere.
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', done)
  }

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const wm = useWindows.getState()
    wm.focus(win.id)
    const sx = e.clientX
    const sy = e.clientY
    const ox = win.x
    const oy = win.y
    track(
      e,
      (ev) => {
        wm.move(win.id, ox + ev.clientX - sx, oy + ev.clientY - sy)
        useUi.getState().setSnapPreview(zoneFor(ev.clientX, ev.clientY))
      },
      (ev) => {
        const zone = zoneFor(ev.clientX, ev.clientY)
        useUi.getState().setSnapPreview(null)
        if (zone) useWindows.getState().snap(win.id, zone)
      },
    )
  }

  const startResize = (edge: Edge) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const wm = useWindows.getState()
    wm.focus(win.id)
    const sx = e.clientX
    const sy = e.clientY
    const o = { x: win.x, y: win.y, w: win.w, h: win.h }
    track(e, (ev) => {
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      let { x, y, w, h } = o
      if (edge.includes('e')) w = o.w + dx
      if (edge.includes('s')) h = o.h + dy
      if (edge.includes('w')) {
        w = o.w - dx
        x = o.x + dx
      }
      if (edge.includes('n')) {
        h = o.h - dy
        y = o.y + dy
      }
      // When the minimum bites on a top/left edge, that edge stays put instead of travelling with the pointer.
      if (w < MIN_W) {
        if (edge.includes('w')) x = o.x + o.w - MIN_W
        w = MIN_W
      }
      if (h < MIN_H) {
        if (edge.includes('n')) y = o.y + o.h - MIN_H
        h = MIN_H
      }
      wm.reshape(win.id, { x, y, w, h })
    })
  }

  const askSky = () => {
    useWindows.getState().focus(win.id)
    useUi.getState().focusComposer()
  }

  const geometry = { left: win.x, top: win.y, width: win.w, height: win.h }
  const geometryTransition = settling ? SETTLE : INSTANT

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 12, ...geometry }}
      animate={win.minimized ? { opacity: 0, scale: 0.9, y: 80, ...geometry } : { opacity: 1, scale: 1, y: 0, ...geometry }}
      exit={{ opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.16 } }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 34,
        mass: 0.9,
        left: geometryTransition,
        top: geometryTransition,
        width: geometryTransition,
        height: geometryTransition,
      }}
      style={{ zIndex: win.z, pointerEvents: win.minimized ? 'none' : 'auto' }}
      onAnimationComplete={() => {
        if (win.settling) useWindows.getState().settled(win.id)
      }}
      className={cn('glass group/window absolute flex select-text flex-col overflow-hidden', win.maximized ? 'rounded-2xl' : 'rounded-2xl', active ? 'shadow-win' : 'shadow-soft')}
      onPointerDownCapture={() => {
        if (!active) useWindows.getState().focus(win.id)
      }}
    >
      <div
        className="cursor-hand flex h-9 shrink-0 select-none items-center gap-2 border-b border-line/70 px-3"
        onPointerDown={startDrag}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          useWindows.getState().toggleMaximize(win.id)
        }}
      >
        <div className="group flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            onClick={() => useWindows.getState().close(win.id)}
            className="h-3 w-3 rounded-full bg-ink-3/35 transition group-hover:bg-[#ff5f57] hover:brightness-90"
          />
          <button
            type="button"
            aria-label="Minimizar"
            title="Minimizar"
            onClick={() => useWindows.getState().minimize(win.id)}
            className="h-3 w-3 rounded-full bg-ink-3/35 transition group-hover:bg-[#febc2e] hover:brightness-90"
          />
          <button
            type="button"
            aria-label={win.maximized ? 'Restaurar tamaño' : 'Maximizar'}
            title={win.maximized ? 'Restaurar tamaño' : 'Maximizar'}
            onClick={() => useWindows.getState().toggleMaximize(win.id)}
            className="h-3 w-3 rounded-full bg-ink-3/35 transition group-hover:bg-[#28c840] hover:brightness-90"
          />
        </div>
        <div className={cn('flex-1 truncate text-center text-[13px] font-medium', active ? 'text-ink' : 'text-ink-2')}>{win.title}</div>
        <div className="flex w-[54px] items-center justify-end">
          <button
            type="button"
            aria-label="Preguntar a Sky sobre esta ventana"
            title="Preguntar a Sky sobre esta ventana"
            onClick={askSky}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md text-accent transition hover:bg-accent-soft',
              active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover/window:opacity-70',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div ref={contentRef} className={cn('relative min-h-0 flex-1 overflow-hidden', interacting && 'pointer-events-none')}>
        {children}
        {win.app !== 'editor' && <SelectionMenu frameRef={contentRef} source={win.title} />}
        {/* A click inside an <iframe> never reaches this document, so clicking the page of a browser window
            that sits behind another one did not bring it forward: you had to aim at its title bar. While the
            window is not the active one, this pane takes the first click, focuses, and gets out of the way. */}
        {!active && (win.app === 'browser' || win.app === 'app' || win.app === 'canvas') && (
          <div className="absolute inset-0 z-10" onPointerDown={() => useWindows.getState().focus(win.id)} aria-hidden />
        )}
      </div>

      {/* Only the bottom-right corner could be grabbed, and part of it fell outside the rounded border: a
          window parked on the right half of the screen could not be widened towards the left without moving
          the whole thing first. Every border and corner stretches now. */}
      <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
        <div className="pointer-events-auto absolute top-0 right-0 left-0 h-1.5 cursor-ns-resize" onPointerDown={startResize('n')} />
        <div className="pointer-events-auto absolute right-0 bottom-0 left-0 h-1.5 cursor-ns-resize" onPointerDown={startResize('s')} />
        <div className="pointer-events-auto absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={startResize('w')} />
        <div className="pointer-events-auto absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize" onPointerDown={startResize('e')} />
        <div className="pointer-events-auto absolute top-0 left-0 h-3 w-3 cursor-nwse-resize" onPointerDown={startResize('nw')} />
        <div className="pointer-events-auto absolute top-0 right-0 h-3 w-3 cursor-nesw-resize" onPointerDown={startResize('ne')} />
        <div className="pointer-events-auto absolute bottom-0 left-0 h-3 w-3 cursor-nesw-resize" onPointerDown={startResize('sw')} />
        <div className="pointer-events-auto absolute right-0 bottom-0 h-3 w-3 cursor-nwse-resize" onPointerDown={startResize('se')} />
      </div>
    </motion.div>
  )
}
