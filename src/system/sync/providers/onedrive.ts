import { MS_OAUTH } from '../../../config'
import { randomToken } from '../../../mcp/auth'
import { useMcp } from '../../../mcp/manager'
import { authorizeInBrowser, redirectUri, takeRedirectResult } from '../../../mcp/popup'
import { sessionSuffix } from '../../session'
import { basename, dirname, expectOk, reach, SyncError, type RemoteFile, type SyncProvider } from '../types'

/**
 * OneDrive through Microsoft Graph. Microsoft offers no MCP server for personal accounts, so this provider
 * signs the person in itself (OAuth 2.0 with PKCE, same-tab, same /oauth/callback) with an app registration
 * of their own (Microsoft Entra, single-page application). Files live in the app's own folder
 * (Apps/SkyOS), the narrowest permission OneDrive offers.
 */

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPES = 'Files.ReadWrite.AppFolder offline_access openid profile'
const PENDING_KEY = 'mesa:onedrive:pending'
const SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024
/** Upload session chunks must be multiples of 320 KiB. */
const CHUNK = 10 * 320 * 1024
const ROOT = `${GRAPH}/me/drive/special/approot`

interface Tokens {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

interface Pending {
  state: string
  verifier: string
  redirectUri: string
  clientId: string
  startedAt: number
}

interface Item {
  id: string
  name: string
  size?: number
  lastModifiedDateTime: string
  cTag?: string
  eTag?: string
  file?: object
  folder?: object
  deleted?: object
  parentReference?: { path?: string }
  '@microsoft.graph.downloadUrl'?: string
}

const tokensKey = () => `mesa:onedrive:tokens${sessionSuffix()}`
const clientKey = () => `mesa:onedrive:client${sessionSuffix()}`

export function oneDriveClientId(): string {
  try {
    return (localStorage.getItem(clientKey()) ?? '').trim() || MS_OAUTH.clientId
  } catch {
    return MS_OAUTH.clientId
  }
}

export function setOneDriveClientId(id: string): void {
  localStorage.setItem(clientKey(), id.trim())
}

function readTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(tokensKey())
    return raw ? (JSON.parse(raw) as Tokens) : null
  } catch {
    return null
  }
}

function saveTokens(t: Tokens | null): void {
  if (t) localStorage.setItem(tokensKey(), JSON.stringify(t))
  else localStorage.removeItem(tokensKey())
}

export const oneDriveConnected = (): boolean => !!readTokens()

