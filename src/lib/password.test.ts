import { describe, expect, it } from 'vitest'
import { FREE_TRIES, lockoutMs, passwordProblem, passwordStrength } from './password'

describe('a password worth having', () => {
  it('asks for eight characters before anything else', () => {
    expect(passwordProblem('abc123')).toMatch(/8 caracteres/)
    expect(passwordProblem('')).toMatch(/8 caracteres/)
  })

  it('refuses the first guesses anybody would make', () => {
    for (const p of ['12345678', 'password', 'contraseña', 'aaaaaaaa', 'abcdefgh', 'qwertyuiop']) {
      expect(passwordProblem(p), p).toMatch(/cualquiera/)
    }
  })

  it('refuses the email itself, in any case', () => {
    expect(passwordProblem('Hector2026x', 'hector@correo.com')).toMatch(/correo/)
    expect(passwordProblem('salvia-2026', 'hector@correo.com')).toBeNull()
  })

  it('wants a second kind of character unless the password is long', () => {
    expect(passwordProblem('correcthorse')).toMatch(/Mezcla/)
    expect(passwordProblem('correcthorsebattery')).toBeNull()
    expect(passwordProblem('salvia2026')).toBeNull()
  })

  it('measures strength only once the password is acceptable', () => {
    expect(passwordStrength('short1')).toBe(0)
    expect(passwordStrength('salvia2026')).toBe(1)
    expect(passwordStrength('salvia-2026')).toBe(2)
    expect(passwordStrength('Salvia-campo-2026!')).toBe(3)
  })
})

describe('waiting after wrong guesses', () => {
  it('lets the first tries through and then makes the guesser wait, doubling, up to five minutes', () => {
    for (let n = 0; n < FREE_TRIES; n++) expect(lockoutMs(n)).toBe(0)
    expect(lockoutMs(FREE_TRIES)).toBe(30_000)
    expect(lockoutMs(FREE_TRIES + 1)).toBe(60_000)
    expect(lockoutMs(FREE_TRIES + 2)).toBe(120_000)
    expect(lockoutMs(40)).toBe(5 * 60_000)
  })
})
