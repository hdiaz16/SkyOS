import { registerCommand } from '../commands'
import { fs } from '../fs'
import { useWindows, type Win } from '../../state/windows'
import { useUi } from '../../state/ui'
import { useSettings } from '../../state/settings'
import { endSession } from '../../system/session'

interface WindowSummary {
  id: string
  app: string
  title: string
  minimized: boolean
  active: boolean
  /** Minutes since the window was last opened or brought to the front. */
  idleMinutes: number
}

/** A window nobody has touched for this long counts as stale. */
const STALE_MS = 10 * 60_000
const idleMinutes = (w: Win) => Math.round((Date.now() - w.touchedAt) / 60_000)

function activeId(windows: Win[]): string | undefined {
  let top: Win | undefined
  for (const w of windows) if (!w.minimized && (!top || w.z > top.z)) top = w
  return top?.id
}

/** Words that make these commands relevant; without one of them in the request, their tools stay home. */
const WINDOW_WORDS = ['ventana', 'ventanas', 'minimiza', 'minimizar', 'cierra', 'cerrar', 'ordena', 'ordenar', 'acomoda', 'acomodar', 'cascada', 'cuadricula', 'cuadrícula', 'limpia', 'limpiar', 'despeja', 'abiertas', 'sesion', 'sesión', 'salir', 'logout', 'sistema', 'estado', 'hora', 'fecha', 'almacenamiento', 'espacio', 'version', 'versión']

registerCommand<Record<string, never>, WindowSummary[]>({
  id: 'ui.windows',
  keywords: WINDOW_WORDS,
  title: 'Ventanas abiertas',
  description: 'Lista las ventanas abiertas: aplicación, título, cuál está activa, cuáles están minimizadas y cuántos minutos lleva cada una sin usarse.',
  params: {},
  async run() {
    const { windows } = useWindows.getState()
    const active = activeId(windows)
    return {
      result: windows.map((w) => ({ id: w.id, app: w.app, title: w.title, minimized: w.minimized, active: w.id === active, idleMinutes: idleMinutes(w) })),
    }
  },
})

type Scope = 'all' | 'inactive' | 'minimized' | 'stale'

function targets(scope: Scope, ids?: string[]): Win[] {
  const { windows } = useWindows.getState()
  if (ids?.length) return windows.filter((w) => ids.includes(w.id))
  const active = activeId(windows)
  switch (scope) {
    case 'all':
      return windows
    case 'inactive':
      return windows.filter((w) => w.id !== active)
    case 'minimized':
      return windows.filter((w) => w.minimized)
    case 'stale':
      return windows.filter((w) => w.id !== active && (w.minimized || Date.now() - w.touchedAt >= STALE_MS))
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

registerCommand<{ ids?: string[]; scope?: Scope }, number>({
  id: 'ui.closeWindows',
  keywords: WINDOW_WORDS,
  title: 'Cerrar ventanas',
  description:
    'Cierra ventanas por id o por alcance: "all" (todas), "inactive" (todas menos la activa), "minimized" (solo minimizadas), "stale" (las que llevan 10 minutos o más sin usarse o están minimizadas; ideal para "cierra lo que no estoy usando").',
  params: {
    ids: { type: 'array', items: { type: 'string', description: 'Id de ventana' }, description: 'Ventanas concretas.' },
    scope: { type: 'string', description: 'Alcance cuando no se dan ids.', enum: ['all', 'inactive', 'minimized', 'stale'] },
  },
  async run({ ids, scope = 'stale' }) {
    const wins = targets(scope, ids)
    if (!wins.length) return { result: 0 }
    const wm = useWindows.getState()
    for (const w of wins) wm.close(w.id)
    return {
      result: wins.length,
      label: `${plural(wins.length, 'ventana cerrada', 'ventanas cerradas')}`,
      undo: async () => {
        const s = useWindows.getState()
        for (const w of wins) s.restore(w)
      },
    }
  },
})

registerCommand<{ ids?: string[]; scope?: Scope }, number>({
  id: 'ui.minimizeWindows',
  keywords: WINDOW_WORDS,
  title: 'Minimizar ventanas',
  description: 'Minimiza ventanas por id o por alcance: "all", "inactive" (todas menos la activa) o "stale" (sin usar 10 minutos o más).',
  params: {
    ids: { type: 'array', items: { type: 'string', description: 'Id de ventana' }, description: 'Ventanas concretas.' },
    scope: { type: 'string', description: 'Alcance cuando no se dan ids.', enum: ['all', 'inactive', 'stale'] },
  },
  async run({ ids, scope = 'inactive' }) {
    const wins = targets(scope, ids).filter((w) => !w.minimized)
    if (!wins.length) return { result: 0 }
    const wm = useWindows.getState()
    for (const w of wins) wm.minimize(w.id)
    return {
      result: wins.length,
      label: plural(wins.length, 'ventana minimizada', 'ventanas minimizadas'),
      undo: async () => {
        const s = useWindows.getState()
        for (const w of wins) s.focus(w.id)
      },
    }
  },
})

type Layout = 'grid' | 'cascade' | 'columns' | 'rows'

const TOP = 52
const BOTTOM = 104
const GAP = 12

function computeLayout(wins: Win[], layout: Layout): Array<Partial<Win> & { id: string }> {
  const W = window.innerWidth
  const H = window.innerHeight - TOP - BOTTOM
  const n = wins.length
  if (layout === 'cascade') {
    return wins.map((w, i) => ({
      id: w.id,
      x: 24 + i * 32,
      y: TOP + i * 28,
      w: Math.min(w.w, W - 48 - i * 32),
      h: Math.min(w.h, H - i * 28),
    }))
  }
  let cols = 1
  let rows = 1
  if (layout === 'columns') cols = n
  else if (layout === 'rows') rows = n
  else {
    cols = Math.ceil(Math.sqrt(n))
    rows = Math.ceil(n / cols)
  }
  const cw = (W - GAP * (cols + 1)) / cols
  const ch = (H - GAP * (rows + 1)) / rows
  return wins.map((w, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    return { id: w.id, x: GAP + c * (cw + GAP), y: TOP + GAP + r * (ch + GAP), w: cw, h: ch }
  })
}

registerCommand<{ layout?: Layout }, number>({
  id: 'ui.arrangeWindows',
  keywords: WINDOW_WORDS,
  title: 'Ordenar ventanas',
  description: 'Acomoda las ventanas visibles: "grid" (cuadrícula), "cascade" (cascada), "columns" o "rows".',
  params: { layout: { type: 'string', description: 'Disposición.', enum: ['grid', 'cascade', 'columns', 'rows'] } },
  async run({ layout = 'grid' }) {
    const wins = useWindows.getState().windows.filter((w) => !w.minimized)
    if (!wins.length) return { result: 0 }
    const before = wins.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h }))
    useWindows.getState().patchMany(computeLayout(wins, layout))
    const names: Record<Layout, string> = { grid: 'en cuadrícula', cascade: 'en cascada', columns: 'en columnas', rows: 'en filas' }
    return {
      result: wins.length,
      label: `${plural(wins.length, 'ventana ordenada', 'ventanas ordenadas')} ${names[layout]}`,
      undo: async () => useWindows.getState().patchMany(before),
    }
  },
})

