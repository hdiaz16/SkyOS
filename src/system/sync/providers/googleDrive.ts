import { mcp } from '../../../mcp/manager'
import { basename, dirname, expectOk, reach, SyncError, type RemoteFile, type SyncProvider } from '../types'

/**
 * Google Drive through the Drive REST API, with the token of the Google Drive MCP connection (scope
 * drive.file: the app sees only what it created). Everything lives under a "SkyOS" folder in the person's
 * Drive, mirrored as real folders so it is browsable in Drive itself; each file also carries its SkyOS path
 * as an app property, so one query lists the whole tree.
 */

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const ROOT_NAME = 'SkyOS'
const FIELDS = 'id,name,size,modifiedTime,md5Checksum,appProperties'

interface DriveFile {
  id: string
  name: string
  size?: string
  modifiedTime: string
  md5Checksum?: string
  appProperties?: Record<string, string>
}

/** Folder ids by SkyOS path ("" is the SkyOS root folder). */
const folders = new Map<string, string>()

async function token(): Promise<string> {
  const t = await mcp.accessToken('google-drive')
  if (!t) throw new SyncError('Google Drive no está conectado. Conéctalo en Apps conectadas.', 'auth')
  return t
}

async function call(url: string, init: RequestInit = {}, what = 'Google Drive'): Promise<Response> {
  const res = await reach(url, { ...init, headers: { Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) } }, 'Google Drive')
  return expectOk(res, what)
}

const q = (s: string) => encodeURIComponent(s)
const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const toRemote = (f: DriveFile): RemoteFile => ({
  id: f.id,
  path: f.appProperties?.path ?? f.name,
  size: Number(f.size ?? 0),
  modifiedAt: Date.parse(f.modifiedTime),
  rev: f.md5Checksum ?? f.modifiedTime,
})

async function ensureFolder(path: string): Promise<string> {
  const cached = folders.get(path)
  if (cached) return cached
  const parentId = path === '' ? 'root' : await ensureFolder(dirname(path))
  const name = path === '' ? ROOT_NAME : basename(path)
  const query = `name='${quote(name)}' and mimeType='${FOLDER_MIME}' and '${parentId}' in parents and trashed=false`
  const found = (await (await call(`${API}/files?q=${q(query)}&fields=files(id)&pageSize=1`)).json()) as { files: { id: string }[] }
  let id = found.files[0]?.id
  if (!id) {
    const res = await call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId], appProperties: { skyos: 'folder', path } }),
    })
    id = ((await res.json()) as { id: string }).id
  }
  folders.set(path, id)
  return id
}

export const googleDrive: SyncProvider = {
  id: 'google-drive',
  name: 'Google Drive',

  ready: async () => !!(await mcp.accessToken('google-drive').catch(() => undefined)),

  async list() {
    const out: RemoteFile[] = []
    let pageToken: string | undefined
    const query = "appProperties has { key='skyos' and value='file' } and trashed=false"
    do {
      const url = `${API}/files?q=${q(query)}&fields=${q(`nextPageToken,files(${FIELDS})`)}&pageSize=1000${pageToken ? `&pageToken=${q(pageToken)}` : ''}`
      const page = (await (await call(url)).json()) as { files: DriveFile[]; nextPageToken?: string }
      out.push(...page.files.map(toRemote))
      pageToken = page.nextPageToken
    } while (pageToken)
    return out
  },

  async download(file) {
    return (await call(`${API}/files/${file.id}?alt=media`, {}, `Descargar ${basename(file.path)}`)).blob()
  },

  async upload(path, blob, mime, existing) {
    const type = mime || 'application/octet-stream'
    if (existing) {
      const res = await call(`${UPLOAD}/files/${existing.id}?uploadType=media&fields=${FIELDS}`, { method: 'PATCH', headers: { 'Content-Type': type }, body: blob }, `Subir ${basename(path)}`)
      return toRemote((await res.json()) as DriveFile)
    }
    const parent = await ensureFolder(dirname(path))
    const meta = JSON.stringify({ name: basename(path), parents: [parent], appProperties: { skyos: 'file', path } })
    const boundary = `skyos${Date.now().toString(36)}`
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ])
    const res = await call(
      `${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`,
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
      `Subir ${basename(path)}`,
    )
    return toRemote((await res.json()) as DriveFile)
  },

  async remove(file) {
    await call(`${API}/files/${file.id}`, { method: 'DELETE' }, `Borrar ${basename(file.path)}`)
  },
}
