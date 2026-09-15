import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { AlertCircle, Check, ExternalLink, FolderGit2, Loader2, Sparkles, Square, Trash2, Undo2, Volume2, VolumeX, X, FileText } from 'lucide-react'
import { speak, speechAvailable, stopSpeaking } from '../ai/speech'
import { useSession, type Turn } from '../ai/session'
import { commandIdForTool } from '../ai/tools'
import { modelLabel, TIER_LABELS, type Tier } from '../ai/router'
import type { Usage } from '../ai/types'
import { useAiSettings } from '../ai/settings'
import type { ToolEvent } from '../ai/agent'
import { getCommand, standingOf, undoEntry, undoRun, useJournal } from '../kernel/commands'
import { cn } from '../lib/utils'
import { Markdown } from './Markdown'

const READ_ONLY_LABELS: Record<string, string> = {
  fs_list: 'Revisando una carpeta',
  fs_overview: 'Revisando la estructura',
  fs_read: 'Leyendo un archivo',
  fs_find: 'Buscando por nombre',
  fs_info: 'Consultando detalles',
  ui_windows: 'Revisando las ventanas',
  system_info: 'Consultando el sistema',
}

function describeCall(ev: ToolEvent): string {
  if (ev.result?.label) return ev.result.label
  const fixed = READ_ONLY_LABELS[ev.call.name]
  if (fixed) return fixed
  const id = commandIdForTool(ev.call.name)
  return id ? getCommand(id)?.title ?? ev.call.name : ev.call.name
}

export function AssistantPanel() {
  const turns = useSession((s) => s.turns)
  const threadName = useSession((s) => s.threadName)
  const running = useSession((s) => s.running)
  const stop = useSession((s) => s.stop)
  const clear = useSession((s) => s.clear)
  const setOpen = useSession((s) => s.setOpen)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [turns])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 480, damping: 38 }}
      className="glass pointer-events-auto absolute inset-x-0 bottom-full mb-2 flex max-h-[62vh] flex-col overflow-hidden rounded-2xl shadow-win"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <Sparkles className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
        <span className="shrink-0 text-[13px] font-medium text-ink">Sky</span>
        {/* Which conversation this is: the everyday one has no name, a project's says whose. */}
        {threadName && (
          <span className="flex min-w-0 items-center gap-1 text-[12px] text-ink-3" title={`Conversación del proyecto «${threadName}»`}>
            <span aria-hidden>·</span>
            <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="truncate">{threadName}</span>
          </span>
        )}
        {running && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink-3" />}
        <div className="flex-1" />
        {running ? (
          <button
            type="button"
            onClick={stop}
            className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            <Square className="h-3 w-3 fill-current" />
            Detener
          </button>
        ) : (
          <button
            type="button"
            onClick={clear}
            title="Nueva conversación"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-ink"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Cerrar"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
        className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-3 select-text"
      >
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <Sparkles className="mb-1 h-5 w-5 text-accent" />
            <p className="text-[13.5px] text-ink-2">{threadName ? `Lo que hablemos sobre «${threadName}» se queda aquí` : 'Aquí queda lo que hablamos'}</p>
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              {threadName
                ? 'Este proyecto tiene su propia conversación, aparte de la general. Pregúntame dónde nos quedamos o pídeme el siguiente paso.'
                : 'Escribe abajo, arrastra un archivo y dime qué hacer con él, o selecciona texto en cualquier ventana para preguntarme sobre esa parte.'}
            </p>
          </div>
        ) : (
          turns.map((t) => <TurnView key={t.id} turn={t} />)
        )}
      </div>
    </motion.div>
  )
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-[14px] leading-relaxed text-ink">
          {turn.attachments?.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {turn.attachments.map((a, i) =>
                a.type === 'image' ? (
                  <img key={i} src={`data:${a.mediaType};base64,${a.data}`} alt="" className="h-20 rounded-lg border border-line object-cover" />
                ) : (
                  <span key={i} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12px] text-ink-2">
                    <FileText className="h-3.5 w-3.5" /> {a.type === 'file' ? a.name : (a.title ?? 'PDF')}
                  </span>
                ),
              )}
            </div>
          ) : null}
          {turn.text}
        </div>
      </div>
    )
  }

  const thinking = turn.status === 'streaming' && !turn.text && turn.toolEvents.length === 0
  return (
    <div className="max-w-[92%] text-[14px] leading-relaxed text-ink">
      {turn.toolEvents.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {turn.toolEvents.map((ev) => (
            <ToolChip key={ev.call.id} ev={ev} />
          ))}
        </ul>
      )}
      {thinking && <p className="animate-pulse text-ink-3">Pensando…</p>}
      {turn.statusMessage && <p className="mb-1 text-[12px] italic text-ink-3">{turn.statusMessage}</p>}
      {turn.text && <Markdown text={turn.text} />}
      {turn.status === 'error' && (
        <p className="mt-1 flex items-start gap-1.5 text-[13px] text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {turn.error}
        </p>
      )}
      {turn.status === 'stopped' && <p className="mt-1 text-[12px] text-ink-3">Detenido.</p>}
      {turn.runId && turn.status !== 'streaming' && <UndoAll runId={turn.runId} />}
      <div className="mt-1.5 flex items-center gap-3">
        {turn.model && turn.status !== 'streaming' && <ModelTag model={turn.model} tier={turn.tier ?? null} usage={turn.usage} latencyMs={turn.latencyMs} />}
        {turn.status === 'done' && turn.text && speechAvailable() && <Listen text={turn.text} />}
      </div>
    </div>
  )
}

