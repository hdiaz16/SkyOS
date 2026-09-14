import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Loader2, Minus, Plus, Scan, Sparkles } from 'lucide-react'
import { fs } from '../../kernel/fs'
import type { Win } from '../../state/windows'
import { useBlobUrl } from '../../lib/hooks'

// pdf.js renders in a worker; Vite bundles it from the installed package.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/**
 * PDFs rendered page by page with pdf.js: real text you can select. Selecting a passage brings up the window's
 * in-context menu (summarize, translate, explain); the browser's own find (Ctrl F) works on the text layer.
 */
export function PdfViewer({ win }: { win: Win }) {
  const nodeId = win.props.nodeId ?? ''
  const node = useLiveQuery(() => fs.get(nodeId), [nodeId])
  const url = useBlobUrl(nodeId, node?.updatedAt)
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [zoom, setZoom] = useState(1)
  const [pages, setPages] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = container.current
    if (!el) return
    const measure = () => setWidth(Math.max(280, el.clientWidth - 48))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const step = (dir: 1 | -1) => {
    const i = ZOOM_STEPS.findIndex((z) => Math.abs(z - zoom) < 0.01)
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (i === -1 ? 4 : i) + dir))]
    setZoom(next)
  }

  if (!url) return <Message text="Abriendo…" spinner />
  if (failed) return <Message text="No pude leer este PDF. Puede estar dañado o protegido." />

  return (
    <div className="flex h-full flex-col bg-surface-2">
      <div className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1 text-[12px] text-ink-2">
        <span className="px-2 tabular-nums">{pages ? `${pages} página${pages === 1 ? '' : 's'}` : '…'}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => step(-1)} aria-label="Alejar" className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-surface-2 hover:text-ink">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => step(1)} aria-label="Acercar" className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-surface-2 hover:text-ink">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => setZoom(1)} className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 transition hover:bg-surface-2 hover:text-ink">
          <Scan className="h-3.5 w-3.5" />
          Ajustar
        </button>
        <span className="ml-2 hidden items-center gap-1 text-ink-3 sm:flex">
          <Sparkles className="h-3 w-3" />
          Selecciona texto para pedírselo a Sky
        </span>
      </div>

      <div ref={container} className="scrollbar-thin relative flex-1 select-text overflow-auto px-6 py-4">
        <Document
          file={url}
          onLoadSuccess={(doc) => setPages(doc.numPages)}
          onLoadError={() => setFailed(true)}
          loading={<Message text="Preparando las páginas…" spinner />}
          className="flex flex-col items-center gap-4"
        >
          {Array.from({ length: pages }, (_, i) => (
            <Page
              key={i}
              pageNumber={i + 1}
              width={Math.round(width * zoom)}
              renderTextLayer
              renderAnnotationLayer
              className="overflow-hidden rounded-md shadow-[0_8px_28px_rgb(0_0_0/0.12)]"
              loading={<div style={{ width: Math.round(width * zoom), height: Math.round(width * zoom * 1.3) }} className="rounded-md bg-surface-solid" />}
            />
          ))}
        </Document>
      </div>
    </div>
  )
}

function Message({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-[13px] text-ink-3">
      {spinner && <Loader2 className="h-4 w-4 animate-spin" />}
      {text}
    </div>
  )
}
