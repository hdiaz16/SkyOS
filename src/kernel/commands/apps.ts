import { registerCommand } from '../commands'
import { useWindows } from '../../state/windows'
import { CATALOG, catalogFor } from '../../mcp/catalog'
import { useMcp } from '../../mcp/manager'

/** Connected apps, for people (the panel) and for the assistant (knowing what it can reach). */

interface AppStatus {
  id: string
  name: string
  connected: boolean
  tools: number
  account?: string
  attention?: string
}

/** Words that make these commands relevant; without one of them in the request, their tools stay home. */
const APP_WORDS = ['app', 'apps', 'aplicacion', 'aplicación', 'aplicaciones', 'conecta', 'conectar', 'conectado', 'integra', 'integracion', 'integración', 'mcp', 'notion', 'slack', 'gmail', 'correo', 'mail', 'drive', 'docs', 'calendario', 'calendar', 'github', 'todoist', 'spotify', 'evernote']

registerCommand<Record<string, never>, AppStatus[]>({
  id: 'apps.status',
  keywords: APP_WORDS,
  title: 'Apps conectadas',
  description: 'Lista las apps externas (Notion, Slack, Google Drive, Gmail, Spotify…) y cuáles están conectadas, con cuántas herramientas ofrece cada una.',
  params: {},
  async run() {
    const records = useMcp.getState().servers
    const known = new Map(records.map((r) => [r.id, r]))
    const rows: AppStatus[] = CATALOG.map((c) => {
      const r = known.get(c.id)
      return { id: c.id, name: c.name, connected: !!r && r.status !== 'disconnected', tools: r?.tools?.length ?? 0, account: r?.account?.name, attention: r?.attention }
    })
    for (const r of records) {
      if (!r.catalogId) rows.push({ id: r.id, name: r.name, connected: r.status !== 'disconnected', tools: r.tools?.length ?? 0, account: r.account?.name, attention: r.attention })
    }
    return { result: rows }
  },
})

registerCommand<{ app: string }, void>({
  id: 'ui.openApp',
  keywords: APP_WORDS,
  title: 'Abrir una app conectada',
  description: 'Abre dentro de Sky la vista de una app conectada (p. ej. notion): páginas recientes, búsqueda y lectura. Úsalo cuando la persona quiera ver o entrar a la app, no solo pedir un dato.',
  params: { app: { type: 'string', description: 'Id de la app conectada (p. ej. notion, slack, gmail).', required: true } },
  async run({ app }) {
    const record = useMcp.getState().servers.find((r) => r.id === app)
    if (!record || record.status === 'disconnected') throw new Error(`${catalogFor(app)?.name ?? app} no está conectada. Ábrela en Apps conectadas.`)
    const wm = useWindows.getState()
    const existing = wm.windows.find((w) => w.app === 'app' && w.props.app === app)
    if (existing) wm.focus(existing.id)
    else wm.open('app', { title: record.name, props: { app } })
    return { result: undefined }
  },
})

registerCommand<{ app?: string }, void>({
  id: 'ui.openApps',
  keywords: APP_WORDS,
  title: 'Abrir apps conectadas',
  description: 'Abre Ajustes en Apps conectadas, donde la persona autoriza Notion, Slack, Google, Gmail, GitHub, Spotify y otros servidores MCP. Úsalo cuando pida algo de una app que no está conectada. Con "app" resalta esa app.',
  params: { app: { type: 'string', description: 'Id de la app a resaltar (p. ej. notion, slack, gmail).' } },
  async run({ app }) {
    const wm = useWindows.getState()
    const id = wm.open('settings', { singleton: true, props: { section: 'apps', app } })
    wm.setProps(id, { section: 'apps', app })
    return { result: undefined }
  },
})
