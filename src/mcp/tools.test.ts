import { afterEach, describe, expect, it } from 'vitest'
import { useMcp } from './manager'
import { mcpToolSpecs, relevantServers } from './tools'
import type { McpServerRecord } from './types'

const server = (id: string, name: string): McpServerRecord => ({
  id,
  name,
  url: `https://${id}.example/mcp`,
  catalogId: id,
  status: 'connected',
  updatedAt: 0,
  tools: [{ name: 'search', description: `Busca en ${name}`, inputSchema: { type: 'object', properties: {} } }],
})

afterEach(() => useMcp.setState({ servers: [] }))

describe('MCP relevante', () => {
  it('envía solo Gmail cuando se pide correo, no las demás apps conectadas', () => {
    useMcp.setState({ servers: [server('gmail', 'Gmail'), server('github', 'GitHub'), server('notion', 'Notion')] })
    expect(relevantServers({ prompt: 'busca el correo de Ana' }).map((s) => s.id)).toEqual(['gmail'])
    expect(mcpToolSpecs({ prompt: 'busca el correo de Ana' }).map((s) => s.name)).toEqual(['mcp_gmail__search'])
  })

  it('no adjunta MCP sin app/intención y mantiene una continuidad explícita', () => {
    useMcp.setState({ servers: [server('gmail', 'Gmail'), server('github', 'GitHub')] })
    expect(mcpToolSpecs({ prompt: 'hola' })).toEqual([])
    expect(relevantServers({ prompt: 'ahora ábrelo', recent: 'Usé mcp_gmail__search para encontrar el correo.' }).map((s) => s.id)).toEqual(['gmail'])
  })

  it('una palabra compartida no abre varias apps; varios nombres sí', () => {
    useMcp.setState({ servers: [server('gmail', 'Gmail'), server('slack', 'Slack'), server('github', 'GitHub')] })
    expect(relevantServers({ prompt: 'envía un mensaje' })).toHaveLength(1)
    expect(relevantServers({ prompt: 'compara Gmail y GitHub' }).map((s) => s.id)).toEqual(['github', 'gmail'])
  })
})
