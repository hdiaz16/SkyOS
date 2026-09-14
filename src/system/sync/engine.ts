import { db, type SyncStateRow } from '../../kernel/db'
import { fs } from '../../kernel/fs'
import { ROOT_ID, extOf, mimeFor, type FsNode } from '../../kernel/types'
import { basename, dirname, type RemoteFile, type SyncProvider } from './types'

/**
 * Two-way sync between the desktop and the person's own cloud. Paths are the truth shared across devices:
 * "Nube/Proyectos/plan.md" here is "SkyOS/Nube/Proyectos/plan.md" there. Each device remembers, per file,
 * the local version and the cloud revision it last agreed on; whichever side moved since then travels.
 * When both moved, nothing is lost: the cloud copy lands next to the local one marked as a conflict.
 */

export type SyncScope = { mode: 'all' } | { mode: 'folder'; name: string }

export interface SyncReport {
  uploaded: number
  downloaded: number
  deletedLocal: number
  deletedRemote: number
  conflicts: number
  skipped: number
  errors: string[]
}

export type SyncProgress = (done: number, total: number, detail: string) => void

const MAX_BYTES = 100 * 1024 * 1024
/** Clock slack when comparing an unlinked local file with a cloud one at the same path. */
const SLACK_MS = 2000

interface LocalFile {
  node: FsNode
  path: string
}

const inScope = (path: string, scope: SyncScope): boolean => scope.mode === 'all' || path.startsWith(`${scope.name}/`)

async function collectLocal(scope: SyncScope): Promise<{ files: LocalFile[]; folders: Map<string, string> }> {
  const files: LocalFile[] = []
  const folders = new Map<string, string>([['', ROOT_ID]])
  const walk = async (parentId: string, prefix: string) => {
    for (const n of await fs.list(parentId)) {
      const path = prefix ? `${prefix}/${n.name}` : n.name
      if (n.kind === 'folder') {
        folders.set(path, n.id)
        await walk(n.id, path)
      } else {
        files.push({ node: n, path })
      }
    }
  }
  if (scope.mode === 'all') {
    await walk(ROOT_ID, '')
  } else {
    const top = (await fs.list(ROOT_ID)).find((n) => n.kind === 'folder' && n.name === scope.name)
    if (top) {
      folders.set(top.name, top.id)
      await walk(top.id, top.name)
    }
  }
  return { files, folders }
}

async function ensureLocalFolder(path: string, folders: Map<string, string>): Promise<string> {
  if (path === '') return ROOT_ID
  const cached = folders.get(path)
  if (cached) return cached
  const parentId = await ensureLocalFolder(dirname(path), folders)
  const name = basename(path)
  const existing = (await fs.list(parentId)).find((n) => n.kind === 'folder' && n.name === name)
  const id = existing?.id ?? (await fs.createFolder(parentId, name)).id
  folders.set(path, id)
  return id
}

