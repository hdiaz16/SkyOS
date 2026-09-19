import { create } from 'zustand'
import type { UserRow } from './db'
import { users } from './users'
import { currentSession, endSession, readSession, startSession, watchSessionChange } from './session'
import { accountsEnabled, currentAccount, entryMode, signOutAccount, watchAccount, type Account, type EntryMode } from './account'

/**
 * `account` is the screen that asks for an email, and only exists where accounts are configured. `login` is
 * the list of local profiles, which is what a SkyOS without a server has instead.
 */
export type ShellStatus = 'loading' | 'account' | 'login' | 'onboarding' | 'ready'

/** Why this tab stopped: somebody else came in, or the session was closed from elsewhere. */
export type Stale = 'switched' | 'closed'

interface AuthState {
  status: ShellStatus
  /**
   * Set when another tab changed the session. This tab holds one person's databases, workers and open files;
   * there is no honest way to carry on as somebody else, so it stops and says so.
   */
  stale: Stale | null
  users: UserRow[]
  current: UserRow | null
  /** The verified account, when this deployment has them. The desktop below belongs to it. */
  account: Account | null
  /** Desktops made before accounts existed, offered for adoption right after a first sign-in. */
  adoptable: UserRow[]
  /** How the door opens where accounts exist: a code from the inbox, or a password. */
  entryMode: EntryMode
  /** Accounts are configured but the project cannot let anyone in yet: the desktop runs on local profiles and says so. */
  accountsUnavailable: boolean
  /** Takes the session from a verified account to a desktop: finds it, or asks for a name to make one. */
  enter: (account: Account) => Promise<void>
  /** Hands an old desktop to the account that just signed in, and opens it. False when the PIN it asked for was wrong. */
  adopt: (user: UserRow, pin?: string) => Promise<boolean>
  load: () => Promise<void>
  /** Verifies the PIN when the account has one, then starts the session (reload). */
  login: (user: UserRow, pin?: string) => Promise<boolean>
  logout: () => void
  showOnboarding: () => void
  showLogin: () => void
  refreshCurrent: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  stale: null,
  users: [],
  current: null,
  account: null,
  adoptable: [],
  entryMode: 'password',
  accountsUnavailable: false,

  load: async () => {
    // From here on this tab answers to one person only; if that changes elsewhere, it stands down.
    watchSessionChange(() => {
      if (useAuth.getState().stale) return
      useAuth.setState({ stale: readSession() ? 'switched' : 'closed' })
    })
    const account = accountsEnabled ? await currentAccount() : null
    if (accountsEnabled) {
      watchAccount((next) => {
        const status = useAuth.getState().status
        // A session that outlives its account — signed out elsewhere, expired, revoked — must not open a desktop.
        if (!next && status === 'ready') return useAuth.setState({ stale: 'closed' })
        // The other half: the email's link was opened in another tab, and this one is still waiting for a code
        // it will never get. The account arrived; that is the same as typing it.
        if (next && status === 'account') void useAuth.getState().enter(next)
      })
    }

    const session = currentSession()
    if (session) {
      const user = await users.get(session.userId)
      const belongs = !accountsEnabled || !user?.authId || user.authId === account?.id
      if (user && belongs && (!accountsEnabled || account || !user.authId)) {
        await users.touch(user.id)
        set({ status: 'ready', current: user, account })
        return
      }
      // The session points at a desktop that is gone, or at somebody else's. Drop it and ask who is here.
      localStorage.removeItem('mesa:session')
    }

    if (accountsEnabled) {
      if (account) {
        await get().enter(account)
        return
      }
      const mode = await entryMode()
      if (mode !== 'unavailable') {
        set({ status: 'account', current: null, account: null, entryMode: mode })
        return
      }
      // The project cannot let anyone in yet: it wants emails confirmed and this deployment has nothing to send
      // the confirmation with. A door that does not open is worse than no door, so the desktop works with local
      // profiles until it does — and switches to accounts on its own the day the project allows it.
      set({ accountsUnavailable: true })
    }

    // Desktops that already belong to an account are not on the local list while the account cannot be checked.
    const list = (await users.list()).filter((u) => !u.authId || !accountsEnabled)
    set({ users: list, status: list.length ? 'login' : 'onboarding', current: null })
  },

  enter: async (account) => {
    const mine = await users.byAccount(account.id)
    if (mine) {
      startSession({ userId: mine.id, dbName: mine.dbName, storageDir: mine.storageDir }, 'plain')
      return
    }
    // First time on this machine with a verified account. A desktop registered here with this same email is
    // this person's — that is what the email at the onboarding was for — so it becomes theirs without a
    // question. Anything else from before accounts is offered, and they choose.
    // Unless nobody has verified that email and the desktop has a PIN: a password proves nothing about the inbox,
    // so the PIN — set by its owner against exactly this, somebody else at the same browser — is asked for on
    // the adoption screen before the desktop changes hands.
    const twin = account.email ? await users.byEmail(account.email) : undefined
    if (twin && !twin.authId && (account.emailVerified || !twin.pinHash)) {
      await users.adopt(twin.id, account.id, account.email)
      startSession({ userId: twin.id, dbName: twin.dbName, storageDir: twin.storageDir }, 'plain')
      return
    }
    const adoptable = await users.orphans()
    set({ status: 'onboarding', account, adoptable, current: null })
  },

  adopt: async (user, pin) => {
    const account = get().account
    if (!account) return false
    if (user.pinHash && !account.emailVerified && !(await users.verifyPin(user, pin ?? ''))) return false
    await users.adopt(user.id, account.id, account.email)
    startSession({ userId: user.id, dbName: user.dbName, storageDir: user.storageDir }, 'plain')
    return true
  },

  login: async (user, pin) => {
    if (user.pinHash && !(await users.verifyPin(user, pin ?? ''))) return false
    startSession({ userId: user.id, dbName: user.dbName, storageDir: user.storageDir })
    return true
  },

  logout: () => {
    // The account goes with it: leaving a verified session behind would let the next person in without asking.
    if (accountsEnabled) void signOutAccount().finally(() => endSession())
    else endSession()
  },

  showOnboarding: () => set({ status: 'onboarding' }),
  showLogin: () => set({ status: 'login' }),

  refreshCurrent: async () => {
    const id = get().current?.id
    if (!id) return
    const user = await users.get(id)
    if (user) set({ current: user })
  },
}))
