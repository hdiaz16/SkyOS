import { nanoid } from 'nanoid'
import { db } from './db'

export type WidgetType = 'weather' | 'currency' | 'recent' | 'clock' | 'todo' | 'note' | 'timer' | 'html'

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
  weather: { place?: string; lat?: number; lon?: number }
  currency: { from: string; to: string; amount: number }
  recent: { limit: number }
  clock: { zones: ClockZone[] }
  todo: { items: TodoItem[] }
  note: { text: string }
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

/** Order used in menus: most useful first. */
export const WIDGET_TYPES: WidgetType[] = ['weather', 'currency', 'recent', 'clock', 'todo', 'note', 'timer', 'html']

/** Types a person can add by hand; html is only created by the AI on request. */
export const USER_WIDGET_TYPES: WidgetType[] = WIDGET_TYPES.filter((t) => t !== 'html')

interface WidgetMeta {
  label: string
  description: string
  w: number
  h: number
  defaults: () => WidgetConfig
}

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  weather: {
    label: 'Clima',
    description: 'Temperatura actual y pronóstico de tres días para tu ubicación o una ciudad.',
    w: 300,
    h: 232,
    defaults: () => ({}),
  },
  currency: {
    label: 'Divisas',
    description: 'Tipo de cambio del día entre dos monedas, con monto editable.',
    w: 300,
    h: 196,
    defaults: () => ({ from: 'USD', to: 'MXN', amount: 1 }),
  },
  recent: {
    label: 'Recientes',
    description: 'Los últimos archivos que modificaste, listos para abrir.',
    w: 300,
    h: 250,
    defaults: () => ({ limit: 6 }),
  },
  clock: {
    label: 'Reloj mundial',
    description: 'Hora local y en otras zonas horarias.',
    w: 300,
    h: 232,
    defaults: () => ({
      zones: [
        { label: 'Madrid', timeZone: 'Europe/Madrid' },
        { label: 'Nueva York', timeZone: 'America/New_York' },
        { label: 'Tokio', timeZone: 'Asia/Tokyo' },
      ],
    }),
  },
  todo: { label: 'Tareas', description: 'Lista corta de pendientes.', w: 300, h: 280, defaults: () => ({ items: [] }) },
  note: { label: 'Nota rápida', description: 'Un espacio para apuntar sin abrir nada.', w: 280, h: 220, defaults: () => ({ text: '' }) },
  timer: { label: 'Temporizador', description: 'Cuenta regresiva con avisos.', w: 260, h: 224, defaults: () => ({ seconds: 25 * 60, endsAt: null }) },
  html: { label: 'Widget de Sky', description: 'Contenido hecho a medida por la IA.', w: 380, h: 300, defaults: () => ({ html: '' }) },
}

const now = () => Date.now()

const MARGIN = 28
const TOP = 64
const GAP = 16
const BOTTOM_RESERVED = 140
const COLUMN = 300

/**
 * Stacks new widgets down fixed-width columns starting at the right edge, opening a column to the left
 * when the current one is full. Widgets the user moved elsewhere still count for the column they sit in.
 */
function nextPosition(existing: Widget[], w: number, h: number): { x: number; y: number } {
  const maxBottom = window.innerHeight - BOTTOM_RESERVED
  const columns = Math.max(1, Math.floor((window.innerWidth - MARGIN * 2) / (COLUMN + GAP)))
  for (let col = 0; col < columns; col++) {
    const right = window.innerWidth - MARGIN - col * (COLUMN + GAP)
    const left = right - COLUMN
    const inColumn = existing.filter((e) => {
      const center = e.x + e.w / 2
      return center > left - GAP && center <= right + GAP
    })
    const y = inColumn.reduce((acc, e) => Math.max(acc, e.y + e.h + GAP), TOP)
    if (y + h <= maxBottom) return { x: Math.max(24, right - w), y }
  }
  const n = existing.length
  return { x: Math.max(24, window.innerWidth - MARGIN - w - (n % 5) * 24), y: TOP + (n % 5) * 24 }
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
