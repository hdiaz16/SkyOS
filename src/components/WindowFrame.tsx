import { useState, type PointerEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useWindows, type Win } from '../state/windows'
import { cn } from '../lib/utils'

interface Props {
  win: Win
  active: boolean
  children: ReactNode
}

export function WindowFrame({ win, active, children }: Props) {
  const [interacting, setInteracting] = useState(false)

  const track = (onMove: (ev: globalThis.PointerEvent) => void) => {
    setInteracting(true)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setInteracting(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
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
    track((ev) => wm.move(win.id, ox + ev.clientX - sx, oy + ev.clientY - sy))
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={win.minimized ? { opacity: 0, scale: 0.9, y: 80 } : { opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.9 }}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z, pointerEvents: win.minimized ? 'none' : 'auto' }}
      className={cn(
        'glass absolute flex flex-col overflow-hidden rounded-2xl',
        active ? 'shadow-win' : 'shadow-soft',
      )}
      onPointerDownCapture={() => {
        if (!active) useWindows.getState().focus(win.id)
      }}
    >
      <div
        className="cursor-hand flex h-10 shrink-0 select-none items-center gap-2 border-b border-line px-3"
        onPointerDown={startDrag}
      >
        <div className="group flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => useWindows.getState().close(win.id)}
            className="h-3 w-3 rounded-full bg-ink-3/40 transition group-hover:bg-[#ff5f57] hover:brightness-90"
          />
          <button
            type="button"
            aria-label="Minimizar"
            onClick={() => useWindows.getState().minimize(win.id)}
            className="h-3 w-3 rounded-full bg-ink-3/40 transition group-hover:bg-[#febc2e] hover:brightness-90"
          />
        </div>
        <div className={cn('flex-1 truncate text-center text-[13px] font-medium', active ? 'text-ink' : 'text-ink-2')}>
          {win.title}
        </div>
        <div className="w-[38px]" />
      </div>

      <div className={cn('relative min-h-0 flex-1', interacting && 'pointer-events-none')}>{children}</div>

      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        onPointerDown={startResize}
        aria-hidden
      />
    </motion.div>
  )
}
