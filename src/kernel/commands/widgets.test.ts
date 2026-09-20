import { describe, expect, it } from 'vitest'
import { configProblem, htmlProblem } from './widgets'

/**
 * The model writes widget configs in its own dialect — minutes where seconds go, a currency the service has
 * never heard of — and create used to bury that under the defaults, confirming a widget that was not the one
 * asked for. These are the two shapes that started it.
 */

describe('la config de un widget dice qué no cabe', () => {
  it('un temporizador en minutos no nace diciendo 25:00', () => {
    const problem = configProblem('timer', { minutes: 10 })
    expect(problem).toContain('minutes')
    expect(problem).toContain('seconds')
  })

  it('una moneda fuera del catálogo se rechaza con la lista', () => {
    const problem = configProblem('currency', { from: 'USD', to: 'ARS' })
    expect(problem).toContain('ARS')
    expect(problem).toContain('MXN')
  })

  it('los diez minutos bien dichos pasan', () => {
    expect(configProblem('timer', { seconds: 600, label: 'Té' })).toBeNull()
  })

  it('una zona horaria que no existe no entra al reloj', () => {
    expect(configProblem('clock', { zones: [{ label: 'Bogotá', timeZone: 'America/Narnia' }] })).toContain('zones')
  })

  it('sin config no hay problema: los defaults mandan', () => {
    expect(configProblem('weather', undefined)).toBeNull()
  })
})

/**
 * La primera cuenta regresiva que le pedí a Sky salió como una caja blanca: el modelo dejó un <style> sin
 * cerrar y el documento entero se volvió CSS. El widget no debería llegar al escritorio así.
 */
describe('un widget html tiene que pintar algo', () => {
  it('rechaza el <style> sin cerrar que dejó el escritorio en blanco', () => {
    const roto = '<!doctype html><html><body><style>body{padding:20px;}h1{font-size:2em;}</body></html>'
    expect(htmlProblem(roto)).toContain('<style>')
  })

  it('rechaza un <script> sin cerrar', () => {
    expect(htmlProblem('<body><div id="c"></div><script>setInterval(()=>{},1000)</body>')).toContain('<script>')
  })

  it('rechaza un documento sin nada que pintar', () => {
    expect(htmlProblem('<!doctype html><html><head><title>Nada</title></head><body></body></html>')).toContain('no pinta nada')
  })

  it('acepta una cuenta regresiva de verdad, con su script y su contenido', () => {
    const bueno = '<!doctype html><html><body><h1 id="d">—</h1><p>para el año nuevo</p><script>setInterval(()=>{document.getElementById("d").textContent=1},1000)</script></body></html>'
    expect(htmlProblem(bueno)).toBeNull()
  })

  it('acepta el documento que se dibuja entero desde el script', () => {
    expect(htmlProblem('<body><script>document.body.textContent = "hola"</script></body>')).toBeNull()
  })
})
