import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cropToImagePart, useSnap, type Region } from '../ai/snap'
import { useSession } from '../ai/session'
import { useUi } from '../state/ui'

/** Full-screen region picker over a fresh capture. Drag to choose an area, Enter for everything, Esc to cancel. */
export function SnapOverlay() {
  const image = useSnap((s) => s.image)
  return <AnimatePresence>{image && <Picker key="picker" />}</AnimatePresence>
}

function Picker() {
  const { image, width, height, close } = useSnap()
  type Drag = { x0: number; y0: number; x1: number; y1: number }
  const [drag, setDragState] = useState<Drag | null>(null)
  // The ref mirrors the state so fast pointer sequences never read a stale closure.
  const dragRef = useRef<Drag | null>(null)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }
  const frameRef = useRef<HTMLDivElement>(null)

  const finish = async (region: Region | null) => {
    if (!image) return
    const part = await cropToImagePart(image, region)
    useSession.getState().attach(part, region ? 'Área capturada' : 'Captura de pantalla')
    close()
    useUi.getState().focusComposer()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'Enter') void finish(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image])

  /** Maps a pointer position to source-image pixels, honoring object-fit: contain. */
  const toImage = (clientX: number, clientY: number) => {
    const el = frameRef.current
    if (!el) return { x: 0, y: 0 }
    const box = el.getBoundingClientRect()
    const scale = Math.min(box.width / width, box.height / height)
    const drawW = width * scale
    const drawH = height * scale
    const offX = box.left + (box.width - drawW) / 2
    const offY = box.top + (box.height - drawH) / 2
    return {
      x: Math.min(width, Math.max(0, (clientX - offX) / scale)),
      y: Math.min(height, Math.max(0, (clientY - offY) / scale)),
    }
  }

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const p = toImage(e.clientX, e.clientY)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMove = (e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const p = toImage(e.clientX, e.clientY)
    setDrag({ ...d, x1: p.x, y1: p.y })
  }
  const onUp = () => {
    const d = dragRef.current
    if (!d) return
    const region: Region = {
      x: Math.min(d.x0, d.x1),
      y: Math.min(d.y0, d.y1),
      w: Math.abs(d.x1 - d.x0),
      h: Math.abs(d.y1 - d.y0),
    }
    setDrag(null)
    if (region.w < 8 || region.h < 8) return
    void finish(region)
  }

  const box = frameRef.current?.getBoundingClientRect()
  const scale = box ? Math.min(box.width / width, box.height / height) : 1
  const drawW = width * scale
  const drawH = height * scale
  const offX = box ? (box.width - drawW) / 2 : 0
  const offY = box ? (box.height - drawH) / 2 : 0
  const sel = drag
    ? {
        left: offX + Math.min(drag.x0, drag.x1) * scale,
        top: offY + Math.min(drag.y0, drag.y1) * scale,
        width: Math.abs(drag.x1 - drag.x0) * scale,
        height: Math.abs(drag.y1 - drag.y0) * scale,
      }
    : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      className="fixed inset-0 z-[260000] select-none bg-black/80 p-6"
    >
      <div
        ref={frameRef}
        className="relative h-full w-full cursor-crosshair"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {image && <img src={image} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain opacity-60" />}
        {sel && (
          <div
            className="pointer-events-none absolute overflow-hidden rounded-md ring-2 ring-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={{ left: sel.left, top: sel.top, width: sel.width, height: sel.height }}
          >
            {image && (
              <img
                src={image}
                alt=""
                draggable={false}
                className="absolute max-w-none"
                style={{ width: drawW, height: drawH, left: -(sel.left - offX), top: -(sel.top - offY) }}
              />
            )}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
        <span className="rounded-full bg-black/60 px-4 py-2 text-[13px] text-white shadow-soft">
          Arrastra para elegir un área · Enter para toda la pantalla · Esc para cancelar
        </span>
      </div>
    </motion.div>
  )
}
