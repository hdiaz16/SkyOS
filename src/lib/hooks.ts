import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { fs } from '../kernel/fs'
import type { FsNode } from '../kernel/types'

/**
 * Object URL for a stored file, and whether there was anything to make one from. Returning only the URL made
 * "still loading" and "the bytes are gone" look identical, which is how a viewer ends up spinning forever
 * over a file that will never arrive. Revoked automatically when the id changes or the component unmounts.
 */
export function useBlobUrl(id: string | null | undefined, version?: number): { url: string | null; missing: boolean } {
  // The answer carries the file it is about, so a stale one is recognised while rendering instead of being
  // cleared by an extra round of state at the top of the effect.
  const key = `${id ?? ''}:${version ?? ''}`
  const [state, setState] = useState<{ key: string; url: string | null; missing: boolean }>({ key: '', url: null, missing: false })
  useEffect(() => {
    if (!id) return
    let alive = true
    let created: string | null = null
    fs.readBlob(id).then(
      (blob) => {
        if (!alive) return
        if (!blob) return setState({ key, url: null, missing: true })
        created = URL.createObjectURL(blob)
        setState({ key, url: created, missing: false })
      },
      () => alive && setState({ key, url: null, missing: true }),
    )
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [id, key])
  return id && state.key === key ? { url: state.url, missing: state.missing } : { url: null, missing: false }
}

export function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const ms = 60000 - (Date.now() % 60000)
    let interval: number | undefined
    const timeout = window.setTimeout(() => {
      tick()
      interval = window.setInterval(tick, 60000)
    }, ms)
    return () => {
      window.clearTimeout(timeout)
      if (interval) window.clearInterval(interval)
    }
  }, [])
  return now
}

/**
 * Whether the file behind a window is still there. The database answers "nothing" both while it is looking and
 * when there is nothing to find, so the answer is wrapped: a window has to be able to tell "un momento" from
 * "ya no está".
 */
export type FileStatus = 'loading' | 'ready' | 'trashed' | 'gone'

export function useFileNode(nodeId: string): { status: FileStatus; node?: FsNode } {
  const found = useLiveQuery(async () => ({ node: nodeId ? await fs.get(nodeId) : undefined }), [nodeId])
  if (!nodeId) return { status: 'gone' }
  if (!found) return { status: 'loading' }
  if (!found.node) return { status: 'gone' }
  return { status: found.node.trashedAt === null ? 'ready' : 'trashed', node: found.node }
}
