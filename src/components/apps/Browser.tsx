import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, ExternalLink, House, ListChecks, Loader2, RotateCw, Save, Square, X } from 'lucide-react'
import { useWindows, type Win } from '../../state/windows'
import { keyPointsForUrl, useTasks } from '../../ai/tasks'
import { getProvider } from '../../ai/providers'
import { isAiConfigured, useAiSettings } from '../../ai/settings'
import { dispatch } from '../../kernel/commands'
import { ROOT_ID, type FsNode } from '../../kernel/types'
import { GOOGLE_HOME, titleForUrl, toNavigableUrl } from '../../lib/web'
import { cn } from '../../lib/utils'
import { ToolButton } from '../ToolButton'
import { Markdown } from '../Markdown'

export function BrowserApp({ win }: { win: Win }) {
  const target = win.props.url ?? GOOGLE_HOME
  const [address, setAddress] = useState(target)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const [taskId, setTaskId] = useState<string | null>(null)
  const lastTarget = useRef(target)
  const aiReady = isAiConfigured(useAiSettings())

  // Keep the address bar in sync when another command changes the URL of this window.
  useEffect(() => {
    if (target === lastTarget.current) return
    lastTarget.current = target
    setAddress(target)
    setLoading(true)
  }, [target])

  const navigate = (raw: string) => {
    const url = toNavigableUrl(raw)
    const wm = useWindows.getState()
    wm.setProps(win.id, { url })
    wm.setTitle(win.id, titleForUrl(url))
    setNonce((n) => n + 1)
    setLoading(true)
  }

  // Only Anthropic reads a page on the server side. With Groq —what SkyOS starts on— the button looked ready
  // and always ended in the same toast; now it says so before being pressed.
  const canRead = !!getProvider()?.capabilities.serverWebFetch

  const keyPoints = () => {
    if (!canRead) return
    // Pressing it again used to launch a second task and leave the first one running, spending quota nobody
    // was watching. The one in flight is what comes back.
    if (taskId) return
    setTaskId(keyPointsForUrl(target))
  }

  /** Closing the panel stops the work. It used to keep running, and then chimed to offer what was dismissed. */
  const closeKeyPoints = () => {
    if (taskId) useTasks.getState().remove(taskId)
    setTaskId(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
        <ToolButton label="Inicio (Google)" onClick={() => navigate('')}>
          <House className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Recargar"
          onClick={() => {
            setNonce((n) => n + 1)
            setLoading(true)
          }}
        >
          <RotateCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </ToolButton>

        <form
          className="flex min-w-0 flex-1 px-1"
          onSubmit={(e) => {
            e.preventDefault()
            navigate(address)
          }}
        >
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => e.stopPropagation()}
            spellCheck={false}
            placeholder="Busca en Google o escribe una dirección"
            className="h-8 w-full rounded-lg bg-surface-2 px-3 text-[13px] text-ink outline-none transition focus:ring-1 focus:ring-accent/50"
          />
        </form>

        {aiReady && (
          <ToolButton
            label={canRead ? 'Puntos clave con Sky' : 'Los puntos clave necesitan Claude (Anthropic): es el proveedor que puede leer la página'}
            onClick={keyPoints}
            active={!!taskId}
            disabled={!canRead}
          >
            <ListChecks className="h-4 w-4" />
          </ToolButton>
        )}
        <ToolButton label="Abrir en pestaña nueva" onClick={() => window.open(target, '_blank', 'noopener')}>
          <ExternalLink className="h-4 w-4" />
        </ToolButton>

        {loading && (
          <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
            <div className="loading-bar h-full w-1/3 rounded-full bg-accent" />
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <iframe
          key={nonce}
          src={target}
          title={win.title}
          onLoad={() => setLoading(false)}
          className="min-h-0 min-w-0 flex-1 border-0 bg-white"
          // The page keeps what it needs to work — its own origin, scripts, forms, popups — but not the right
          // to navigate the desktop out from under the person, and not the clipboard.
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          referrerPolicy="no-referrer"
        />
        <AnimatePresence>{taskId && <KeyPointsPanel key={taskId} taskId={taskId} onClose={closeKeyPoints} />}</AnimatePresence>
      </div>

      {/* X, YouTube, Instagram and anything with frame-ancestors refuse to be framed, and Chrome fires `load`
          all the same: the loading bar vanished and its English error page stayed inside SkyOS. The way out
          used to be a sentence hidden below 1024 px; now it is a button, always there, right under the page. */}
      <div className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-line px-3 text-[11px] text-ink-3">
        <span className="truncate">{target}</span>
        <button
          type="button"
          onClick={() => window.open(target, '_blank', 'noopener')}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-accent transition hover:bg-accent-soft"
        >
          <ExternalLink className="h-3 w-3" />
          ¿No se ve nada? Ábrelo aquí fuera
        </button>
      </div>
    </div>
  )
}

function KeyPointsPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useTasks((s) => s.tasks[taskId])
  const stop = useTasks((s) => s.stop)
  if (!task) return null
  const running = task.status === 'running'

  const save = async () => {
    const name = task.context.saveAs ?? 'Puntos clave.md'
    const node = await dispatch<FsNode>('fs.createFile', { parentId: ROOT_ID, name, type: 'note', content: `${task.text}\n\nFuente: ${task.context.url ?? ''}` })
    await dispatch('ui.open', { id: node.id })
  }

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 340, opacity: 1 }}
      exit={{ width: 0, opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      className="flex shrink-0 flex-col overflow-hidden border-l border-line bg-surface-solid/70"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <ListChecks className="h-4 w-4 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">Puntos clave</span>
        {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-3" />}
        <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 select-text overflow-y-auto px-4 py-3 text-[13.5px] leading-relaxed text-ink">
        {task.text ? <Markdown text={task.text} /> : running ? <p className="animate-pulse text-ink-3">{task.statusMessage ?? 'Leyendo la página…'}</p> : null}
        {task.status === 'error' && (
          <p className="flex items-start gap-1.5 text-[13px] text-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {task.error}
          </p>
        )}
      </div>
      <div className="flex h-11 shrink-0 items-center justify-end gap-1 border-t border-line px-2">
        {running ? (
          <button type="button" onClick={() => stop(task.id)} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink">
            <Square className="h-3 w-3 fill-current" />
            Detener
          </button>
        ) : (
          <button
            type="button"
            disabled={!task.text.trim()}
            onClick={() => void save()}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[12px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            Guardar como nota
          </button>
        )}
      </div>
    </motion.aside>
  )
}
