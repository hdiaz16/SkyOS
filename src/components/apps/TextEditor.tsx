import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, CornerDownLeft, Languages, Loader2, Sparkles, Square, Wand2, X } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { useToasts } from '../../kernel/commands'
import { FileMissing, Opening } from './FileState'
import { useFileNode } from '../../lib/hooks'
import { dispatch } from '../../kernel/commands'
import { useWindows, type Win } from '../../state/windows'
import { onLeaving } from '../../lib/leaving'
import { runAgent } from '../../ai/agent'
import { isAiConfigured, useAiSettings } from '../../ai/settings'
import { cn } from '../../lib/utils'

type Status = 'saved' | 'dirty' | 'saving'

interface Assist {
  mode: 'replace' | 'insert'
  instruction: string
  /** Character range the result applies to (selection, or caret for inserts). */
  start: number
  end: number
  /** The exact words the request was about, so the answer can be placed even if the text moved underneath. */
  original: string
  text: string
  status: 'running' | 'done' | 'error'
  error?: string
  controller: AbortController | null
}

/**
 * Where the answer belongs in the text as it is now. Unchanged positions win; otherwise the original words
 * are looked for nearby and then anywhere. An insert has nothing to match, so its caret is only clamped.
 */
function locate(text: string, assist: Assist): { start: number; end: number } | null {
  if (assist.mode === 'insert') {
    const at = Math.min(assist.start, text.length)
    return { start: at, end: at }
  }
  if (text.slice(assist.start, assist.end) === assist.original) return { start: assist.start, end: assist.end }
  if (!assist.original) return null
  const near = text.indexOf(assist.original, Math.max(0, assist.start - 500))
  const at = near >= 0 ? near : text.indexOf(assist.original)
  return at >= 0 ? { start: at, end: at + assist.original.length } : null
}

const QUICK_ACTIONS: { id: string; label: string; icon: typeof Wand2; instruction: string }[] = [
  { id: 'improve', label: 'Mejorar', icon: Wand2, instruction: 'Mejora la redacción: más clara y fluida, mismo significado, misma longitud aproximada.' },
  { id: 'short', label: 'Resumir', icon: Sparkles, instruction: 'Resume el texto a la mitad conservando lo esencial.' },
  { id: 'en', label: 'Al inglés', icon: Languages, instruction: 'Traduce el texto al inglés natural.' },
]

const CONTEXT_BEFORE = 4000
const CONTEXT_AFTER = 800

