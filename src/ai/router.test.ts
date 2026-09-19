import { describe, expect, it } from 'vitest'
import { AUTO_MODEL, type AiSettingsState } from './settings'
import type { Attachment } from './types'
import { resolveModel } from './router'

/**
 * With «Automático» the tiers pick the talker; a request that carries an image needs one that sees, and
 * the provider's own list says which one that is today. These cases pin the switch and its limits.
 */

const state = {
  provider: 'glm',
  model: AUTO_MODEL,
  discovered: { glm: ['glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5v'] },
} as AiSettingsState

const image: Attachment[] = [{ type: 'image', mediaType: 'image/png', data: 'x' }]

describe('con imagen, el turno es del modelo que ve', () => {
  it('una imagen adjunta manda la petición al -v de la lista', () => {
    const route = resolveModel(state, { prompt: '¿qué hay en esta foto?', attachments: image })
    expect(route.model).toBe('glm-4.5v')
    expect(route.auto).toBe(true)
  })

  it('sin imagen, los tiers siguen mandando', () => {
    // Sin flash en la lista, lo cotidiano lo toma el marcador barato.
    expect(resolveModel(state, { prompt: 'hola' }).model).toBe('glm-4.5-air')
  })

  it('un adjunto que no es imagen no cambia nada', () => {
    const files = [{ type: 'file' as const, name: 'a.md', text: 'hola' }]
    expect(resolveModel(state, { prompt: 'resume esto', attachments: files }).model).toBe('glm-4.6')
  })

  it('el modelo elegido a mano nunca se pisa', () => {
    const manual = { ...state, model: 'glm-4.6' }
    expect(resolveModel(manual, { prompt: '¿qué ves?', attachments: image }).model).toBe('glm-4.6')
  })

  it('sin -v en la lista, la imagen viaja con el tier que toque', () => {
    const blind = { ...state, discovered: { glm: ['glm-4.6', 'glm-4.5-air'] } }
    expect(resolveModel(blind, { prompt: '¿qué ves?', attachments: image }).model).toBe('glm-4.6')
  })
})
