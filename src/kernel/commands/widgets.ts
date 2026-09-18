import { registerCommand } from '../commands'
import { WIDGET_META, WIDGET_TYPES, widgets, type Widget, type WidgetConfig, type WidgetType } from '../widgets'
import { CURRENCIES } from '../../lib/currency'

const TYPE_HELP = [
  'Tipos y su config:',
  'weather → { place } (nombre de ciudad; si se omite usa la ubicación del dispositivo).',
  `currency → { from, to, amount } con códigos soportados: ${Object.keys(CURRENCIES).join(', ')}.`,
  'recent → { limit } (cuántos archivos recientes mostrar).',
  'clock → { zones: [{ label, timeZone }] } con zonas IANA como "America/Bogota".',
  'todo → { items: [{ text, done }] }.',
  'note → { text }.',
  'timer → { seconds, label }.',
  'html → { html }: documento HTML completo y autocontenido (CSS y JS inline, sin recursos externos) mostrado en un marco aislado. Puede usar las variables CSS --ink, --ink-2, --ink-3, --accent, --accent-soft, --surface, --line. Úsalo solo cuando ningún tipo propio sirva (una gráfica, un contador específico, un tablero).',
].join(' ')

const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const validCurrency = (v: unknown): v is string => isString(v) && v.toUpperCase() in CURRENCIES

