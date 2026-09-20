import { describe, expect, it } from 'vitest'
import { aiTargetAllowed, isPrivateHost, originAllowed, resolveTarget, RelayError, withClientSecret } from './relay.js'

const form = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer
const fields = (b: ArrayBuffer | undefined) => new URLSearchParams(b ? new TextDecoder().decode(b) : '')
const FORM = 'application/x-www-form-urlencoded'
const github = new URL('https://github.com/login/oauth/access_token')

describe('el secreto que el navegador nunca tiene', () => {
  it('añade el secreto del despliegue al canje de GitHub cuando el cliente es el suyo', () => {
    const out = withClientSecret(github, form('grant_type=authorization_code&code=abc&client_id=id1'), FORM, { GITHUB_CLIENT_SECRET: 's3', VITE_GITHUB_CLIENT_ID: 'id1' })
    expect(fields(out).get('client_secret')).toBe('s3')
    expect(fields(out).get('code')).toBe('abc')
  })

  it('acepta el secreto con prefijo VITE_ que dejó un despliegue anterior', () => {
    const out = withClientSecret(new URL('https://oauth2.googleapis.com/token'), form('grant_type=authorization_code&client_id=gid&code=x'), FORM, { VITE_GOOGLE_CLIENT_SECRET: 'g', VITE_GOOGLE_CLIENT_ID: 'gid' })
    expect(fields(out).get('client_secret')).toBe('g')
  })

  it('no toca la petición sin secreto configurado, con otro cliente, con secreto propio, hacia otro sitio o sin formulario', () => {
    const body = form('grant_type=authorization_code&code=abc&client_id=id1')
    expect(withClientSecret(github, body, FORM, {})).toBe(body)
    expect(withClientSecret(github, body, FORM, { GITHUB_CLIENT_SECRET: 's3', VITE_GITHUB_CLIENT_ID: 'otro' })).toBe(body)
    const own = form('client_id=id1&client_secret=mine')
    expect(withClientSecret(github, own, FORM, { GITHUB_CLIENT_SECRET: 's3' })).toBe(own)
    expect(withClientSecret(new URL('https://example.com/token'), body, FORM, { GITHUB_CLIENT_SECRET: 's3' })).toBe(body)
    expect(withClientSecret(github, body, 'application/json', { GITHUB_CLIENT_SECRET: 's3' })).toBe(body)
    expect(withClientSecret(github, undefined, FORM, { GITHUB_CLIENT_SECRET: 's3' })).toBeUndefined()
  })

  it('no firma un grant sin persona detrás: client_credentials se queda como llegó', () => {
    const env = { SPOTIFY_CLIENT_SECRET: 's3', VITE_SPOTIFY_CLIENT_ID: 'sid', BOX_CLIENT_SECRET: 'b', VITE_BOX_CLIENT_ID: 'bid' }
    const spotify = new URL('https://accounts.spotify.com/api/token')
    const app = form('grant_type=client_credentials&client_id=sid')
    expect(withClientSecret(spotify, app, FORM, env)).toBe(app)
    const box = form('grant_type=client_credentials&client_id=bid&box_subject_type=enterprise&box_subject_id=1')
    expect(withClientSecret(new URL('https://api.box.com/oauth2/token'), box, FORM, env)).toBe(box)
    const renew = form('grant_type=refresh_token&refresh_token=r&client_id=sid')
    expect(fields(withClientSecret(spotify, renew, FORM, env)).get('client_secret')).toBe('s3')
    const noGrant = form('client_id=sid&code=x')
    expect(withClientSecret(spotify, noGrant, FORM, env)).toBe(noGrant)
  })
})

/**
 * The relay is the only part of SkyOS that runs on somebody else's machine and holds a key. Everything it
 * refuses, it has to keep refusing.
 */

const request = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers })
const SITE = 'https://skyos.test/api/mcp/proxy'

describe('quién puede usar el relé', () => {
  it('rechaza a quien no trae cabeceras de navegador, que es como llega curl', () => {
    expect(originAllowed(request(SITE))).toBe(false)
  })

  it('rechaza un origen ajeno aunque diga ser un navegador', () => {
    expect(originAllowed(request(SITE, { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }))).toBe(false)
  })

  it('deja pasar al propio sitio', () => {
    expect(originAllowed(request(SITE, { Origin: 'https://skyos.test' }))).toBe(true)
    expect(originAllowed(request(SITE, { 'Sec-Fetch-Site': 'same-origin' }))).toBe(true)
  })

  it('rechaza un Origin que no es una URL', () => {
    expect(originAllowed(request(SITE, { Origin: 'no-es-una-url' }))).toBe(false)
  })
})

describe('a dónde puede ir el relé', () => {
  const refuses = (target: string) => expect(() => resolveTarget(target)).toThrow(RelayError)

  it('exige https', () => refuses('http://api.notion.com/v1'))
  it('rechaza credenciales en la URL', () => refuses('https://user:clave@api.notion.com/v1'))
  it('rechaza destinos sin URL', () => refuses(''))

  it('rechaza la red local y la metadata de la nube', () => {
    for (const host of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.10', '172.16.4.4', '169.254.169.254', '[::1]', '0.0.0.0']) {
      expect(isPrivateHost(host), host).toBe(true)
      refuses(`https://${host}/lo-que-sea`)
    }
  })

  it('acepta un destino público y le quita el fragmento', () => {
    const url = resolveTarget('https://mcp.notion.com/mcp#seccion')
    expect(url.host).toBe('mcp.notion.com')
    expect(url.hash).toBe('')
  })

  it('no confunde un nombre público con uno privado', () => {
    expect(isPrivateHost('mcp.notion.com')).toBe(false)
    expect(isPrivateHost('2606:4700::1111')).toBe(false)
  })
})

describe('a dónde puede llevar una llave el relevo de IA', () => {
  it('a los proveedores que rechazan navegadores, y a ningún otro', () => {
    expect(aiTargetAllowed(new URL('https://api.z.ai/api/paas/v4/chat/completions'))).toBe(true)
    expect(aiTargetAllowed(new URL('https://open.bigmodel.cn/api/paas/v4/models'))).toBe(true)
    // The MCP relay takes any public server; a key must not travel that freely.
    expect(aiTargetAllowed(new URL('https://api.notion.com/v1'))).toBe(false)
    expect(aiTargetAllowed(new URL('https://evil.example/collect'))).toBe(false)
  })

  it('un despliegue propio puede añadir hosts, y la mayúscula no cuenta', () => {
    const before = process.env.AI_RELAY_HOSTS
    process.env.AI_RELAY_HOSTS = 'ia.mi-empresa.mx, Otro.Proveedor.ai'
    try {
      expect(aiTargetAllowed(new URL('https://ia.mi-empresa.mx/v1'))).toBe(true)
      expect(aiTargetAllowed(new URL('https://otro.proveedor.ai/v1'))).toBe(true)
      expect(aiTargetAllowed(new URL('https://api.notion.com/v1'))).toBe(false)
    } finally {
      if (before === undefined) delete process.env.AI_RELAY_HOSTS
      else process.env.AI_RELAY_HOSTS = before
    }
  })
})
