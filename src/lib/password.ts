/**
 * Entering with a password, the part that is ours: what counts as a password worth having, and how long to
 * make somebody wait after guessing wrong. The server checks too — Supabase has its own minimum and its own
 * rate limits — but this is the first line, the one that speaks Spanish before anything travels, and the one
 * that slows a guesser down in the browser he is guessing from.
 */

export const MIN_PASSWORD = 8

/** The first things anybody would try. Not a dictionary: the handful that head every leak. */
const COMMON = new Set([
  'password',
  'password1',
  'contraseña',
  'contrasena',
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  'qwertyuiop',
  'qwerty123',
  'asdfghjk',
  'zxcvbnm1',
  'iloveyou',
  'letmein1',
  'welcome1',
  'admin123',
  'skyos123',
  'football',
  'baseball',
  'princess',
  'sunshine',
  'superman',
  'trustno1',
  '11111111',
  '00000000',
])

/** abcdefgh, 12345678: every character one step after the last. */
const isSequence = (s: string): boolean => s.length >= 4 && [...s].every((ch, i) => i === 0 || ch.charCodeAt(0) - s.charCodeAt(i - 1) === 1)
const sameChar = (s: string): boolean => /^(.)\1+$/.test(s)
const classes = (s: string): number => [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((re) => re.test(s)).length

/** Why this is not a password yet, in one line for the person; null when it will do. */
export function passwordProblem(password: string, email = ''): string | null {
  if (password.length < MIN_PASSWORD) return `Al menos ${MIN_PASSWORD} caracteres.`
  const lower = password.toLowerCase()
  if (COMMON.has(lower) || sameChar(lower) || isSequence(lower)) return 'Esa es de las primeras que probaría cualquiera.'
  const local = email.trim().toLowerCase().split('@')[0] ?? ''
  if (local.length >= 4 && lower.includes(local)) return 'Que no sea tu propio correo.'
  if (password.length < 14 && classes(password) < 2) return 'Mezcla letras con números o signos, o hazla más larga.'
  return null
}

/** 0 is not a password yet; 1 will do; 2 is good; 3 is long and mixed. */
export function passwordStrength(password: string, email = ''): 0 | 1 | 2 | 3 {
  if (passwordProblem(password, email)) return 0
  const score = (password.length >= 12 ? 1 : 0) + (password.length >= 16 ? 1 : 0) + (classes(password) >= 3 ? 1 : 0)
  return score >= 3 ? 3 : score >= 1 ? 2 : 1
}

export const STRENGTH_LABEL = ['', 'Sirve', 'Buena', 'Fuerte'] as const

/** Wrong tries before the wait starts. */
export const FREE_TRIES = 5

/** After the free tries, thirty seconds; doubling from there, never more than five minutes. */
export function lockoutMs(failures: number): number {
  if (failures < FREE_TRIES) return 0
  return Math.min(5 * 60_000, 30_000 * 2 ** (failures - FREE_TRIES))
}
