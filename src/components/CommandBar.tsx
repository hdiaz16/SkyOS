import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import {
  Calculator,
  Camera,
  CornerDownLeft,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  Globe,
  LayoutGrid,
  Loader2,
  LogOut,
  Mic,
  ScanSearch,
  Plug,
  Settings2,
  Sparkles,
  SquareTerminal,
  SunMoon,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { fs } from '../kernel/fs'
import { flows } from '../kernel/flows'
import type { FlowRow } from '../kernel/db'
import { ROOT_ID, fileKind, type FsNode } from '../kernel/types'
import { USER_WIDGET_TYPES, WIDGET_META } from '../kernel/widgets'
import { dispatch, undoLast, useToasts } from '../kernel/commands'
import { useUi } from '../state/ui'
import { useWindows } from '../state/windows'
import { useSession } from '../ai/session'
import { isAiConfigured, resolveKey, useAiSettings, usesSharedKey } from '../ai/settings'
import { connectedApps, useMcp } from '../mcp/manager'
import { catalogFor } from '../mcp/catalog'
import { AppLogo } from './apps/Apps'
import { useSemantic } from '../ai/indexer'
import { captureScreen, useSnap } from '../ai/snap'
import { getProvider } from '../ai/providers'
import { dictationAvailable, Recorder, transcribe } from '../ai/voice'
import { createFileAndOpen, createFolderAndRename, importInto } from '../lib/menus'
import { FILE_TYPES } from '../lib/fileTypes'
import { calculate } from '../lib/calc'
import { looksLikeUrl } from '../lib/web'
import { cn } from '../lib/utils'
import { KindIcon } from './KindIcon'
import { AssistantPanel } from './AssistantPanel'

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>

interface Action {
  id: string
  title: string
  hint?: string
  keywords: string[]
  icon: IconType
  run: () => void
}

const ACTIONS: Action[] = [
  { id: 'new-folder', title: 'Nueva carpeta', hint: 'en el escritorio', keywords: ['carpeta', 'folder', 'crear', 'nueva'], icon: FolderPlus, run: () => void createFolderAndRename(ROOT_ID) },
  ...FILE_TYPES.map<Action>((t) => ({
    id: `new-${t.id}`,
    title: `Nuevo archivo: ${t.label}`,
    hint: `.${t.ext}`,
    keywords: ['nuevo', 'archivo', 'crear', t.label.toLowerCase(), t.ext],
    icon: FilePlus2,
    run: () => void createFileAndOpen(ROOT_ID, t.id),
  })),
  { id: 'import', title: 'Importar archivos…', hint: 'desde tu computadora', keywords: ['subir', 'importar', 'upload'], icon: Upload, run: () => importInto(ROOT_ID) },
  ...USER_WIDGET_TYPES.map<Action>((t) => ({
    id: `widget-${t}`,
    title: `Añadir widget: ${WIDGET_META[t].label}`,
    hint: 'en el escritorio',
    keywords: ['widget', 'añadir', 'agregar', WIDGET_META[t].label.toLowerCase(), t],
    icon: LayoutGrid,
    run: () => void dispatch('widgets.create', { type: t }),
  })),
  { id: 'files', title: 'Abrir Archivos', keywords: ['explorador', 'archivos', 'carpetas', 'escritorio'], icon: FolderOpen, run: () => void dispatch('ui.openFiles') },
  { id: 'browser', title: 'Abrir navegador', hint: 'Google', keywords: ['google', 'web', 'internet', 'navegador'], icon: Globe, run: () => void dispatch('ui.openBrowser') },
  { id: 'terminal', title: 'Abrir terminal', hint: 'lenguaje natural', keywords: ['terminal', 'consola', 'comandos', 'shell'], icon: SquareTerminal, run: () => void dispatch('ui.openTerminal') },
  { id: 'snap', title: 'Capturar pantalla para Sky', hint: 'elige un área', keywords: ['captura', 'pantalla', 'screenshot', 'analizar', 'foto'], icon: Camera, run: () => void snapScreen() },
  { id: 'logout', title: 'Cerrar sesión', hint: 'vuelve al inicio', keywords: ['salir', 'sesion', 'sesión', 'cambiar usuario', 'logout'], icon: LogOut, run: () => void dispatch('system.logout') },
  { id: 'trash', title: 'Abrir papelera', keywords: ['papelera', 'basura', 'trash', 'borrados'], icon: Trash2, run: () => void dispatch('ui.openTrash') },
  { id: 'apps', title: 'Apps conectadas', hint: 'Notion, Slack, Google, GitHub, Spotify…', keywords: ['apps', 'conectar', 'integraciones', 'mcp', 'notion', 'slack', 'google', 'drive', 'gmail', 'github', 'spotify', 'todoist', 'evernote'], icon: Plug, run: () => void dispatch('ui.openApps') },
  { id: 'settings', title: 'Ajustes', keywords: ['configuracion', 'preferencias', 'settings', 'opciones', 'llave', 'api'], icon: Settings2, run: () => void dispatch('ui.openSettings') },
  { id: 'theme', title: 'Cambiar tema', hint: 'sistema, claro, oscuro', keywords: ['tema', 'oscuro', 'claro', 'dark', 'light', 'modo', 'noche'], icon: SunMoon, run: () => void dispatch('ui.theme') },
  { id: 'undo', title: 'Deshacer última acción', hint: 'Ctrl Z', keywords: ['deshacer', 'undo', 'revertir'], icon: Undo2, run: () => void undoLast() },
]

interface Item {
  key: string
  title: string
  hint?: string
  icon: ReactNode
  run: () => void
  /** Keep the input (and its text) after running: conversational or in-panel items. */
  keepFocus?: boolean
  keepQuery?: boolean
  /** Rendered as a section header above the item. */
  section?: string
}

const NO_FILES: FsNode[] = []
const NO_FLOWS: FlowRow[] = []

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

async function snapScreen(): Promise<void> {
  try {
    const shot = await captureScreen()
    if (shot) useSnap.getState().open(shot.dataUrl, shot.width, shot.height)
  } catch (err) {
    useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo capturar la pantalla', kind: 'error' })
  }
}

type DictationState = 'idle' | 'recording' | 'transcribing'

/** Toggle-to-talk: one click starts the microphone, the next one transcribes and drops the text in the bar. */
function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>('idle')
  const recorder = useRef<Recorder | null>(null)

  const stop = async () => {
    const rec = recorder.current
    if (!rec) return
    recorder.current = null
    setState('transcribing')
    try {
      const audio = await rec.stop()
      if (audio.size < 2000) throw new Error('No escuché nada')
      const settings = useAiSettings.getState()
      const text = await transcribe(audio, resolveKey(settings, 'groq'), usesSharedKey(settings, 'groq'))
      if (text) onText(text)
      else useToasts.getState().push({ message: 'No entendí el audio. Intenta otra vez.', kind: 'info' })
    } catch (err) {
      useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo transcribir', kind: 'error' })
    } finally {
      setState('idle')
    }
  }

  const toggle = async () => {
    if (state === 'transcribing') return
    if (state === 'recording') {
      await stop()
      return
    }
    const rec = new Recorder()
    try {
      await rec.start(() => void stop())
      recorder.current = rec
      setState('recording')
    } catch (err) {
      useToasts.getState().push({
        message: err instanceof DOMException && err.name === 'NotAllowedError' ? 'Necesito permiso para usar el micrófono.' : 'No se pudo acceder al micrófono.',
        kind: 'error',
      })
    }
  }

  useEffect(() => () => recorder.current?.cancel(), [])
  return { state, toggle }
}

