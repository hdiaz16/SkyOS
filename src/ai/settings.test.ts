import { describe, expect, it } from 'vitest'
import { inferTiers } from './settings'

/**
 * Nothing is written down for auto-tier providers: the tiers are read from whatever the provider lists the
 * day it is asked. These are the shapes that reading has to survive — today's GLM list, tomorrow's, and the
 * lists that carry models which cannot hold a conversation.
 */

describe('los tiers se leen de la lista del proveedor, no de este archivo', () => {
  it('la lista de hoy: air para lo cotidiano, 4.5 de equilibrio, 4.6 para lo difícil', () => {
    const ids = ['glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5-airx', 'glm-4.5-flash', 'glm-4.5v']
    expect(inferTiers(ids)).toEqual({ fast: 'glm-4.5-air', balanced: 'glm-4.5', deep: 'glm-4.6' })
  })

  it('mañana sale el 4.7 y el escalón más alto se mueve solo', () => {
    const ids = ['glm-4.7', 'glm-4.6', 'glm-4.6-air', 'glm-4.5', 'glm-4.5-air']
    expect(inferTiers(ids)).toEqual({ fast: 'glm-4.6-air', balanced: 'glm-4.6', deep: 'glm-4.7' })
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
