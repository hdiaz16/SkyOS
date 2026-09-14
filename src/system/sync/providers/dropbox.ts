import { mcp } from '../../../mcp/manager'
import { basename, expectOk, reach, SyncError, type RemoteFile, type SyncProvider } from '../types'

/**
 * Dropbox through its v2 API, with the token of the Dropbox MCP connection. Everything lives under /SkyOS;
 * Dropbox creates parent folders on upload, so the tree needs no bookkeeping.
 */

const RPC = 'https://api.dropboxapi.com/2'
const CONTENT = 'https://content.dropboxapi.com/2'
const ROOT = '/SkyOS'

interface Entry {
  '.tag'?: 'file' | 'folder' | 'deleted'
  id: string
  name: string
  path_display?: string
  size?: number
  server_modified?: string
  rev?: string
}

interface ListPage {
  entries: Entry[]
  cursor: string
  has_more: boolean
}

/** Dropbox-API-Arg must be ASCII: non-ASCII characters travel as \u escapes. */
const headerJson = (value: unknown) => JSON.stringify(value).replace(/[-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)

async function token(): Promise<string> {
  const t = await mcp.accessToken('dropbox')
  if (!t) throw new SyncError('Dropbox no está conectado. Conéctalo en Apps conectadas.', 'auth')
  return t
}

async function rpc<T>(method: string, arg: unknown, what: string): Promise<T> {
  const res = await reach(`${RPC}/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(arg) }, 'Dropbox')
  return (await (await expectOk(res, what)).json()) as T
}

const fullPath = (path: string) => `${ROOT}/${path}`

const toRemote = (e: Entry): RemoteFile => ({
  id: e.id,
  path: (e.path_display ?? e.name).slice(ROOT.length + 1),
  size: e.size ?? 0,
  modifiedAt: Date.parse(e.server_modified ?? '') || 0,
  rev: e.rev ?? '',
})

export const dropbox: SyncProvider = {
  id: 'dropbox',
  name: 'Dropbox',

  ready: async () => !!(await mcp.accessToken('dropbox').catch(() => undefined)),

  async list() {
    let page: ListPage
    try {
      page = await rpc<ListPage>('files/list_folder', { path: ROOT, recursive: true, limit: 2000, include_deleted: false }, 'Listar Dropbox')
    } catch (err) {
      // No SkyOS folder yet: nothing in the cloud. The first upload creates it.
      if (err instanceof SyncError && err.status === 409) return []
      throw err
    }
    const out: RemoteFile[] = []
    for (;;) {
      out.push(...page.entries.filter((e) => e['.tag'] === 'file').map(toRemote))
      if (!page.has_more) break
      page = await rpc<ListPage>('files/list_folder/continue', { cursor: page.cursor }, 'Listar Dropbox')
    }
    return out
  },

  async download(file) {
    const res = await reach(`${CONTENT}/files/download`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Dropbox-API-Arg': headerJson({ path: fullPath(file.path) }) } }, 'Dropbox')
    return (await expectOk(res, `Descargar ${basename(file.path)}`)).blob()
  },

  async upload(path, blob) {
    const res = await reach(
      `${CONTENT}/files/upload`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await token()}`,
          'Dropbox-API-Arg': headerJson({ path: fullPath(path), mode: 'overwrite', autorename: false, mute: true }),
          'Content-Type': 'application/octet-stream',
        },
        body: blob,
      },
      'Dropbox',
    )
    return toRemote((await (await expectOk(res, `Subir ${basename(path)}`)).json()) as Entry)
  },

  async remove(file) {
    await rpc('files/delete_v2', { path: fullPath(file.path) }, `Borrar ${basename(file.path)}`)
  },
}
