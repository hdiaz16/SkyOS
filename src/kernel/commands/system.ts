import { registerCommand } from '../commands'
import { fs } from '../fs'
import { MIN_H, MIN_W, useWindows, type Win } from '../../state/windows'
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
const WINDOW_WORDS = ['ventana', 'ventanas', 'minimiza', 'minimizar', 'cierra', 'cerrar', 'ordena', 'ordenar', 'acomoda', 'acomodar', 'cascada', 'cuadricula', 'cuadrícula', 'limpia', 'limpiar', 'despeja', 'abiertas', 'zen', 'enfoque', 'concentrar', 'concentrarme', 'apila', 'apilar', 'mazo', 'maximiza', 'maximizar', 'pantalla completa', 'sesion', 'sesión', 'salir', 'logout', 'sistema', 'estado', 'hora', 'fecha', 'almacenamiento', 'espacio', 'version', 'versión']

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

/**
 * The written inverses of every window command. They are marked ephemeral where they are used: geometry from
 * an earlier session means nothing after a reload, because the desk already came back fitted to this screen.
 */
registerCommand<{ windows: Array<Partial<Win> & { id: string }> }, void>({
  id: 'ui.applyLayout',
  risk: 'write',
  title: 'Devolver las ventanas a su sitio',
  description: 'Devuelve posición, tamaño o estado a las ventanas indicadas.',
  ai: false,
  params: {},
  async run({ windows }) {
    // `prev` travels as null when it has to be cleared, because a missing value cannot say "borra esto".
    useWindows.getState().patchMany((windows ?? []).map((w) => ({ ...w, prev: w.prev ?? undefined })))
    return { result: undefined }
  },
})

registerCommand<{ windows: Win[] }, void>({
  id: 'ui.restoreWindows',
  risk: 'write',
  title: 'Volver a abrir ventanas',
  description: 'Vuelve a abrir ventanas que se cerraron, tal como estaban.',
  ai: false,
  params: {},
  async run({ windows }) {
    const wm = useWindows.getState()
    for (const w of windows ?? []) wm.restore(w)
    return { result: undefined }
  },
})

registerCommand<{ ids?: string[]; scope?: Scope }, number>({
  id: 'ui.closeWindows',
  risk: 'write',
  // Counted the way the command itself counts. Reading only `ids` left the scale at 1 for «cierra todas las
  // ventanas», so the rule that more than ten is never a small change never fired — fourteen windows closed
  // without a question, and the undo does not survive a reload.
  scale: ({ ids, scope }) => targets(scope ?? 'stale', ids).length,
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
      undo: { commandId: 'ui.restoreWindows', params: { windows: wins } },
      ephemeral: true,
    }
  },
})

registerCommand<{ ids?: string[]; scope?: Scope }, number>({
  id: 'ui.minimizeWindows',
  risk: 'write',
  scale: ({ ids, scope }) => targets(scope ?? 'inactive', ids).filter((w) => !w.minimized).length,
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
      undo: { commandId: 'ui.applyLayout', params: { windows: wins.map((w) => ({ id: w.id, minimized: false })) } },
      ephemeral: true,
    }
  },
})

type Layout = 'grid' | 'cascade' | 'columns' | 'rows'

const TOP = 52
const BOTTOM = 104
const GAP = 12

/**
 * Where each window goes, and which arrangement it really was. The maths used to ignore the minimum window
 * size: six columns on a laptop came out 226 px wide, the store pushed every one of them back to 360, and the
 * last window ended up past the right edge — while the label announced six tidy columns. Now what does not fit
 * wraps onto more rows, and when not even that fits it falls back to a cascade, where every title bar is at
 * least reachable. The caller is told which of the two happened so it can say so.
 */
function computeLayout(wins: Win[], layout: Layout): { patches: Array<Partial<Win> & { id: string }>; used: Layout; cols: number; rows: number } {
  const W = window.innerWidth
  const H = window.innerHeight - TOP - BOTTOM
  const n = wins.length
  if (layout === 'cascade') {
    return {
      used: 'cascade',
      cols: 1,
      rows: n,
      patches: wins.map((w, i) => ({
        id: w.id,
        x: 24 + i * 32,
        y: TOP + i * 28,
        w: Math.min(w.w, W - 48 - i * 32),
        h: Math.min(w.h, H - i * 28),
      })),
    }
  }
  const maxCols = Math.max(1, Math.floor((W - GAP) / (MIN_W + GAP)))
  const maxRows = Math.max(1, Math.floor((H - GAP) / (MIN_H + GAP)))
  let cols: number
  if (layout === 'columns') cols = Math.min(n, maxCols)
  else if (layout === 'rows') cols = Math.ceil(n / Math.min(n, maxRows))
  else cols = Math.min(Math.ceil(Math.sqrt(n)), maxCols)
  const rows = Math.ceil(n / cols)
  const cw = (W - GAP * (cols + 1)) / cols
  const ch = (H - GAP * (rows + 1)) / rows
  if (cw < MIN_W || ch < MIN_H) return { ...computeLayout(wins, 'cascade'), used: 'cascade' }
  return {
    used: layout,
    cols,
    rows,
    patches: wins.map((w, i) => {
      const c = i % cols
      const r = Math.floor(i / cols)
      return { id: w.id, x: GAP + c * (cw + GAP), y: TOP + GAP + r * (ch + GAP), w: cw, h: ch }
    }),
  }
}

