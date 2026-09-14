import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const METADATA_PATH = '/oauth/client-metadata.json'

/**
 * Serves (dev) and emits (build) the OAuth Client ID Metadata Document with which SkyOS identifies itself
 * to MCP authorization servers. Only useful from a public https origin, which is what VITE_APP_ORIGIN names.
 */
function clientMetadata(origin: string): Plugin {
  const body = () =>
    JSON.stringify(
      {
        client_id: `${origin}${METADATA_PATH}`,
        client_name: 'SkyOS',
        client_uri: origin,
        redirect_uris: [`${origin}/oauth/callback`],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'web',
      },
      null,
      2,
    )
  return {
    name: 'sky-client-metadata',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== METADATA_PATH) return next()
        res.setHeader('Content-Type', 'application/json')
        res.end(body())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: METADATA_PATH.slice(1), source: body() })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const origin = (env.VITE_APP_ORIGIN || 'http://127.0.0.1:5173').replace(/\/+$/, '')
  return { plugins: [react(), tailwindcss(), clientMetadata(origin)] }
})
