import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Sparkles } from 'lucide-react'
import { useWindows, type SnapTarget, type Win } from '../state/windows'
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

/**
 * The chrome around every app: a quiet header (three discreet dots, the title, a spark to ask Sky about what
 * is inside), drag to move with magnetic edges, a corner to resize, double-click to fill the workspace.
 */
export function WindowFrame({ win, active, children }: Props) {
  const [interacting, setInteracting] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  // A placement made by the system (snap, arrange, stack) glides into place; once it lands, drags follow the hand instantly.
  const settling = !!win.settling

  const track = (onMove: (ev: globalThis.PointerEvent) => void, onUp?: (ev: globalThis.PointerEvent) => void) => {
    setInteracting(true)
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', up)
      setInteracting(false)
      onUp?.(ev)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', up)
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

  const startResize = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const wm = useWindows.getState()
    wm.focus(win.id)
    const sx = e.clientX
    const sy = e.clientY
    const ow = win.w
    const oh = win.h
    track((ev) => wm.resize(win.id, ow + ev.clientX - sx, oh + ev.clientY - sy))
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
      className={cn('glass group/window absolute flex flex-col overflow-hidden', win.maximized ? 'rounded-2xl' : 'rounded-2xl', active ? 'shadow-win' : 'shadow-soft')}
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

      <div ref={contentRef} className={cn('relative min-h-0 flex-1', interacting && 'pointer-events-none')}>
        {children}
        {win.app !== 'editor' && <SelectionMenu frameRef={contentRef} source={win.title} />}
      </div>

      <div className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize" onPointerDown={startResize} aria-hidden />
    </motion.div>
  )
}
