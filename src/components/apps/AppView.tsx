import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ExternalLink, Loader2, Search, Settings2, Sparkles } from 'lucide-react'
import { dispatch } from '../../kernel/commands'
import type { Win } from '../../state/windows'
import { catalogFor } from '../../mcp/catalog'
import { mcp, useMcp } from '../../mcp/manager'
import type { CallToolResult, McpServerRecord, McpTool } from '../../mcp/types'
import { useSession } from '../../ai/session'
import { Markdown } from '../Markdown'
import { notionPage } from '../../mcp/notionText'
import { AppLogo } from './Apps'
import { cn } from '../../lib/utils'

/**
 * A connected app, opened from the dock. The apps themselves refuse to be shown inside another site, so Sky
 * shows what it can reach through their tools: Notion gets a native reader (recent pages, search, page
 * content); every other app gets its capabilities and a line to ask Sky about it.
 */
export function AppView({ win }: { win: Win }) {
  const id = win.props.app ?? ''
  const record = useMcp((s) => s.servers.find((r) => r.id === id))
  const entry = catalogFor(id)
  if (!record || record.status === 'disconnected') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[13px] text-ink-3">
        <p>{entry?.name ?? 'Esta app'} no está conectada.</p>
        <button type="button" onClick={() => void dispatch('ui.openApps', { app: id })} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-soft hover:brightness-110">
          Conectar en Ajustes
        </button>
      </div>
    )
  }
  const item = { id, name: record.name, color: entry?.color ?? '#6B7280', abbr: entry?.abbr ?? record.name.slice(0, 2), entry }
  return (
    <div className="flex h-full flex-col bg-surface-solid">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <AppLogo item={item} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ink">{record.name}</p>
          <p className="truncate text-[11px] text-ink-3">
            {record.account?.name ? `${record.account.name} · ` : ''}
            {record.tools?.length ?? 0} herramientas
          </p>
        </div>
        {entry?.webUrl && (
          <a href={entry.webUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink">
            Abrir en {record.name}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button type="button" onClick={() => void dispatch('ui.openApps', { app: id })} aria-label="Ajustes de la app" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-ink">
          <Settings2 className="h-4 w-4" />
        </button>
      </header>
      {id === 'notion' ? <NotionView record={record} /> : <GenericView record={record} />}
    </div>
  )
}

/* ---------- shared ---------- */

/** The text of a tool result, JSON-parsed when it is JSON. */
function payload(result: CallToolResult): unknown {
  const text = (result.content ?? [])
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function AskSky({ placeholder, prefix }: { placeholder: string; prefix: string }) {
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = text.trim()
    if (!q) return
    setText('')
    useSession.getState().setOpen(true)
    void useSession.getState().send(`${prefix} ${q}`)
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t border-line bg-surface-2/60 px-3 py-2">
      <Sparkles className="h-4 w-4 shrink-0 text-accent" />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
      <button type="submit" disabled={!text.trim()} className="rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40">
        Pedir
      </button>
    </form>
  )
}

/* ---------- Notion ---------- */

interface NotionPage {
  id?: string
  title: string
  url: string
  highlight?: string
  timestamp?: string
}

interface OpenPage extends NotionPage {
  text: string
}

const asPages = (data: unknown): NotionPage[] => {
  const results = (data as { results?: unknown[] } | null)?.results
  if (!Array.isArray(results)) return []
  return results
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({ id: r.id as string | undefined, title: String(r.title ?? 'Sin título'), url: String(r.url ?? ''), highlight: r.highlight as string | undefined, timestamp: r.timestamp as string | undefined }))
    .filter((p) => p.url)
}

function NotionView({ record }: { record: McpServerRecord }) {
  const [recent, setRecent] = useState<NotionPage[] | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NotionPage[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState<OpenPage | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    mcp
      .callTool(record.id, 'notion-list-recent-pages', { limit: 20 })
      .then((r) => alive && setRecent(asPages(payload(r))))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'No pude leer Notion'))
    return () => {
      alive = false
    }
  }, [record.id])

  const search = async (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    setSearching(true)
    try {
      const r = await mcp.callTool(record.id, 'notion-search', { query: q, query_type: 'internal', page_size: 12 })
      setResults(asPages(payload(r)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La búsqueda no respondió')
    } finally {
      setSearching(false)
    }
  }

  const openPage = async (page: NotionPage) => {
    setOpening(page.url)
    try {
      const r = await mcp.callTool(record.id, 'notion-fetch', { id: page.url })
      const parsed = notionPage(payload(r) as { title?: string; text?: string } | string)
      setOpen({ ...page, title: parsed.title ?? page.title, text: parsed.markdown })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude abrir la página')
    } finally {
      setOpening(null)
    }
  }

  const list = results ?? recent

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-line">
          <form onSubmit={(e) => void search(e)} className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-3" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (!e.target.value.trim()) setResults(null)
              }}
              placeholder="Buscar en Notion"
              className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
            />
            {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-3" />}
          </form>
          <p className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-ink-3">{results ? `Resultados (${results.length})` : 'Recientes'}</p>
          <ul className="scrollbar-thin flex-1 overflow-y-auto p-2">
            {list === null && !error && (
              <li className="flex items-center gap-2 px-2 py-2 text-[12px] text-ink-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo…
              </li>
            )}
            {list?.length === 0 && <li className="px-2 py-2 text-[12px] text-ink-3">Nada por aquí.</li>}
            {list?.map((p) => (
              <li key={p.url}>
                <button
                  type="button"
                  onClick={() => void openPage(p)}
                  className={cn('flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2', open?.url === p.url && 'bg-accent-soft')}
                >
                  <span className="flex w-full items-center gap-1.5 text-[13px] text-ink">
                    <span className="truncate">{p.title}</span>
                    {opening === p.url && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-ink-3" />}
                  </span>
                  {p.highlight && <span className="line-clamp-2 text-[11px] text-ink-3">{p.highlight.replace(/\*\*/g, '')}</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          {error && <p className="m-4 rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</p>}
          {!open && !error && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[13px] text-ink-3">
              <p>Elige una página para leerla aquí, o pídele a Sky que busque, resuma o cree algo en tu Notion.</p>
            </div>
          )}
          {open && (
            <article className="mx-auto max-w-[640px] px-6 py-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button type="button" onClick={() => setOpen(null)} className="mb-1 flex items-center gap-1 text-[11px] text-ink-3 transition hover:text-ink">
                    <ArrowLeft className="h-3 w-3" /> {results ? 'Resultados' : 'Recientes'}
                  </button>
                  <h1 className="font-display text-[22px] font-bold tracking-tight text-ink">{open.title}</h1>
                </div>
                <a href={open.url} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 text-[11px] text-ink-3 transition hover:text-ink">
                  Abrir en Notion <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <Markdown text={open.text || '_Esta página está vacía._'} className="text-[14px] leading-relaxed text-ink" />
            </article>
          )}
        </section>
      </div>
      <AskSky placeholder={open ? `Pregúntale a Sky sobre «${open.title}»` : 'Pídele algo a Sky sobre tu Notion'} prefix={open ? `En Notion, sobre la página «${open.title}» (${open.url}):` : 'En Notion:'} />
    </div>
  )
}

/* ---------- any other app ---------- */

function GenericView({ record }: { record: McpServerRecord }) {
  const tools: McpTool[] = record.tools ?? []
  const featured = new Set(catalogFor(record.id)?.featuredTools ?? [])
  const shown = [...tools].sort((a, b) => Number(featured.has(b.name)) - Number(featured.has(a.name))).slice(0, 24)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        <p className="text-[13px] leading-relaxed text-ink-2">
          {record.name} no permite mostrarse dentro de otro sitio, pero Sky llega a todo lo que la app expone. Pídeselo abajo con tus palabras; esto es lo que puede hacer:
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {shown.map((t) => (
            <li key={t.name} className="rounded-xl border border-line px-3 py-2">
              <p className="text-[12px] font-medium text-ink">{t.title ?? t.name.replace(/[-_]/g, ' ')}</p>
              {t.description && <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-3">{t.description}</p>}
            </li>
          ))}
        </ul>
        {tools.length > shown.length && <p className="mt-3 text-[11px] text-ink-3">Y {tools.length - shown.length} herramientas más.</p>}
      </div>
      <AskSky placeholder={`Pídele algo a Sky en ${record.name}`} prefix={`En ${record.name}:`} />
    </div>
  )
}

