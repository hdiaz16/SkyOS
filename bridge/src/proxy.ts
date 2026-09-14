/**
 * Generic streaming reverse proxy behind `/mcp/proxy` and `/oauth/proxy`.
 *
 * The browser names the destination in `?target=<absolute URL>`; the bridge
 * repeats the request with a whitelisted subset of headers and pipes the
 * upstream response back untouched (status, body, whitelisted headers). Bodies
 * are streamed, so `text/event-stream` responses flow event by event.
 *
 * Safety rails: https-only targets, no loopback/private destinations unless
 * explicitly enabled, redirects followed server-side with every hop re-checked,
 * no cookies in either direction, and nothing logged about the request.
 */
import type { Context } from 'hono';
import { isIP } from 'node:net';

import { badRequest, methodNotAllowed, tooManyRedirects, upstreamUnavailable } from './errors.js';

export interface ProxyPolicy {
  /** Noun used in error messages, e.g. "el servidor MCP". */
  readonly label: string;
  /** Methods accepted by the route; omit to accept any. */
  readonly allowedMethods?: ReadonlySet<string>;
  /** Request headers copied from the browser when present. */
  readonly requestHeaders: readonly string[];
  /** Header-name prefixes copied wholesale (the MCP spec mirrors body fields into Mcp-* headers). */
  readonly requestHeaderPrefixes?: readonly string[];
  /** Upstream response headers relayed to the browser. */
  readonly responseHeaders: readonly string[];
  /** Relayed headers the browser is allowed to read cross-origin. */
  readonly exposeHeaders?: readonly string[];
  /** Give up if upstream has not answered in time; omit for long-lived streams. */
  readonly timeoutMs?: number;
}

export interface TargetRules {
  readonly allowLocal: boolean;
}

const USER_AGENT = 'skyos-bridge/0.1.0';
const MAX_REDIRECTS = 5;
const METHODS_WITHOUT_BODY: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

export const MCP_POLICY: ProxyPolicy = {
  label: 'el servidor MCP',
  requestHeaders: ['Authorization', 'Content-Type', 'Accept', 'Last-Event-ID'],
  requestHeaderPrefixes: ['mcp-'],
  responseHeaders: ['Content-Type', 'Mcp-Session-Id', 'MCP-Protocol-Version', 'WWW-Authenticate', 'Cache-Control'],
  exposeHeaders: ['Mcp-Session-Id', 'MCP-Protocol-Version', 'WWW-Authenticate'],
};

export const OAUTH_POLICY: ProxyPolicy = {
  label: 'el servidor OAuth',
  allowedMethods: new Set(['GET', 'POST']),
  requestHeaders: ['Content-Type', 'Accept', 'Authorization'],
  responseHeaders: ['Content-Type'],
  timeoutMs: 30_000,
};

// --- Target validation ------------------------------------------------------------

/** [network, prefix length] pairs that never leave the machine or the LAN. */
const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8 "this" network
  [0x0a000000, 8], // 10.0.0.0/8
  [0x64400000, 10], // 100.64.0.0/10 carrier-grade NAT
  [0x7f000000, 8], // 127.0.0.0/8 loopback
  [0xa9fe0000, 16], // 169.254.0.0/16 link-local (cloud metadata lives here)
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0a80000, 16], // 192.168.0.0/16
];

function parseIpv4(address: string): number | undefined {
  const octets = address.split('.');
  if (octets.length !== 4) return undefined;
  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return undefined;
    const n = Number(octet);
    if (n > 255) return undefined;
    value = value * 256 + n;
  }
  return value;
}

function inRange(ip: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ip & mask) >>> 0) === network;
}

function isPrivateIpv4(ip: number): boolean {
  return PRIVATE_IPV4_RANGES.some(([network, prefix]) => inRange(ip, network, prefix));
}

