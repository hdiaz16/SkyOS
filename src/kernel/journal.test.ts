import { describe, expect, it } from 'vitest'
import { storable } from './journal'
import type { JournalEntry } from './commands'

/**
 * What the journal writes down decides whether "deshacer" still means anything tomorrow. An inverse that will
 * not work after a reload must not be saved, because a button that does nothing is worse than no button.
 */

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'e1',
  commandId: 'fs.trash',
  label: '"Acta.md" enviado a la papelera',
  at: 1_700_000_000_000,
  source: 'ai',
  undone: false,
  undo: { commandId: 'fs.restore', params: { ids: ['n1'] } },
  ...over,
})

describe('lo que se guarda del diario', () => {
  it('guarda el inverso de un cambio en archivos', () => {
    expect(storable(entry()).undo).toEqual({ commandId: 'fs.restore', params: { ids: ['n1'] } })
  })

  it('deja fuera el inverso de lo que solo vale en esta sesión', () => {
    const row = storable(entry({ commandId: 'ui.arrangeWindows', ephemeral: true }))
    expect(row.undo).toBeUndefined()
    expect(row.label).toBe(entry().label)
  })

  it('deja fuera un inverso demasiado pesado para cargarlo entre sesiones', () => {
    const enorme = { commandId: 'fs.writeText', params: { id: 'n1', content: 'x'.repeat(300 * 1024) } }
    expect(storable(entry({ undo: enorme })).undo).toBeUndefined()
  })

  it('carga un contenido anterior que sí cabe', () => {
    const cabe = { commandId: 'fs.writeText', params: { id: 'n1', content: 'x'.repeat(1000) } }
    expect(storable(entry({ undo: cabe })).undo).toEqual(cabe)
  })

  it('recuerda que una acción salió del equipo y nunca le inventa un inverso', () => {
    const row = storable(entry({ commandId: 'mcp.notion.create_page', external: true, undo: undefined }))
    expect(row.external).toBe(true)
    expect(row.undo).toBeUndefined()
  })

  it('no arrastra marcas que solo valen en memoria', () => {
    const row = storable(entry({ restored: true, ephemeral: true }))
    expect('restored' in row).toBe(false)
    expect('ephemeral' in row).toBe(false)
  })

  it('conserva que ya fue deshecho, para no ofrecerlo dos veces', () => {
    expect(storable(entry({ undone: true })).undone).toBe(true)
  })
})
