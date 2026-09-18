import { describe, expect, it } from 'vitest'
import { configProblem } from './widgets'

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
