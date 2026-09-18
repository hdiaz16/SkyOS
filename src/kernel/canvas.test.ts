import { describe, expect, it } from 'vitest'
import { appendBlocks, canvasText, parseCanvas, serializeCanvas } from './canvas'

/**
 * A canvas that does not parse used to come out as an empty board, and the next edit wrote over the original
 * with nothing but itself. These are the shapes that must never pass for a blank canvas.
 */

describe('un lienzo ilegible no se hace pasar por vacío', () => {
  it('el texto vacío es un lienzo que está naciendo', () => {
    expect(parseCanvas('')).toEqual({ version: 1, blocks: [] })
    expect(parseCanvas('   \n ')).toEqual({ version: 1, blocks: [] })
  })

  it('un archivo truncado, renombrado o de otra forma es ilegible', () => {
    expect(parseCanvas('{"version":1,"blocks":[{"id":"a"')).toBeNull()
    expect(parseCanvas('la lista del súper')).toBeNull()
    expect(parseCanvas('{"hello":1}')).toBeNull()
  })

  it('un lienzo válido va y vuelve entero', () => {
    const { doc } = appendBlocks({ version: 1, blocks: [] }, [{ kind: 'markdown', content: '# Plan' }])
    expect(parseCanvas(serializeCanvas(doc))).toEqual(doc)
  })

  it('canvasText no inventa palabras de un archivo roto', () => {
    expect(canvasText('roto')).toBe('')
  })
})
