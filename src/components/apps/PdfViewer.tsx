import { useLiveQuery } from 'dexie-react-hooks'
import { fs } from '../../kernel/fs'
import type { Win } from '../../state/windows'
import { useBlobUrl } from '../../lib/hooks'

export function PdfViewer({ win }: { win: Win }) {
  const nodeId = win.props.nodeId ?? ''
  const node = useLiveQuery(() => fs.get(nodeId), [nodeId])
  const url = useBlobUrl(nodeId, node?.updatedAt)

  if (!url) return <div className="flex h-full items-center justify-center text-[13px] text-ink-3">Abriendo…</div>
  return <iframe src={url} title={node?.name ?? 'Documento'} className="h-full w-full border-0 bg-surface-solid" />
}
