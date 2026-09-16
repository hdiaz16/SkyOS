import { describe, expect, it } from 'vitest'
import { GOOGLE_HOME, looksLikeUrl, titleForUrl, toNavigableUrl } from './web'

/**
 * What counts as an address and what is just something someone typed. Everything with a dot used to be an
 * address, so «3.5» opened https://3.5 and left an empty panel where a Google search belonged.
 */
describe('looksLikeUrl', () => {
  it('acepta dominios de verdad', () => {
    for (const s of ['google.com', 'www.sky-os.cloud', 'sub.dominio.mx/ruta?q=1', 'localhost:5173/x', 'https://x.com'])
      expect(looksLikeUrl(s), s).toBe(true)
  })

  it('rechaza lo que solo tiene un punto', () => {
    for (const s of ['3.5', 'v1.2', 'notas.txt', 'index.js', 'hola mundo.com', 'https://', 'https:// x'])
      expect(looksLikeUrl(s), s).toBe(false)
  })
})

describe('toNavigableUrl', () => {
  it('busca en Google lo que no es una dirección', () => {
    expect(toNavigableUrl('3.5')).toContain('/search')
    expect(toNavigableUrl('cuánto cuesta el iPhone')).toContain('/search')
    // An address with a scheme and nothing else framed an empty panel; it is a search like any other text.
    expect(toNavigableUrl('https://')).toContain('/search')
  })

  it('deja pasar direcciones y completa las que vienen sin esquema', () => {
    expect(toNavigableUrl('https://x.com/algo')).toBe('https://x.com/algo')
    expect(toNavigableUrl('sky-os.cloud')).toBe('https://sky-os.cloud')
    expect(toNavigableUrl('')).toBe(GOOGLE_HOME)
  })
})

describe('titleForUrl', () => {
  it('nombra la ventana por su sitio', () => {
    expect(titleForUrl('https://www.sky-os.cloud/x')).toBe('sky-os.cloud')
    expect(titleForUrl('https://www.google.com/search?q=hola')).toBe('Google · hola')
    expect(titleForUrl('no es una url')).toBe('Navegador')
  })
})
