import { describe, expect, it } from 'vitest'
import { scriptsLast } from './sandboxHtml'

/**
 * El caso real: «crea un widget con la cuenta regresiva para el fin de año». El modelo escribió un documento
 * correcto, pero con el <script> antes del <p id="count">, así que getElementById daba null, update() tiraba y
 * el setInterval nunca se registraba. En el escritorio se veía el título y nada más.
 */
describe('los scripts, al final del cuerpo', () => {
  it('mueve el script que buscaba un elemento que aún no existía', () => {
    const roto = `<body><script>document.getElementById('c').textContent='x'</script><h1>Fin de año</h1><p id="c"></p></body>`
    const out = scriptsLast(roto)
    expect(out.indexOf('<script')).toBeGreaterThan(out.indexOf('<p id="c">'))
    expect(out).toContain(`document.getElementById('c')`)
    expect(out).toMatch(/<\/script\s*>\s*<\/body>/)
  })

  it('conserva el orden entre varios scripts', () => {
    const out = scriptsLast('<body><script>uno()</script><div></div><script>dos()</script></body>')
    expect(out.indexOf('uno()')).toBeLessThan(out.indexOf('dos()'))
    expect(out.indexOf('<div>')).toBeLessThan(out.indexOf('uno()'))
  })

  it('sin body los deja al final del fragmento', () => {
    expect(scriptsLast('<script>hola()</script><p>Texto</p>')).toBe('<p>Texto</p><script>hola()</script>')
  })

  it('un documento sin scripts no se toca', () => {
    const plano = '<!doctype html><html><body><p>Solo texto</p></body></html>'
    expect(scriptsLast(plano)).toBe(plano)
  })

  it('no toca el <style> ni el contenido', () => {
    const out = scriptsLast('<body><style>p{color:red}</style><p>Hola</p><script>x()</script></body>')
    expect(out).toContain('<style>p{color:red}</style>')
    expect(out.indexOf('<style>')).toBeLessThan(out.indexOf('<p>Hola</p>'))
  })
})
