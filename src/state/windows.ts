import { create } from 'zustand'
import { play } from '../system/sound'
import { nanoid } from 'nanoid'

export type AppId = 'files' | 'editor' | 'image' | 'pdf' | 'browser' | 'result' | 'terminal' | 'trash' | 'settings' | 'office' | 'app' | 'canvas'

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
  /** Last time the window was opened or brought to the front; lets Sky tell what the person has not used in a while. */
  touchedAt: number
  /** Geometry to go back to after a snap or maximize. */
  prev?: Geometry
  maximized?: boolean
  /** True right after the system placed the window (snap, arrange, stack): the frame glides there instead of jumping, then clears it. */
  settling?: boolean
}

export type Geometry = Pick<Win, 'x' | 'y' | 'w' | 'h'>
export type SnapTarget = 'left' | 'right' | 'max'

/** Where windows may live: under the top bar, above the command bar, with a little air at the sides. */
export function workspace(): Geometry {
  const margin = 12
  const top = 52
  const bottom = 100
  return { x: margin, y: top, w: Math.max(320, window.innerWidth - margin * 2), h: Math.max(240, window.innerHeight - top - bottom) }
}

/**
 * Puts every window back inside a screen that just got smaller. A maximised one grows or shrinks with it; the
 * rest keep their size and only slide in, so that their header — the only part you can grab — is always
 * within reach. Nothing moves that does not have to.
 */
export function fitAll(): void {
  const ws = workspace()
  const max = snapGeometry('max')
  const patches: Array<Partial<Win> & { id: string }> = []
  for (const w of useWindows.getState().windows) {
    if (w.maximized) {
      if (w.x !== max.x || w.y !== max.y || w.w !== max.w || w.h !== max.h) patches.push({ id: w.id, ...max })
      continue
    }
    const width = Math.min(w.w, ws.w)
    const height = Math.min(w.h, ws.h)
    // At least a hand's width of header has to stay on screen, and never above the top bar.
    const grab = 120
    const x = Math.min(Math.max(w.x, ws.x - width + grab), ws.x + ws.w - grab)
    const y = Math.min(Math.max(w.y, ws.y), ws.y + ws.h - 36)
    if (x !== w.x || y !== w.y || width !== w.w || height !== w.h) patches.push({ id: w.id, x, y, w: width, h: height })
  }
  if (patches.length) useWindows.getState().patchMany(patches)
}

/**
 * The size to come back to. A window that is already snapped keeps the one it had: snapping left twice, or
 * left and then maximised, used to make «restaura la ventana» point at the half screen, and the size the
 * person had chosen was gone for good.
 */
function prevFor(w: Win): Win['prev'] {
  if (w.maximized || isSnapped(w)) return w.prev
  return { x: w.x, y: w.y, w: w.w, h: w.h }
}

const isSnapped = (w: Win): boolean =>
  (['left', 'right', 'max'] as const).some((t) => {
    const g = snapGeometry(t)
    return Math.abs(g.x - w.x) < 2 && Math.abs(g.y - w.y) < 2 && Math.abs(g.w - w.w) < 2 && Math.abs(g.h - w.h) < 2
  })

export function snapGeometry(target: SnapTarget): Geometry {
  const ws = workspace()
  if (target === 'max') return ws
  const gap = 12
  const half = Math.floor((ws.w - gap) / 2)
  return target === 'left' ? { x: ws.x, y: ws.y, w: half, h: ws.h } : { x: ws.x + half + gap, y: ws.y, w: ws.w - half - gap, h: ws.h }
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
  /** Sends the window to a half of the screen or the whole workspace, remembering where it was. */
  snap: (id: string, target: SnapTarget) => void
  /** Whole workspace, or back to where it was. */
  toggleMaximize: (id: string) => void
  /** Windows hidden by Zen mode, or null when Zen is off. */
  zen: string[] | null
  /** Zen: every window but the active one fades away; again brings them back. */
  toggleZen: () => void
  /** Gathers the visible windows behind the active one as a deck ordered by recent use. */
  stack: () => void
  /** The frame reports that a placement finished animating. */
  settled: (id: string) => void
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
  office: { w: 920, h: 700, title: 'Documento' },
  app: { w: 860, h: 620, title: 'App' },
  canvas: { w: 1000, h: 680, title: 'Lienzo' },
}

export const MIN_W = 360
export const MIN_H = 240

const place = (w: Win, g: Geometry, extra: Partial<Win> = {}): Win => ({ ...w, ...g, settling: true, ...extra })

