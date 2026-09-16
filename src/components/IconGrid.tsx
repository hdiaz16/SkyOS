import { useRef } from 'react'
import { AnimatePresence } from 'motion/react'
import type { FsNode } from '../kernel/types'
import { useUi, DESKTOP_SURFACE } from '../state/ui'
import { NodeIcon, type PickMode } from './NodeIcon'

interface Props {
  nodes: FsNode[]
  onOpenFolder?: (id: string) => void
  /** Animate reflow when items appear or disappear. Off by default so movable windows stay crisp. */
  animateLayout?: boolean
  /** Which surface these icons belong to, so a selection never spans two of them. */
  surface?: string
  className?: string
}

export function IconGrid({ nodes, onOpenFolder, animateLayout = false, surface = DESKTOP_SURFACE, className }: Props) {
  /** Where a range starts: the last icon picked without Shift. */
  const anchor = useRef<string | null>(null)

  const pick = (id: string, mode: PickMode) => {
    const ui = useUi.getState()
    const ids = nodes.map((n) => n.id)
    // Shift used to fall through to "replace the selection with this one": you picked the first file, shift
    // clicked the fifth expecting five, and were left holding one.
    if (mode === 'range' && anchor.current && anchor.current !== id) {
      const a = ids.indexOf(anchor.current)
      const b = ids.indexOf(id)
      if (a >= 0 && b >= 0) {
        ui.select(ids.slice(Math.min(a, b), Math.max(a, b) + 1), surface)
        return
      }
    }
    anchor.current = id
    if (mode === 'toggle') ui.toggleSelect(id, surface)
    else ui.select([id], surface)
  }

  return (
    <div
      className={className}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 104px)', gap: '4px 6px', alignContent: 'start' }}
    >
      <AnimatePresence initial={false}>
        {nodes.map((n) => (
          <NodeIcon key={n.id} node={n} onOpenFolder={onOpenFolder} animateLayout={animateLayout} surface={surface} onPick={pick} />
        ))}
      </AnimatePresence>
    </div>
  )
}
