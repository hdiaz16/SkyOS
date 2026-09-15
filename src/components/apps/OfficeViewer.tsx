import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { LayoutList, Loader2, Presentation } from 'lucide-react'
import type { PPTXPreviewer } from 'pptx-preview'
import { fs } from '../../kernel/fs'
import { FileMissing } from './FileState'
import { useFileNode } from '../../lib/hooks'
import { fileKind } from '../../kernel/types'
import { useWindows, type Win } from '../../state/windows'
import { cn } from '../../lib/utils'

/**
 * Word, Excel and PowerPoint files inside Sky, rendered in the browser so nothing leaves the machine:
 * docx-preview lays out documents, FortuneSheet turns workbooks into an editable grid, pptx-preview draws
 * slides. Every engine loads on demand so the desktop bundle stays light.
 */
export function OfficeViewer({ win }: { win: Win }) {
  const nodeId = win.props.nodeId ?? ''
  const { status, node } = useFileNode(nodeId)
  const stamp = node?.contentAt ?? node?.updatedAt ?? 0
  /** The version the grid inside wrote itself, which is not a reason to reopen anything. */
  const ours = useRef(0)
  // Keyed by file version, so a new version shows "Abriendo…" without resetting state inside the effect.
  const [loaded, setLoaded] = useState<{ id: string; version: number; blob: Blob | null; error?: string } | null>(null)

  useEffect(() => {
    // Pressing Guardar in row 400 of sheet 3 used to reopen the file: «Abriendo…», «Leyendo las hojas…», and
    // back to A1 of sheet 1 with no undo history. That version is ours; someone else's still reopens it.
    if (stamp && stamp === ours.current) return
    let alive = true
    fs.readBlob(nodeId)
      .then((blob) => alive && setLoaded({ id: nodeId, version: stamp, blob, error: blob ? undefined : 'No encontré el contenido del archivo.' }))
      .catch(
        (err: unknown) =>
          alive && setLoaded({ id: nodeId, version: stamp, blob: null, error: err instanceof Error ? err.message : 'No se pudo leer el archivo' }),
      )
    return () => {
      alive = false
    }
  }, [nodeId, stamp])

  // Renaming an open file left the title bar and the Dock on the old name.
  useEffect(() => {
    if (node?.name) useWindows.getState().setTitle(win.id, node.name)
  }, [node?.name, win.id])

  const current = loaded?.id === nodeId ? loaded : null
  if (status === 'trashed' || status === 'gone') {
    return <FileMissing winId={win.id} nodeId={nodeId} status={status} name={node?.name ?? win.title} />
  }
  if (current?.error) return <Message text={current.error} />
  if (!node || !current?.blob) return <Message text="Abriendo…" spinner />
  const kind = fileKind(node)
  if (kind === 'document') return <DocumentView blob={current.blob} />
  if (kind === 'spreadsheet') {
    return (
      <Suspense fallback={<Message text="Preparando la hoja de cálculo…" spinner />}>
        <SheetEditor
          key={`${current.id}:${current.version}`}
          blob={current.blob}
          nodeId={nodeId}
          name={node.name}
          onSaved={(written) => {
            ours.current = written
          }}
        />
      </Suspense>
    )
  }
  if (kind === 'presentation') return <PresentationView blob={current.blob} />
  return <Message text={`Todavía no hay un visor para "${node.name}".`} />
}

const SheetEditor = lazy(() => import('./SheetEditor'))

function Message({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-[13px] text-ink-3">
      {spinner && <Loader2 className="h-4 w-4 animate-spin" />}
      {text}
    </div>
  )
}

type Status = 'loading' | 'ready' | 'error'

/** Render status for the blob (and mode) on screen; a new one reads as "loading" until its own status lands. */
function useRenderStatus(key: unknown): [Status, (status: Status) => void] {
  const [state, setState] = useState<{ key: unknown; status: Status } | null>(null)
  const status: Status = state && state.key === key ? state.status : 'loading'
  return [status, (next) => setState({ key, status: next })]
}

/* ---------- Word ---------- */

function DocumentView({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useRenderStatus(blob)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    el.replaceChildren()
    import('docx-preview')
      .then(({ renderAsync }) => renderAsync(blob, el, undefined, { inWrapper: true, ignoreWidth: false, breakPages: true, useBase64URL: true, className: 'docx' }))
      .then(() => alive && setStatus('ready'))
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob])

  return (
    <div className="scrollbar-thin relative h-full overflow-auto bg-surface-2">
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-2/80">
          <Message text="Preparando el documento…" spinner />
        </div>
      )}
      {status === 'error' && <Message text="No pude leer este documento. Puede estar dañado o en un formato antiguo (.doc)." />}
      <div ref={ref} className={cn('office-doc py-4', status !== 'ready' && 'invisible')} />
    </div>
  )
}

/* ---------- PowerPoint ---------- */

type SlideMode = 'list' | 'slide'

function PresentationView({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<SlideMode>('list')
  const [width, setWidth] = useState(0)
  const [status, setStatus] = useRenderStatus(`${mode}:${width}`)

  /**
   * pptx-preview draws at a fixed size, decided once. Opening a deck and then maximising the window left the
   * slides at their original size in the middle of a huge empty area, and making the window smaller pushed them
   * past the frame. So the frame is watched and the deck redrawn — a beat after the drag stops, and only when
   * the width really moved, because redrawing means parsing the file again.
   */
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    let timer = 0
    let first = true
    const measure = () => setWidth((w) => (Math.abs(Math.max(320, box.clientWidth - 32) - w) < 24 ? w : Math.max(320, box.clientWidth - 32)))
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      // The first call arrives the moment it starts watching: that one is the size it opened at, not a resize.
      timer = window.setTimeout(measure, first ? 0 : 250)
      first = false
    })
    observer.observe(box)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || !width) return
    let alive = true
    let previewer: PPTXPreviewer | null = null
    el.replaceChildren()
    Promise.all([import('pptx-preview'), blob.arrayBuffer()])
      .then(([{ init }, buffer]) => {
        if (!alive) return
        previewer = init(el, { width, height: Math.round((width * 9) / 16), mode })
        return previewer.preview(buffer)
      })
      .then(() => alive && setStatus('ready'))
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
      previewer?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob, mode, width])

  return (
    <div className="flex h-full flex-col bg-surface-2">
      <div className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1 text-[12px]">
        <span className="flex-1" />
        <ModeButton active={mode === 'list'} onClick={() => setMode('list')} icon={<LayoutList className="h-3.5 w-3.5" />} label="Todas" />
        <ModeButton active={mode === 'slide'} onClick={() => setMode('slide')} icon={<Presentation className="h-3.5 w-3.5" />} label="Presentar" />
      </div>
      <div ref={boxRef} className="scrollbar-thin relative flex-1 overflow-auto p-4">
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-2/80">
            <Message text="Dibujando las diapositivas…" spinner />
          </div>
        )}
        {status === 'error' && <Message text="No pude leer esta presentación. Puede estar dañada o en un formato antiguo (.ppt)." />}
        <div ref={ref} className={cn('office-slides mx-auto', status !== 'ready' && 'invisible')} />
      </div>
    </div>
  )
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 transition', active ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink')}>
      {icon}
      {label}
    </button>
  )
}
