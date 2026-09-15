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

/**
 * Anything named VITE_ is baked into the file the browser downloads: it is published, not configured. A key
 * there is convenient while developing on your own machine and is a leak the moment that build is served to
 * anybody else. Rather than trust whoever runs the build to remember, the key is left out of it: the bundle
 * comes out empty-handed and falls back to /api/ai, where GROQ_API_KEY lives on the server and never travels.
 * `npm run dev` is untouched, which is where a local key belongs.
 */
function noSecretsInTheBundle(env: Record<string, string>): Plugin {
  return {
    name: 'sky-no-secrets-in-the-bundle',
    apply: 'build',
    config() {
      if (env.VITE_GOOGLE_CLIENT_SECRET?.trim()) {
        console.warn(
          '\n[SkyOS] VITE_GOOGLE_CLIENT_SECRET viaja en el paquete: en una página pública deja de ser secreto.\n' +
            '        Registra el cliente de Google como "Aplicación de página única" (PKCE, sin secreto) y bórrala.\n',
        )
      }
      if (!env.VITE_GROQ_KEY?.trim()) return
      console.warn('\n[SkyOS] VITE_GROQ_KEY no se incluye en el paquete: viajaría a la vista de cualquiera. En el servidor usa GROQ_API_KEY.\n')
      return { define: { 'import.meta.env.VITE_GROQ_KEY': '""' } }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const origin = (env.VITE_APP_ORIGIN || 'http://127.0.0.1:5173').replace(/\/+$/, '')
  return { plugins: [react(), tailwindcss(), clientMetadata(origin), noSecretsInTheBundle(env)], worker: { format: 'es' } }
})
