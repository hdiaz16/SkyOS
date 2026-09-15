import { describe, expect, it } from 'vitest'
import { sanitizeHistory, trimHistory } from './history'
import type { ChatMessage } from './types'

/**
 * Providers reject a history whose grammar is broken, and the rejection arrives as a 400 in the middle of the
 * person's sentence. This is the shape of the bug that caused one: a tool result whose call had been trimmed
 * away. Everything here is a case that already happened or is one cut away from happening.
 */

const user = (text: string): ChatMessage => ({ role: 'user', parts: [{ type: 'text', text }] })
const assistant = (text: string): ChatMessage => ({ role: 'assistant', parts: [{ type: 'text', text }] })
const calls = (...ids: string[]): ChatMessage => ({ role: 'assistant', parts: ids.map((id) => ({ type: 'tool_call', id, name: 'fs_list', input: {} })) })
const results = (...ids: string[]): ChatMessage => ({ role: 'user', parts: ids.map((id) => ({ type: 'tool_result', toolCallId: id, content: 'ok' })) })

const shapeOf = (history: ChatMessage[]) => history.map((m) => `${m.role}:${m.parts.map((p) => ('id' in p ? `call ${p.id}` : 'toolCallId' in p ? `result ${p.toolCallId}` : p.type)).join(',')}`)

describe('una conversación que el proveedor aceptará', () => {
  it('tira el resultado cuyo llamado ya no está — el 400 de Anthropic', () => {
    const roto = [results('fc_huérfano'), user('sigue'), assistant('listo')]
    expect(shapeOf(sanitizeHistory(roto))).toEqual(['user:text', 'assistant:text'])
  })

  it('tira el llamado que nunca recibió respuesta', () => {
    const roto = [user('haz algo'), calls('fc_1'), user('mejor no'), assistant('va')]
    const limpio = sanitizeHistory(roto)
    expect(shapeOf(limpio)).toEqual(['user:text', 'user:text', 'assistant:text'])
  })

  it('no toca un intercambio sano', () => {
    const sano = [user('lista mis archivos'), calls('fc_1'), results('fc_1'), assistant('aquí están')]
    expect(sanitizeHistory(sano)).toEqual(sano)
  })

  it('conserva solo los llamados que sí fueron respondidos', () => {
    const mixto = [user('dos cosas'), calls('fc_1', 'fc_2'), results('fc_1'), assistant('una salió')]
    expect(shapeOf(sanitizeHistory(mixto))).toEqual(['user:text', 'assistant:call fc_1', 'user:result fc_1', 'assistant:text'])
  })

  it('empieza por las palabras de la persona, nunca por una respuesta suelta', () => {
    expect(sanitizeHistory([assistant('hola'), user('hola')])[0].role).toBe('user')
  })

  it('una conversación imposible de reparar se queda vacía en vez de romper la petición', () => {
    expect(sanitizeHistory([results('fc_x')])).toEqual([])
  })
})

describe('recortar sin romper', () => {
  it('corta donde empieza un intercambio, no a la mitad', () => {
    const largo = [user('uno'), calls('fc_1'), results('fc_1'), assistant('ya'), user('dos'), assistant('ya dos')]
    const corto = trimHistory(largo, 3)
    expect(corto[0].role).toBe('user')
    expect(shapeOf(corto)).toEqual(['user:text', 'assistant:text'])
  })

  it('deja la historia como está cuando ya cabe', () => {
    const corta = [user('uno'), assistant('dos')]
    expect(trimHistory(corta, 10)).toBe(corta)
  })
})
