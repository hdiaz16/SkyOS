import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Check, ChevronDown, ExternalLink, LayoutGrid, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useToasts } from '../../kernel/commands'
import { CATALOG, CATEGORIES, categoryFor, type CatalogEntry, type CategoryId } from '../../mcp/catalog'
import { mcp, useMcp } from '../../mcp/manager'
import { McpError, type McpServerRecord } from '../../mcp/types'
import { cn } from '../../lib/utils'

/**
 * Apps conectadas, inside Ajustes. Opens on categories (what you want to reach), then the apps inside; the
 * flat list is one click away. Connecting is one consent screen; Sky keeps the session alive afterwards.
 */

type View = { kind: 'categories' } | { kind: 'category'; id: CategoryId } | { kind: 'all' }

/** A catalog entry or a custom server, unified for the cards. */
interface AppItem {
  id: string
  name: string
  category: CategoryId
  tagline: string
  abilities: string[]
  color: string
  abbr: string
  url: string
  entry?: CatalogEntry
  record?: McpServerRecord
}

const CUSTOM_COLOR = '#6B7280'

function itemsFrom(servers: McpServerRecord[]): AppItem[] {
  const byId = new Map(servers.map((s) => [s.id, s]))
  const items: AppItem[] = CATALOG.map((c) => {
    const record = byId.get(c.id)
    return { id: c.id, name: record?.name ?? c.name, category: c.category, tagline: c.tagline, abilities: c.abilities, color: c.color, abbr: c.abbr, url: record?.url ?? c.url, entry: c, record }
  })
  for (const s of servers) {
    if (s.catalogId) continue
    items.push({ id: s.id, name: s.name, category: 'custom', tagline: s.serverInfo?.title ?? s.url, abilities: [], color: CUSTOM_COLOR, abbr: s.name.slice(0, 2), url: s.url, record: s })
  }
  return items
}

const isConnected = (r?: McpServerRecord) => !!r && r.status !== 'disconnected'