registerCommand<{ mode?: 'minimize' | 'close' }, unknown>({
  id: 'ui.cleanDesktop',
  keywords: WINDOW_WORDS,
  title: 'Limpiar escritorio',
  description: 'Deja solo la ventana activa. Por defecto minimiza las demás; con mode "close" las cierra. Quita la selección.',
  params: { mode: { type: 'string', description: 'minimize (por defecto) o close.', enum: ['minimize', 'close'] } },
  async run({ mode = 'minimize' }) {
    const wins = targets('inactive').filter((w) => mode === 'close' || !w.minimized)
    const wm = useWindows.getState()
    for (const w of wins) {
      if (mode === 'close') wm.close(w.id)
      else wm.minimize(w.id)
    }
    useUi.getState().clearSelection()
    if (!wins.length) return { result: { affected: 0 }, label: 'El escritorio ya estaba limpio' }
    return {
      result: { affected: wins.length, mode },
      label: `Escritorio limpio: ${plural(wins.length, 'ventana', 'ventanas')} ${mode === 'close' ? 'cerradas' : 'minimizadas'}`,
      undo: async () => {
        const s = useWindows.getState()
        for (const w of wins) {
          if (mode === 'close') s.restore(w)
          else s.focus(w.id)
        }
      },
    }
  },
})

registerCommand<Record<string, never>, void>({
  id: 'system.logout',
  keywords: WINDOW_WORDS,
  title: 'Cerrar sesión',
  description: 'Cierra la sesión de la persona actual y vuelve a la pantalla de inicio. Sus archivos se conservan.',
  params: {},
  async run() {
    endSession()
    return { result: undefined }
  },
})

registerCommand<Record<string, never>, unknown>({
  id: 'system.info',
  keywords: WINDOW_WORDS,
  title: 'Estado del sistema',
  description: 'Fecha y hora, tema, conteo de archivos y carpetas, ventanas abiertas y motor de almacenamiento.',
  params: {},
  async run() {
    const stats = await fs.stats()
    const { windows } = useWindows.getState()
    return {
      result: {
        now: new Date().toString(),
        theme: useSettings.getState().theme,
        files: stats.files,
        folders: stats.folders,
        openWindows: windows.length,
        storage: fs.engine,
      },
    }
  },
})
