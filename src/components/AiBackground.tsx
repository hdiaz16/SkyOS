import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../kernel/db'
import { indexPending } from '../ai/indexer'
import { embedPending, useEmbeddings, warmUp } from '../ai/embeddings'
import { isAiConfigured, useAiSettings } from '../ai/settings'
import { extractPending } from '../system/extract'

const DEBOUNCE_MS = 8000
const EXTRACT_DEBOUNCE_MS = 1200

const EMBED_DEBOUNCE_MS = 2500

/** Headless: reads new documents and keeps both semantic indexes (local vectors, model summaries) fresh a few seconds after files stop changing. */
export function AiBackground() {
  const settings = useAiSettings()
  const configured = isAiConfigured(settings)
  const embeddingsOn = useEmbeddings((s) => s.enabled)
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

  useEffect(() => {
    if (!signal) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => void extractPending(controller.signal), EXTRACT_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [signal])

  useEffect(() => {
    if (!embeddingsOn) return
    void warmUp()
  }, [embeddingsOn])

  useEffect(() => {
    if (!embeddingsOn || !signal) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => void embedPending(controller.signal), EMBED_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [embeddingsOn, signal])

  return null
}
