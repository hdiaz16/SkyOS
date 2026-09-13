import { AnimatePresence } from 'motion/react'
import type { FsNode } from '../kernel/types'
import { NodeIcon } from './NodeIcon'

interface Props {
  nodes: FsNode[]
  onOpenFolder?: (id: string) => void
  className?: string
}

export function IconGrid({ nodes, onOpenFolder, className }: Props) {
  return (
    <div
      className={className}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 104px)', gap: '4px 6px', alignContent: 'start' }}
    >
      <AnimatePresence initial={false}>
        {nodes.map((n) => (
          <NodeIcon key={n.id} node={n} onOpenFolder={onOpenFolder} />
        ))}
      </AnimatePresence>
    </div>
  )
}
