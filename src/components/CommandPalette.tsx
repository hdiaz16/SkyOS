import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import {
  CornerDownLeft,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Settings2,
  Sparkles,
  SunMoon,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react'
import { fs } from '../kernel/fs'
import { ROOT_ID, fileKind, type FsNode } from '../kernel/types'
import { dispatch, undoLast } from '../kernel/commands'
import { useUi } from '../state/ui'
import { createFolderAndRename, createNoteAndOpen, importInto } from '../lib/menus'
import { cn } from '../lib/utils'
import { KindIcon } from './KindIcon'

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
  { id: 'new-folder', title: 'Nueva carpeta', hint: 'en el escritorio', keywords: ['carpeta', 'folder', 'crear'], icon: FolderPlus, run: () => void createFolderAndRename(ROOT_ID) },
  { id: 'new-note', title: 'Nueva nota', hint: 'en el escritorio', keywords: ['nota', 'texto', 'markdown', 'crear', 'escribir'], icon: FilePlus2, run: () => void createNoteAndOpen(ROOT_ID) },
  { id: 'import', title: 'Importar archivos…', hint: 'desde tu computadora', keywords: ['subir', 'importar', 'upload', 'archivo'], icon: Upload, run: () => importInto(ROOT_ID) },
  { id: 'files', title: 'Abrir Archivos', keywords: ['explorador', 'archivos', 'carpetas', 'escritorio'], icon: FolderOpen, run: () => void dispatch('ui.openFiles') },
  { id: 'trash', title: 'Abrir papelera', keywords: ['papelera', 'basura', 'trash', 'borrados'], icon: Trash2, run: () => void dispatch('ui.openTrash') },
  { id: 'settings', title: 'Ajustes', keywords: ['configuracion', 'preferencias', 'settings', 'opciones'], icon: Settings2, run: () => void dispatch('ui.openSettings') },
  { id: 'theme', title: 'Cambiar tema', hint: 'sistema, claro, oscuro', keywords: ['tema', 'oscuro', 'claro', 'dark', 'light', 'modo'], icon: SunMoon, run: () => void dispatch('ui.theme') },
  { id: 'undo', title: 'Deshacer última acción', hint: 'Ctrl Z', keywords: ['deshacer', 'undo', 'revertir'], icon: Undo2, run: () => void undoLast() },
]

interface Item {
  key: string
  title: string
  hint?: string
  icon: ReactNode
  run: () => void
}

const NO_FILES: FsNode[] = []

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function matchAction(a: Action, q: string): boolean {
  if (!q) return true
  const n = norm(q)
  return norm(a.title).includes(n) || a.keywords.some((k) => norm(k).includes(n))
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const setPalette = useUi((s) => s.setPalette)
  return <AnimatePresence>{open && <Palette key="palette" close={() => setPalette(false)} />}</AnimatePresence>
}

function Palette({ close }: { close: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const files = useLiveQuery(() => fs.search(q, 8), [q], NO_FILES)

  const items = useMemo<Item[]>(() => {
    const fileItems: Item[] = files.map((n: FsNode) => ({
      key: `file:${n.id}`,
      title: n.name,
      hint: n.kind === 'folder' ? 'Carpeta' : 'Archivo',
      icon: <KindIcon kind={fileKind(n)} className="h-6 w-6" />,
      run: () => void dispatch('ui.open', { id: n.id }),
    }))
    const actionItems: Item[] = ACTIONS.filter((a) => matchAction(a, q)).map((a) => ({
      key: `action:${a.id}`,
      title: a.title,
      hint: a.hint,
      icon: <a.icon className="h-[18px] w-[18px] text-ink-2" strokeWidth={1.75} />,
      run: a.run,
    }))
    return [...fileItems, ...actionItems]
  }, [files, q])

  useEffect(() => {
    const el = listRef.current?.children[idx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  const runItem = (item: Item | undefined) => {
    if (!item) return
    close()
    item.run()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[200000] flex items-start justify-center pt-[16vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      onMouseDown={close}
    >
      <div className="absolute inset-0 bg-black/10 dark:bg-black/40" />
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.99, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        className="glass relative w-[640px] max-w-[92vw] overflow-hidden rounded-2xl shadow-win"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 items-center gap-3 border-b border-line px-4">
          <Sparkles className="h-4.5 w-4.5 shrink-0 text-accent" strokeWidth={2} />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setIdx(0)
            }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIdx((i) => Math.min(i + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIdx((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                runItem(items[idx])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
            placeholder="Busca un archivo o escribe una acción…"
            className="h-full flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
            spellCheck={false}
          />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3">esc</kbd>
        </div>

        <ul ref={listRef} className="scrollbar-thin max-h-[380px] overflow-y-auto p-2">
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-[13px] text-ink-3">Nada coincide con “{q}”.</li>
          )}
          {items.map((item, i) => (
            <li key={item.key}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => runItem(item)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                  i === idx ? 'bg-accent-soft' : 'hover:bg-surface-2',
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center">{item.icon}</span>
                <span className="flex-1 truncate text-[14px] text-ink">{item.title}</span>
                {item.hint && <span className="shrink-0 text-[12px] text-ink-3">{item.hint}</span>}
                {i === idx && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-3" />}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-[11px] text-ink-3">
          <Sparkles className="h-3 w-3" />
          Pronto podrás pedir cosas aquí en lenguaje natural.
        </div>
      </motion.div>
    </motion.div>
  )
}
