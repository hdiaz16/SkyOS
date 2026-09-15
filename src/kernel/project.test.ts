import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject, summarizeProject, type ProjectMemory } from './project'
import type { FsNode } from './types'

/**
 * The project's memory is a Markdown file a person can edit by hand. Whatever they do to it, reading it back
 * must not invent items, lose decisions or turn the file's own filler into content.
 */

const folder = { id: 'f1', name: 'Propuesta Bodesa' } as FsNode

const memory = (over: Partial<ProjectMemory> = {}): ProjectMemory => ({
  folderId: 'f1',
  name: 'Propuesta Bodesa',
  nodeId: 'n1',
  goal: 'Cerrar la propuesta antes del viernes.',
  decisions: ['14 sep 2026 · Tres nodos, no cinco'],
  pending: ['Pedir precios'],
  done: ['Redactar alcance'],
  log: ['14 sep 2026 · Esqueleto listo'],
  ...over,
})

describe('la memoria del proyecto va y vuelve entera', () => {
  it('sobrevive a escribirla y volverla a leer', () => {
    const before = memory()
    const after = parseProject(serializeProject(before), folder, 'n1')
    expect(after).toEqual(before)
  })

  it('un proyecto recién nacido se lee vacío, no lleno de relleno', () => {
    const nuevo = memory({ goal: '', decisions: [], pending: [], done: [], log: [] })
    const after = parseProject(serializeProject(nuevo), folder, 'n1')
    expect(after.goal).toBe('')
    expect(after.decisions).toEqual([])
    expect(after.pending).toEqual([])
    expect(after.log).toEqual([])
  })

  it('separa lo hecho de lo pendiente por su casilla', () => {
    const mem = parseProject(
      ['# X', '## Pendientes', '- [ ] Falta esto', '- [x] Esto ya', '- Sin casilla también cuenta'].join('\n'),
      folder,
      'n1',
    )
    expect(mem.pending).toEqual(['Falta esto', 'Sin casilla también cuenta'])
    expect(mem.done).toEqual(['Esto ya'])
  })

  it('aguanta que la editen a mano: líneas en blanco, asteriscos y encabezados sin acento', () => {
    const aMano = [
      '# Propuesta Bodesa',
      '',
      '## Objetivo',
      'Cerrar la propuesta',
      'antes del viernes.',
      '',
      '## Decisiones',
      '* Tres nodos',
      '',
      '## Bitacora',
      '- Se armó el esqueleto',
      '',
      '## Sección que alguien inventó',
      '- esto no es nuestro',
    ].join('\n')
    const mem = parseProject(aMano, folder, 'n1')
    expect(mem.goal).toBe('Cerrar la propuesta antes del viernes.')
    expect(mem.decisions).toEqual(['Tres nodos'])
    expect(mem.log).toEqual(['Se armó el esqueleto'])
  })

  it('resume para el modelo solo lo que existe', () => {
    const lineas = summarizeProject(memory({ decisions: [], log: [] }))
    expect(lineas[0]).toContain('Propuesta Bodesa')
    expect(lineas.join(' ')).toContain('Pedir precios')
    expect(lineas.join(' ')).not.toContain('Decisiones:')
  })
})
