import { registerCommand } from '../commands'
import { useWindows } from '../../state/windows'
import { CATALOG } from '../../mcp/catalog'
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

registerCommand<Record<string, never>, AppStatus[]>({
  id: 'apps.status',
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

registerCommand<{ app?: string }, void>({
  id: 'ui.openApps',
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
