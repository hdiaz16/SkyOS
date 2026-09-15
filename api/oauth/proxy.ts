import { OAUTH_POLICY, relay } from '../_lib/relay.js'

/** CORS relay for the OAuth endpoints of MCP servers: discovery, registration, token exchange and refresh. */
export const config = { runtime: 'edge' }

export default function handler(request: Request): Promise<Response> {
  return relay(request, OAUTH_POLICY)
}
