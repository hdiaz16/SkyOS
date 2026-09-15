import { beforeEach, describe, expect, it } from 'vitest'
import { allowed, BULK } from './consent'
import { useAuth } from '../system/auth'
import { useDialog } from '../state/dialog'
import type { UserProfile, UserRow } from '../system/db'

/**
 * The gate that decides when Sky has to ask. These are the rules a poisoned document or a confused model must
 * not be able to talk its way around, so they are checked here rather than trusted to a prompt.
 */

const profile = (autonomy: UserProfile['autonomy']): UserProfile => ({ tone: 'warm', purpose: 'mixed', autonomy, microphone: 'skipped', voice: true })

function signedInWith(autonomy: UserProfile['autonomy']): void {
  useAuth.setState({ current: { id: 'u1', name: 'Ana', initials: 'A', hue: 0, dbName: 'x', storageDir: 'x', profile: profile(autonomy), createdAt: 0, lastLoginAt: 0 } as UserRow })
}

/** Replaces the dialog with one that always answers the same way, and counts how often it was asked. */
function answering(reply: boolean): { asked: () => number; lastTitle: () => string | undefined } {
  let count = 0
  let title: string | undefined
  useDialog.setState({
    confirm: (request) => {
      count++
      title = request.title
      return Promise.resolve(reply)
    },
  })
  return { asked: () => count, lastTitle: () => title }
}

beforeEach(() => signedInWith('act'))

describe('con «actúa y avísame»', () => {
  it('no interrumpe por un cambio pequeño y reversible', async () => {
    const dialog = answering(false)
    await expect(allowed('write', { title: '¿Renombrar?' })).resolves.toBe(true)
    expect(dialog.asked()).toBe(0)
  })

  it('pregunta en cuanto la acción toca más de un puñado de cosas', async () => {
    const dialog = answering(true)
    await expect(allowed('write', { title: '¿Mover a la papelera?', count: BULK + 1 })).resolves.toBe(true)
    expect(dialog.asked()).toBe(1)
  })

  it('pregunta siempre por lo que no se puede deshacer', async () => {
    const dialog = answering(true)
    await allowed('destructive', { title: '¿Eliminar definitivamente?' })
    expect(dialog.asked()).toBe(1)
  })

  it('pregunta siempre por lo que sale del equipo', async () => {
    const dialog = answering(true)
    await allowed('external', { title: '¿Notion: crear página?' })
    expect(dialog.asked()).toBe(1)
  })

  it('nunca pregunta por leer', async () => {
    const dialog = answering(false)
    await expect(allowed('read', { title: '¿Listar archivos?' })).resolves.toBe(true)
    expect(dialog.asked()).toBe(0)
  })
})

describe('con «pregúntame antes» y con «solo lo que yo pida»', () => {
  for (const autonomy of ['ask', 'manual'] as const) {
    it(`pregunta hasta por un cambio pequeño (${autonomy})`, async () => {
      signedInWith(autonomy)
      const dialog = answering(true)
      await expect(allowed('write', { title: '¿Etiquetar?' })).resolves.toBe(true)
      expect(dialog.asked()).toBe(1)
    })

    it(`sigue sin preguntar por leer (${autonomy})`, async () => {
      signedInWith(autonomy)
      const dialog = answering(false)
      await expect(allowed('read', { title: '¿Buscar?' })).resolves.toBe(true)
      expect(dialog.asked()).toBe(0)
    })
  }
})

describe('cuando la persona dice que no', () => {
  it('la respuesta es no, y el que llama no debe hacer nada', async () => {
    answering(false)
    await expect(allowed('destructive', { title: '¿Vaciar la papelera?' })).resolves.toBe(false)
  })

  it('sin nadie con sesión iniciada se comporta como «actúa y avísame»', async () => {
    useAuth.setState({ current: null })
    const dialog = answering(true)
    await expect(allowed('write', { title: '¿Renombrar?' })).resolves.toBe(true)
    expect(dialog.asked()).toBe(0)
    await allowed('external', { title: '¿Notion?' })
    expect(dialog.asked()).toBe(1)
  })
})

describe('lo que se le dice a la persona', () => {
  it('avisa que algo no se puede deshacer', async () => {
    const dialog = answering(true)
    await allowed('destructive', { title: '¿Eliminar definitivamente?' })
    expect(dialog.lastTitle()).toBe('¿Eliminar definitivamente?')
  })
})
