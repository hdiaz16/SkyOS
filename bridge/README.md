# SkyOS bridge

Relevo CORS opcional y sin estado para SkyOS.

SkyOS se conecta a Notion, Slack, Google Drive, Spotify y Evernote a través de sus servidores MCP remotos
(Model Context Protocol, transporte Streamable HTTP) y del flujo OAuth 2.1 propio de MCP, directamente desde el
navegador. Algunos de esos servidores MCP, y algunos servidores OAuth (descubrimiento, registro dinámico de
clientes, emisión de tokens), no envían encabezados CORS, así que el navegador no puede hablarles. Este puente
existe solo para eso: repite la petición hacia el destino que el navegador indica y devuelve la respuesta tal cual,
con los encabezados CORS que faltaban.

**Si todos los servidores que usas permiten orígenes de navegador, no necesitas el puente.**

## Qué guarda

Nada. No hay base de datos ni archivos ni sesiones. No tiene credenciales de ningún proveedor. Los tokens del
usuario viajan en el encabezado `Authorization` y el puente solo los reenvía al destino; no los registra en logs
ni los conserva. Las cookies no cruzan en ninguna dirección.

## Correr en local

```bash
cd bridge
npm install
npm run dev
```

Escucha en `http://localhost:8787`. `npm run dev` recarga al guardar; `npm run typecheck` revisa tipos sin compilar.

## Variables de entorno

| Variable                | Por defecto                                   | Qué hace                                                                                        |
| ----------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PORT`                  | `8787`                                        | Puerto donde escucha.                                                                           |
| `ALLOWED_ORIGINS`       | `http://127.0.0.1:5173,http://localhost:5173` | Orígenes del navegador permitidos por CORS, separados por coma. Pon aquí el origen de SkyOS.    |
| `MCP_PROXY_ALLOW_LOCAL` | `false`                                       | `true` permite destinos locales o privados (y por `http`) para probar servidores MCP en tu PC. |

Copia `.env.example` a `.env` como referencia; el puente lee las variables del entorno del proceso (en Node 20+
puedes arrancar con `node --env-file=.env dist/index.js`).

## Endpoints

Todas las respuestas de error tienen la forma `{ "error": { "code": string, "message": string } }` con mensaje en
español y sin filtrar cuerpos del destino.

### `GET /health`

```json
{ "ok": true, "proxy": true }
```

### `ALL /mcp/proxy?target=<URL absoluta codificada>`

Reenvía la petición a `target` con el mismo método y cuerpo. Pensado para el transporte Streamable HTTP de MCP:
la respuesta se transmite en streaming (incluye `text/event-stream`), sin almacenarla.

- Encabezados de petición reenviados si vienen: `Authorization`, `Content-Type`, `Accept`, `Mcp-Session-Id`,
  `MCP-Protocol-Version`, `Last-Event-ID`.
- Encabezados de respuesta devueltos: `Content-Type`, `Mcp-Session-Id`, `MCP-Protocol-Version`, `WWW-Authenticate`,
  `Cache-Control`. Toda respuesta lleva
  `Access-Control-Expose-Headers: Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate`.
- El estado HTTP del destino se devuelve sin cambios (incluido `401` con `WWW-Authenticate`, que dispara el flujo
  OAuth de MCP en el cliente).

### `ALL /oauth/proxy?target=<URL absoluta codificada>`

Mismo relevo para los servidores OAuth: descubrimiento (`/.well-known/...`), registro dinámico de clientes y
endpoint de tokens. Acepta `GET` y `POST` (otros métodos responden `405`). Reenvía `Content-Type`, `Accept` y
`Authorization`; devuelve el estado, `Content-Type` y el cuerpo.

### `ALL /ai/proxy?target=<URL absoluta codificada>`

Mismo relevo para proveedores de IA que no aceptan llamadas directas desde un navegador — Z.ai responde el
preflight sin cabeceras CORS, así que una página nunca puede hablarle directo. SkyOS manda aquí sus llamadas a
`/chat/completions` y `/models` (GLM, en Ajustes › Inteligencia) con la llave de la persona en `Authorization`.
Acepta `GET` y `POST` (otros métodos responden `405`); reenvía `Authorization`, `Content-Type` y `Accept`, y
devuelve el estado, `Content-Type` y `Retry-After`. Sin tiempo de espera: las respuestas se transmiten en
streaming, token por token.

### Reglas para `target`

- Debe ser una URL absoluta `https:`; cualquier otra cosa responde `400 invalid_target`.
- Se rechazan destinos locales o privados (`localhost`, `127.*`, `10.*`, `192.168.*`, `172.16-31.*`, `169.254.*`,
  `::1`, `fc00::/7`, `fe80::/10`, IPv4 mapeadas) con `400 target_not_allowed`, salvo que `MCP_PROXY_ALLOW_LOCAL=true`;
  en ese caso esos destinos también pueden usar `http:`.
- Las redirecciones se siguen en el servidor (máximo 5) revalidando cada salto con las mismas reglas; si cambia el
  origen, se deja de enviar `Authorization`.
- El cuerpo de la petición se limita a 10 MB (`413 payload_too_large`).

## Desplegar

Cualquier host con Node 20 o superior (Render, Fly.io, Railway, un VPS):

```bash
npm ci
npm run build
PORT=8787 ALLOWED_ORIGINS=https://sky.tudominio.com npm start
```

Con Docker (imagen basada en `node:22-alpine`, ejecuta como usuario `node`):

```bash
docker build -t skyos-bridge .
docker run -p 8787:8787 -e ALLOWED_ORIGINS=https://sky.tudominio.com skyos-bridge
```

Ponlo detrás de HTTPS (el propio host suele darlo). No actives `MCP_PROXY_ALLOW_LOCAL` en producción.

## Conectar SkyOS

En el `.env.local` de la raíz del repositorio:

```bash
VITE_BRIDGE_URL=https://puente.tudominio.com
```

y añade el origen donde corre SkyOS a `ALLOWED_ORIGINS` del puente. Sin `VITE_BRIDGE_URL`, SkyOS habla con los
servidores MCP directamente, y los proveedores de IA que no aceptan navegadores (Z.ai/GLM) quedan sin poder
llamarse: el escritorio lo dice así, en vez de culpar a la red.

## Estructura

```
bridge/
├── src/
│   ├── index.ts   # app Hono, CORS, rutas y arranque
│   ├── proxy.ts   # validación de destino y relevo en streaming
│   ├── env.ts     # lectura tipada de variables de entorno
│   └── errors.ts  # modelo de errores { error: { code, message } }
├── Dockerfile
├── .env.example
└── package.json
```
