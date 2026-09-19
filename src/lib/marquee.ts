import { useCallback, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { useUi } from '../state/ui'

export interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

/** A press that travels less than this is a click, and a click on empty ground only clears the selection. */
const DRAG_THRESHOLD = 4

/**
 * Selection by rectangle: press on empty ground, drag, and every icon the rectangle touches is selected — the
 * way every desktop has done it since there were desktops, and the one thing dragging on empty ground did
 * not do here (it only cleared). The rectangle lives in the container's coordinates, scroll included, so it
 * also works inside an Archivos window; icons are found by their `data-node` boxes, so the grid never has to
 * know. Whatever gets selected belongs to the surface that asked, like any other selection.
 */
export function useMarquee(containerRef: RefObject<HTMLElement | null>, surface: string): { rect: MarqueeRect | null; onPointerDown: (e: ReactPointerEvent) => void } {
  const [rect, setRect] = useState<MarqueeRect | null>(null)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      // Icons drag themselves; controls click; the ground is what is left.
      if (target.closest('[data-node], button, input, textarea, select, a, [data-board], [data-selection-menu]')) return
      const el = containerRef.current
      if (!el) return
      const box = el.getBoundingClientRect()
      const point = (ev: { clientX: number; clientY: number }) => ({ x: ev.clientX - box.left + el.scrollLeft, y: ev.clientY - box.top + el.scrollTop })
      const start = point(e)
      let moved = false

      const move = (ev: PointerEvent) => {
        const cur = point(ev)
        if (!moved && Math.abs(cur.x - start.x) < DRAG_THRESHOLD && Math.abs(cur.y - start.y) < DRAG_THRESHOLD) return
        moved = true
        const r: MarqueeRect = {
          left: Math.min(start.x, cur.x),
          top: Math.min(start.y, cur.y),
          width: Math.abs(cur.x - start.x),
          height: Math.abs(cur.y - start.y),
        }
        setRect(r)
        const ids: string[] = []
        for (const node of el.querySelectorAll<HTMLElement>('[data-node]')) {
          const b = node.getBoundingClientRect()
          const left = b.left - box.left + el.scrollLeft
          const top = b.top - box.top + el.scrollTop
          const touches = left < r.left + r.width && left + b.width > r.left && top < r.top + r.height && top + b.height > r.top
          if (touches && node.dataset.node) ids.push(node.dataset.node)
        }
        useUi.getState().select(ids, surface)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        setRect(null)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [containerRef, surface],
  )

  return { rect, onPointerDown }
}
