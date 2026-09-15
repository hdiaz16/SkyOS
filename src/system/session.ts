/**
 * The active session, readable synchronously at module load. Every per-user store (Dexie database,
 * OPFS folder, localStorage keys) derives its name from it, so switching users is a clean reload.
 */

export interface SessionInfo {
  userId: string
  /** Dexie database that holds this user's files, widgets, flows and index. */
  dbName: string
  /** OPFS subdirectory for this user's file bytes ("" means the legacy root). */
  storageDir: string
}

/**
 * How the screen looked when the reload was requested, so the next page can pick up from there
 * instead of booting from scratch: `flood` = the disc has filled the screen (end of onboarding),
 * `plain` = the orb is resting over the backdrop (login).
 */
export type Entrance = 'flood' | 'plain'

const KEY = 'mesa:session'
const HANDOFF_KEY = 'mesa:handoff'

/**
 * The session this page runs as, decided once when the tab loaded. Everything per-user — the database, the
 * OPFS folder, the suffixed localStorage keys — is derived from this and only this. Reading localStorage again
 * later would be a mistake: another tab can sign in as somebody else at any moment, and a tab that followed
 * that change would keep writing to one person's database while stamping another person's name on the keys.
 */
const PINNED = readStoredSession()

/** The user this tab belongs to, for as long as it lives. */
export const currentSession = (): SessionInfo | null => PINNED

/** What is stored right now. Only the boot path wants this; per-user stores want `currentSession`. */
export const readSession = readStoredSession

function readStoredSession(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SessionInfo>
    if (!parsed.userId || !parsed.dbName) return null
    return { userId: parsed.userId, dbName: parsed.dbName, storageDir: parsed.storageDir ?? '' }
  } catch {
    return null
  }
}

/** Suffix for per-user localStorage keys, e.g. ":abc123". Empty when nobody is signed in. */
export function sessionSuffix(): string {
  return PINNED ? `:${PINNED.userId}` : ''
}

/**
 * Tells this tab when another one signs in as somebody else or signs out. There is no safe way to carry on:
 * the databases, the workers and the open files all belong to the person this tab started as. The caller's job
 * is to stop, not to migrate.
 */
export function watchSessionChange(onChanged: () => void): () => void {
  const check = () => {
    const now = readStoredSession()
    if ((now?.userId ?? null) !== (PINNED?.userId ?? null)) onChanged()
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) check()
  }
  window.addEventListener('storage', onStorage)
  // A tab that was in the background can come back to a session that changed while nobody was looking.
  document.addEventListener('visibilitychange', check)
  return () => {
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', check)
  }
}

/** Marks the next page load as a hand-over (no splash): signing in, or coming back from an authorization page. */
export function markHandoff(entrance: Entrance): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, entrance)
  } catch {
    // Without sessionStorage the next page simply boots with its splash.
  }
}

/** Signs in and reloads so every module boots against this user's stores. */
export function startSession(info: SessionInfo, entrance: Entrance = 'plain'): void {
  localStorage.setItem(KEY, JSON.stringify(info))
  markHandoff(entrance)
  window.location.reload()
}

/** Reads and clears the hand-over left by `startSession`; null on a cold start. */
export function takeHandoff(): Entrance | null {
  try {
    const value = sessionStorage.getItem(HANDOFF_KEY)
    sessionStorage.removeItem(HANDOFF_KEY)
    return value === 'flood' || value === 'plain' ? value : null
  } catch {
    return null
  }
}

/** Signs out and reloads to the login screen. Data stays in the browser, untouched. */
export function endSession(): void {
  localStorage.removeItem(KEY)
  window.location.reload()
}