function Listen({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)
  const toggle = async () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setSpeaking(true)
    await speak(text)
    setSpeaking(false)
  }
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className="flex items-center gap-1 text-[11px] text-ink-3 transition hover:text-ink"
      title={speaking ? 'Silenciar' : 'Escuchar'}
    >
      {speaking ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      {speaking ? 'Silenciar' : 'Escuchar'}
    </button>
  )
}

const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n))

function ModelTag({ model, tier, usage, latencyMs }: { model: string; tier: Tier | null; usage?: Usage; latencyMs?: number }) {
  const settings = useAiSettings()
  const total = usage ? usage.inputTokens + usage.outputTokens : 0
  return (
    <p className="text-[11px] text-ink-3" title={usage ? `${usage.inputTokens} de entrada · ${usage.outputTokens} de salida` : undefined}>
      {modelLabel(settings, model)}
      {tier ? ` · ${TIER_LABELS[tier]}` : ''}
      {total ? ` · ${tokens(total)} tokens` : ''}
      {latencyMs ? ` · ${(latencyMs / 1000).toFixed(latencyMs >= 10_000 ? 0 : 1)} s` : ''}
    </p>
  )
}

function ToolChip({ ev }: { ev: ToolEvent }) {
  const entry = useJournal((s) => (ev.result?.entryId ? s.entries.find((e) => e.id === ev.result?.entryId) : undefined))
  const pending = !ev.result
  const failed = ev.result?.isError
  const standing = entry ? standingOf(entry) : undefined
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg border border-line px-2.5 py-1 text-[12.5px]',
        failed ? 'text-danger' : entry?.undone ? 'text-ink-3 line-through' : 'text-ink-2',
      )}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : failed ? (
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
      )}
      <span className="min-w-0 flex-1 truncate">{failed ? `${describeCall(ev)}: ${ev.result?.content}` : describeCall(ev)}</span>
      {standing === 'undoable' && entry && (
        <button
          type="button"
          onClick={() => void undoEntry(entry.id)}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-accent transition hover:bg-accent-soft"
        >
          <Undo2 className="h-3 w-3" />
          Deshacer
        </button>
      )}
      {standing === 'external' && (
        <span title="Pasó en la app conectada; desde aquí no se puede deshacer" className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-3">
          <ExternalLink className="h-3 w-3" />
          En la app
        </span>
      )}
    </li>
  )
}

function UndoAll({ runId }: { runId: string }) {
  const pending = useJournal((s) => s.entries.filter((e) => e.runId === runId && !e.undone && !!e.undo).length)
  if (pending < 2) return null
  return (
    <button
      type="button"
      onClick={() => void undoRun(runId)}
      className="mt-2 flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink-2 transition hover:border-line-2 hover:text-ink"
    >
      <Undo2 className="h-3.5 w-3.5" />
      Deshacer todo lo de esta respuesta ({pending})
    </button>
  )
}
