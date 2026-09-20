import { describe, expect, it } from 'vitest'
import { describeRefusal, serverWords } from './refusal'
import { McpError } from './types'

describe('lo que dice la tarjeta cuando el servidor rechaza', () => {
  it('un 403 sin scope es una aplicación no admitida, y reconectar no lo arregla', () => {
    const err = new McpError('forbidden', 'x', { status: 403, detail: 'RBAC: access denied' })
    const r = describeRefusal('Spotify', err, 'connect')
    expect(r.kind).toBe('not_admitted')
    expect(r.attention).toContain('RBAC: access denied')
    expect(r.attention).toContain('Volver a conectar no lo cambia')
    expect(r.attention).not.toMatch(/Vuelve a conectar/)
    expect(r.message).toContain('no admite esta aplicación')
  })

  it('un 403 con insufficient_scope pide más permisos y los nombra', () => {
    const err = new McpError('forbidden', 'x', { status: 403, challenge: 'Bearer error="insufficient_scope", scope="user-library-read"' })
    const r = describeRefusal('Spotify', err)
    expect(r.kind).toBe('scopes')
    expect(r.attention).toContain('user-library-read')
    expect(r.attention).toContain('Vuelve a conectar')
  })

  it('un 401 recién concedido el permiso lleva la razón del servidor', () => {
    const err = new McpError('auth_required', 'x', { status: 401, challenge: 'Bearer realm="spotify", error="invalid_token", error_description="Invalid access token"' })
    const r = describeRefusal('Spotify', err, 'connect')
    expect(r.kind).toBe('expired')
    expect(r.attention).toBe('No aceptó el permiso recién concedido (Invalid access token). Vuelve a conectar la app.')
  })

  it('un 401 más tarde es la sesión caducada', () => {
    const r = describeRefusal('GitHub', new McpError('auth_required', 'x', { status: 401 }))
    expect(r.kind).toBe('expired')
    expect(r.attention).toBe('Ya no tengo permiso en GitHub. Vuelve a conectarla.')
  })
})

describe('las palabras del servidor', () => {
  const res = (body: string, type: string) => new Response(body, { status: 403, headers: { 'content-type': type } })

  it('texto plano corto, tal cual', async () => {
    expect(await serverWords(res('RBAC: access denied\n', 'text/plain'))).toBe('RBAC: access denied')
  })

  it('JSON: error_description, message o error', async () => {
    expect(await serverWords(res('{"error":"invalid_client","error_description":"Failed to get client"}', 'application/json'))).toBe('Failed to get client')
    expect(await serverWords(res('{"error":{"message":"Forbidden"}}', 'application/json; charset=utf-8'))).toBe('Forbidden')
    expect(await serverWords(res('{"error":"Not Found"}', 'application/json'))).toBe('Not Found')
  })

  it('HTML, vacío o roto no dicen nada', async () => {
    expect(await serverWords(res('<html>…</html>', 'text/html'))).toBeUndefined()
    expect(await serverWords(res('', 'text/plain'))).toBeUndefined()
    expect(await serverWords(res('{no json', 'application/json'))).toBeUndefined()
  })

  it('recorta lo largo', async () => {
    expect((await serverWords(res('x'.repeat(500), 'text/plain')))?.length).toBe(160)
  })
})