function conflictName(name: string): string {
  const ext = extOf(name)
  const stamp = new Date().toLocaleDateString('es-MX').replace(/\//g, '-')
  return ext ? `${name.slice(0, -(ext.length + 1))} (conflicto ${stamp}).${ext}` : `${name} (conflicto ${stamp})`
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** One full pass. Safe to run repeatedly: a pass with nothing to move touches nothing. */
export async function runSync(provider: SyncProvider, scope: SyncScope, onProgress?: SyncProgress): Promise<SyncReport> {
  const report: SyncReport = { uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, conflicts: 0, skipped: 0, errors: [] }
  const remote = new Map((await provider.list()).filter((r) => inScope(r.path, scope)).map((r) => [r.path, r]))
  const { files, folders } = await collectLocal(scope)
  const states = await db.syncState.where('providerId').equals(provider.id).toArray()
  const byNode = new Map(states.map((s) => [s.nodeId, s]))
  const byPath = new Map(states.map((s) => [s.remotePath, s]))
  const total = files.length + remote.size
  let done = 0
  const step = (detail: string) => onProgress?.(++done, total, detail)

  const link = (node: FsNode, r: RemoteFile): SyncStateRow => ({
    key: `${provider.id}:${node.id}`,
    providerId: provider.id,
    nodeId: node.id,
    remoteId: r.id,
    remotePath: r.path,
    remoteRev: r.rev,
    localUpdatedAt: node.updatedAt,
    syncedAt: Date.now(),
  })

  const upload = async (node: FsNode, path: string, existing?: RemoteFile) => {
    const blob = await fs.readBlob(node.id)
    if (!blob) return
    const r = await provider.upload(path, blob, node.mime || mimeFor(node.name), existing)
    await db.syncState.put(link(node, r))
    report.uploaded++
  }

  const download = async (r: RemoteFile, into?: FsNode) => {
    const blob = await provider.download(r)
    let target = into
    if (target) {
      await fs.writeBlob(target.id, blob)
    } else {
      const parentId = await ensureLocalFolder(dirname(r.path), folders)
      target = await fs.createFile(parentId, basename(r.path), blob, mimeFor(basename(r.path), blob.type))
    }
    const fresh = (await fs.get(target.id)) ?? target
    await db.syncState.put(link(fresh, r))
    report.downloaded++
  }

  const seen = new Set<string>()

  for (const { node, path } of files) {
    try {
      if (node.size > MAX_BYTES) {
        report.skipped++
        continue
      }
      const st = byNode.get(node.id)
      const here = remote.get(path)
      if (here) seen.add(path)

      if (!st) {
        // First sight of this file on this device. If the cloud has one at the same path, the newer copy wins.
        if (here && here.modifiedAt > node.updatedAt + SLACK_MS) await download(here, node)
        else await upload(node, path, here)
        continue
      }

      const localChanged = node.updatedAt > st.localUpdatedAt
      const moved = st.remotePath !== path
      if (moved) {
        // Renamed or moved here: the old cloud copy goes, the file goes up under its new path.
        const old = remote.get(st.remotePath)
        if (old) {
          await provider.remove(old).catch(() => undefined)
          seen.add(st.remotePath)
        }
        await upload(node, path, here)
        continue
      }

      if (!here) {
        // Gone in the cloud. A file untouched here follows it to the trash; one edited here is sent again.
        if (localChanged) {
          await upload(node, path)
        } else {
          await fs.trash([node.id])
          await db.syncState.delete(st.key)
          report.deletedLocal++
        }
        continue
      }

      const remoteChanged = here.rev !== st.remoteRev
      if (localChanged && remoteChanged) {
        const blob = await provider.download(here)
        await fs.createFile(node.parentId, conflictName(node.name), blob, node.mime)
        report.conflicts++
        await upload(node, path, here)
      } else if (localChanged) {
        await upload(node, path, here)
      } else if (remoteChanged) {
        await download(here, node)
      }
    } catch (err) {
      report.errors.push(`${node.name}: ${message(err)}`)
    } finally {
      step(node.name)
    }
  }

  // What the cloud has and this device does not: it comes down, unless this device had it and threw it away.
  for (const [path, r] of remote) {
    if (seen.has(path)) continue
    try {
      const st = byPath.get(path)
      if (st) {
        const node = await fs.get(st.nodeId)
        if (!node || node.trashedAt !== null) {
          await provider.remove(r)
          await db.syncState.delete(st.key)
          report.deletedRemote++
          continue
        }
      }
      await download(r)
    } catch (err) {
      report.errors.push(`${basename(path)}: ${message(err)}`)
    } finally {
      step(basename(path))
    }
  }

  // Links whose file is gone on both sides are just noise now.
  for (const st of states) {
    if (!remote.has(st.remotePath) && !(await fs.get(st.nodeId))) await db.syncState.delete(st.key)
  }

  return report
}
