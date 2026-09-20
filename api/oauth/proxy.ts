import { OAUTH_POLICY, relay, withClientSecret } from '../_lib/relay.js'

/**
 * CORS relay for the OAuth endpoints of MCP servers: discovery, registration, token exchange and refresh. The
 * token exchange also gets the deployment's client secret added here, for the servers that want one: the browser
 * never holds it, so nobody can read it from the page.
 */
export const config = { runtime: 'edge' }

export default function handler(request: Request): Promise<Response> {
  return relay(request, OAUTH_POLICY, undefined, (url, body, type) => withClientSecret(url, body, type))
}
