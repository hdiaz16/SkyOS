import { describe, expect, it } from 'vitest'
import { inferTiers, inferVisionModel } from './settings'

/**
 * Nothing is written down for auto-tier providers: the tiers are read from whatever the provider lists the
 * day it is asked. These are the shapes that reading has to survive — today's GLM list, tomorrow's, and the
 * lists that carry models which cannot hold a conversation.
 */

describe('los tiers se leen de la lista del proveedor, no de este archivo', () => {
  it('el marcador barato más nuevo carga lo cotidiano, y lo difícil sube al modelo completo', () => {
    const ids = ['glm-4.7-flash', 'glm-4.6', 'glm-4.5', 'glm-4.5-air']
    expect(inferTiers(ids)).toEqual({ fast: 'glm-4.7-flash', balanced: 'glm-4.7-flash', deep: 'glm-4.6' })
  })

  it('sin flash, air toma lo cotidiano', () => {
    const ids = ['glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5-airx', 'glm-4.5v']
    expect(inferTiers(ids)).toEqual({ fast: 'glm-4.5-air', balanced: 'glm-4.5-air', deep: 'glm-4.6' })
  })

  it('mañana sale el 4.7 y el escalón más alto se mueve solo', () => {
    const ids = ['glm-4.7-flash', 'glm-4.7', 'glm-4.6', 'glm-4.5']
    expect(inferTiers(ids)).toEqual({ fast: 'glm-4.7-flash', balanced: 'glm-4.7-flash', deep: 'glm-4.7' })
  })

  it('un modelo que no conversa nunca sube al podio', () => {
    const ids = ['embedding-3', 'glm-4.6', 'video-lipsync', 'glm-4.5-air']
    const tiers = inferTiers(ids)
    expect(tiers?.deep).toBe('glm-4.6')
    expect(tiers?.fast).toBe('glm-4.5-air')
  })

  it('una lista de un solo modelo lo usa para los tres escalones', () => {
    expect(inferTiers(['glm-4.6'])).toEqual({ fast: 'glm-4.6', balanced: 'glm-4.6', deep: 'glm-4.6' })
  })

  it('sin lista no hay tiers: la persona elige a mano', () => {
    expect(inferTiers([])).toBeNull()
  })
})

describe('el modelo con ojos sale de la misma lista viva', () => {
  it('toma el -v de la generación más nueva', () => {
    const ids = ['glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5v']
    expect(inferVisionModel(ids)).toBe('glm-4.5v')
  })

  it('cuando Z.ai sirva el 4.6v, ese es el que mira', () => {
    const ids = ['glm-4.6v', 'glm-4.6', 'glm-4.5v', 'glm-4.5']
    expect(inferVisionModel(ids)).toBe('glm-4.6v')
  })

  it('otros nombres de ojos también cuentan', () => {
    expect(inferVisionModel(['qwen2.5-vl-72b', 'qwen3-235b'])).toBe('qwen2.5-vl-72b')
    expect(inferVisionModel(['gemma-3-27b-it-vision', 'gemma-3-27b-it'])).toBe('gemma-3-27b-it-vision')
  })

  it('los trabajos que no conversan no pasan por ojos aunque lleven v', () => {
    expect(inferVisionModel(['glm-4.5v-audio', 'video-lipsync'])).toBeNull()
  })

  it('sin -v en la lista, nadie mira', () => {
    expect(inferVisionModel(['glm-4.6', 'glm-4.5-air', 'embedding-3'])).toBeNull()
    expect(inferVisionModel([])).toBeNull()
  })
})
