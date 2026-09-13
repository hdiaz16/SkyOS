import type { ComponentType } from 'react'
import { FolderOpen, FilePlus2, Sparkles, Trash2, Settings2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { dispatch } from '../kernel/commands'
import { ROOT_ID } from '../kernel/types'
import { useUi } from '../state/ui'
import { useWindows } from '../state/windows'
import { createNoteAndOpen } from '../lib/menus'

interface DockItem {
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  onClick: () => void
}

const ITEMS: DockItem[] = [
  { label: 'Archivos', icon: FolderOpen, onClick: () => void dispatch('ui.openFiles') },
  { label: 'Nueva nota', icon: FilePlus2, onClick: () => void createNoteAndOpen(ROOT_ID) },
  { label: 'Buscar o pedir', icon: Sparkles, onClick: () => useUi.getState().setPalette(true) },
  { label: 'Papelera', icon: Trash2, onClick: () => void dispatch('ui.openTrash') },
  { label: 'Ajustes', icon: Settings2, onClick: () => void dispatch('ui.openSettings') },
]

export function Dock() {
  const windows = useWindows((s) => s.windows)
  const minimized = windows.filter((w) => w.minimized)

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[100000] flex justify-center">
      <motion.div
        layout
        className="glass pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5 shadow-soft"
        transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      >
        {ITEMS.map((item) => (
          <DockButton key={item.label} label={item.label} onClick={item.onClick}>
            <item.icon className="h-[22px] w-[22px]" strokeWidth={1.6} />
          </DockButton>
        ))}

        <AnimatePresence initial={false}>
          {minimized.length > 0 && (
            <motion.div
              key="sep"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 1 }}
              exit={{ opacity: 0, width: 0 }}
              className="mx-1 h-7 bg-line-2"
            />
          )}
          {minimized.map((w) => (
            <motion.button
              key={w.id}
              type="button"
              layout
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              onClick={() => useWindows.getState().focus(w.id)}
              title={w.title}
              className="flex h-11 max-w-[140px] items-center rounded-xl px-3 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            >
              <span className="truncate">{w.title}</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function DockButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-11 w-11 items-center justify-center rounded-xl text-ink-2 transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface-2 hover:text-ink active:translate-y-0 active:scale-95"
    >
      {children}
      <span className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-surface-solid opacity-0 shadow-soft transition-all duration-150 group-hover:-translate-y-0.5 group-hover:opacity-100">
        {label}
      </span>
    </button>
  )
}
