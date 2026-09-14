/**
 * Typed access to the process environment. Read once at boot.
 */

export interface BridgeEnv {
  readonly port: number;
  /** Browser origins allowed by CORS, normalized (scheme + host [+ port]). */
  readonly allowedOrigins: readonly string[];
  /** Let proxy targets point at loopback/private hosts (local MCP servers during development). */
  readonly allowLocalTargets: boolean;
}

const DEFAULT_PORT = 8787;
const DEFAULT_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173'];

function readString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = readString(name)?.toLowerCase();
  if (raw === undefined) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  throw new Error(`${name} debe ser "true" o "false" (valor actual: "${raw}").`);
}

function readPort(): number {
  const raw = readString('PORT');
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT no es válido: "${raw}". Usa un entero entre 1 y 65535.`);
  }
  return port;
}

/** Keep only well-formed origins, normalized without path or trailing slash. */
function normalizeOrigin(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const { origin } = new URL(trimmed);
    if (origin === 'null') throw new Error('opaque origin');
    return origin;
  } catch {
    console.warn(`[bridge] Origen ignorado en ALLOWED_ORIGINS (no es una URL válida): ${trimmed}`);
    return undefined;
  }
}

function readOrigins(): string[] {
  const raw = readString('ALLOWED_ORIGINS');
  const list = raw ? raw.split(',') : DEFAULT_ORIGINS;
  const origins = list.map(normalizeOrigin).filter((origin): origin is string => origin !== undefined);
  return [...new Set(origins)];
}

/** Throws with a Spanish message when a variable is malformed. */
export function loadEnv(): BridgeEnv {
  return {
    port: readPort(),
    allowedOrigins: readOrigins(),
    allowLocalTargets: readBoolean('MCP_PROXY_ALLOW_LOCAL', false),
  };
}
