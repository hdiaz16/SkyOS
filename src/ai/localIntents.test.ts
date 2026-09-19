import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeLocalIntent, resolveLocalIntent } from './localIntents'

const context = { now: new Date('2026-09-19T14:05:00Z'), locale: 'es-MX', timeZone: 'UTC', theme: 'oscuro', windowCount: 2 }

afterEach(() => vi.unstubAllGlobals())

describe('intenciones locales', () => {
  it('normaliza acentos y signos sin ampliar el significado', () => {
    expect(normalizeLocalIntent(' ¿QUÉ   HORA es?! ')).toBe('que hora es')
    expect(resolveLocalIntent('¿Qué hora es?', context)).toMatchObject({ kind: 'time', text: 'Son las 14:05.' })
  })

  it('resuelve fecha, tema y ventanas sin un proveedor', () => {
    expect(resolveLocalIntent('qué día es', context)?.kind).toBe('date')
    expect(resolveLocalIntent('tema actual', context)).toEqual({ kind: 'theme', text: 'El tema activo es oscuro.' })
    expect(resolveLocalIntent('cuántas ventanas hay', context)).toEqual({ kind: 'window_count', text: 'Hay 2 ventanas abiertas.' })
  })

  it.each(['crea un reloj', 'qué hora es en Tokio', 'dime la hora y abre el calendario', 'analiza por qué la hora está mal'])('no intercepta %s', (prompt) => {
    expect(resolveLocalIntent(prompt, context)).toBeNull()
  })

  it('no depende de navigator fuera del navegador', () => {
    vi.stubGlobal('navigator', undefined)
    expect(resolveLocalIntent('hora actual', { now: context.now, timeZone: 'UTC' })?.kind).toBe('time')
  })
})
