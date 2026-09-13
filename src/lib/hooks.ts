import { useEffect, useState } from 'react'
import { fs } from '../kernel/fs'

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
