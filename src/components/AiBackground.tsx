import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../kernel/db'
import { indexPending } from '../ai/indexer'
import { isAiConfigured, useAiSettings } from '../ai/settings'

const DEBOUNCE_MS = 8000

/** Headless: keeps the semantic index fresh a few seconds after files stop changing. */
export function AiBackground() {
  const settings = useAiSettings()
  const configured = isAiConfigured(settings)
  const signal = useLiveQuery(
    async () => {
      const rows = await db.nodes.where('kind').equals('file').and((n) => n.trashedAt === null).toArray()
      const latest = rows.reduce((acc, n) => Math.max(acc, n.updatedAt), 0)
      return `${rows.length}:${latest}`
    },
    [],
    '',
  )

  useEffect(() => {
    if (!configured || !signal) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => void indexPending(controller.signal), DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [configured, signal, settings.provider, settings.model])

  return null
}