export const useWindows = create<WindowsState>((set, get) => ({
  windows: [],
  nextZ: 10,
  zen: null,

  open: (app, opts = {}) => {
    const state = get()
    const existing = state.windows.find(
      (w) => w.app === app && (opts.singleton || (opts.props?.nodeId && w.props.nodeId === opts.props.nodeId)),
    )
    if (existing) {
      state.focus(existing.id)
      return existing.id
    }
    play('open')
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
        { id, app, title: opts.title ?? d.title, x, y, w, h, z: s.nextZ, minimized: false, props: opts.props ?? {}, touchedAt: Date.now() },
      ],
      nextZ: s.nextZ + 1,
    }))
    return id
  },

  close: (id) => {
    if (get().windows.some((w) => w.id === id)) play('close')
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) }))
  },

  closeForNode: (nodeId) =>
    set((s) => ({ windows: s.windows.filter((w) => w.props.nodeId !== nodeId && w.props.folderId !== nodeId) })),

  focus: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, z: s.nextZ, minimized: false, touchedAt: Date.now() } : w)),
      nextZ: s.nextZ + 1,
    })),

  minimize: (id) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)) })),

  // Moving or resizing by hand ends the maximised state. Leaving the flag on meant the green button kept
  // offering "Restaurar tamaño" over a window that was no longer maximised, and pressing it threw the window
  // back to an old geometry instead of filling the screen.
  move: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, x: Math.round(x), y: Math.max(28, Math.round(y)), maximized: false, prev: undefined } : w,
      ),
    })),

  resize: (id, w, h) =>
    set((s) => ({
      windows: s.windows.map((win) =>
        win.id === id ? { ...win, w: Math.max(MIN_W, Math.round(w)), h: Math.max(MIN_H, Math.round(h)), maximized: false, prev: undefined } : win,
      ),
    })),

  setTitle: (id, title) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)) })),

  setProps: (id, props) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, props: { ...w.props, ...props } } : w)) })),

  restore: (win) =>
    set((s) =>
      s.windows.some((w) => w.id === win.id)
        ? s
        : { windows: [...s.windows, { ...win, z: s.nextZ, minimized: false, touchedAt: Date.now() }], nextZ: s.nextZ + 1 },
    ),

  snap: (id, target) =>
    set((s) => ({
      ...(play('snap'), {}),
      windows: s.windows.map((w) => (w.id === id ? place(w, snapGeometry(target), { prev: prevFor(w), maximized: target === 'max' }) : w)),
    })),

  toggleMaximize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w
        if (w.maximized && w.prev) return place(w, w.prev, { maximized: false, prev: undefined })
        return place(w, snapGeometry('max'), { prev: { x: w.x, y: w.y, w: w.w, h: w.h }, maximized: true })
      }),
    })),

  settled: (id) => set((s) => (s.windows.some((w) => w.id === id && w.settling) ? { windows: s.windows.map((w) => (w.id === id ? { ...w, settling: false } : w)) } : s)),

  toggleZen: () =>
    set((s) => {
      if (s.zen) {
        const back = new Set(s.zen)
        return { zen: null, windows: s.windows.map((w) => (back.has(w.id) ? { ...w, minimized: false } : w)) }
      }
      let top: Win | undefined
      for (const w of s.windows) if (!w.minimized && (!top || w.z > top.z)) top = w
      const hidden = s.windows.filter((w) => !w.minimized && w.id !== top?.id).map((w) => w.id)
      if (!hidden.length) return s
      const gone = new Set(hidden)
      return { zen: hidden, windows: s.windows.map((w) => (gone.has(w.id) ? { ...w, minimized: true } : w)) }
    }),

  stack: () =>
    set((s) => {
      const visible = s.windows.filter((w) => !w.minimized).sort((a, b) => b.touchedAt - a.touchedAt)
      if (visible.length < 2) return s
      const lead = visible[0]
      const ws = workspace()
      const w = Math.min(lead.w, ws.w - 16 * (visible.length - 1))
      const h = Math.min(lead.h, ws.h - 14 * (visible.length - 1))
      const x0 = Math.max(ws.x, Math.min(lead.x, ws.x + ws.w - w - 16 * (visible.length - 1)))
      const y0 = Math.max(ws.y + 14 * (visible.length - 1), Math.min(lead.y, ws.y + ws.h - h))
      const order = new Map(visible.map((win, i) => [win.id, i]))
      let z = s.nextZ
      return {
        nextZ: s.nextZ + visible.length,
        windows: s.windows.map((win) => {
          const i = order.get(win.id)
          if (i === undefined) return win
          return place(win, { x: x0 + 16 * i, y: y0 - 14 * i, w, h }, { z: z + visible.length - 1 - i, maximized: false })
        }),
      }
    }),

  patchMany: (patches) =>
    set((s) => {
      const byId = new Map(patches.map((p) => [p.id, p]))
      return {
        windows: s.windows.map((w) => {
          const p = byId.get(w.id)
          if (!p) return w
          const next = { ...w, ...p, settling: true }
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
