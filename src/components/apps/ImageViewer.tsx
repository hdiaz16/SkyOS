import { useEffect, useState } from 'react'
import { useWindows, type Win } from '../../state/windows'
import { useBlobUrl, useFileNode } from '../../lib/hooks'
import { FileMissing, Opening } from './FileState'
import { formatBytes } from '../../lib/utils'

export function ImageViewer({ win }: { win: Win }) {
  const nodeId = win.props.nodeId ?? ''
  const { status, node } = useFileNode(nodeId)
  const { url, missing } = useBlobUrl(node)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  /** A .heic from a phone, a .tiff, a truncated png: the browser simply paints nothing and says nothing. */
  const [broken, setBroken] = useState(false)

  // The title bar and the Dock said the old name after a rename while the foot of this same window showed the
  // new one, and FileMissing announced a name that no longer existed.
  useEffect(() => {
    if (node?.name) useWindows.getState().setTitle(win.id, node.name)
  }, [node?.name, win.id])

  if (status === 'trashed' || status === 'gone') {
    return <FileMissing winId={win.id} nodeId={nodeId} status={status} name={node?.name ?? win.title} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {missing || broken ? (
          <p className="max-w-[320px] text-center text-[13px] leading-relaxed text-ink-3">
            {missing ? 'El contenido de esta imagen no está donde debería.' : 'No pude mostrar esta imagen: el navegador no abre este formato.'}
          </p>
        ) : url ? (
          <img
            src={url}
            alt={node?.name ?? ''}
            draggable={false}
            onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setBroken(true)}
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
