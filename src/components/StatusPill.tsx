import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Activity, CheckCircle2, CloudOff, ExternalLink, Headphones, Loader2, Square, Undo2, XCircle } from 'lucide-react'
import { useJobs, finishedJobs, runningJobs } from '../system/jobs'
import { useNetwork } from '../system/network'
import { useAmbient } from '../system/ambient'
import { connectedApps, useMcp } from '../mcp/manager'
import { catalogFor } from '../mcp/catalog'
import { useSession } from '../ai/session'
import { useTasks } from '../ai/tasks'
import { dispatch, standingOf, undoEntry, useJournal, type JournalEntry } from '../kernel/commands'
import { clearJournal } from '../kernel/journal'
import { TIER_LABELS } from '../ai/router'
import { cn } from '../lib/utils'
import { AppLogo } from './apps/Apps'

const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`)
const fmtSeconds = (ms: number) => `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s`

/**
 * The system's pulse in one quiet capsule: which apps are connected, what the last answer cost and how long it
 * took, what runs in the background, whether the network is there, what is playing. Click for the details.
 */
export function StatusPill() {
  const servers = useMcp((s) => s.servers)
  const apps = connectedApps(servers)
  const jobs = useJobs((s) => s.jobs)
  const running = runningJobs(jobs)
  const online = useNetwork((s) => s.online)
  const ambient = useAmbient((s) => s.kind)
  const done = useJournal((s) => s.entries)
  const last = useSession((s) => {
    for (let i = s.turns.length - 1; i >= 0; i--) {
      const t = s.turns[i]
      if (t.role === 'assistant' && t.status === 'done' && t.usage) return t
    }
    return undefined
  })
  const thinking = useSession((s) => s.running)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-statuspill]')) setOpen(false)
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [open])

  const tokens = last?.usage ? last.usage.inputTokens + last.usage.outputTokens : 0
  const head = running[0]

  return (
    <div className="relative" data-statuspill>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Estado del sistema"
        className={cn('glass flex h-7 items-center gap-2 rounded-full pl-1.5 pr-2.5 text-[11.5px] text-ink-2 shadow-soft transition hover:text-ink', open && 'text-ink')}
      >
        {!online && (
          <span className="flex items-center gap-1 text-danger">
            <CloudOff className="h-3.5 w-3.5" />
            Sin conexión
          </span>
        )}
        {apps.length > 0 && (
          <span className="flex items-center">
            {apps.slice(0, 4).map((a, i) => {
              const entry = catalogFor(a.id)
              return (
                <span key={a.id} className={cn('rounded-full ring-2 ring-surface-solid', i > 0 && '-ml-1.5')}>
                  <AppLogo item={{ id: a.id, name: a.name, color: entry?.color ?? '#6B7280', abbr: entry?.abbr ?? a.name.slice(0, 2), entry }} size={16} />
                </span>
              )
            })}
            {apps.length > 4 && <span className="ml-1 tabular-nums">+{apps.length - 4}</span>}
          </span>
        )}
        {(thinking || head) && (
          <span className="flex max-w-[180px] items-center gap-1 truncate">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
            <span className="truncate">{thinking ? 'Sky trabaja…' : head?.title}</span>
            {head?.progress !== undefined && head.progress < 1 && !thinking && <span className="tabular-nums text-ink-3">{Math.round(head.progress * 100)}%</span>}
          </span>
        )}
        {!thinking && last?.usage && (
          <span className="flex items-center gap-1 tabular-nums" title={`${last.usage.inputTokens} de entrada · ${last.usage.outputTokens} de salida`}>
            <Activity className="h-3.5 w-3.5 text-ink-3" />
            {fmtTokens(tokens)} tok
            {last.latencyMs ? ` · ${fmtSeconds(last.latencyMs)}` : ''}
          </span>
        )}
        {ambient !== 'off' && <Headphones className="h-3.5 w-3.5 text-accent" />}
        {online && apps.length === 0 && !thinking && !head && !last?.usage && <span className="text-ink-3">Al día</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            style={{ transformOrigin: 'top right' }}
            className="glass absolute right-0 top-full mt-2 w-[300px] rounded-xl p-2 text-[12px] shadow-win"
          >
            <Section title="Red">
              <Line ok={online} text={online ? 'En línea' : 'Sin conexión · todo lo local sigue; Sky y la nube esperan a la red'} />
            </Section>
            <Section title="Apps conectadas" action={{ label: apps.length ? 'Ver' : 'Conectar', run: () => void dispatch('ui.openApps') }}>
              {apps.length ? apps.map((a) => <Line key={a.id} ok text={`${a.name}${a.account?.name ? ` · ${a.account.name}` : ''}`} />) : <p className="px-1 text-ink-3">Ninguna todavía.</p>}
            </Section>
            <Section title="Última respuesta">
              {last?.usage ? (
                <p className="px-1 text-ink-2">
                  {last.model}
                  {last.tier ? ` · ${TIER_LABELS[last.tier]}` : ''} · {fmtTokens(last.usage.inputTokens)} entrada + {fmtTokens(last.usage.outputTokens)} salida
                  {last.latencyMs ? ` · ${fmtSeconds(last.latencyMs)}` : ''}
                </p>
              ) : (
                <p className="px-1 text-ink-3">Aún no has hablado con Sky.</p>
              )}
            </Section>
            <Section title="Lo que hice" action={done.length ? { label: 'Limpiar', run: () => void clearJournal() } : undefined}>
              {done.length === 0 ? (
                <p className="px-1 text-ink-3">Nada todavía.</p>
              ) : (
                [...done]
                  .reverse()
                  .slice(0, 6)
                  .map((e) => <ActivityLine key={e.id} entry={e} />)
              )}
            </Section>
            <Section title="En segundo plano">
              {running.length === 0 && finishedJobs(jobs).length === 0 ? (
                <p className="px-1 text-ink-3">Nada corriendo.</p>
              ) : (
                <>
                  {/* A job in flight is not just a line of text: it can be opened —its window is where the work
                      shows— and stopped right here. A background synthesis of twenty files used to run to the
                      end no matter what, because the only Detener lived in a window that was never opened. */}
                  {running.map((j) => (
                    <div key={j.id} className="rounded-md px-1 py-0.5 transition hover:bg-surface-2">
                      <div className="flex items-center gap-1.5 text-ink">
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
                        {j.open ? (
                          <button type="button" onClick={() => j.open?.()} className="min-w-0 flex-1 truncate text-left">
                            {j.title}
                          </button>
                        ) : (
                          <span className="min-w-0 flex-1 truncate">{j.title}</span>
                        )}
                        {j.progress !== undefined && <span className="shrink-0 tabular-nums text-ink-3">{Math.round(j.progress * 100)}%</span>}
                        {j.kind === 'ai' && (
                          <button
                            type="button"
                            title="Detener"
                            aria-label={`Detener ${j.title}`}
                            onClick={() => useTasks.getState().stop(j.id)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-3 transition hover:bg-surface hover:text-ink"
                          >
                            <Square className="h-2.5 w-2.5 fill-current" />
                          </button>
                        )}
                      </div>
                      {j.detail && <p className="truncate pl-[18px] text-ink-3">{j.detail}</p>}
                    </div>
                  ))}
                  {finishedJobs(jobs)
                    .slice(0, 4)
                    .map((j) => (
                      <Line key={j.id} ok={j.status === 'done'} text={`${j.title}${j.detail ? ` · ${j.detail}` : ''}`} muted />
                    ))}
                </>
              )}
            </Section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: { label: string; run: () => void }; children: React.ReactNode }) {
  return (
    <div className="px-1 py-1.5 [&+&]:border-t [&+&]:border-line">
      <div className="mb-1 flex items-center justify-between px-1">
        <p className="text-[10.5px] font-medium uppercase tracking-wide text-ink-3">{title}</p>
        {action && (
          <button type="button" onClick={action.run} className="text-[11px] font-medium text-accent hover:underline">
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * One thing that happened and what can still be done about it: taken back, only remembered, or gone out to a
 * connected app where this desktop has no say. Saying which is the difference between trust and a surprise.
 */
function ActivityLine({ entry }: { entry: JournalEntry }) {
  const standing = standingOf(entry)
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5" title={new Date(entry.at).toLocaleString('es-MX')}>
      <span className={cn('min-w-0 flex-1 truncate', entry.undone ? 'text-ink-3 line-through' : 'text-ink-2')}>{entry.label}</span>
      {standing === 'undoable' ? (
        <button
          type="button"
          onClick={() => void undoEntry(entry.id)}
          className="flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-[11px] text-accent transition hover:bg-accent-soft"
        >
          <Undo2 className="h-3 w-3" />
          Deshacer
        </button>
      ) : standing === 'external' ? (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-3" title="Pasó en la app conectada; desde aquí no se puede deshacer">
          <ExternalLink className="h-3 w-3" />
          En la app
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-ink-3">{entry.undone ? 'Deshecho' : 'Historial'}</span>
      )}
    </div>
  )
}

function Line({ ok, text, muted }: { ok: boolean; text: string; muted?: boolean }) {
  return (
    <p className={cn('flex items-center gap-1.5 truncate px-1 py-0.5', muted ? 'text-ink-3' : 'text-ink-2')}>
      {ok ? <CheckCircle2 className="h-3 w-3 shrink-0 text-accent" /> : <XCircle className="h-3 w-3 shrink-0 text-danger" />}
      <span className="truncate">{text}</span>
    </p>
  )
}
