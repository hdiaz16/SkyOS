import { registerCommand } from '../commands'
import { WIDGET_META, WIDGET_TYPES, widgets, type Widget, type WidgetConfig, type WidgetType } from '../widgets'

const TYPE_HELP = [
  'Tipos y su config:',
  'weather → { place } (nombre de ciudad; si se omite usa la ubicación del dispositivo).',
  'currency → { from, to, amount } con códigos ISO como USD, MXN, EUR.',
  'recent → { limit } (cuántos archivos recientes mostrar).',
  'clock → { zones: [{ label, timeZone }] } con zonas IANA como "America/Bogota".',
  'todo → { items: [{ text, done }] }.',
  'note → { text }.',
  'timer → { seconds, label }.',
  'html → { html }: documento HTML completo y autocontenido (CSS y JS inline, sin recursos externos) mostrado en un marco aislado. Puede usar las variables CSS --ink, --ink-2, --ink-3, --accent, --accent-soft, --surface, --line. Úsalo solo cuando ningún tipo propio sirva (una gráfica, un contador específico, un tablero).',
].join(' ')

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

registerCommand<{ type: WidgetType; title?: string; config?: WidgetConfig; x?: number; y?: number; w?: number; h?: number }, Widget>({
  id: 'widgets.create',
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
    const widget = await widgets.create(type, opts)
    return {
      result: widget,
      label: `Widget "${widget.title}" añadido`,
      undo: async () => {
        await widgets.remove(widget.id)
      },
    }
  },
})

registerCommand<{ id: string; title?: string; config?: WidgetConfig }, Widget>({
  id: 'widgets.update',
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
    const after = await widgets.update(id, { title, config })
    return {
      result: after,
      label: `Widget "${after.title}" actualizado`,
      undo: async () => {
        await widgets.restore(before)
      },
    }
  },
})

registerCommand<{ id: string }, void>({
  id: 'widgets.remove',
  title: 'Quitar widget',
  description: 'Quita un widget del escritorio.',
  params: { id: { type: 'string', description: 'Id del widget.', required: true } },
  async run({ id }) {
    const removed = await widgets.remove(id)
    if (!removed) throw new Error('El widget ya no existe')
    return {
      result: undefined,
      label: `Widget "${removed.title}" quitado`,
      undo: async () => {
        await widgets.restore(removed)
      },
    }
  },
})

registerCommand<Record<string, never>, unknown>({
  id: 'widgets.list',
  title: 'Widgets del escritorio',
  description: `Lista los widgets presentes en el escritorio con un resumen de su contenido. Tipos disponibles: ${WIDGET_TYPES.map((t) => `${t} (${WIDGET_META[t].label})`).join(', ')}.`,
  params: {},
  async run() {
    return { result: (await widgets.list()).map(summarize) }
  },
})
