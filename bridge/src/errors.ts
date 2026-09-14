/**
 * Error model shared by every route.
 *
 * A BridgeError carries the HTTP status and a stable machine-readable code the
 * browser client can branch on. The message is user-facing (Spanish) and never
 * contains secrets, tokens or raw upstream payloads.
 */

export type ErrorStatus = 400 | 404 | 405 | 413 | 500 | 502;

export interface ErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export class BridgeError extends Error {
  readonly status: ErrorStatus;
  readonly code: string;

  constructor(status: ErrorStatus, code: string, message: string) {
    super(message);
    this.name = 'BridgeError';
    this.status = status;
    this.code = code;
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}

export function badRequest(message: string, code = 'bad_request'): BridgeError {
  return new BridgeError(400, code, message);
}

export function notFound(message = 'No se encontró el recurso solicitado.'): BridgeError {
  return new BridgeError(404, 'not_found', message);
}

export function methodNotAllowed(allowed: readonly string[]): BridgeError {
  return new BridgeError(405, 'method_not_allowed', `Método no permitido. Usa ${allowed.join(' o ')}.`);
}

export function payloadTooLarge(maxBytes: number): BridgeError {
  const maxMb = Math.round(maxBytes / (1024 * 1024));
  return new BridgeError(413, 'payload_too_large', `El cuerpo de la petición supera el máximo de ${maxMb} MB.`);
}

export function upstreamUnavailable(label: string): BridgeError {
  return new BridgeError(502, 'upstream_unavailable', `No se pudo contactar a ${label}. Intenta de nuevo en unos segundos.`);
}

export function tooManyRedirects(label: string): BridgeError {
  return new BridgeError(502, 'too_many_redirects', `${label} redirigió demasiadas veces.`);
}

export function internalError(): BridgeError {
  return new BridgeError(500, 'internal_error', 'Ocurrió un error interno en el puente.');
}
