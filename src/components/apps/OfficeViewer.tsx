import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2 } from 'lucide-react'
import type { PPTXPreviewer } from 'pptx-preview'
import { fs } from '../../kernel/fs'
import { fileKind } from '../../kernel/types'
import type { Win } from '../../state/windows'
import { cn } from '../../lib/utils'

/**
 * Word, Excel and PowerPoint files, read inside Sky. Rendering happens in the browser, nothing leaves the
 * machine: docx-preview lays out documents, SheetJS reads workbooks, pptx-preview draws slides.
 * The libraries load on demand so the desktop bundle stays light.
 */
export function OfficeViewer({ win }: { win: Win }) {
  const nodeId = win.props.nodeId ?? ''
  const node = useLiveQuery(() => fs.get(nodeId), [nodeId])
  const key = `${nodeId}:${node?.updatedAt ?? 0}`
  // Keyed by file version, so a new version shows "Abriendo…" without resetting state inside the effect.
  const [loaded, setLoaded] = useState<{ key: string; blob: Blob | null; error?: string } | null>(null)

  useEffect(() => {
    let alive = true
    fs.readBlob(nodeId)
      .then((blob) => alive && setLoaded({ key, blob, error: blob ? undefined : 'No encontré el contenido del archivo.' }))
      .catch((err: unknown) => alive && setLoaded({ key, blob: null, error: err instanceof Error ? err.message : 'No se pudo leer el archivo' }))
    return () => {
      alive = false
    }
  }, [nodeId, key])

  const current = loaded?.key === key ? loaded : null
  if (current?.error) return <Message text={current.error} />
  if (!node || !current?.blob) return <Message text="Abriendo…" spinner />
  const kind = fileKind(node)
  if (kind === 'document') return <DocumentView blob={current.blob} />
  if (kind === 'spreadsheet') return <SpreadsheetView blob={current.blob} />
  if (kind === 'presentation') return <PresentationView blob={current.blob} />
  return <Message text={`Todavía no hay un visor para "${node.name}".`} />
}

function Message({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-[13px] text-ink-3">
      {spinner && <Loader2 className="h-4 w-4 animate-spin" />}
      {text}
    </div>
  )
}

type Status = 'loading' | 'ready' | 'error'

/** Render status for the blob currently on screen; a new blob reads as "loading" until its own status lands. */
function useRenderStatus(blob: Blob): [Status, (status: Status) => void] {
  const [state, setState] = useState<{ blob: Blob; status: Status } | null>(null)
  const status: Status = state?.blob === blob ? state.status : 'loading'
  return [status, (next) => setState({ blob, status: next })]
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

/* ---------- Excel ---------- */

interface Sheet {
  name: string
  rows: unknown[][]
  truncated: boolean
}

const MAX_ROWS = 500
const MAX_COLS = 60

const columnName = (i: number): string => {
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function SpreadsheetView({ blob }: { blob: Blob }) {
  const [parsed, setParsed] = useState<{ blob: Blob; sheets: Sheet[] | null; error?: string } | null>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([import('xlsx'), blob.arrayBuffer()])
      .then(([xlsx, buffer]) => {
        const wb = xlsx.read(buffer, { type: 'array', cellDates: true })
        const sheets: Sheet[] = wb.SheetNames.map((name) => {
          const all = xlsx.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '', raw: false })
          return { name, rows: all.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS)), truncated: all.length > MAX_ROWS }
        })
        if (alive) setParsed({ blob, sheets })
      })
      .catch(() => alive && setParsed({ blob, sheets: null, error: 'No pude leer esta hoja de cálculo.' }))
    return () => {
      alive = false
    }
  }, [blob])

  const current = parsed?.blob === blob ? parsed : null
  if (current?.error) return <Message text={current.error} />
  if (!current?.sheets) return <Message text="Leyendo las hojas…" spinner />
  const sheets = current.sheets
  const index = Math.min(active, sheets.length - 1)
  const sheet = sheets[index]
  const cols = sheet.rows.reduce((m, r) => Math.max(m, r.length), 0)

  return (
    <div className="flex h-full flex-col bg-surface-solid">
      <div className="scrollbar-thin flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-[12px] tabular-nums">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-10 border-b border-r border-line bg-surface-2 px-2 py-1 text-right text-[11px] font-normal text-ink-3" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="border-b border-r border-line bg-surface-2 px-2 py-1 text-center text-[11px] font-medium text-ink-2">
                  {columnName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r} className="hover:bg-surface-2/60">
                <td className="border-b border-r border-line bg-surface-2 px-2 py-1 text-right text-[11px] text-ink-3">{r + 1}</td>
                {Array.from({ length: cols }, (_, c) => {
                  const v = row[c]
                  const text = v === undefined || v === null ? '' : String(v)
                  const numeric = text !== '' && !Number.isNaN(Number(text.replace(/[,$%\s]/g, '')))
                  return (
                    <td key={c} className={cn('max-w-[280px] truncate border-b border-r border-line px-2 py-1 text-ink', numeric && 'text-right', r === 0 && 'font-medium')} title={text}>
                      {text}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.truncated && <p className="px-3 py-2 text-[11px] text-ink-3">Se muestran las primeras {MAX_ROWS} filas.</p>}
      </div>
      <div className="flex items-center gap-1 overflow-x-auto border-t border-line bg-surface-2 px-2 py-1">
        {sheets.map((s, i) => (
          <button
            key={s.name}
            type="button"
            onClick={() => setActive(i)}
            className={cn('rounded-md px-2.5 py-1 text-[12px] transition', i === index ? 'bg-surface-solid font-medium text-ink shadow-soft' : 'text-ink-2 hover:text-ink')}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- PowerPoint ---------- */

function PresentationView({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useRenderStatus(blob)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    let previewer: PPTXPreviewer | null = null
    el.replaceChildren()
    const width = Math.max(320, el.clientWidth - 32)
    Promise.all([import('pptx-preview'), blob.arrayBuffer()])
      .then(([{ init }, buffer]) => {
        if (!alive) return
        previewer = init(el, { width, height: Math.round((width * 9) / 16), mode: 'list' })
        return previewer.preview(buffer)
      })
      .then(() => alive && setStatus('ready'))
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
      previewer?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob])

  return (
    <div className="scrollbar-thin relative h-full overflow-auto bg-surface-2 p-4">
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-2/80">
          <Message text="Dibujando las diapositivas…" spinner />
        </div>
      )}
      {status === 'error' && <Message text="No pude leer esta presentación. Puede estar dañada o en un formato antiguo (.ppt)." />}
      <div ref={ref} className={cn('office-slides mx-auto', status !== 'ready' && 'invisible')} />
    </div>
  )
}
