import { create } from 'zustand'
import type { UserRow } from './db'
import { users } from './users'
import { currentSession, endSession, readSession, startSession, watchSessionChange } from './session'

export type ShellStatus = 'loading' | 'login' | 'onboarding' | 'ready'

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

  load: async () => {
    // From here on this tab answers to one person only; if that changes elsewhere, it stands down.
    watchSessionChange(() => {
      if (useAuth.getState().stale) return
      useAuth.setState({ stale: readSession() ? 'switched' : 'closed' })
    })
    const session = currentSession()
    if (session) {
      const user = await users.get(session.userId)
      if (user) {
        await users.touch(user.id)
        set({ status: 'ready', current: user })
        return
      }
      // Stale session (user removed): drop it and fall through to the login screen.
      localStorage.removeItem('mesa:session')
    }
    const list = await users.list()
    set({ users: list, status: list.length ? 'login' : 'onboarding', current: null })
  },

  login: async (user, pin) => {
    if (user.pinHash && !(await users.verifyPin(user, pin ?? ''))) return false
    startSession({ userId: user.id, dbName: user.dbName, storageDir: user.storageDir })
    return true
  },

  logout: () => endSession(),

  showOnboarding: () => set({ status: 'onboarding' }),
  showLogin: () => set({ status: 'login' }),

  refreshCurrent: async () => {
    const id = get().current?.id
    if (!id) return
    const user = await users.get(id)
    if (user) set({ current: user })
  },
}))
