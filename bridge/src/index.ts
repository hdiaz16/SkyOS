/**
 * SkyOS bridge: an optional, stateless CORS relay for the browser-only desktop.
 *
 * SkyOS talks to apps through their remote MCP servers and MCP's own OAuth 2.1
 * flow, straight from the browser. Some of those servers do not send CORS
 * headers; this bridge repeats the request for them and streams the answer
 * back. It stores nothing and only ever sees tokens while forwarding them.
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import { loadEnv, type BridgeEnv } from './env.js';
import { BridgeError, internalError, notFound, payloadTooLarge } from './errors.js';
import { MCP_POLICY, OAUTH_POLICY, forward, type TargetRules } from './proxy.js';

/** MCP messages are small JSON-RPC payloads; anything bigger is not ours to relay. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

export function createApp(env: BridgeEnv): Hono {
  const app = new Hono();
  const allowedOrigins = new Set(env.allowedOrigins);
  const rules: TargetRules = { allowLocal: env.allowLocalTargets };

  app.use(
    '*',
    cors({
      origin: (origin) => (allowedOrigins.has(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'Accept', 'Mcp-Session-Id', 'MCP-Protocol-Version', 'Last-Event-ID'],
      exposeHeaders: ['Mcp-Session-Id', 'MCP-Protocol-Version', 'WWW-Authenticate'],
      maxAge: 600,
    }),
  );

  app.use(
    '/*/proxy',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => {
        const error = payloadTooLarge(MAX_BODY_BYTES);
        return c.json(error.toBody(), error.status);
      },
    }),
  );

  app.get('/health', (c) => c.json({ ok: true, proxy: true }));

  app.all('/mcp/proxy', (c) => forward(c, MCP_POLICY, rules));
  app.all('/oauth/proxy', (c) => forward(c, OAUTH_POLICY, rules));

  app.notFound((c) => c.json(notFound('Ruta no encontrada.').toBody(), 404));

  app.onError((err, c) => {
    if (err instanceof BridgeError) return c.json(err.toBody(), err.status);
    console.error('[bridge] Error no controlado:', err.stack ?? err.message);
    const fallback = internalError();
    return c.json(fallback.toBody(), fallback.status);
  });

  return app;
}

function main(): void {
  let env: BridgeEnv;
  try {
    env = loadEnv();
  } catch (err) {
    console.error(`[bridge] Configuración inválida: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const app = createApp(env);
  const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
    console.info(`[bridge] SkyOS bridge escuchando en http://localhost:${info.port}`);
    console.info(`[bridge] Orígenes permitidos: ${env.allowedOrigins.join(', ') || '(ninguno)'}`);
    if (env.allowLocalTargets) {
      console.warn('[bridge] MCP_PROXY_ALLOW_LOCAL=true: se permiten destinos locales/privados. Solo para pruebas.');
    }
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.info(`[bridge] ${signal} recibido; cerrando.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main();