export function AppsPanel({ highlight }: { highlight?: string }) {
  const servers = useMcp((s) => s.servers)
  const items = useMemo(() => itemsFrom(servers), [servers])
  const [view, setView] = useState<View>(() => {
    const target = highlight ? CATALOG.find((c) => c.id === highlight) : undefined
    return target ? { kind: 'category', id: target.category } : { kind: 'categories' }
  })

  // A new highlight (from ui.openApps) moves the view to its category; adopted during render, not in an effect.
  const [seenHighlight, setSeenHighlight] = useState(highlight)
  if (highlight !== seenHighlight) {
    setSeenHighlight(highlight)
    const target = highlight ? CATALOG.find((c) => c.id === highlight) : undefined
    if (target) setView({ kind: 'category', id: target.category })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-[28px] items-center justify-between gap-3">
        {view.kind === 'categories' ? (
          <p className="text-[12px] text-ink-3">Elige por lo que quieres hacer.</p>
        ) : (
          <button type="button" onClick={() => setView({ kind: 'categories' })} className="flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2.5 text-[13px] font-medium text-ink transition hover:bg-surface-2">
            <ArrowLeft className="h-4 w-4" />
            {view.kind === 'category' ? categoryFor(view.id).name : 'Todas las apps'}
          </button>
        )}
        {view.kind === 'categories' && (
          <button type="button" onClick={() => setView({ kind: 'all' })} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink">
            <LayoutGrid className="h-3.5 w-3.5" />
            Ver todas
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view.kind === 'category' ? view.id : view.kind} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }} transition={{ duration: 0.22 }}>
          {view.kind === 'categories' && <CategoryGrid items={items} onOpen={(id) => setView({ kind: 'category', id })} />}
          {view.kind === 'category' && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-ink-3">{categoryFor(view.id).tagline}</p>
              <AppList items={items.filter((i) => i.category === view.id)} category={view.id} highlight={highlight} />
            </div>
          )}
          {view.kind === 'all' && <AppList items={items} highlight={highlight} grouped />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ---------- categories ---------- */

function CategoryGrid({ items, onOpen }: { items: AppItem[]; onOpen: (id: CategoryId) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {CATEGORIES.map((cat) => {
        const inCat = items.filter((i) => i.category === cat.id)
        const connected = inCat.filter((i) => isConnected(i.record)).length
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onOpen(cat.id)}
            className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-line-2 hover:bg-surface-2"
          >
            <div className="flex items-center gap-1.5">
              {inCat.slice(0, 4).map((i) => (
                <AppLogo key={i.id} item={i} size={30} />
              ))}
              {cat.id === 'custom' && (
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-dashed border-line-2 text-ink-3">
                  <Plus className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <div>
              <p className="text-[14px] font-medium text-ink">{cat.name}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">{cat.tagline}</p>
            </div>
            <p className={cn('text-[11px] font-medium', connected ? 'text-accent' : 'text-ink-3')}>
              {connected ? `${connected} de ${inCat.length} conectada${inCat.length === 1 ? '' : 's'}` : inCat.length ? `${inCat.length} disponible${inCat.length === 1 ? '' : 's'}` : 'Agrega la tuya'}
            </p>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- lists ---------- */

function AppList({ items, category, highlight, grouped }: { items: AppItem[]; category?: CategoryId; highlight?: string; grouped?: boolean }) {
  if (grouped) {
    return (
      <div className="flex flex-col gap-6">
        {CATEGORIES.map((cat) => {
          const inCat = items.filter((i) => i.category === cat.id)
          if (!inCat.length && cat.id !== 'custom') return null
          return (
            <section key={cat.id} className="flex flex-col gap-2">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{cat.name}</h2>
              {inCat.map((i) => (
                <AppCard key={i.id} item={i} highlighted={i.id === highlight} />
              ))}
              {cat.id === 'custom' && <AddServer />}
            </section>
          )
        })}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((i) => (
        <AppCard key={i.id} item={i} highlighted={i.id === highlight} />
      ))}
      {category === 'custom' && <AddServer />}
    </div>
  )
}

/* ---------- one app ---------- */

function AppCard({ item, highlighted }: { item: AppItem; highlighted: boolean }) {
  const managerBusy = useMcp((s) => s.busy[item.id])
  /** What this card is doing on its own, for the steps the manager does not report. */
  const [localBusy, setLocalBusy] = useState<string | undefined>(undefined)
  const busy = managerBusy ?? localBusy
  const record = item.record
  const connected = isConnected(record)
  const attention = record?.status === 'attention' ? record.attention : undefined
  const [showTools, setShowTools] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlighted])

  const needsClientId = !!item.entry?.preregistered && !item.entry.preregistered() && !record?.manualClient?.clientId

  const connect = async () => {
    try {
      const r = await mcp.connect(item.id)
      useToasts.getState().push({ message: `${r.name} conectado${r.account?.name ? ` como ${r.account.name}` : ''} · ${r.tools?.length ?? 0} herramientas`, kind: 'info' })
    } catch (err) {
      if (err instanceof McpError && err.code === 'cancelled') return
      useToasts.getState().push({ message: err instanceof Error ? err.message : `No se pudo conectar ${item.name}`, kind: 'error' })
    }
  }

  const disconnect = async () => {
    setLocalBusy('Desconectando…')
    try {
      await mcp.disconnect(item.id)
      useToasts.getState().push({ message: `${item.name} desconectado`, kind: 'info' })
    } catch (err) {
      // It was called with `void` and no catch: a failure here left the card saying "Conectada" and nobody
      // was told anything at all.
      useToasts.getState().push({ message: err instanceof Error ? err.message : `No se pudo desconectar ${item.name}`, kind: 'error' })
    } finally {
      setLocalBusy(undefined)
    }
  }

  const refreshTools = async () => {
    try {
      const tools = await mcp.refreshTools(item.id, true)
      useToasts.getState().push({ message: `${item.name}: ${tools.length} herramientas`, kind: 'info' })
    } catch (err) {
      useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo actualizar', kind: 'error' })
    }
  }

  return (
    <div ref={ref} className={cn('rounded-2xl border bg-surface p-4 transition', highlighted ? 'border-accent ring-1 ring-accent/40' : 'border-line')}>
      <div className="flex items-start gap-3">
        <AppLogo item={item} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-medium text-ink">{item.name}</p>
            {connected && !attention && (
              <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-px text-[11px] font-medium text-accent">
                <Check className="h-3 w-3" />
                Conectada
              </span>
            )}
            {attention && <span className="rounded-full bg-amber-500/15 px-2 py-px text-[11px] font-medium text-amber-700 dark:text-amber-400">Atención</span>}
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">{item.tagline}</p>
          {!connected && item.abilities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.abilities.map((a) => (
                <span key={a} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">
                  {a}
                </span>
              ))}
            </div>
          )}
          {/* Not while it needs attention: the refresh token is still stored, so this line read "La sesión se
              renueva sola" right on top of "La sesión ya no se pudo renovar". */}
          {connected && !attention && (
            <p className="mt-1.5 text-[12px] text-ink-3">
              {record?.account?.name ? `Como ${record.account.name}${record.account.email ? ` · ${record.account.email}` : ''} · ` : ''}
              {record?.auth?.tokens?.refreshToken
                ? 'La sesión se renueva sola'
                : record?.auth?.tokens?.expiresAt
                  ? `Sesión válida hasta ${new Date(record.auth.tokens.expiresAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`
                  : 'La sesión no caduca'}
            </p>
          )}
          {attention && <p className="mt-1.5 text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">{attention}</p>}
          {/* A normal person has no idea what a client id is or where one comes from, and the card used to ask
              them for it. Registering the connection is the job of whoever runs this SkyOS, once; after that it
              is one click for everybody. Until then the card says so, and Avanzado is still there for those who
              have their own client. */}
          {!connected && needsClientId && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
              Google no permite conectarse sin que quien administra esta instalación registre antes la conexión (VITE_GOOGLE_CLIENT_ID). En cuanto eso esté, aquí
              será un clic. Si tienes tu propio cliente de Google Cloud, pégalo en Avanzado.
            </p>
          )}
          {busy && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busy}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {connected ? (
          <>
            {attention && (
              <button type="button" disabled={!!busy} onClick={() => void connect()} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40">
                Reconectar
              </button>
            )}
            <button type="button" disabled={!!busy} onClick={() => void disconnect()} className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:opacity-40">
              Desconectar
            </button>
            <button type="button" onClick={() => setShowTools((v) => !v)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink">
              {record?.tools?.length ?? 0} herramientas
              <ChevronDown className={cn('h-3.5 w-3.5 transition', showTools && 'rotate-180')} />
            </button>
            <button type="button" disabled={!!busy} onClick={() => void refreshTools()} aria-label="Actualizar herramientas" className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-ink disabled:opacity-40">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!!busy || !item.url || needsClientId}
            title={needsClientId ? 'Esta instalación aún no tiene registrada la conexión con Google' : undefined}
            onClick={() => void connect()}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40"
          >
            Conectar
          </button>
        )}
        <span className="flex-1" />
        {item.entry?.docsUrl && (
          <a href={item.entry.docsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-ink-3 transition hover:text-ink">
            Documentación
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-[11px] text-ink-3 transition hover:text-ink">
          Avanzado
        </button>
      </div>

      {showTools && record?.tools && (
        <ul className="scrollbar-thin mt-3 flex max-h-60 flex-col gap-1 overflow-y-auto rounded-xl bg-surface-2 p-3">
          {record.tools.map((t) => (
            <li key={t.name} className="text-[12px] leading-relaxed">
              <span className="font-medium text-ink">{t.title ?? t.name}</span>
              {t.description && <span className="text-ink-3"> · {t.description.length > 140 ? `${t.description.slice(0, 140)}…` : t.description}</span>}
            </li>
          ))}
          {record.tools.length === 0 && <li className="text-[12px] text-ink-3">Este servidor no publica herramientas.</li>}
        </ul>
      )}

      {showAdvanced && <Advanced item={item} onDone={() => setShowAdvanced(false)} />}
    </div>
  )
}

/* ---------- advanced: url and hand-registered client ---------- */

function Advanced({ item, onDone }: { item: AppItem; onDone: () => void }) {
  const [url, setUrl] = useState(item.url)
  const [clientId, setClientId] = useState(item.record?.manualClient?.clientId ?? '')
  const [clientSecret, setClientSecret] = useState(item.record?.manualClient?.clientSecret ?? '')
  const custom = !item.entry

  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const manual = clientId.trim() ? { clientId: clientId.trim(), clientSecret: clientSecret.trim() || undefined } : undefined
      const changedClient = (manual?.clientId ?? '') !== (item.record?.manualClient?.clientId ?? '') || (manual?.clientSecret ?? '') !== (item.record?.manualClient?.clientSecret ?? '')
      await mcp.update(item.id, { url: url.trim(), ...(changedClient ? { manualClient: manual } : {}) })
      useToasts.getState().push({ message: 'Guardado. Si cambiaste algo, vuelve a conectar la app.', kind: 'info' })
      onDone()
    } catch (err) {
      useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo guardar', kind: 'error' })
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="mt-3 flex flex-col gap-2.5 rounded-xl bg-surface-2 p-3">
      <Field label="URL del servidor MCP">
        <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} className="h-8 w-full rounded-lg border border-line bg-surface-solid px-2.5 font-mono text-[12px] text-ink outline-none focus:border-accent" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Client id (opcional)">
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} spellCheck={false} placeholder="Solo si el servidor no registra clientes" className="h-8 w-full rounded-lg border border-line bg-surface-solid px-2.5 font-mono text-[12px] text-ink outline-none focus:border-accent" />
        </Field>
        <Field label="Client secret (opcional)">
          <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" className="h-8 w-full rounded-lg border border-line bg-surface-solid px-2.5 font-mono text-[12px] text-ink outline-none focus:border-accent" />
        </Field>
      </div>
      <p className="text-[11px] leading-relaxed text-ink-3">
        Sky se identifica solo ante el servidor de autorización (Client ID Metadata Documents o registro dinámico). Estos campos son para servidores que exigen un cliente registrado a mano, como los de Google.
      </p>
      <div className="flex items-center gap-2">
        <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-soft transition hover:brightness-110">
          Guardar
        </button>
        <button type="button" onClick={onDone} className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface hover:text-ink">
          Cancelar
        </button>
        <span className="flex-1" />
        {custom && (
          <button
            type="button"
            onClick={() => void mcp.remove(item.id).then(() => useToasts.getState().push({ message: `${item.name} eliminado`, kind: 'info' }))}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-3 transition hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </button>
        )}
      </div>
    </form>
  )
}

/* ---------- add any MCP server ---------- */

function AddServer() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const record = await mcp.addCustom(name, url)
      setOpen(false)
      setName('')
      setUrl('')
      useToasts.getState().push({ message: `${record.name} agregado. Ahora conéctalo.`, kind: 'info' })
    } catch (err) {
      useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo agregar', kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-line-2 p-4 text-[13px] text-ink-2 transition hover:border-accent hover:text-ink">
        <Plus className="h-4 w-4" />
        Agregar un servidor MCP por URL
      </button>
    )
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
      <Field label="Nombre">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi servidor" className="h-9 w-full rounded-lg border border-line bg-surface-solid px-2.5 text-[13px] text-ink outline-none focus:border-accent" />
      </Field>
      <Field label="URL (Streamable HTTP)">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/mcp" spellCheck={false} autoFocus className="h-9 w-full rounded-lg border border-line bg-surface-solid px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent" />
      </Field>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving || !url.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40">
          Agregar
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink">
          Cancelar
        </button>
      </div>
    </form>
  )
}

/* ---------- pieces ---------- */

/** The app's official mark on a small tile; custom servers get their initials on a neutral disc. */
export function AppLogo({ item, size }: { item: Pick<AppItem, 'id' | 'name' | 'color' | 'abbr' | 'entry'>; size: number }) {
  const [missing, setMissing] = useState(false)
  if (!item.entry || missing) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-xl font-display font-bold text-white"
        style={{ width: size, height: size, background: item.color, fontSize: Math.round(size * 0.34), letterSpacing: '-0.02em' }}
      >
        {item.abbr}
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl border border-line bg-white shadow-soft" style={{ width: size, height: size, padding: Math.round(size * 0.18) }}>
      <img src={`/brands/${item.id}.svg`} alt={`Logo de ${item.name}`} className="h-full w-full object-contain" draggable={false} onError={() => setMissing(true)} />
    </span>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-ink-2">{label}</span>
      {children}
    </label>
  )
}
