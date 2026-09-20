import { describe, expect, it } from 'vitest'
import { dayLabel } from './weather'

/**
 * El modelo no sabe qué día es hoy: si el pronóstico solo trae fechas ISO, «¿qué tiempo hará mañana?» se
 * contesta con el día equivocado o no se contesta. Cada día llega con su nombre ya resuelto.
 */
describe('el día en palabras', () => {
  const today = new Date(2026, 8, 20) // domingo 20 de septiembre de 2026, hora local

  it('nombra hoy, mañana y pasado mañana', () => {
    expect(dayLabel('2026-09-20', today)).toBe('hoy')
    expect(dayLabel('2026-09-21', today)).toBe('mañana')
    expect(dayLabel('2026-09-22', today)).toBe('pasado mañana')
  })

  it('a partir del tercer día usa el día de la semana', () => {
    expect(dayLabel('2026-09-23', today)).toBe('el miércoles')
    expect(dayLabel('2026-09-26', today)).toBe('el sábado')
  })

  it('cruza el fin de mes sin perder la cuenta', () => {
    expect(dayLabel('2026-10-01', new Date(2026, 8, 30))).toBe('mañana')
    expect(dayLabel('2026-01-01', new Date(2025, 11, 31))).toBe('mañana')
  })

  it('una fecha pasada o ilegible se devuelve tal cual, sin inventar', () => {
    expect(dayLabel('2026-09-19', today)).toBe('2026-09-19')
    expect(dayLabel('ayer', today)).toBe('ayer')
  })
})