function checkZone(z: unknown): boolean {
  if (!z || typeof z !== 'object') return false
  const { label, timeZone } = z as { label?: unknown; timeZone?: unknown }
  if (!isString(label) || !isString(timeZone)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}

const checkItem = (v: unknown): boolean => {
  if (!v || typeof v !== 'object') return false
  const i = v as { text?: unknown; done?: unknown; id?: unknown }
  return isString(i.text) && typeof i.done === 'boolean' && (i.id === undefined || isString(i.id))
}

/** What each type accepts, and the form to say when it doesn't. */
const CONFIG_KEYS: Record<WidgetType, Record<string, (v: unknown) => boolean>> = {
  weather: { place: isString, lat: isNumber, lon: isNumber },
  currency: { from: validCurrency, to: validCurrency, amount: (v) => isNumber(v) && v >= 0 },
  recent: { limit: (v) => isNumber(v) && v > 0 },
  clock: { zones: (v) => Array.isArray(v) && v.every(checkZone) },
  todo: { items: (v) => Array.isArray(v) && v.every(checkItem) },
  note: { text: isString },
  timer: { seconds: (v) => isNumber(v) && v > 0, label: isString },
  html: { html: isString },
}

const SHAPE: Record<WidgetType, string> = {
  weather: '{ place, lat, lon }',
  currency: '{ from, to, amount }',
  recent: '{ limit }',
  clock: '{ zones: [{ label, timeZone }] }',
  todo: '{ items: [{ text, done }] }',
  note: '{ text }',
  timer: '{ seconds, label }',
  html: '{ html }',
}

/**
 * widgets.create took whatever config the model wrote and buried it under the defaults: «un temporizador de
 * 10 minutos» arrived as { minutes: 10 }, the unknown key sat next to the 25:00 default and Sky confirmed a
 * timer that was not the one asked for. Now each type says what it accepts and rejects the rest by name.
 */
function configProblem(type: WidgetType, config: WidgetConfig | undefined): string | null {
  if (!config) return null
  const allowed = CONFIG_KEYS[type]
  for (const [key, value] of Object.entries(config)) {
    const ok = allowed[key]
    if (!ok) return `config de ${type} no admite «${key}»; espera ${SHAPE[type]}`
    if (!ok(value)) {
      if (type === 'currency' && (key === 'from' || key === 'to'))
        return `Moneda no soportada: ${String(value)}. Códigos: ${Object.keys(CURRENCIES).join(', ')}`
      return `config.${key} de ${type} no es válido; ${type} espera ${SHAPE[type]}`
    }
  }
  return null
}
export { configProblem }

function summarize(w: Widget) {
  const c = w.config
  let detail: unknown
  switch (w.type) {
    case 'weather':
      detail = { place: c.place ?? 'ubicación del dispositivo' }
      break
    case 'currency':
      detail = { from: c.from, to: c.to, amount: c.amount }
      break
    case 'recent':
      detail = { limit: c.limit }
      break
    case 'clock':
      detail = Array.isArray(c.zones) ? c.zones.map((z) => (z as { label: string }).label) : undefined
      break
    case 'note':
      detail = typeof c.text === 'string' ? c.text.slice(0, 120) : undefined
      break
    case 'todo':
      detail = Array.isArray(c.items) ? c.items.map((i) => `${(i as { done: boolean }).done ? '[x]' : '[ ]'} ${(i as { text: string }).text}`) : undefined
      break
    case 'timer':
      detail = { seconds: c.seconds, label: c.label, running: !!c.endsAt }
      break
    case 'html':
      detail = typeof c.html === 'string' ? `${c.html.length} caracteres de HTML` : undefined
      break
  }
  return { id: w.id, type: w.type, title: w.title, detail }
}

/** Words that make these commands relevant; without one of them in the request, their tools stay home. */
const WIDGET_WORDS = ['widget', 'widgets', 'reloj', 'clima', 'tiempo', 'temporizador', 'timer', 'pomodoro', 'tareas', 'pendientes', 'nota rapida', 'nota rápida', 'divisas', 'moneda', 'dolar', 'dólar', 'html', 'panel', 'escritorio']

registerCommand<{ type: WidgetType; title?: string; config?: WidgetConfig; x?: number; y?: number; w?: number; h?: number }, Widget>({
  id: 'widgets.create',
  risk: 'write',
  keywords: WIDGET_WORDS,
  title: 'Añadir widget',
  description: `Coloca un widget en el escritorio. ${TYPE_HELP}`,
  params: {
    type: { type: 'string', description: 'Tipo de widget.', enum: WIDGET_TYPES, required: true },
    title: { type: 'string', description: 'Título visible.' },
    config: { type: 'object', description: 'Configuración según el tipo (ver descripción).' },
    x: { type: 'number', description: 'Posición horizontal en píxeles (opcional).' },
    y: { type: 'number', description: 'Posición vertical en píxeles (opcional).' },
    w: { type: 'number', description: 'Ancho en píxeles (opcional).' },
    h: { type: 'number', description: 'Alto en píxeles (opcional).' },
  },
  async run({ type, ...opts }) {
    if (!WIDGET_TYPES.includes(type)) throw new Error(`Tipo de widget desconocido: ${type}`)
    if (type === 'html' && typeof opts.config?.html !== 'string') throw new Error('Un widget html necesita config.html')
    const problem = configProblem(type, opts.config)
    if (problem) throw new Error(problem)
    const widget = await widgets.create(type, opts)
    return {
      result: widget,
      label: `Widget "${widget.title}" añadido`,
      undo: { commandId: 'widgets.restore', params: { widget: null, id: widget.id } },
    }
  },
})

registerCommand<{ id: string; title?: string; config?: WidgetConfig }, Widget>({
  id: 'widgets.update',
  risk: 'write',
  keywords: WIDGET_WORDS,
  title: 'Actualizar widget',
  description: `Cambia el título o la configuración de un widget existente (la config se fusiona con la actual). ${TYPE_HELP}`,
  params: {
    id: { type: 'string', description: 'Id del widget.', required: true },
    title: { type: 'string', description: 'Nuevo título.' },
    config: { type: 'object', description: 'Campos de configuración a cambiar.' },
  },
  async run({ id, title, config }) {
    const before = await widgets.get(id)
    if (!before) throw new Error('El widget ya no existe')
    const problem = configProblem(before.type, config)
    if (problem) throw new Error(problem)
    const after = await widgets.update(id, { title, config })
    return {
      result: after,
      label: `Widget "${after.title}" actualizado`,
      undo: { commandId: 'widgets.restore', params: { widget: before } },
    }
  },
})

registerCommand<{ id: string }, void>({
  id: 'widgets.remove',
  risk: 'write',
  keywords: WIDGET_WORDS,
  title: 'Quitar widget',
  description: 'Quita un widget del escritorio.',
  params: { id: { type: 'string', description: 'Id del widget.', required: true } },
  async run({ id }) {
    const removed = await widgets.remove(id)
    if (!removed) throw new Error('El widget ya no existe')
    return {
      result: undefined,
      label: `Widget "${removed.title}" quitado`,
      undo: { commandId: 'widgets.restore', params: { widget: removed } },
    }
  },
})

registerCommand<{ widget: Widget | null; id?: string }, void>({
  id: 'widgets.restore',
  risk: 'write',
  title: 'Devolver un widget',
  description: 'Devuelve un widget a como estaba, o lo quita si no había ninguno.',
  // The written inverse of the three widget commands: with a widget it comes back, without one it goes away.
  ai: false,
  params: {},
  async run({ widget, id }) {
    if (widget) await widgets.restore(widget)
    else if (id) await widgets.remove(id)
    return { result: undefined }
  },
})

registerCommand<Record<string, never>, unknown>({
  id: 'widgets.list',
  keywords: WIDGET_WORDS,
  title: 'Widgets del escritorio',
  description: `Lista los widgets presentes en el escritorio con un resumen de su contenido. Tipos disponibles: ${WIDGET_TYPES.map((t) => `${t} (${WIDGET_META[t].label})`).join(', ')}.`,
  params: {},
  async run() {
    return { result: (await widgets.list()).map(summarize) }
  },
})
