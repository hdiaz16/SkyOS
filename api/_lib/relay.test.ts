import { describe, expect, it } from 'vitest'
import { isPrivateHost, originAllowed, resolveTarget, RelayError } from './relay.js'

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
