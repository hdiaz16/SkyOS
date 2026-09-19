import { describe, expect, it } from 'vitest'
import { describeAuthError } from './account'

/** What Supabase says, said for a person — and never in a way that tells a stranger which emails have an account. */
describe('what the account service said', () => {
  it('answers a wrong email and a wrong password with the same sentence', () => {
    expect(describeAuthError({ message: 'Invalid login credentials', code: 'invalid_credentials' })).toBe('Correo o contraseña incorrectos.')
    expect(describeAuthError({ message: 'Invalid login credentials' })).toBe('Correo o contraseña incorrectos.')
  })

  it('knows the codes Supabase names its errors with, and the older messages', () => {
    expect(describeAuthError({ message: 'x', code: 'user_already_exists' })).toBe('Ese correo ya tiene cuenta.')
    expect(describeAuthError({ message: 'User already registered' })).toBe('Ese correo ya tiene cuenta.')
    expect(describeAuthError({ message: 'x', code: 'weak_password' })).toMatch(/contraseña/)
    expect(describeAuthError({ message: 'Password should be at least 6 characters' })).toMatch(/contraseña/)
    expect(describeAuthError({ message: 'x', code: 'email_not_confirmed' })).toMatch(/confirmación/)
    expect(describeAuthError({ message: 'x', code: 'signup_disabled' })).toMatch(/cuentas nuevas/)
    expect(describeAuthError({ message: 'x', code: 'over_request_rate_limit' })).toMatch(/Espera/)
    expect(describeAuthError({ message: 'For security purposes, you can only request this after 59 seconds' })).toMatch(/Espera/)
    expect(describeAuthError({ message: 'Unable to validate email address: invalid format' })).toMatch(/correo/)
  })

  it('keeps the code messages of the email flow', () => {
    expect(describeAuthError({ message: 'Token has expired or is invalid' })).toMatch(/caducó/)
    expect(describeAuthError({ message: 'x', code: 'otp_expired' })).toMatch(/caducó/)
    expect(describeAuthError({ message: 'Invalid token' })).toMatch(/no coincide/)
    expect(describeAuthError({ message: 'Failed to fetch' })).toMatch(/conexión/)
  })

  it('passes through what it does not know rather than inventing', () => {
    expect(describeAuthError({ message: 'Something odd happened' })).toBe('Something odd happened')
  })
})