function matchAction(a: Action, q: string): boolean {
  const n = norm(q)
  return norm(a.title).includes(n) || a.keywords.some((k) => norm(k).includes(n))
}

export function CommandBar() {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const focusTick = useUi((s) => s.composerFocus)
  const selectionCount = useUi((s) => s.selection.length)
  const windows = useWindows((s) => s.windows)
  const minimized = windows.filter((w) => w.minimized)
  const trashCount = useLiveQuery(() => fs.listTrash().then((l) => l.length), [], 0)
  const files = useLiveQuery(() => fs.search(q, 6), [q], NO_FILES)
  const flowMatches = useLiveQuery(() => flows.search(q, 4), [q], NO_FLOWS)

  const chatOpen = useSession((s) => s.open)
  const chatRunning = useSession((s) => s.running)
  const hasTurns = useSession((s) => s.turns.length > 0)
  const pending = useSession((s) => s.pending)
  const semantic = useSemantic()
  const aiSettings = useAiSettings()
  const aiReady = isAiConfigured(aiSettings)
  const apps = connectedApps(useMcp((s) => s.servers))
  const canSee = aiReady && !!getProvider(aiSettings)?.capabilities.vision
  const canDictate = dictationAvailable(aiSettings)
  const dictation = useDictation((text) => {
    setQ((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
    inputRef.current?.focus()
  })

  useEffect(() => {
    if (focusTick > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [focusTick])

  const askMesa = (text: string) => {
    if (aiReady) void useSession.getState().send(text)
    else {
      void dispatch('ui.openSettings')
      useToasts.getState().push({ message: 'Configura tu proveedor de IA en Ajustes › Inteligencia para pedirle cosas a Sky.', kind: 'info' })
    }
  }

  const query = q.trim()
  const semanticForQuery = semantic.query === query && query.length > 0 ? semantic : null

  const items = useMemo<Item[]>(() => {
    if (!query) return []
    const nq = norm(query)
    const isUrl = looksLikeUrl(query)
    const words = query.split(/\s+/).length

    const calc = calculate(query)
    const calcItems: Item[] = calc
      ? [
          {
            key: 'calc',
            title: `= ${calc.display}`,
            hint: `${calc.detail} · Enter copia`,
            icon: <Calculator className="h-[18px] w-[18px] text-accent" strokeWidth={1.75} />,
            run: () => {
              void navigator.clipboard.writeText(calc.display)
              useToasts.getState().push({ message: `${calc.display} copiado`, kind: 'info' })
            },
            keepFocus: true,
            keepQuery: true,
          },
        ]
      : []

    const flowItems: Item[] = aiReady
      ? flowMatches.map((f) => ({
          key: `flow:${f.id}`,
          title: `Ejecutar flujo: ${f.name}`,
          hint: f.instructions.length > 60 ? `${f.instructions.slice(0, 60)}…` : f.instructions,
          icon: <Zap className="h-[18px] w-[18px] text-accent" strokeWidth={1.75} />,
          run: () => askMesa(`Ejecuta el flujo "${f.name}". Sus pasos son: ${f.instructions}`),
          keepFocus: true,
        }))
      : []

    const semanticItems: Item[] = []
    if (semanticForQuery?.status === 'done') {
      const hits = semanticForQuery.result?.hits ?? []
      if (hits.length === 0) {
        semanticItems.push({ key: 'sem:none', title: 'Nada coincide por significado', hint: 'Índice', icon: <ScanSearch className="h-[18px] w-[18px] text-ink-3" />, run: () => undefined, section: 'Por significado', keepFocus: true, keepQuery: true })
      }
      hits.forEach((h, i) =>
        semanticItems.push({
          key: `sem:${h.id}`,
          title: h.name,
          hint: h.reason,
          icon: <ScanSearch className="h-[18px] w-[18px] text-accent" strokeWidth={1.75} />,
          run: () => void dispatch('ui.open', { id: h.id }),
          section: i === 0 ? 'Por significado' : undefined,
        }),
      )
    }

    const fileItems: Item[] = files.map((n) => ({
      key: `file:${n.id}`,
      title: n.name,
      hint: n.kind === 'folder' ? 'Carpeta' : n.tags?.length ? n.tags.map((t) => `#${t}`).join(' ') : 'Archivo',
      icon: <KindIcon kind={fileKind(n)} name={n.name} className="h-6 w-6" />,
      run: () => void dispatch('ui.open', { id: n.id }),
    }))
    const matched = ACTIONS.filter((a) => matchAction(a, query)).slice(0, 6)
    const actionItems: Item[] = matched.map((a) => ({
      key: `action:${a.id}`,
      title: a.title,
      hint: a.hint,
      icon: <a.icon className="h-[18px] w-[18px] text-ink-2" strokeWidth={1.75} />,
      run: a.run,
    }))
    const web: Item = {
      key: 'web',
      title: isUrl ? `Abrir ${query}` : `Buscar "${query}" en Google`,
      hint: 'Navegador',
      icon: <Globe className="h-[18px] w-[18px] text-ink-2" strokeWidth={1.75} />,
      run: () => void dispatch('ui.openBrowser', isUrl ? { url: query } : { query }),
    }
    const ask: Item = {
      key: 'ask',
      title: `Pedir a Sky: "${query}"`,
      hint: aiReady ? 'Enter' : 'Configura la IA en Ajustes',
      icon: <Sparkles className="h-[18px] w-[18px] text-accent" strokeWidth={2} />,
      run: () => askMesa(query),
      keepFocus: aiReady,
    }
    const meaning: Item | null =
      aiReady && !isUrl && words >= 2 && semanticForQuery?.status !== 'done'
        ? {
            key: 'semantic',
            title: semanticForQuery?.status === 'running' ? 'Buscando por significado…' : `Buscar por significado: "${query}"`,
            hint: semanticForQuery?.status === 'running' ? undefined : 'Contenido, no nombre',
            icon:
              semanticForQuery?.status === 'running' ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin text-ink-3" />
              ) : (
                <ScanSearch className="h-[18px] w-[18px] text-ink-2" strokeWidth={1.75} />
              ),
            run: () => void useSemantic.getState().run(query),
            keepFocus: true,
            keepQuery: true,
          }
        : null

    const strongFile = files.length > 0 && norm(files[0].name).startsWith(nq)
    const strongAction = matched.length > 0 && norm(matched[0].title).startsWith(nq)
    const head = [...calcItems, ...flowItems, ...semanticItems]
    const tail = meaning ? [meaning, web] : [web]
    if (isUrl) return [...head, web, ask, ...fileItems, ...actionItems]
    if (strongFile || strongAction) return [...head, ...fileItems, ...actionItems, ask, ...tail]
    if (aiReady) return calc ? [...head, ...fileItems, ...actionItems, ask, ...tail] : [...head, ask, ...fileItems, ...actionItems, ...tail]
    return [...head, ...fileItems, ...actionItems, web, ask]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, flowMatches, query, aiReady, semanticForQuery])

  const resultsOpen = focused && !chatOpen && query.length > 0

  useEffect(() => {
    const el = listRef.current?.querySelectorAll('[data-item]')[idx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  const run = (item: Item | undefined) => {
    if (!item) return
    item.run()
    if (!item.keepQuery) {
      setQ('')
      setIdx(0)
    }
    if (!item.keepFocus) inputRef.current?.blur()
  }

  const submit = () => {
    if (chatOpen || pending.length > 0) {
      if (!query || chatRunning) return
      askMesa(query)
      setQ('')
      return
    }
    run(items[idx])
  }

  const placeholder =
    pending.length > 0
      ? 'Describe qué hacer con lo adjunto…'
      : chatOpen
        ? chatRunning
          ? 'Sky está trabajando…'
          : 'Responde o pide algo más…'
        : selectionCount > 0
          ? `${selectionCount} ${selectionCount === 1 ? 'elemento seleccionado' : 'elementos seleccionados'} · pide algo sobre ellos…`
          : aiReady
            ? 'Pide algo a Sky, busca un archivo o navega…'
            : 'Busca un archivo, ejecuta una acción o navega…'

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-[100000] flex flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {(minimized.length > 0 || pending.length > 0) && !chatOpen && (
          <motion.div
            key="chips"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="pointer-events-auto flex w-[min(800px,94vw)] flex-wrap items-center gap-1.5"
          >
            {pending.map((p) => (
              <span key={p.id} className="glass flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-1 text-[12px] text-ink shadow-soft">
                {p.part.type === 'image' ? (
                  <img src={`data:${p.part.mediaType};base64,${p.part.data}`} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <FileText className="h-4 w-4 text-ink-2" />
                )}
                <span className="max-w-[160px] truncate">{p.label}</span>
                <button
                  type="button"
                  aria-label="Quitar adjunto"
                  onClick={() => useSession.getState().detach(p.id)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {minimized.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => useWindows.getState().focus(w.id)}
                className="glass max-w-[200px] truncate rounded-full px-3 py-1 text-[12px] text-ink-2 shadow-soft transition hover:text-ink"
              >
                {w.title}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-[min(800px,94vw)]">
        <AnimatePresence>
          {chatOpen && <AssistantPanel key="assistant" />}
          {resultsOpen && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              onMouseDown={(e) => e.preventDefault()}
              className="glass pointer-events-auto absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-2xl shadow-win"
            >
              <ul ref={listRef} className="scrollbar-thin max-h-[46vh] overflow-y-auto p-2">
                {items.map((item, i) => (
                  <li key={item.key}>
                    {item.section && <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">{item.section}</div>}
                    <button
                      type="button"
                      data-item
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => run(item)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                        i === idx ? 'bg-accent-soft' : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center">{item.icon}</span>
                      <span className="flex-1 truncate text-[14px] text-ink">{item.title}</span>
                      {item.hint && <span className="max-w-[45%] shrink-0 truncate text-[12px] text-ink-3">{item.hint}</span>}
                      {i === idx && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-3" />}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={cn(
            'glass pointer-events-auto flex h-14 items-center gap-2 rounded-2xl pl-3 pr-2 shadow-win transition-shadow',
            focused && 'ring-1 ring-accent/40',
          )}
        >
          <button
            type="button"
            title={hasTurns ? (chatOpen ? 'Ocultar conversación' : 'Mostrar conversación') : 'Sky'}
            onClick={() => hasTurns && useSession.getState().setOpen(!chatOpen)}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-accent transition',
              hasTurns ? 'hover:bg-accent-soft' : 'cursor-default',
              chatOpen && 'bg-accent-soft',
            )}
          >
            {chatRunning ? <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={2} /> : <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} />}
          </button>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setIdx(0)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'ArrowDown' && resultsOpen) {
                e.preventDefault()
                setIdx((i) => Math.min(i + 1, items.length - 1))
              } else if (e.key === 'ArrowUp' && resultsOpen) {
                e.preventDefault()
                setIdx((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                if (q) setQ('')
                else if (pending.length) useSession.getState().clearPending()
                else if (chatOpen) useSession.getState().setOpen(false)
                else inputRef.current?.blur()
              }
            }}
            placeholder={placeholder}
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
          />
          {canDictate && (
            <button
              type="button"
              title={dictation.state === 'recording' ? 'Terminar y transcribir' : dictation.state === 'transcribing' ? 'Transcribiendo…' : 'Dictar (Whisper en Groq)'}
              aria-label="Dictar"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void dictation.toggle()}
              className={cn(
                'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition',
                dictation.state === 'recording' ? 'bg-danger/10 text-danger' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              {dictation.state === 'transcribing' ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Mic className="h-[18px] w-[18px]" strokeWidth={1.75} />}
              {dictation.state === 'recording' && <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-danger" />}
            </button>
          )}
          {canSee && !query && (
            <button
              type="button"
              title="Capturar pantalla para Sky"
              aria-label="Capturar pantalla"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void snapScreen()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            >
              <Camera className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          )}
          {query ? (
            <button
              type="button"
              aria-label="Enviar"
              disabled={chatOpen && chatRunning}
              onMouseDown={(e) => e.preventDefault()}
              onClick={submit}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-soft transition hover:brightness-110 active:scale-95 disabled:opacity-40"
            >
              <CornerDownLeft className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3 sm:inline">
              Ctrl K
            </kbd>
          )}

          <div className="mx-1 h-7 w-px shrink-0 bg-line-2" />

          <div className="flex shrink-0 items-center gap-0.5">
            <DockButton label="Archivos" onClick={() => void dispatch('ui.openFiles')}>
              <FolderOpen className="h-5 w-5" strokeWidth={1.6} />
            </DockButton>
            <DockButton label="Navegador" onClick={() => void dispatch('ui.openBrowser')}>
              <Globe className="h-5 w-5" strokeWidth={1.6} />
            </DockButton>
            <DockButton label="Nueva nota" onClick={() => void createFileAndOpen(ROOT_ID, 'note')}>
              <FilePlus2 className="h-5 w-5" strokeWidth={1.6} />
            </DockButton>
            {apps.map((a) => {
              const entry = catalogFor(a.id)
              return (
                <DockButton key={a.id} label={a.name} onClick={() => void dispatch('ui.openApp', { app: a.id })}>
                  <AppLogo item={{ id: a.id, name: a.name, color: entry?.color ?? '#6B7280', abbr: entry?.abbr ?? a.name.slice(0, 2), entry }} size={24} />
                </DockButton>
              )
            })}
            {apps.length > 0 && <div className="mx-0.5 h-6 w-px shrink-0 bg-line-2" />}
            <DockButton label="Papelera" onClick={() => void dispatch('ui.openTrash')} badge={(trashCount ?? 0) > 0}>
              <Trash2 className="h-5 w-5" strokeWidth={1.6} />
            </DockButton>
            <DockButton label="Ajustes" onClick={() => void dispatch('ui.openSettings')} badge={!aiReady}>
              <Settings2 className="h-5 w-5" strokeWidth={1.6} />
            </DockButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function DockButton({
  label,
  onClick,
  badge,
  children,
}: {
  label: string
  onClick: () => void
  badge?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface-2 hover:text-ink active:translate-y-0 active:scale-95"
    >
      {children}
      {badge && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />}
      <span className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-surface-solid opacity-0 shadow-soft transition-all duration-150 group-hover:-translate-y-0.5 group-hover:opacity-100">
        {label}
      </span>
    </button>
  )
}
