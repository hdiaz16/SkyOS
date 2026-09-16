import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Copy, Loader2, Save, Square } from 'lucide-react'
import { useTasks } from '../../ai/tasks'
import { dispatch, useToasts } from '../../kernel/commands'
import { ROOT_ID, extOf, type FsNode } from '../../kernel/types'
import type { Win } from '../../state/windows'
import { cn } from '../../lib/utils'
import { Markdown } from '../Markdown'

/** Shows the streamed output of an AI task and offers what to do with it. */
export function ResultApp({ win }: { win: Win }) {
  const task = useTasks((s) => (win.props.taskId ? s.tasks[win.props.taskId] : undefined))
  const [applied, setApplied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  /** Whether the reader is still at the end. Going up to reread used to be impossible: every fragment, up to
   *  sixty times a second, pulled a long result back down. */
  const stick = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current && task?.status === 'running') el.scrollTop = el.scrollHeight
  }, [task?.text, task?.status])

  if (!task) return <div className="flex h-full items-center justify-center text-[13px] text-ink-3">Este resultado ya no está disponible.</div>

  const running = task.status === 'running'
  // Stopping a long answer left its text on screen and every button dead: what was already written could not
  // be copied, saved or applied. Anything that is not still running and has words counts.
  const canAct = !running && task.text.trim().length > 0

  const copy = async () => {
    await navigator.clipboard.writeText(task.text)
    useToasts.getState().push({ message: 'Copiado al portapapeles', kind: 'info' })
  }

  const saveAsNote = async () => {
    const folderId = task.context.folderId ?? ROOT_ID
    const base = task.context.saveAs ?? `${task.title}.md`
    const name = task.kind === 'transform' ? withSuffix(base, ' (Sky)') : base
    const node = await dispatch<FsNode>('fs.createFile', { parentId: folderId, name, type: extOf(name) === 'md' ? 'note' : 'text', content: task.text })
    await dispatch('ui.open', { id: node.id })
  }

  const applyToFile = async () => {
    if (!task.context.nodeId) return
    await dispatch('fs.writeText', { id: task.context.nodeId, content: task.text })
    setApplied(true)
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="scrollbar-thin min-h-0 flex-1 select-text overflow-y-auto px-6 py-5 text-[14px] leading-relaxed text-ink"
      >
        {task.text ? (
          task.kind === 'transform' ? <pre className="whitespace-pre-wrap font-sans">{task.text}</pre> : <Markdown text={task.text} />
        ) : running ? (
          <p className="animate-pulse text-ink-3">{task.statusMessage ?? 'Leyendo…'}</p>
        ) : null}
        {task.status === 'error' && (
          <p className="mt-2 flex items-start gap-1.5 text-[13px] text-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {task.error}
          </p>
        )}
        {task.status === 'stopped' && <p className="mt-2 text-[12px] text-ink-3">Detenido.</p>}
      </div>

      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-t border-line px-3">
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {task.statusMessage ?? 'Sky está trabajando…'}
            </>
          ) : task.status === 'done' ? (
            <>
              <Check className="h-3.5 w-3.5 text-accent" />
              Listo
            </>
          ) : null}
        </span>
        <div className="flex items-center gap-1">
          {running ? (
            <ActionButton onClick={() => useTasks.getState().stop(task.id)} icon={<Square className="h-3 w-3 fill-current" />}>
              Detener
            </ActionButton>
          ) : (
            <>
              <ActionButton onClick={() => void copy()} disabled={!canAct} icon={<Copy className="h-3.5 w-3.5" />}>
                Copiar
              </ActionButton>
              {task.kind === 'transform' && task.context.nodeId ? (
                <>
                  <ActionButton onClick={() => void saveAsNote()} disabled={!canAct} icon={<Save className="h-3.5 w-3.5" />}>
                    Guardar como copia
                  </ActionButton>
                  <ActionButton onClick={() => void applyToFile()} disabled={!canAct || applied} primary icon={<Check className="h-3.5 w-3.5" />}>
                    {applied ? 'Aplicado' : 'Aplicar al archivo'}
                  </ActionButton>
                </>
              ) : (
                <ActionButton onClick={() => void saveAsNote()} disabled={!canAct} primary icon={<Save className="h-3.5 w-3.5" />}>
                  Guardar como nota
                </ActionButton>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function withSuffix(name: string, suffix: string): string {
  const ext = extOf(name)
  return ext ? `${name.slice(0, -(ext.length + 1))}${suffix}.${ext}` : `${name}${suffix}`
}

function ActionButton({
  onClick,
  disabled,
  primary,
  icon,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition disabled:opacity-40',
        primary ? 'bg-accent text-white shadow-soft hover:brightness-110' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
