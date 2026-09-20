import { spotifyMcp } from '../_lib/spotify-mcp.js'

/**
 * The desktop's own MCP server for Spotify, speaking Web API on the other side: Spotify's pilot gateway does not
 * admit this application, the Web API does. Stateless; the person's Bearer goes to api.spotify.com and nowhere
 * else. `/.well-known/oauth-protected-resource/api/mcp/spotify` is rewritten here with `?prm=1` (vercel.json).
 */
export const config = { runtime: 'edge' }

export default function handler(request: Request): Promise<Response> {
  return spotifyMcp(request)
}
