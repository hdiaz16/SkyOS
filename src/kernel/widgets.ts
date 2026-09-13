import { nanoid } from 'nanoid'
import { db } from './db'

export type WidgetType = 'clock' | 'note' | 'todo' | 'timer' | 'html'

export interface ClockZone {
  label: string
  timeZone: string
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

/** Per-type configuration. Components apply defaults for anything missing. */
export interface WidgetConfigs {
  clock: { zones: ClockZone[] }
  note: { text: string }
  todo: { items: TodoItem[] }
  timer: { seconds: number; label?: string; endsAt: number | null; remaining?: number }
  html: { html: string }
}

export type WidgetConfig = Partial<WidgetConfigs[WidgetType]> & Record<string, unknown>

export interface Widget {
  id: string
  type: WidgetType
  title: string
  x: number
  y: number
  w: number
  h: number
  config: WidgetConfig
  createdAt: number
  updatedAt: number
}

export const WIDGET_TYPES: WidgetType[] = ['clock', 'note', 'todo', 'timer', 'html']

interface WidgetMeta {
  label: string
  w: number
  h: number
  defaults: () => WidgetConfig
}

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  clock: {
    label: 'Reloj mundial',
    w: 300,
    h: 190,
    defaults: () => ({
      zones: [
        { label: 'Aquí', timeZone: LOCAL_TZ },
        { label: 'Madrid', timeZone: 'Europe/Madrid' },
        { label: 'Nueva York', timeZone: 'America/New_York' },
        { label: 'Tokio', timeZone: 'Asia/Tokyo' },
      ],
    }),
  },
  note: { label: 'Nota rápida', w: 260, h: 220, defaults: () => ({ text: '' }) },
  todo: { label: 'Lista de tareas', w: 280, h: 280, defaults: () => ({ items: [] }) },
  timer: { label: 'Temporizador', w: 240, h: 190, defaults: () => ({ seconds: 25 * 60, endsAt: null }) },
  html: { label: 'Widget personalizado', w: 380, h: 300, defaults: () => ({ html: '' }) },
}

const now = () => Date.now()

const MARGIN = 28
const TOP = 64
const GAP = 16
const BOTTOM_RESERVED = 140

/** Stacks new widgets down the right edge, opening a new column to the left when one fills up. */
function nextPosition(existing: Widget[], w: number, h: number): { x: number; y: number } {
  const maxBottom = window.innerHeight - BOTTOM_RESERVED
  let columnRight = window.innerWidth - MARGIN
  for (let col = 0; col < 4; col++) {
    const x = Math.max(24, columnRight - w)
    const inColumn = existing.filter((e) => e.x + e.w > x && e.x < x + w)
    const y = inColumn.reduce((acc, e) => Math.max(acc, e.y + e.h + GAP), TOP)
    if (y + h <= maxBottom || inColumn.length === 0) return { x, y: Math.min(y, Math.max(TOP, maxBottom - h)) }
    columnRight = Math.max(200, x - GAP)
  }
  return { x: 24 + existing.length * 12, y: TOP + existing.length * 12 }
}

export const widgets = {
  list: () => db.widgets.orderBy('updatedAt').toArray(),
  get: (id: string) => db.widgets.get(id),

  async create(
    type: WidgetType,
    opts: { title?: string; config?: WidgetConfig; x?: number; y?: number; w?: number; h?: number } = {},
  ): Promise<Widget> {
    const meta = WIDGET_META[type]
    const existing = await db.widgets.toArray()
    const w = opts.w ?? meta.w
    const h = opts.h ?? meta.h
    const pos = nextPosition(existing, w, h)
    const t = now()
    const widget: Widget = {
      id: nanoid(8),
      type,
      title: (opts.title ?? '').trim() || meta.label,
      x: opts.x ?? pos.x,
      y: opts.y ?? pos.y,
      w,
      h,
      config: { ...meta.defaults(), ...(opts.config ?? {}) },
      createdAt: t,
      updatedAt: t,
    }
    await db.widgets.add(widget)
    return widget
  },

  async update(id: string, patch: { title?: string; config?: WidgetConfig }): Promise<Widget> {
    const current = await db.widgets.get(id)
    if (!current) throw new Error('El widget ya no existe')
    const next: Widget = {
      ...current,
      title: patch.title?.trim() || current.title,
      config: patch.config ? { ...current.config, ...patch.config } : current.config,
      updatedAt: now(),
    }
    await db.widgets.put(next)
    return next
  },

  /** Silent config write for continuous edits (typing in a note, ticking a task). Not journaled. */
  async setConfig(id: string, config: WidgetConfig): Promise<void> {
    const current = await db.widgets.get(id)
    if (!current) return
    await db.widgets.update(id, { config: { ...current.config, ...config }, updatedAt: now() })
  },

  async place(id: string, geometry: Partial<Pick<Widget, 'x' | 'y' | 'w' | 'h'>>): Promise<void> {
    await db.widgets.update(id, geometry)
  },

  async remove(id: string): Promise<Widget | undefined> {
    const current = await db.widgets.get(id)
    if (current) await db.widgets.delete(id)
    return current
  },

  async restore(widget: Widget): Promise<void> {
    await db.widgets.put(widget)
  },
}
