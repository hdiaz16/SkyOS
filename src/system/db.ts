import Dexie, { type Table } from 'dexie'

export type Tone = 'warm' | 'direct' | 'formal'
export type Purpose = 'work' | 'study' | 'personal' | 'mixed'
export type Autonomy = 'ask' | 'act' | 'manual'

export interface UserLocation {
  lat: number
  lon: number
  place: string
}

export type Permission = 'granted' | 'denied' | 'skipped'

/** Answers from the onboarding. They shape how Sky talks and how far it acts on its own. */
export interface UserProfile {
  tone: Tone
  purpose: Purpose
  autonomy: Autonomy
  location?: UserLocation
  /** Whether the person allowed the microphone during onboarding (the browser still owns the real permission). */
  microphone?: Permission
  /** Whether Sky may speak out loud. */
  voice?: boolean
}

export interface UserRow {
  id: string
  name: string
  /**
   * The account this desktop belongs to, when the deployment verifies accounts. Absent on a profile made
   * before accounts existed, or on a SkyOS without them: those stay reachable from the same screen.
   */
  authId?: string
  email?: string
  initials: string
  /** Accent hue for the avatar, 0-360. */
  hue: number
  pinHash?: string
  pinSalt?: string
  dbName: string
  storageDir: string
  profile: UserProfile
  createdAt: number
  lastLoginAt: number
  /** First boot still has to place default widgets and the welcome note. */
  setupPending: boolean
}

/** Shared registry of people who use this browser. Everything else lives in per-user databases. */
class SystemDB extends Dexie {
  users!: Table<UserRow, string>

  constructor() {
    super('mesa-system')
    this.version(1).stores({ users: 'id, name, lastLoginAt' })
    // Accounts: a desktop can now say whose it is. Indexed because signing in looks a person up by account.
    this.version(2).stores({ users: 'id, name, lastLoginAt, authId' })
  }
}

export const systemDb = new SystemDB()
