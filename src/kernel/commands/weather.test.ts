import { describe, expect, it } from 'vitest'
import { dayLabel, shapeForecast } from './weather'

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

/**
 * Con la lista delante, el modelo contestó «mañana, entre 23 y 29» leyendo la fila de hoy, cuando mañana eran
 * 22 y 30. Hoy y mañana van servidos aparte para que no tenga que contar filas.
 */
describe('el pronóstico, sin que haya que elegir fila', () => {
  const weather = {
    temperature: 28.6,
    code: 3,
    isDay: true,
    humidity: 68.2,
    wind: 9.7,
    days: [
      { date: '2026-09-20', code: 80, min: 22.6, max: 29.4 },
      { date: '2026-09-21', code: 95, min: 22.4, max: 30.1 },
      { date: '2026-09-22', code: 61, min: 23.1, max: 29.8 },
    ],
    fetchedAt: 0,
  }
  const today = new Date(2026, 8, 20)

  it('sirve hoy y mañana ya resueltos, con sus temperaturas', () => {
    const out = shapeForecast(weather, 'Colima', 4, today)
    expect(out.today).toMatchObject({ when: 'hoy', min: 23, max: 29 })
    expect(out.tomorrow).toMatchObject({ when: 'mañana', min: 22, max: 30, sky: 'Tormenta' })
  })

  it('redondea lo de ahora y conserva el lugar', () => {
    const out = shapeForecast(weather, 'Colima', 4, today)
    expect(out.place).toBe('Colima')
    expect(out.now).toEqual({ temperature: 29, sky: 'Nublado', humidity: 68, wind: 10 })
  })

  it('recorta la lista a los días pedidos, entre uno y siete', () => {
    expect(shapeForecast(weather, 'Colima', 2, today).days).toHaveLength(2)
    expect(shapeForecast(weather, 'Colima', 0, today).days).toHaveLength(1)
    expect(shapeForecast(weather, 'Colima', 99, today).days).toHaveLength(3)
  })

  it('si solo piden hoy, mañana no se inventa', () => {
    expect(shapeForecast(weather, 'Colima', 1, today).tomorrow).toBeUndefined()
  })
})
