import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { ACCOUNTS_KEY, ACCOUNTS_URL } from '../config'

/**
 * Who you are, verified somewhere other than this browser.
 *
 * Until now a person was a name in a list: anyone who opened the browser could be anyone, and the optional PIN
 * only kept an honest passer-by out. An account fixes the part that matters — coming back is proving it is
 * you, and it is the same you on another computer. Your files stay where they always were, on this device;
 * what travels is the identity, not the desktop.
 *
 * Sign-in is a code sent to your email. No password to invent, lose or reuse, and nothing to click in another
 * tab: the code is typed where you already are. When the deployment has no Supabase configured, none of this
 * exists and SkyOS keeps working with local profiles, which is what a self-hosted copy without a server gets.
 */

export interface Account {
  id: string
  email: string
}

export const accountsEnabled = !!(ACCOUNTS_URL && ACCOUNTS_KEY)

/**
 * The session lives under a key of our own so it never collides with anything else on the origin, and it is
 * refreshed in the background while the desktop is open.
 */
const client: SupabaseClient | null = accountsEnabled
  ? createClient(ACCOUNTS_URL, ACCOUNTS_KEY, {
      auth: { storageKey: 'mesa:cuenta', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null

const toAccount = (user: User | null | undefined): Account | null => (user?.email ? { id: user.id, email: user.email } : null)

/** How long to wait for the network before deciding the cached session is all we are going to get. */
const OFFLINE_AFTER_MS = 6000

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

const spanish = (message: string): string => {
  const m = message.toLowerCase()
  if (m.includes('rate') || m.includes('too many') || m.includes('seconds')) return 'Vas muy rápido para el servidor de correo. Espera un minuto y te mando otro.'
  if (m.includes('expired')) return 'Ese código ya caducó. Pídeme uno nuevo.'
  if (m.includes('invalid') || m.includes('token')) return 'Ese código no coincide. Míralo otra vez o pide uno nuevo.'
  if (m.includes('email') && m.includes('valid')) return 'Ese correo no parece válido.'
  if (m.includes('fetch') || m.includes('network')) return 'No alcanzo el servicio de cuentas. Vuelve a intentar cuando haya conexión.'
  return message
}

/**
 * Sends the code. Signing in and signing up are the same email and the same six digits, but they are not the
 * same intention: someone who mistypes their address while signing in should hear "no existe", not end up
 * inside a brand-new empty account wondering where their files went.
 */
export async function sendCode(email: string, creating: boolean): Promise<void> {
  if (!client) throw new AccountError('Este SkyOS no tiene cuentas configuradas.')
  const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: creating } })
  if (!error) return
  const m = error.message.toLowerCase()
  if (m.includes('signups not allowed') || m.includes('not found') || m.includes('user not found')) {
    throw new NoSuchAccount('No hay ninguna cuenta con ese correo.')
  }
  throw new AccountError(spanish(error.message))
}

/** Exchanges the code for a session. Accepts the six digits with or without the spaces people paste. */
export async function verifyCode(email: string, code: string): Promise<Account> {
  if (!client) throw new AccountError('Este SkyOS no tiene cuentas configuradas.')
  const token = code.replace(/\D/g, '')
  const { data, error } = await client.auth.verifyOtp({ email: email.trim(), token, type: 'email' })
  if (error) throw new AccountError(spanish(error.message))
  const account = toAccount(data.user)
  if (!account) throw new AccountError('El servicio de cuentas no devolvió un correo.')
  return account
}

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
