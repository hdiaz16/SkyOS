/**
 * Cloud sync speaks to each provider through this small surface: list what the cloud holds, move bytes both
 * ways, delete. Providers reuse the authorization the person already gave the app (Google Drive and Dropbox
 * through their MCP connection; OneDrive through its own sign-in, since Microsoft has no MCP for personal
 * accounts). The engine never learns provider details.
 */

export type SyncProviderId = 'google-drive' | 'dropbox' | 'onedrive'

export interface RemoteFile {
  id: string
  /** Path relative to the SkyOS folder in the cloud, "/"-separated, no leading slash. */
  path: string
  size: number
  modifiedAt: number
  /** Content revision: changes whenever the bytes change. */
  rev: string
}

export interface SyncProvider {
  id: SyncProviderId
  name: string
  /** Connected and holding a usable token. */
  ready(): Promise<boolean>
  list(): Promise<RemoteFile[]>
  download(file: RemoteFile): Promise<Blob>
  upload(path: string, blob: Blob, mime: string, existing?: RemoteFile): Promise<RemoteFile>
  remove(file: RemoteFile): Promise<void>
}

export type SyncErrorCode = 'auth' | 'network' | 'provider' | 'quota'

export class SyncError extends Error {
  code: SyncErrorCode
  status?: number

  constructor(message: string, code: SyncErrorCode = 'provider', status?: number) {
    super(message)
    this.name = 'SyncError'
    this.code = code
    this.status = status
  }
}

const short = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 160)

/** Turns a failed response into a SyncError with a message a person can act on. */
export async function expectOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res
  const text = await res.text().catch(() => '')
  if (res.status === 401) throw new SyncError(`${what}: la sesión ya no es válida; vuelve a conectar la app.`, 'auth', 401)
  if (res.status === 403) throw new SyncError(`${what}: sin permiso. ${short(text)}`.trim(), 'auth', 403)
  if (res.status === 429 || res.status === 507) throw new SyncError(`${what}: el proveedor pide esperar o no tiene espacio.`, 'quota', res.status)
  throw new SyncError(`${what}: ${res.status} ${short(text)}`.trim(), 'provider', res.status)
}

/** fetch that reports a lost connection as a SyncError instead of a bare TypeError. */
export async function reach(url: string, init: RequestInit, who: string): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new SyncError(`Sin conexión con ${who}`, 'network')
  }
}

export const dirname = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
export const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