export function disconnectOneDrive(): void {
  saveTokens(null)
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Leaves for Microsoft's sign-in in this same tab; `resumeOneDrive` finishes when the person is back. */
export async function connectOneDrive(): Promise<void> {
  const clientId = oneDriveClientId()
  if (!clientId) throw new SyncError('Falta el id de aplicación de Microsoft Entra para OneDrive.', 'auth')
  const state = randomToken(16)
  const verifier = randomToken(48)
  const pending: Pending = { state, verifier, redirectUri: redirectUri(), clientId, startedAt: Date.now() }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: pending.redirectUri,
    response_mode: 'query',
    scope: SCOPES,
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  useMcp.setState({ leaving: 'OneDrive' })
  await new Promise((r) => setTimeout(r, 1100))
  await authorizeInBrowser(`${AUTHORITY}/authorize?${params}`)
}

async function exchange(form: Record<string, string>): Promise<Tokens> {
  const res = await reach(`${AUTHORITY}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) }, 'Microsoft')
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !data.access_token) throw new SyncError(data.error_description ?? data.error ?? `Microsoft respondió ${res.status}`, 'auth', res.status)
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
}

/** Back from Microsoft: exchanges the code for tokens. True when OneDrive got connected on this page load. */
export async function resumeOneDrive(): Promise<boolean> {
  const raw = sessionStorage.getItem(PENDING_KEY)
  if (!raw) return false
  sessionStorage.removeItem(PENDING_KEY)
  const pending = JSON.parse(raw) as Pending
  const params = takeRedirectResult()
  if (!params) return false
  if (params.error) throw new SyncError(params.error_description ?? params.error, 'auth')
  if (params.state !== pending.state || !params.code) throw new SyncError('La respuesta de Microsoft no corresponde a esta sesión.', 'auth')
  saveTokens(await exchange({ client_id: pending.clientId, grant_type: 'authorization_code', code: params.code, redirect_uri: pending.redirectUri, code_verifier: pending.verifier, scope: SCOPES }))
  return true
}

async function token(): Promise<string> {
  const t = readTokens()
  if (!t) throw new SyncError('OneDrive no está conectado.', 'auth')
  if (t.expiresAt - Date.now() > 60_000) return t.accessToken
  if (!t.refreshToken) {
    saveTokens(null)
    throw new SyncError('La sesión de OneDrive caducó; vuelve a conectarla.', 'auth')
  }
  const next = await exchange({ client_id: oneDriveClientId(), grant_type: 'refresh_token', refresh_token: t.refreshToken, scope: SCOPES })
  const merged = { ...next, refreshToken: next.refreshToken ?? t.refreshToken }
  saveTokens(merged)
  return merged.accessToken
}

async function graph(url: string, init: RequestInit = {}, what = 'OneDrive'): Promise<Response> {
  const res = await reach(url, { ...init, headers: { Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) } }, 'OneDrive')
  return expectOk(res, what)
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')
const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

let approotPath: string | null = null

async function rootPath(): Promise<string> {
  if (approotPath) return approotPath
  const r = (await (await graph(`${ROOT}?$select=id,name,parentReference`)).json()) as Item
  approotPath = `${r.parentReference?.path ?? '/drive/root:'}/${r.name}`
  return approotPath
}

function toRemote(i: Item, root: string): RemoteFile {
  const parent = safeDecode((i.parentReference?.path ?? '').slice(root.length)).replace(/^\//, '')
  return { id: i.id, path: parent ? `${parent}/${i.name}` : i.name, size: i.size ?? 0, modifiedAt: Date.parse(i.lastModifiedDateTime), rev: i.cTag ?? i.eTag ?? i.lastModifiedDateTime }
}

const knownFolders = new Set<string>()

async function ensureFolders(dir: string): Promise<void> {
  if (!dir || knownFolders.has(dir)) return
  await ensureFolders(dirname(dir))
  const parent = dirname(dir)
  const url = parent ? `${ROOT}:/${encodePath(parent)}:/children` : `${ROOT}/children`
  const res = await reach(
    url,
    { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: basename(dir), folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) },
    'OneDrive',
  )
  // 409 means the folder is already there, which is what we wanted.
  if (!res.ok && res.status !== 409) await expectOk(res, `Crear carpeta ${basename(dir)}`)
  knownFolders.add(dir)
}

export const oneDrive: SyncProvider = {
  id: 'onedrive',
  name: 'OneDrive',

  ready: async () => oneDriveConnected(),

  async list() {
    const root = await rootPath()
    const out: RemoteFile[] = []
    let url: string | undefined = `${ROOT}/delta?$select=id,name,size,lastModifiedDateTime,cTag,eTag,file,folder,deleted,parentReference`
    while (url) {
      const page = (await (await graph(url, {}, 'Listar OneDrive')).json()) as { value: Item[]; '@odata.nextLink'?: string }
      out.push(...page.value.filter((i) => i.file && !i.deleted && i.parentReference?.path).map((i) => toRemote(i, root)))
      url = page['@odata.nextLink']
    }
    return out
  },

  async download(file) {
    const meta = (await (await graph(`${GRAPH}/me/drive/items/${file.id}?$select=id,@microsoft.graph.downloadUrl`)).json()) as Item
    const url = meta['@microsoft.graph.downloadUrl']
    if (!url) throw new SyncError(`Descargar ${basename(file.path)}: OneDrive no dio una dirección de descarga.`)
    const res = await reach(url, {}, 'OneDrive')
    return (await expectOk(res, `Descargar ${basename(file.path)}`)).blob()
  },

  async upload(path, blob, mime) {
    await ensureFolders(dirname(path))
    const root = await rootPath()
    const type = mime || 'application/octet-stream'
    if (blob.size <= SIMPLE_UPLOAD_MAX) {
      const res = await graph(`${ROOT}:/${encodePath(path)}:/content`, { method: 'PUT', headers: { 'Content-Type': type }, body: blob }, `Subir ${basename(path)}`)
      return toRemote((await res.json()) as Item, root)
    }
    const session = (await (
      await graph(`${ROOT}:/${encodePath(path)}:/createUploadSession`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) }, `Subir ${basename(path)}`)
    ).json()) as { uploadUrl: string }
    let item: Item | null = null
    for (let start = 0; start < blob.size; start += CHUNK) {
      const end = Math.min(start + CHUNK, blob.size)
      const res = await reach(session.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${start}-${end - 1}/${blob.size}` }, body: blob.slice(start, end) }, 'OneDrive')
      await expectOk(res, `Subir ${basename(path)}`)
      if (res.status === 200 || res.status === 201) item = (await res.json()) as Item
    }
    if (!item) throw new SyncError(`Subir ${basename(path)}: OneDrive no confirmó la subida.`)
    return toRemote(item, root)
  },

  async remove(file) {
    await graph(`${GRAPH}/me/drive/items/${file.id}`, { method: 'DELETE' }, `Borrar ${basename(file.path)}`)
  },
}
