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

const KEY = 'mesa:session'

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
export function startSession(info: SessionInfo): void {
  localStorage.setItem(KEY, JSON.stringify(info))
  window.location.reload()
}

/** Signs out and reloads to the login screen. Data stays in the browser, untouched. */
export function endSession(): void {
  localStorage.removeItem(KEY)
  window.location.reload()
}
