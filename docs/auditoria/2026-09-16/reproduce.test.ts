// Audit probes: passing means the documented CURRENT defect was reproduced.
// These are evidence, not acceptance tests for the desired behavior. No network or real user storage.
import { beforeEach, expect, it, vi } from 'vitest'
import type { FsNode } from '../../../src/kernel/types'
import { ROOT_ID } from '../../../src/kernel/types'
import type { RemoteFile, SyncProvider } from '../../../src/system/sync/types'

const fake = vi.hoisted(() => ({
  nodes: [] as any[], states: [] as any[],
  writeBlob: vi.fn(), createFile: vi.fn(), put: vi.fn(), delete: vi.fn(), trash: vi.fn(),
}))
vi.mock('../../../src/kernel/db', () => ({ db: { syncState: {
  where: () => ({ equals: () => ({ toArray: async () => fake.states }) }),
  put: fake.put, delete: fake.delete,
} } }))
vi.mock('../../../src/kernel/fs', () => ({ fs: {
  list: async (parent: string) => fake.nodes.filter(n => n.parentId === parent && n.trashedAt === null),
  get: async (id: string) => fake.nodes.find(n => n.id === id),
  readBlob: async () => new Blob(['local']),
  writeBlob: fake.writeBlob, createFile: fake.createFile, trash: fake.trash,
} }))

import { runSync } from '../../../src/system/sync/engine'
import { parseCanvas } from '../../../src/kernel/canvas'

const local = (patch = {}): FsNode => ({ id: 'local', name: 'plan.txt', parentId: ROOT_ID, kind: 'file', mime: 'text/plain', size: 5, createdAt: 1000, updatedAt: 2000, trashedAt: null, ...patch })
const remote = (patch = {}): RemoteFile => ({ id: 'remote', path: 'plan.txt', size: 6, modifiedAt: 1000, rev: 'changed-remotely', ...patch })
const linked = () => ({ key: 'dropbox:local', providerId: 'dropbox', nodeId: 'local', remoteId: 'remote', remotePath: 'plan.txt', remoteRev: 'original', localUpdatedAt: 1000, syncedAt: 1000 })
function provider(files: RemoteFile[]): SyncProvider {
  return { id: 'dropbox', name: 'Fake', ready: async () => true, list: async () => files,
    download: vi.fn(async () => new Blob(['remote'])),
    upload: vi.fn(async (path) => remote({ path })), remove: vi.fn(async () => undefined) }
}
beforeEach(() => { vi.clearAllMocks(); fake.nodes = []; fake.states = []; fake.createFile.mockResolvedValue(local({ id: 'downloaded' })) })

it('first sync overwrites a same-path remote file without a conflict copy', async () => {
  fake.nodes = [local()]
  const p = provider([remote()])
  const report = await runSync(p, { mode: 'all' })
  expect(p.upload).toHaveBeenCalledWith('plan.txt', expect.any(Blob), 'text/plain', expect.objectContaining({ id: 'remote' }))
  expect(p.download).not.toHaveBeenCalled()
  expect(report.conflicts).toBe(0)
})
it('local deletion removes a remote file even when its revision changed', async () => {
  fake.nodes = [local({ trashedAt: 3000 })]; fake.states = [linked()]
  const p = provider([remote()])
  const report = await runSync(p, { mode: 'all' })
  expect(p.remove).toHaveBeenCalledOnce()
  expect(p.download).not.toHaveBeenCalled()
  expect(report.conflicts).toBe(0)
})
it('local rename removes the changed remote original before uploading the new path', async () => {
  fake.nodes = [local({ name: 'renamed.txt' })]; fake.states = [linked()]
  const p = provider([remote()])
  await runSync(p, { mode: 'all' })
  expect(p.remove).toHaveBeenCalledOnce()
  expect(p.download).not.toHaveBeenCalled()
  expect(vi.mocked(p.remove).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(p.upload).mock.invocationCallOrder[0])
})
it('a local file omitted for size is downloaded again from the cloud in the same pass', async () => {
  fake.nodes = [local({ size: 101 * 1024 * 1024 })]; fake.states = [linked()]
  const p = provider([remote()])
  const report = await runSync(p, { mode: 'all' })
  expect(report.skipped).toBe(1)
  expect(report.downloaded).toBe(1)
  expect(fake.createFile).toHaveBeenCalledOnce()
})
it('malformed canvas content becomes an apparently valid empty board', () => {
  expect(parseCanvas('{"version":1,"blocks":[')).toEqual({ version: 1, blocks: [] })
})
