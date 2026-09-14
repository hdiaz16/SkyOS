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

export function readSession(): SessionInfo | null {
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
  const s = readSession()
  return s ? `:${s.userId}` : ''
}

/** Signs in and reloads so every module boots against this user's stores. */
export function startSession(info: SessionInfo, entrance: Entrance = 'plain'): void {
  localStorage.setItem(KEY, JSON.stringify(info))
  try {
    sessionStorage.setItem(HANDOFF_KEY, entrance)
  } catch {
    // Without sessionStorage the next page simply boots with its splash.
  }
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
