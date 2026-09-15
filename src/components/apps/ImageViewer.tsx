import { useState } from 'react'
import type { Win } from '../../state/windows'
import { useBlobUrl, useFileNode } from '../../lib/hooks'
import { FileMissing, Opening } from './FileState'
import { formatBytes } from '../../lib/utils'

export function ImageViewer({ win }: { win: Win }) {
  const nodeId = win.props.nodeId ?? ''
  const { status, node } = useFileNode(nodeId)
  const url = useBlobUrl(nodeId, node?.updatedAt)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  if (status === 'trashed' || status === 'gone') return <FileMissing winId={win.id} nodeId={nodeId} status={status} name={win.title} />

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {url ? (
          <img
            src={url}
            alt={node?.name ?? ''}
            draggable={false}
            onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="no-drag max-h-full max-w-full rounded-lg object-contain shadow-soft"
          />
        ) : (
          <Opening />
        )}
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-t border-line px-4 text-[11px] text-ink-3">
        <span className="truncate">{node?.name}</span>
        <span className="shrink-0 tabular-nums">
          {dims ? `${dims.w} × ${dims.h}` : ''}
          {node ? ` · ${formatBytes(node.size)}` : ''}
        </span>
      </div>
    </div>
  )
}
