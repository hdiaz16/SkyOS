import { parseChallenge } from './challenge'
import type { McpError } from './types'

export type RefusalKind = 'expired' | 'scopes' | 'not_admitted'

export interface Refusal {
  kind: RefusalKind
  /** What the card says under «Atención». */
  attention: string
  /** What Sky tells the person who asked for something. */
  message: string
}

/**
 * A 401 and a 403 used to read the same on the card —«vuelve a conectarla»— and for one of them that was a lie: a
 * server that turns this application away (Spotify's MCP pilot answers a valid token with «RBAC: access denied»)
 * does it again after every consent page, and the person went round in circles. The server's own words travel
 * with the note, so «Invalid access token», a missing scope and a client the pilot never admitted read differently.
 */
export function describeRefusal(name: string, err: McpError, when: 'connect' | 'later' = 'later'): Refusal {
  const challenge = parseChallenge(err.challenge)
  const why = challenge.errorDescription ?? err.detail
  const said = why ? ` (${why})` : ''
  if (err.code === 'forbidden' && challenge.error !== 'insufficient_scope' && !challenge.scope) {
    return {
      kind: 'not_admitted',
      attention: `${name} aceptó tu cuenta, pero su servidor no admite esta aplicación${said}. Volver a conectar no lo cambia: depende de que ${name} dé de alta a SkyOS en su servidor.`,
      message: `${name} aceptó la cuenta, pero su servidor MCP no admite esta aplicación${said}. Volver a conectar no lo cambia.`,
    }
  }
  if (err.code === 'forbidden') {
    const needed = challenge.scope ? ` Permisos necesarios: ${challenge.scope}.` : ''
    return {
      kind: 'scopes',
      attention: `Necesita más permisos.${needed} Vuelve a conectar la app para concederlos.`,
      message: `${name} necesita más permisos para eso.${needed} La persona debe reconectar la app en Apps conectadas.`,
    }
  }
  if (when === 'connect') {
    return {
      kind: 'expired',
      attention: `No aceptó el permiso recién concedido${said}. Vuelve a conectar la app.`,
      message: `${name} sigue pidiendo autorización aunque acabas de concedérsela${said}. Vuelve a probar desde Apps conectadas.`,
    }
  }
  return {
    kind: 'expired',
    attention: `Ya no tengo permiso en ${name}. Vuelve a conectarla.`,
    message: `La sesión de ${name} caducó. Pide a la persona que la vuelva a conectar en Apps conectadas.`,
  }
}

const MAX_WORDS = 160

/**
 * The server's own words from a refusal, when it sent a short plain text or a JSON error. HTML pages, empty
 * bodies and broken JSON say nothing a person should read; long texts are cut, they go in a note on a card.
 */
export async function serverWords(res: Response): Promise<string | undefined> {
  try {
    const type = res.headers.get('content-type') ?? ''
    if (!/^(?:text\/plain|application\/(?:problem\+)?json)/i.test(type)) return undefined
    const text = (await res.text()).trim()
    if (!text) return undefined
    if (/json/i.test(type)) {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object') return undefined
      const o = parsed as Record<string, unknown>
      const inner = o.error && typeof o.error === 'object' ? (o.error as Record<string, unknown>) : undefined
      const said = [o.error_description, o.message, inner?.message, o.detail, o.error].find((v) => typeof v === 'string' && v.trim())
      return typeof said === 'string' ? said.trim().slice(0, MAX_WORDS) : undefined
    }
    return text.replace(/\s+/g, ' ').slice(0, MAX_WORDS)
  } catch {
    return undefined
  }
}
