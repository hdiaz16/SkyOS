import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { ACCOUNTS_KEY, ACCOUNTS_MAIL, ACCOUNTS_URL } from '../config'

/**
 * Who you are, verified somewhere other than this browser.
 *
 * Until now a person was a name in a list: anyone who opened the browser could be anyone, and the optional PIN
 * only kept an honest passer-by out. An account fixes the part that matters — coming back is proving it is
 * you, and it is the same you on another computer. Your files stay where they always were, on this device;
 * what travels is the identity, not the desktop.
 *
 * Two ways in, chosen by what the deployment can do. Where it can send email — its own SMTP in Supabase,
 * declared with `VITE_ACCOUNTS_MAIL=1` — entering is a six-digit code typed where it was asked for, and the
 * email is thereby verified. Where it cannot, which is every deployment until somebody connects an SMTP,
 * entering is a password, and the email is a name nobody has checked yet. Both ways open the same account, so
 * a deployment moves from one to the other by flipping the flag. When the deployment has no Supabase
 * configured at all, none of this exists and SkyOS keeps working with local profiles, which is what a
 * self-hosted copy without a server gets.
 */

export interface Account {
  id: string
  email: string
  /** Whether anyone has proved this email is theirs. The code sent to the inbox does; a password does not. */
  emailVerified: boolean
}

export const accountsEnabled = !!(ACCOUNTS_URL && ACCOUNTS_KEY)

/**
 * How a person gets in, decided by the deployment and by the project's own settings. `unavailable` is a project
 * that insists on confirming emails while the deployment cannot send any: nobody could ever get in, so the
 * desktop falls back to local profiles instead of showing a door that does not open.
 */
export type EntryMode = 'code' | 'password' | 'unavailable'

/**
 * The session lives under a key of our own so it never collides with anything else on the origin, and it is
 * refreshed in the background while the desktop is open.
 *
 * The flow is implicit rather than PKCE on purpose. PKCE keeps a verifier in the browser that asked for the
 * code, which is stricter and would be the better choice — except that the link in the email is opened
 * wherever the person reads their mail, which is very often another browser or another phone. There the
 * verifier does not exist and the link simply fails. The six-digit code, which is the way in this desktop is
 * built around, does not depend on any of this: it is typed where it was asked for.
 */
const client: SupabaseClient | null = accountsEnabled
  ? createClient(ACCOUNTS_URL, ACCOUNTS_KEY, {
      auth: { storageKey: 'mesa:cuenta', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    })
  : null

const toAccount = (user: User | null | undefined): Account | null => (user?.email ? { id: user.id, email: user.email, emailVerified: ACCOUNTS_MAIL } : null)

/** How long to wait for the network before deciding the cached session is all we are going to get. */
const OFFLINE_AFTER_MS = 6000

let knownMode: EntryMode | null = null

/**
 * Reads the project's public settings, once. GoTrue publishes whether it confirms emails on its own; when it
 * does not, and this deployment has nothing to send the confirmation with, a password sign-up would leave the
 * person with an account they can never open. Offline, the usual mode is assumed — nobody can register offline
 * anyway — and the answer is not kept, so the next boot asks again.
 */
export async function entryMode(): Promise<EntryMode> {
  if (!client) return 'unavailable'
  if (ACCOUNTS_MAIL) return 'code'
  if (knownMode) return knownMode
  try {
    const res = await fetch(`${ACCOUNTS_URL}/auth/v1/settings`, { headers: { apikey: ACCOUNTS_KEY }, signal: AbortSignal.timeout(OFFLINE_AFTER_MS) })
    if (!res.ok) return 'password'
    const settings = (await res.json()) as { mailer_autoconfirm?: boolean; external?: { email?: boolean } }
    if (settings.external?.email === false) {
      console.warn('[cuentas] El proyecto de Supabase tiene apagado el proveedor de correo (Authentication › Sign In / Providers › Email); sin él no hay cuentas. Mientras, el escritorio usa perfiles locales.')
      knownMode = 'unavailable'
    } else if (settings.mailer_autoconfirm !== true) {
      console.warn(
        '[cuentas] El proyecto exige confirmar el correo y este SkyOS no manda correos: apaga «Confirm email» en Supabase (Authentication › Sign In / Providers › Email), o configura un SMTP propio y pon VITE_ACCOUNTS_MAIL=1. Mientras, el escritorio usa perfiles locales.',
      )
      knownMode = 'unavailable'
    } else {
      knownMode = 'password'
    }
    return knownMode
  } catch {
    return 'password'
  }
}

/**
 * The account this browser is signed into, or null. Never blocks the boot for long: a cached session is
 * enough to open the desktop, because everything it opens is on this device anyway.
 */
export async function currentAccount(): Promise<Account | null> {
  if (!client) return null
  try {
    const session = await Promise.race([client.auth.getSession(), new Promise<null>((r) => setTimeout(() => r(null), OFFLINE_AFTER_MS))])
    return toAccount(session?.data.session?.user)
  } catch {
    return null
  }
}

export class AccountError extends Error {}

/** Thrown when someone tries to sign in with an email that has no account yet, so the screen can offer to make one. */
export class NoSuchAccount extends AccountError {}

/** Thrown when someone tries to create an account with an email that already has one, so the screen can offer the way in instead. */
export class AccountExists extends AccountError {}

/**
 * What the service said, said for a person. Supabase names its errors with a code; the message is the fallback
 * for older answers. Wrong email and wrong password are one sentence on purpose: the difference would tell a
 * stranger which emails have an account here.
 */
export function describeAuthError(error: { message: string; code?: string }): string {
  const code = error.code ?? ''
  const m = error.message.toLowerCase()
  if (code === 'invalid_credentials' || m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (code === 'user_already_exists' || m.includes('already registered') || m.includes('already been registered')) return 'Ese correo ya tiene cuenta.'
  if (code === 'weak_password' || m.includes('password should') || m.includes('password is known')) return 'Esa contraseña es demasiado corta o demasiado conocida.'
  if (code === 'email_not_confirmed' || m.includes('not confirmed')) {
    return 'Esa cuenta espera un correo de confirmación que este SkyOS aún no puede mandar. Pide a quien lo administra que apague la confirmación por correo.'
  }
  if (code === 'signup_disabled' || m.includes('signups not allowed for this instance')) return 'Este SkyOS no admite cuentas nuevas por ahora.'
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || m.includes('rate') || m.includes('too many') || m.includes('seconds')) {
    return 'Demasiados intentos seguidos. Espera un minuto.'
  }
  if (code === 'email_address_invalid' || code === 'validation_failed' || (m.includes('email') && m.includes('valid'))) return 'Ese correo no parece válido.'
  if (code === 'otp_expired' || m.includes('expired')) return 'Ese código ya caducó. Pídeme uno nuevo.'
  if (m.includes('invalid') || m.includes('token')) return 'Ese código no coincide. Míralo otra vez o pide uno nuevo.'
  if (m.includes('fetch') || m.includes('network')) return 'No alcanzo el servicio de cuentas. Vuelve a intentar cuando haya conexión.'
  return error.message
}

const NO_ACCOUNTS = 'Este SkyOS no tiene cuentas configuradas.'

/* ---------- the code, where the deployment can send it ---------- */

/**
 * Sends the code. Signing in and signing up are the same email and the same six digits, but they are not the
 * same intention: someone who mistypes their address while signing in should hear "no existe", not end up
 * inside a brand-new empty account wondering where their files went.
 */
export async function sendCode(email: string, creating: boolean): Promise<void> {
  if (!client) throw new AccountError(NO_ACCOUNTS)
  // Where the link in the email should land. Supabase only honours origins listed in its redirect allow list,
  // so a deployment has to name this one there; otherwise the link bounces to whatever Site URL it has.
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: creating, emailRedirectTo: window.location.origin },
  })
  if (!error) return
  const m = error.message.toLowerCase()
  if (m.includes('signups not allowed') || m.includes('not found') || m.includes('user not found')) {
    throw new NoSuchAccount('No hay ninguna cuenta con ese correo.')
  }
  throw new AccountError(describeAuthError(error))
}

