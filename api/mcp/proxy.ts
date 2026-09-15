import { MCP_POLICY, relay } from '../_lib/relay.js'

/** CORS relay for remote MCP servers. Streams, so server-sent events flow through event by event. */
export const config = { runtime: 'edge' }

export default function handler(request: Request): Promise<Response> {
  return relay(request, MCP_POLICY)
}