registerCommand<{ layout?: Layout }, number>({
  id: 'ui.arrangeWindows',
  risk: 'write',
  keywords: WINDOW_WORDS,
  title: 'Ordenar ventanas',
  description: 'Acomoda las ventanas visibles: "grid" (cuadrícula), "cascade" (cascada), "columns" o "rows".',
  params: { layout: { type: 'string', description: 'Disposición.', enum: ['grid', 'cascade', 'columns', 'rows'] } },
  async run({ layout = 'grid' }) {
    const wins = useWindows.getState().windows.filter((w) => !w.minimized)
    if (!wins.length) return { result: 0 }
    const before = wins.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h }))
    const { patches, used, cols, rows } = computeLayout(wins, layout)
    useWindows.getState().patchMany(patches)
    const names: Record<Layout, string> = { grid: 'en cuadrícula', cascade: 'en cascada', columns: 'en columnas', rows: 'en filas' }
    // Said the way it ended up looking: six windows asked for in columns may come out in two columns of three,
    // and on a small screen not even that fits.
    const como =
      used !== layout
        ? `${names[used]}: ${names[layout]} no caben en esta pantalla`
        : used === 'columns' && cols < wins.length
          ? `en ${cols} columnas`
          : used === 'rows' && rows < wins.length
            ? `en ${rows} filas`
            : names[used]
    return {
      result: wins.length,
      label: `${plural(wins.length, 'ventana ordenada', 'ventanas ordenadas')} ${como}`,
      undo: { commandId: 'ui.applyLayout', params: { windows: before } },
      ephemeral: true,
    }
  },
})

registerCommand<Record<string, never>, { zen: boolean; hidden: number }>({
  id: 'ui.zen',
  risk: 'write',
  keywords: WINDOW_WORDS,
  title: 'Modo Zen',
  description: 'Alterna el modo Zen (Ctrl+Mayús+Z): todas las ventanas menos la activa se desvanecen para dejar solo el documento en curso; volver a llamarlo las trae de vuelta.',
  params: {},
  async run() {
    const wm = useWindows.getState()
    const wasOn = !!wm.zen
    wm.toggleZen()
    const now = useWindows.getState().zen
    if (!wasOn && !now) return { result: { zen: false, hidden: 0 }, label: 'No hay otras ventanas que apartar' }
    return {
      result: { zen: !!now, hidden: now?.length ?? 0 },
      label: now ? `Modo Zen: ${plural(now.length, 'ventana apartada', 'ventanas apartadas')}` : 'Modo Zen apagado',
      // A toggle is not an inverse. Undoing «Modo Zen apagado» used to switch Zen back on and hide everything
      // again, because it re-ran the toggle against however things are now instead of undoing what it did.
      // Turning it on is undone by bringing those same windows back; turning it off leaves nothing to undo.
      undo: now ? { commandId: 'ui.applyLayout', params: { windows: now.map((id) => ({ id, minimized: false })) } } : undefined,
      ephemeral: true,
    }
  },
})

registerCommand<Record<string, never>, number>({
  id: 'ui.stackWindows',
  risk: 'write',
  keywords: WINDOW_WORDS,
  title: 'Apilar ventanas',
  description: 'Reúne las ventanas visibles en un mazo detrás de la activa, ordenado por uso reciente (también con doble clic en el fondo del escritorio).',
  params: {},
  async run() {
    const wins = useWindows.getState().windows.filter((w) => !w.minimized)
    if (wins.length < 2) return { result: wins.length }
    const before = wins.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, z: w.z }))
    useWindows.getState().stack()
    return {
      result: wins.length,
      label: `${plural(wins.length, 'ventana apilada', 'ventanas apiladas')} detrás de la activa`,
      undo: { commandId: 'ui.applyLayout', params: { windows: before } },
      ephemeral: true,
    }
  },
})

registerCommand<{ id?: string; target?: 'left' | 'right' | 'max' | 'restore' }, void>({
  id: 'ui.snapWindow',
  risk: 'write',
  keywords: WINDOW_WORDS,
  title: 'Ajustar ventana',
  description: 'Lleva una ventana (la activa si no se da id) a la mitad izquierda, la derecha, a pantalla completa ("max") o de vuelta a su tamaño ("restore").',
  params: {
    id: { type: 'string', description: 'Id de la ventana; por defecto la activa.' },
    target: { type: 'string', description: 'left, right, max o restore.', enum: ['left', 'right', 'max', 'restore'] },
  },
  async run({ id, target = 'max' }) {
    const wm = useWindows.getState()
    const win = id ? wm.windows.find((w) => w.id === id) : wm.windows.find((w) => w.id === activeId(wm.windows))
    if (!win) throw new Error('No hay una ventana que ajustar')
    const before = { id: win.id, x: win.x, y: win.y, w: win.w, h: win.h, maximized: win.maximized, prev: win.prev }
    if (target === 'restore') {
      if (win.maximized) wm.toggleMaximize(win.id)
      else if (win.prev) wm.patchMany([{ id: win.id, ...win.prev, prev: undefined }])
      // Nothing to come back from: announcing «ajustada», sounding the toast and leaving an entry in the
      // journal was claiming a move that never happened.
      else return { result: undefined }
    } else {
      wm.snap(win.id, target)
    }
    return { result: undefined, label: `"${win.title}" ajustada`, undo: { commandId: 'ui.applyLayout', params: { windows: [{ ...before, prev: before.prev ?? null }] } }, ephemeral: true }
  },
})

registerCommand<{ mode?: 'minimize' | 'close' }, unknown>({
  id: 'ui.cleanDesktop',
  risk: 'write',
  scale: ({ mode }) => targets('inactive').filter((w) => mode === 'close' || !w.minimized).length,
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
      undo:
        mode === 'close'
          ? { commandId: 'ui.restoreWindows', params: { windows: wins } }
          : { commandId: 'ui.applyLayout', params: { windows: wins.map((w) => ({ id: w.id, minimized: false })) } },
      ephemeral: true,
    }
  },
})

registerCommand<Record<string, never>, void>({
  id: 'system.logout',
  risk: 'destructive',
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
