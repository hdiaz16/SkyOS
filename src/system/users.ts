import Dexie from 'dexie'
import { nanoid } from 'nanoid'
import { systemDb, type UserProfile, type UserRow } from './db'

const LEGACY_DB = 'mesa'

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** PBKDF2-SHA256. Keeps a casual onlooker out; it is not encryption of the data itself. */
async function hashPin(pin: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations: 120000, hash: 'SHA-256' }, key, 256)
  return toHex(new Uint8Array(bits))
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const second = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? ''
  return `${first}${second}`.toUpperCase()
}

export interface NewUser {
  name: string
  profile: UserProfile
  pin?: string
  /** The verified account this desktop belongs to, when there is one. */
  authId?: string
  email?: string
}

export const users = {
  list: () => systemDb.users.orderBy('lastLoginAt').reverse().toArray(),
  get: (id: string) => systemDb.users.get(id),

  /** The desktop that belongs to an account on this device, if it has one here yet. */
  byAccount: (authId: string) => systemDb.users.where('authId').equals(authId).first(),

  /** The desktop registered here under an email, however it was capitalised when typed. */
  async byEmail(email: string): Promise<UserRow | undefined> {
    const wanted = email.trim().toLowerCase()
    if (!wanted) return undefined
    return (await systemDb.users.toArray()).find((u) => u.email?.toLowerCase() === wanted)
  },

  /**
   * Desktops made before accounts existed. Signing in for the first time on a machine that already had one
   * offers to adopt it, so nobody's files are stranded behind a login that did not exist when they made them.
   */
  async orphans(): Promise<UserRow[]> {
    return (await systemDb.users.toArray()).filter((u) => !u.authId)
  },

  /** Hands an existing desktop to an account. From then on it opens by signing in. */
  adopt: (id: string, authId: string, email: string) => systemDb.users.update(id, { authId, email }),

  /**
   * Creates a user. The first person to sign up adopts the pre-accounts desktop, if there is one,
   * so nothing built before sessions existed is lost.
   */
  async create(input: NewUser): Promise<UserRow> {
    const name = input.name.trim()
    if (!name) throw new Error('Necesitamos un nombre')
    const id = nanoid(10)
    const count = await systemDb.users.count()
    const legacy = count === 0 && (await Dexie.exists(LEGACY_DB))
    const t = Date.now()
    const row: UserRow = {
      id,
      name,
      initials: initialsOf(name),
      hue: Math.floor(Math.random() * 360),
      dbName: legacy ? LEGACY_DB : `mesa-${id}`,
      storageDir: legacy ? '' : `users/${id}`,
      profile: input.profile,
      createdAt: t,
      lastLoginAt: t,
      setupPending: true,
      ...(input.authId ? { authId: input.authId } : {}),
      ...(input.email ? { email: input.email } : {}),
    }
    if (input.pin) {
      row.pinSalt = toHex(crypto.getRandomValues(new Uint8Array(16)))
      row.pinHash = await hashPin(input.pin, row.pinSalt)
    }
    await systemDb.users.add(row)
    return row
  },

  async verifyPin(user: UserRow, pin: string): Promise<boolean> {
    if (!user.pinHash || !user.pinSalt) return true
    return (await hashPin(pin, user.pinSalt)) === user.pinHash
  },

  touch: (id: string) => systemDb.users.update(id, { lastLoginAt: Date.now() }),

  /**
   * Changes the given profile fields and nothing else, reading the row inside its own transaction. It used to
   * merge the caller's snapshot and write the whole profile back, so two writers at the same moment — the
   * weather widget saving the place while the permission switches saved an answer — erased each other's field.
   */
  updateProfile: (id: string, patch: Partial<UserProfile>) =>
    systemDb.transaction('rw', systemDb.users, async () => {
      const row = await systemDb.users.get(id)
      if (!row) return
      const next: Record<string, unknown> = { ...row.profile }
      // An explicit undefined means «forget it», so the key goes instead of lingering with nothing in it.
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete next[key]
        else next[key] = value
      }
      await systemDb.users.update(id, { profile: next as unknown as UserProfile })
    }),

  markSetupDone: (id: string) => systemDb.users.update(id, { setupPending: false }),

  async setPin(id: string, pin: string | null): Promise<void> {
    if (!pin) {
      await systemDb.users.update(id, { pinHash: undefined, pinSalt: undefined })
      return
    }
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
    await systemDb.users.update(id, { pinSalt: salt, pinHash: await hashPin(pin, salt) })
  },
}