/** Exchanges the code for a session. Accepts the six digits with or without the spaces people paste. */
export async function verifyCode(email: string, code: string): Promise<Account> {
  if (!client) throw new AccountError(NO_ACCOUNTS)
  const token = code.replace(/\D/g, '')
  const { data, error } = await client.auth.verifyOtp({ email: email.trim(), token, type: 'email' })
  if (error) throw new AccountError(describeAuthError(error))
  const account = toAccount(data.user)
  if (!account) throw new AccountError('El servicio de cuentas no devolvió un correo.')
  return account
}

/* ---------- the password, everywhere else ---------- */

/**
 * Creates the account. The server has its own minimum for the password and its own rate limits; the desktop
 * checks first (lib/password.ts) so the refusal speaks Spanish before anything travels. A project that still
 * insists on confirming emails answers with a user and no session — and, for an email already taken, with a
 * user that has no identities, which is how it avoids telling strangers who has an account.
 */
export async function register(email: string, password: string): Promise<Account> {
  if (!client) throw new AccountError(NO_ACCOUNTS)
  const { data, error } = await client.auth.signUp({ email: email.trim().toLowerCase(), password })
  if (error) {
    const said = describeAuthError(error)
    if (said === 'Ese correo ya tiene cuenta.') throw new AccountExists(said)
    throw new AccountError(said)
  }
  if (!data.session) {
    if (data.user && data.user.identities?.length === 0) throw new AccountExists('Ese correo ya tiene cuenta.')
    throw new AccountError('La cuenta quedó creada, pero espera un correo de confirmación que este SkyOS aún no puede mandar. Pide a quien lo administra que apague la confirmación por correo.')
  }
  const account = toAccount(data.session.user)
  if (!account) throw new AccountError('El servicio de cuentas no devolvió un correo.')
  return account
}

/** Signs in with the password. Wrong email and wrong password are the same answer, on purpose. */
export async function signIn(email: string, password: string): Promise<Account> {
  if (!client) throw new AccountError(NO_ACCOUNTS)
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) throw new AccountError(describeAuthError(error))
  const account = toAccount(data.user)
  if (!account) throw new AccountError('El servicio de cuentas no devolvió un correo.')
  return account
}

/** Sets a new password on the signed-in account: for whoever entered with one, or wants one ready for another computer. */
export async function changePassword(password: string): Promise<void> {
  if (!client) throw new AccountError(NO_ACCOUNTS)
  const { error } = await client.auth.updateUser({ password })
  if (error) throw new AccountError(describeAuthError(error))
}

/** Asks for the reset email. Only where the deployment can send it; the screen does not offer it otherwise. */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!client) throw new AccountError(NO_ACCOUNTS)
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin })
  if (error) throw new AccountError(describeAuthError(error))
}

/* ---------- the session ---------- */

/** Ends the account session. The files on this device stay exactly where they are. */
export async function signOutAccount(): Promise<void> {
  try {
    await client?.auth.signOut()
  } catch {
    // Signing out with no network still has to work: the local session is cleared either way.
  }
}

/** Tells the shell when the account changes under it, including a session that expired while nobody looked. */
export function watchAccount(onChange: (account: Account | null) => void): () => void {
  const sub = client?.auth.onAuthStateChange((_event, session) => onChange(toAccount(session?.user)))
  return () => sub?.data.subscription.unsubscribe()
}
