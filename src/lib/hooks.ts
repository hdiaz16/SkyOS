import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { fs } from '../kernel/fs'
import type { FsNode } from '../kernel/types'

/** Object URL for a stored file. Revoked automatically when the id changes or the component unmounts. */
export function useBlobUrl(id: string | null | undefined, version?: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let created: string | null = null
    if (id) {
      fs.readBlob(id).then((blob) => {
        if (!alive || !blob) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      })
    }
    return () => {
      alive = false
      if (created) {
        URL.revokeObjectURL(created)
        setUrl(null)
      }
    }
  }, [id, version])
  return id ? url : null
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
