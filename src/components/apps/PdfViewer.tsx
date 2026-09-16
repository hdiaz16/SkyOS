import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Loader2, Minus, Plus, Scan, Sparkles } from 'lucide-react'
import { FileMissing } from './FileState'
import type { Win } from '../../state/windows'
import { useBlobUrl, useFileNode } from '../../lib/hooks'
import { useWindows } from '../../state/windows'

// pdf.js renders in a worker; Vite bundles it from the installed package.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
/** Height of a page that has not rendered yet, as a fraction of its width. A4 is the honest default. */
const TALL_GUESS = 1.414

/**
 * PDFs rendered page by page with pdf.js: real text you can select. Selecting a passage brings up the window's
 * in-context menu (summarize, translate, explain); the browser's own find (Ctrl F) works on the text layer.
 */
export function PdfViewer({ win }: { win: Win }) {
  const nodeId = win.props.nodeId ?? ''
  const { status, node } = useFileNode(nodeId)
  const { url, missing } = useBlobUrl(node)
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [zoom, setZoom] = useState(1)
  const [pages, setPages] = useState(0)
  const [failed, setFailed] = useState(false)
  const [locked, setLocked] = useState(false)
  /** Each page's real height ÷ width once it has rendered, so the placeholders of the pages still far away
   *  hold the scrollbar in place instead of jumping when they arrive. */
  const [aspects, setAspects] = useState<Record<number, number>>({})
  const learnAspect = (page: number, aspect: number) => {
    setAspects((known) => (known[page] === aspect ? known : { ...known, [page]: aspect }))
  }

  useEffect(() => {
    const el = container.current
    if (!el) return
    // Dragging the window's border fired this on every pixel, and each measure re-rasterised every mounted
    // page: with a big PDF open, resizing the window froze the desk. The trailing edge is enough — the width
    // the pages are drawn at only matters once the person has let go.
    let timer = 0
    const measure = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setWidth(Math.max(280, el.clientWidth - 48)), 120)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      window.clearTimeout(timer)
      ro.disconnect()
    }
  }, [])

  // Renaming an open file left the title bar and the Dock on the old name while the window itself showed the
  // new one; the same stale name then turned up in "está en la papelera".
  useEffect(() => {
    if (node?.name) useWindows.getState().setTitle(win.id, node.name)
  }, [node?.name, win.id])

  const step = (dir: 1 | -1) => {
    const i = ZOOM_STEPS.findIndex((z) => Math.abs(z - zoom) < 0.01)
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (i === -1 ? 4 : i) + dir))]
    setZoom(next)
  }
  // At 50% or 300% the − and the + kept looking alive; pressing them did nothing, which reads as stuck.
  const atFloor = Math.abs(zoom - ZOOM_STEPS[0]) < 0.01
  const atCeil = Math.abs(zoom - ZOOM_STEPS[ZOOM_STEPS.length - 1]) < 0.01

  if (status === 'trashed' || status === 'gone') {
    return <FileMissing winId={win.id} nodeId={nodeId} status={status} name={node?.name ?? win.title} />
  }
  if (missing) return <Message text="El contenido de este archivo no está donde debería." />
  if (locked) return <Message text="Este PDF pide una contraseña, y aquí todavía no puedo pedírtela." />
  if (failed) return <Message text="No pude leer este PDF. Puede estar dañado." />
  if (!url) return <Message text="Abriendo…" spinner />

  return (
    <div className="flex h-full flex-col bg-surface-2">
      <div className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1 text-[12px] text-ink-2">
        <span className="px-2 tabular-nums">{pages ? `${pages} página${pages === 1 ? '' : 's'}` : '…'}</span>
        <span className="flex-1" />
        <button type="button" disabled={atFloor} onClick={() => step(-1)} aria-label="Alejar" className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" disabled={atCeil} onClick={() => step(1)} aria-label="Acercar" className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent">
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
          // Without this, react-pdf opens the browser's own prompt() — in English, unclosable, on top of
          // everything. Refusing turns it into a message of ours.
          onPassword={() => setLocked(true)}
          // A link inside a PDF was taking the whole desktop with it.
          externalLinkTarget="_blank"
          externalLinkRel="noopener noreferrer"
          loading={<Message text="Preparando las páginas…" spinner />}
          className="flex w-max min-w-full flex-col items-center gap-4"
        >
          {Array.from({ length: pages }, (_, i) => (
            <PdfPage key={i} pageNumber={i + 1} width={Math.round(width * zoom)} aspects={aspects} onAspect={learnAspect} />
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

/**
 * One page, rendered only when it is near the viewport. A PDF of a few hundred pages used to mount every
 * `<Page>` at once —canvas, text layer and annotations for each— and that was hundreds of window-sized
 * canvases: the tab froze or died on open. Far-away pages stay as a placeholder of the height the page turned
 * out to have, and a page that scrolls away is unmounted to give its memory back.
 */
function PdfPage({ pageNumber, width, aspects, onAspect }: { pageNumber: number; width: number; aspects: Record<number, number>; onAspect: (page: number, aspect: number) => void }) {
  const holder = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = holder.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: el.closest('.scrollbar-thin') ?? null, rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const aspect = aspects[pageNumber] ?? TALL_GUESS
  return (
    <div ref={holder} style={{ height: Math.round(width * aspect) }} className="w-full">
      {near ? (
        <Page
          pageNumber={pageNumber}
          width={width}
          renderTextLayer
          renderAnnotationLayer
          onRenderSuccess={(page: PDFPageProxy) => {
            const box = page.getViewport({ scale: 1 })
            onAspect(pageNumber, box.height / box.width)
          }}
          className="overflow-hidden rounded-md shadow-[0_8px_28px_rgb(0_0_0/0.12)]"
          loading={<div style={{ width, height: Math.round(width * aspect) }} className="rounded-md bg-surface-solid" />}
        />
      ) : (
        <div style={{ width, height: Math.round(width * aspect) }} className="rounded-md bg-surface-solid" />
      )}
    </div>
  )
}