export function TextEditor({ win }: { win: Win }) {
  const nodeId = win.props.nodeId ?? ''
  const { status: fileStatus, node } = useFileNode(nodeId)
  const [text, setText] = useState<string | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const [status, setStatus] = useState<Status>('saved')
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [assist, setAssist] = useState<Assist | null>(null)
  const [asking, setAsking] = useState(false)
  /** Someone else wrote this file while there are unsaved keystrokes here. Kept as a ref too: the flush that
   *  runs when the tab closes reads it outside of React. */
  const [outside, setOutside] = useState(false)
  const outsideRef = useRef(false)
  const [customInstruction, setCustomInstruction] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const latest = useRef({ text: '', dirty: false })
  const timer = useRef<number | undefined>(undefined)
  const loadedVersion = useRef<number>(0)
  const aiReady = isAiConfigured(useAiSettings())

  // Load once, then follow external changes (undo, an AI edit, a transform applied) while not mid-edit.
  useEffect(() => {
    if (!node || node.updatedAt === loadedVersion.current) return
    // Two versions of the same file, one on screen and one on disk. Reading would erase what the person is
    // typing; the autosave 600 ms later would erase what just arrived — which is exactly what happened when
    // someone asked Sky to rewrite the note they had open. Neither is ours to choose, so both stop and the bar
    // above the text asks.
    if (latest.current.dirty) {
      window.clearTimeout(timer.current)
      outsideRef.current = true
      setOutside(true)
      return
    }
    let alive = true
    fs.readText(nodeId).then(
      (t) => {
        if (!alive) return
        loadedVersion.current = node.updatedAt
        latest.current = { text: t, dirty: false }
        setText(t)
        setStatus('saved')
      },
      // Opening an unreadable file as an empty document is how its content gets saved over with nothing.
      () => alive && setUnreadable(true),
    )
    return () => {
      alive = false
    }
  }, [node, nodeId])

  useEffect(() => {
    if (node?.name) useWindows.getState().setTitle(win.id, node.name)
  }, [node?.name, win.id])

  // Flush pending changes when the window closes — and when the tab goes away without closing anything, which
  // used to take the last sentence with it if it happened inside the 600 ms of the debounce.
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timer.current)
      if (latest.current.dirty && !outsideRef.current) void fs.writeText(nodeId, latest.current.text).catch(() => undefined)
    }
    const off = onLeaving(flush)
    return () => {
      off()
      flush()
    }
  }, [nodeId])

  /**
   * Writing takes a moment, and in that moment the person keeps typing. Declaring the file clean afterwards
   * would throw those keystrokes away: the load effect sees a newer version, reads what was written, and puts
   * it back on screen. So only what was actually saved gets marked as saved.
   *
   * The version noted down is the one the file came back with. Stamping it with Date.now() never matched what
   * the write had recorded, so every autosave looked like someone else's change and re-read the whole file.
   */
  const persist = async (value: string) => {
    setStatus('saving')
    loadedVersion.current = await fs.writeText(nodeId, value)
    if (latest.current.text !== value) {
      setStatus('dirty')
      return
    }
    latest.current.dirty = false
    setStatus('saved')
  }

  const onChange = (value: string) => {
    setText(value)
    latest.current = { text: value, dirty: true }
    setStatus('dirty')
    window.clearTimeout(timer.current)
    // While the bar is up nothing is written: which of the two versions wins is the person's call, not a timer's.
    if (outsideRef.current) return
    timer.current = window.setTimeout(() => void persist(latest.current.text), 600)
  }

  /** Keep what is on screen: it goes over the version that arrived, now that it was asked for. */
  const keepMine = () => {
    outsideRef.current = false
    setOutside(false)
    void persist(latest.current.text)
  }

  /** Take what arrived, and let go of what was typed here in the meantime. */
  const takeTheirs = () => {
    outsideRef.current = false
    setOutside(false)
    void fs.readText(nodeId).then(
      (t) => {
        loadedVersion.current = node?.updatedAt ?? 0
        latest.current = { text: t, dirty: false }
        setText(t)
        setStatus('saved')
      },
      () => setUnreadable(true),
    )
  }

  const updateSelection = () => {
    const el = areaRef.current
    if (el) setSelection({ start: el.selectionStart, end: el.selectionEnd })
  }

  const words = useMemo(() => (text ? text.trim().split(/\s+/).filter(Boolean).length : 0), [text])
  const selected = text && selection.end > selection.start ? text.slice(selection.start, selection.end) : ''

  const startAssist = (mode: Assist['mode'], instruction: string) => {
    // An empty document is precisely when the placeholder offers Ctrl+J, and precisely when `!text` refused it.
    if (text === null) return
    assist?.controller?.abort()
    const start = mode === 'replace' ? selection.start : selection.end
    const end = mode === 'replace' ? selection.end : selection.end
    const controller = new AbortController()
    const next: Assist = { mode, instruction, start, end, original: text.slice(start, end), text: '', status: 'running', controller }
    setAssist(next)
    setAsking(false)

    const before = text.slice(Math.max(0, start - CONTEXT_BEFORE), start)
    const after = text.slice(end, end + CONTEXT_AFTER)
    const prompt =
      mode === 'replace'
        ? `Instrucción: ${instruction}\n\nTexto a transformar:\n<<<\n${text.slice(start, end)}\n>>>\n\nContexto anterior (no lo repitas):\n${before}\n\nContexto posterior (no lo repitas):\n${after}`
        : `Continúa escribiendo a partir del final del texto, en el mismo idioma, tono y formato. Escribe entre uno y tres párrafos, sin repetir lo anterior.${instruction ? ` Indicación: ${instruction}` : ''}\n\nTexto hasta el cursor:\n${before}\n\nTexto después del cursor (para no contradecirlo):\n${after}`

    let buffer = ''
    void runAgent({
      prompt,
      extraSystem:
        'Tarea de edición dentro de un editor de texto. Devuelve únicamente el texto resultante, sin explicaciones, sin comillas ni bloques de código, listo para insertarse tal cual.',
      tools: [],
      withoutState: true,
      signal: controller.signal,
      onEvent: (e) => {
        if (e.type === 'text') {
          buffer += e.delta
          setAssist((a) => (a && a.controller === controller ? { ...a, text: buffer } : a))
        }
      },
    })
      .then((r) => setAssist((a) => (a && a.controller === controller ? { ...a, text: r.text || buffer, status: 'done', controller: null } : a)))
      .catch((err: unknown) =>
        setAssist((a) =>
          a && a.controller === controller ? { ...a, status: 'error', error: err instanceof Error ? err.message : 'Error', controller: null } : a,
        ),
      )
  }

  const applyAssist = (placement: 'replace' | 'below') => {
    if (!assist || text === null) return
    const result = assist.text.trim()
    if (!result) return
    // The text may have moved while the model was writing: nothing stops the person from typing meanwhile.
    // So the range is found again by what it said, not by where it was, and if those words are gone the
    // answer goes in at the caret instead of overwriting whatever now sits in those positions.
    const moved = locate(text, assist)
    if (!moved) {
      setAssist(null)
      useToasts.getState().push({ message: 'El texto cambió mientras escribía; pega la respuesta donde la quieras.', kind: 'info' })
      return
    }
    let from: number
    let to: number
    let insertion: string
    if (placement === 'replace' && assist.mode === 'replace') {
      from = moved.start
      to = moved.end
      insertion = result
    } else {
      const at = assist.mode === 'replace' ? moved.end : moved.start
      from = at
      to = at
      insertion = (at > 0 && text[at - 1] !== '\n' ? '\n\n' : '') + result
    }
    const nextText = text.slice(0, from) + insertion + text.slice(to)
    const caret = from + insertion.length
    // Through the textarea's own editing command rather than by handing React a new value: replacing the value
    // empties the browser's undo stack, so Ctrl+Z right after accepting a suggestion did nothing and there was
    // no way back to what was written before. Browsers that refuse the command fall back to the old way.
    const el = areaRef.current
    let applied = false
    if (el) {
      el.focus()
      el.setSelectionRange(from, to)
      applied = document.execCommand('insertText', false, insertion)
    }
    if (!applied) {
      setText(nextText)
      requestAnimationFrame(() => {
        const box = areaRef.current
        if (box) {
          box.focus()
          box.setSelectionRange(caret, caret)
        }
      })
    }
    // After the command, because the edit it makes goes through onChange and schedules a save of its own.
    window.clearTimeout(timer.current)
    latest.current = { text: nextText, dirty: false }
    setStatus('saved')
    setAssist(null)
    // Through the command bus so the change shows up as an undoable action.
    void dispatch<number>('fs.writeText', { id: nodeId, content: nextText }).then((stamp) => {
      loadedVersion.current = stamp
    })
  }

  const dismissAssist = () => {
    assist?.controller?.abort()
    setAssist(null)
  }

  /** Stopping is not discarding: what the model already wrote stays on screen, ready to use. */
  const stopAssist = () => {
    assist?.controller?.abort()
    setAssist((a) =>
      a
        ? {
            ...a,
            status: a.text.trim() ? 'done' : 'error',
            error: a.text.trim() ? undefined : 'Se detuvo antes de escribir nada.',
            controller: null,
          }
        : a,
    )
  }

  if (fileStatus === 'trashed' || fileStatus === 'gone') return <FileMissing winId={win.id} nodeId={nodeId} status={fileStatus} name={win.title} />
  if (unreadable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-[14px] text-ink-2">No pude leer «{win.title}»</p>
        <p className="text-[12px] leading-relaxed text-ink-3">Su contenido no está donde debería. Se abre vacío para no escribir encima de lo que quede.</p>
      </div>
    )
  }
  if (text === null) return <Opening />

  return (
    <div className="relative flex h-full flex-col">
      {outside && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-4 py-2 text-[12px] text-ink-2">
          <span className="min-w-0 flex-1">Este archivo cambió por fuera mientras escribías. Mientras decides, no guardo nada.</span>
          <button type="button" onClick={takeTheirs} className="rounded-lg px-2 py-1 text-ink-2 transition hover:bg-surface hover:text-ink">
            Ver lo que llegó
          </button>
          <button type="button" onClick={keepMine} className="rounded-lg px-2 py-1 font-medium text-accent transition hover:bg-accent-soft">
            Quedarme con lo mío
          </button>
        </div>
      )}
      <AnimatePresence>
        {aiReady && selected && !assist && (
          <motion.div
            key="toolbar"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            className="glass absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl p-1 shadow-soft"
            onMouseDown={(e) => e.preventDefault()}
          >
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => startAssist('replace', a.instruction)}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink"
              >
                <a.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {a.label}
              </button>
            ))}
            <div className="mx-0.5 h-5 w-px bg-line-2" />
            {asking ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (customInstruction.trim()) startAssist('replace', customInstruction.trim())
                }}
              >
                <input
                  autoFocus
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Escape') setAsking(false)
                  }}
                  placeholder="Qué hacer con la selección…"
                  className="h-8 w-56 rounded-lg bg-surface-2 px-2.5 text-[12px] text-ink outline-none"
                />
                <button type="submit" aria-label="Enviar" className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
                  <CornerDownLeft className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAsking(true)}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-accent transition hover:bg-accent-soft"
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                Pedir…
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <textarea
        ref={areaRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onSelect={updateSelection}
        onKeyUp={updateSelection}
        onMouseUp={updateSelection}
        onKeyDown={(e) => {
          // Everything stays inside the box except Escape: the desktop shortcuts must not fire while someone is
          // typing, but Escape is what closes an open menu, a dialog or the capture overlay, and swallowing it
          // left them stuck open until you clicked somewhere else.
          if (e.key !== 'Escape') e.stopPropagation()
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && aiReady) {
            e.preventDefault()
            updateSelection()
            startAssist('insert', '')
          }
        }}
        spellCheck={false}
        placeholder={aiReady ? 'Escribe algo… (Ctrl+J para que Sky continúe)' : 'Escribe algo…'}
        className="scrollbar-thin flex-1 resize-none bg-transparent px-8 py-6 text-[15px] leading-7 text-ink outline-none placeholder:text-ink-3"
      />

      <AnimatePresence>
        {assist && (
          <motion.div
            key="assist"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 480, damping: 38 }}
            className="glass absolute inset-x-4 bottom-11 z-10 flex max-h-[55%] flex-col overflow-hidden rounded-2xl shadow-win"
          >
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-[12px] text-ink-2">
              <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate">{assist.mode === 'insert' ? 'Continuación propuesta' : assist.instruction}</span>
              {assist.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-3" />}
              <button type="button" onClick={dismissAssist} aria-label="Cerrar" className="flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 select-text overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[14px] leading-relaxed text-ink">
              {assist.text || (assist.status === 'running' ? <span className="animate-pulse text-ink-3">Escribiendo…</span> : null)}
              {assist.status === 'error' && <p className="text-[13px] text-danger">{assist.error}</p>}
            </div>
            <div className="flex h-11 shrink-0 items-center justify-end gap-1 border-t border-line px-2">
              {assist.status === 'running' ? (
                <AssistButton onClick={stopAssist} icon={<Square className="h-3 w-3 fill-current" />}>
                  Detener
                </AssistButton>
              ) : (
                <>
                  <AssistButton onClick={() => applyAssist('below')} disabled={!assist.text.trim()} icon={<CornerDownLeft className="h-3.5 w-3.5" />}>
                    {assist.mode === 'insert' ? 'Insertar' : 'Insertar debajo'}
                  </AssistButton>
                  {assist.mode === 'replace' && (
                    <AssistButton onClick={() => applyAssist('replace')} disabled={!assist.text.trim()} primary icon={<Check className="h-3.5 w-3.5" />}>
                      Reemplazar selección
                    </AssistButton>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex h-8 shrink-0 items-center justify-between border-t border-line px-4 text-[11px] text-ink-3">
        <span>
          {words} {words === 1 ? 'palabra' : 'palabras'}
          {selected && ` · ${selected.length} ${selected.length === 1 ? 'carácter' : 'caracteres'} seleccionados`}
        </span>
        <span>{status === 'saved' ? 'Guardado' : status === 'saving' ? 'Guardando…' : 'Sin guardar'}</span>
      </div>
    </div>
  )
}

function AssistButton({
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
