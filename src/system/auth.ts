import { create } from 'zustand'
import type { UserRow } from './db'
import { users } from './users'
import { endSession, readSession, startSession } from './session'

export type ShellStatus = 'loading' | 'login' | 'onboarding' | 'ready'

interface AuthState {
  status: ShellStatus
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
  users: [],
  current: null,

  load: async () => {
    const session = readSession()
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
