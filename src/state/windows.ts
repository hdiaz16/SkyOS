import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type AppId = 'files' | 'editor' | 'image' | 'pdf' | 'browser' | 'result' | 'terminal' | 'trash' | 'settings'

export interface WindowProps {
  nodeId?: string
  folderId?: string
  url?: string
  taskId?: string
  /** Ajustes: section to show, and app to highlight inside Apps conectadas. */
  section?: string
  app?: string
}

export interface Win {
  id: string
  app: AppId
  title: string
  x: number
  y: number
  w: number
  h: number
  z: number
  minimized: boolean
  props: WindowProps
}

interface OpenOptions {
  title?: string
  props?: WindowProps
  w?: number
  h?: number
  /** Only one window of this app may exist; reuse it. */
  singleton?: boolean
}

interface WindowsState {
  windows: Win[]
  nextZ: number
  open: (app: AppId, opts?: OpenOptions) => string
  close: (id: string) => void
  closeForNode: (nodeId: string) => void
  focus: (id: string) => void
  minimize: (id: string) => void
  move: (id: string, x: number, y: number) => void
  resize: (id: string, w: number, h: number) => void
  setTitle: (id: string, title: string) => void
  setProps: (id: string, props: WindowProps) => void
  /** Puts a previously closed window back, on top. Used by undo. */
  restore: (win: Win) => void
  /** Applies several geometry or state patches in one update. */
  patchMany: (patches: Array<Partial<Win> & { id: string }>) => void
}

const DEFAULTS: Record<AppId, { w: number; h: number; title: string }> = {
  files: { w: 780, h: 520, title: 'Archivos' },
  editor: { w: 680, h: 540, title: 'Editor' },
  image: { w: 760, h: 560, title: 'Imagen' },
  pdf: { w: 840, h: 660, title: 'Documento' },
  browser: { w: 1000, h: 680, title: 'Navegador' },
  result: { w: 640, h: 540, title: 'Sky' },
  terminal: { w: 720, h: 440, title: 'Terminal' },
  trash: { w: 640, h: 460, title: 'Papelera' },
  settings: { w: 820, h: 600, title: 'Ajustes' },
}

const MIN_W = 360
const MIN_H = 240

export const useWindows = create<WindowsState>((set, get) => ({
  windows: [],
  nextZ: 10,

  open: (app, opts = {}) => {
    const state = get()
    const existing = state.windows.find(
      (w) => w.app === app && (opts.singleton || (opts.props?.nodeId && w.props.nodeId === opts.props.nodeId)),
    )
    if (existing) {
      state.focus(existing.id)
      return existing.id
    }
    const d = DEFAULTS[app]
    const w = Math.min(opts.w ?? d.w, window.innerWidth - 32)
    const h = Math.min(opts.h ?? d.h, window.innerHeight - 96)
    const n = state.windows.length % 6
    const x = Math.max(16, Math.round((window.innerWidth - w) / 2 + n * 28 - 70))
    const y = Math.max(44, Math.round((window.innerHeight - h) / 2 + n * 22 - 60))
    const id = nanoid(6)
    set((s) => ({
      windows: [
        ...s.windows,
        { id, app, title: opts.title ?? d.title, x, y, w, h, z: s.nextZ, minimized: false, props: opts.props ?? {} },
      ],
      nextZ: s.nextZ + 1,
    }))
    return id
  },

  close: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

  closeForNode: (nodeId) =>
    set((s) => ({ windows: s.windows.filter((w) => w.props.nodeId !== nodeId && w.props.folderId !== nodeId) })),

  focus: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, z: s.nextZ, minimized: false } : w)),
      nextZ: s.nextZ + 1,
    })),

  minimize: (id) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)) })),

  move: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, x: Math.round(x), y: Math.max(28, Math.round(y)) } : w,
      ),
    })),

  resize: (id, w, h) =>
    set((s) => ({
      windows: s.windows.map((win) =>
        win.id === id ? { ...win, w: Math.max(MIN_W, Math.round(w)), h: Math.max(MIN_H, Math.round(h)) } : win,
      ),
    })),

  setTitle: (id, title) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)) })),

  setProps: (id, props) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, props: { ...w.props, ...props } } : w)) })),

  restore: (win) =>
    set((s) =>
      s.windows.some((w) => w.id === win.id)
        ? s
        : { windows: [...s.windows, { ...win, z: s.nextZ, minimized: false }], nextZ: s.nextZ + 1 },
    ),

  patchMany: (patches) =>
    set((s) => {
      const byId = new Map(patches.map((p) => [p.id, p]))
      return {
        windows: s.windows.map((w) => {
          const p = byId.get(w.id)
          if (!p) return w
          const next = { ...w, ...p }
          return {
            ...next,
            x: Math.round(next.x),
            y: Math.max(28, Math.round(next.y)),
            w: Math.max(MIN_W, Math.round(next.w)),
            h: Math.max(MIN_H, Math.round(next.h)),
          }
        }),
      }
    }),
}))