/** Expand any textual IPv6 form (including an embedded dotted IPv4 tail) into 8 hextets. */
function expandIpv6(address: string): number[] | undefined {
  let text = address;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1]) {
    const v4 = parseIpv4(dotted[1]);
    if (v4 === undefined) return undefined;
    text = `${text.slice(0, -dotted[1].length)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return undefined;
  const groups = [...head, ...new Array<string>(missing).fill('0'), ...tail].map((g) => Number.parseInt(g, 16));
  return groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : undefined;
}

function isPrivateIpv6(address: string): boolean {
  const groups = expandIpv6(address);
  if (!groups) return true; // unparsable: refuse rather than guess
  const [first = 0] = groups;
  const leadingZeros = groups.slice(0, 5).every((g) => g === 0);
  if (leadingZeros && groups[5] === 0 && groups[6] === 0 && (groups[7] === 0 || groups[7] === 1)) return true; // :: and ::1
  if (leadingZeros && groups[5] === 0xffff) return isPrivateIpv4(((groups[6] ?? 0) << 16) | (groups[7] ?? 0)); // ::ffff:a.b.c.d
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

/**
 * True for hostnames that resolve to the bridge's own machine or LAN. Works on
 * the literal host only: a public name that DNS-resolves to a private address
 * is not detected (the bridge is meant to run without access to anything private).
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const kind = isIP(host);
  if (kind === 4) {
    const ip = parseIpv4(host);
    return ip === undefined ? true : isPrivateIpv4(ip);
  }
  if (kind === 6) return isPrivateIpv6(host);
  return false;
}

/**
 * Validate a `target`. https only, except that with `allowLocal` a loopback or
 * private host may also use plain http (local MCP servers rarely have TLS).
 */
export function resolveTarget(raw: string | undefined, rules: TargetRules): URL {
  if (!raw || raw.trim() === '') {
    throw badRequest('Falta el parámetro "target" con la URL absoluta del destino.', 'invalid_target');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('El parámetro "target" debe ser una URL absoluta válida.', 'invalid_target');
  }
  if (url.username || url.password) {
    throw badRequest('El destino no puede incluir credenciales en la URL.', 'invalid_target');
  }

  const local = isPrivateHost(url.hostname);
  if (local && !rules.allowLocal) {
    throw badRequest(
      'El destino apunta a una dirección local o privada. Activa MCP_PROXY_ALLOW_LOCAL solo para pruebas locales.',
      'target_not_allowed',
    );
  }
  const plainHttpAllowed = local && rules.allowLocal;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && plainHttpAllowed)) {
    throw badRequest('Solo se permiten destinos https.', 'invalid_target');
  }

  url.hash = '';
  return url;
}

// --- Forwarding ---------------------------------------------------------------------

function pickHeaders(source: Headers, names: readonly string[], prefixes: readonly string[] = []): Headers {
  const picked = new Headers();
  for (const name of names) {
    const value = source.get(name);
    if (value !== null) picked.set(name, value);
  }
  if (prefixes.length) {
    source.forEach((value, name) => {
      if (prefixes.some((p) => name.toLowerCase().startsWith(p.toLowerCase()))) picked.set(name, value);
    });
  }
  return picked;
}

async function readRequestBody(c: Context, method: string): Promise<ArrayBuffer | undefined> {
  if (METHODS_WITHOUT_BODY.has(method)) return undefined;
  const buffer = await c.req.arrayBuffer();
  return buffer.byteLength > 0 ? buffer : undefined;
}

interface Hop {
  url: URL;
  method: string;
  headers: Headers;
  body: ArrayBuffer | undefined;
}

/** Apply RFC 9110 redirect semantics and re-validate the new destination. */
function nextHop(current: Hop, status: number, location: string, rules: TargetRules): Hop {
  const url = resolveTarget(new URL(location, current.url).toString(), rules);
  const headers = new Headers(current.headers);
  // Never leak the user's token to a different origin.
  if (url.origin !== current.url.origin) headers.delete('Authorization');

  const switchToGet = status === 303 || ((status === 301 || status === 302) && current.method === 'POST');
  if (switchToGet) {
    headers.delete('Content-Type');
    return { url, method: 'GET', headers, body: undefined };
  }
  return { url, method: current.method, headers, body: current.body };
}

async function fetchFollowingRedirects(
  first: Hop,
  signal: AbortSignal,
  rules: TargetRules,
  label: string,
): Promise<Response> {
  let hop = first;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response: Response;
    try {
      response = await fetch(hop.url, {
        method: hop.method,
        headers: hop.headers,
        body: hop.body,
        redirect: 'manual',
        signal,
      });
    } catch {
      throw upstreamUnavailable(label);
    }

    const location = response.headers.get('Location');
    if (!REDIRECT_STATUSES.has(response.status) || !location) return response;

    await response.body?.cancel();
    hop = nextHop(hop, response.status, location, rules);
  }
  throw tooManyRedirects(label);
}

/** Fresh Response so headers are mutable and only whitelisted ones survive. */
function relay(upstream: Response, policy: ProxyPolicy): Response {
  const headers = pickHeaders(upstream.headers, policy.responseHeaders);
  if (policy.exposeHeaders?.length) {
    headers.set('Access-Control-Expose-Headers', policy.exposeHeaders.join(', '));
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function forward(c: Context, policy: ProxyPolicy, rules: TargetRules): Promise<Response> {
  const method = c.req.method.toUpperCase();
  if (policy.allowedMethods && !policy.allowedMethods.has(method)) {
    throw methodNotAllowed([...policy.allowedMethods]);
  }

  const url = resolveTarget(c.req.query('target'), rules);
  const headers = pickHeaders(c.req.raw.headers, policy.requestHeaders, policy.requestHeaderPrefixes);
  headers.set('User-Agent', USER_AGENT);
  const body = await readRequestBody(c, method);

  // Abort upstream when the browser goes away; add a deadline only where no streaming is expected.
  const clientSignal = c.req.raw.signal;
  const signal =
    policy.timeoutMs === undefined ? clientSignal : AbortSignal.any([clientSignal, AbortSignal.timeout(policy.timeoutMs)]);

  const upstream = await fetchFollowingRedirects({ url, method, headers, body }, signal, rules, policy.label);
  return relay(upstream, policy);
}
