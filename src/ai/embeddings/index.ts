import { create } from 'zustand'
import { db } from '../../kernel/db'
import { fs } from '../../kernel/fs'
import { fileKind } from '../../kernel/types'
import { sessionSuffix } from '../../system/session'
import { hashText } from '../json'

/**
 * Search by meaning, on the device. A small multilingual model (in a Web Worker) turns every text file into
 * a vector stored next to the file's index row; a query becomes a vector too and the closest files win.
 * No provider, no tokens, instant results while typing. The LLM-based index (summaries) stays as a deeper
 * second opinion.
 */

export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small'
const PREF_KEY = `mesa:embeddings${sessionSuffix()}`
const MAX_TEXT = 2000
const MAX_FILE_BYTES = 400 * 1024
const BATCH = 8
/** e5 similarities cluster high; below this the match is noise. */
const MIN_SCORE = 0.78

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface EmbeddingsState {
  /** Whether the person wants the local model at all (it is a one-time ~120 MB download). */
  enabled: boolean
  status: Status
  /** 0..1 while the model downloads. */
  progress: number
  error?: string
  indexed: number
  setEnabled: (enabled: boolean) => void
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export const useEmbeddings = create<EmbeddingsState>((set) => ({
  enabled: readPref(),
  status: 'idle',
  progress: 0,
  indexed: 0,
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off')
    } catch {
      // storage unavailable: the preference lasts the session
    }
    set({ enabled })
    if (enabled) void warmUp()
  },
}))

/* ---------- worker ---------- */

type Pending = { resolve: (v: number[][]) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, Pending>()

interface WorkerMessage {
  id?: number
  type: 'result' | 'ready' | 'error' | 'progress'
  vectors?: number[][]
  message?: string
  loaded?: number
  total?: number
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const m = e.data
    if (m.type === 'progress') {
      useEmbeddings.setState({ status: 'loading', progress: m.total ? Math.min(1, (m.loaded ?? 0) / m.total) : 0 })
      return
    }
    if (m.id === undefined) return
    const p = waiting.get(m.id)
    waiting.delete(m.id)
    if (m.type === 'error') {
      useEmbeddings.setState({ status: 'error', error: m.message })
      p?.reject(new Error(m.message ?? 'El modelo de búsqueda falló'))
      return
    }
    useEmbeddings.setState({ status: 'ready', progress: 1, error: undefined })
    if (m.type === 'result') p?.resolve(m.vectors ?? [])
    else p?.resolve([])
  }
  worker.onerror = (e) => {
    useEmbeddings.setState({ status: 'error', error: e.message })
    for (const p of waiting.values()) p.reject(new Error(e.message))
    waiting.clear()
  }
  return worker
}

function request(type: 'embed' | 'warm', texts: string[] = []): Promise<number[][]> {
  const id = ++seq
  const w = getWorker()
  if (useEmbeddings.getState().status === 'idle') useEmbeddings.setState({ status: 'loading' })
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    w.postMessage(type === 'embed' ? { id, type, texts } : { id, type })
  })
}

/** Loads the model ahead of time so the first search is instant. */
export async function warmUp(): Promise<void> {
  if (!useEmbeddings.getState().enabled) return
  await request('warm').catch(() => undefined)
}

/** e5 models want to know whether a text is a query or a passage. */
export const embed = (texts: string[], kind: 'query' | 'passage'): Promise<number[][]> =>
  request(
    'embed',
    texts.map((t) => `${kind}: ${t}`),
  )

/** Both vectors are unit length, so the dot product is the cosine similarity. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) dot += a[i] * b[i]
  return dot
}

/* ---------- indexing ---------- */

const passageFor = (name: string, text: string) => `${name}\n${text.slice(0, MAX_TEXT)}`

let indexing: Promise<number> | null = null

/** Embeds every text file whose content changed since its vector was computed. Single-flight; safe to call often. */
export function embedPending(signal?: AbortSignal): Promise<number> {
  if (indexing) return indexing
  indexing = (async () => {
    if (!useEmbeddings.getState().enabled) return 0
    const files = (await db.nodes.filter((n) => n.kind === 'file' && n.trashedAt === null && n.size <= MAX_FILE_BYTES).toArray()).filter((n) => fileKind(n) === 'text')
    const pending: Array<{ id: string; name: string; text: string; hash: string }> = []
    for (const node of files) {
      const text = await fs.readText(node.id)
      if (!text.trim()) continue
      const hash = hashText(text)
      const row = await db.fileIndex.get(node.id)
      if (row?.embeddedHash !== hash) pending.push({ id: node.id, name: node.name, text, hash })
    }
    let done = 0
    for (let i = 0; i < pending.length && !signal?.aborted; i += BATCH) {
      const batch = pending.slice(i, i + BATCH)
      const vectors = await embed(
        batch.map((b) => passageFor(b.name, b.text)),
        'passage',
      )
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]
        const vector = vectors[j]
        if (!vector) continue
        const row = await db.fileIndex.get(item.id)
        await db.fileIndex.put({
          nodeId: item.id,
          hash: row?.hash ?? '',
          summary: row?.summary ?? '',
          keywords: row?.keywords ?? [],
          updatedAt: row?.updatedAt ?? Date.now(),
          embedding: vector,
          embeddedHash: item.hash,
        })
        done++
      }
      useEmbeddings.setState((s) => ({ indexed: s.indexed + batch.length }))
    }
    return done
  })().finally(() => {
    indexing = null
  })
  return indexing
}

/* ---------- search ---------- */

export interface VectorHit {
  id: string
  name: string
  score: number
  /** The file's summary when the LLM index has one, else its first line. */
  snippet: string
}

/** Files closest in meaning to the query. Empty when the model is off or nothing is indexed yet. */
export async function vectorSearch(query: string, limit = 8): Promise<VectorHit[]> {
  if (!useEmbeddings.getState().enabled || !query.trim()) return []
  const rows = (await db.fileIndex.toArray()).filter((r) => r.embedding?.length)
  if (!rows.length) return []
  const [q] = await embed([query.trim()], 'query')
  if (!q) return []
  const nodes = new Map((await db.nodes.filter((n) => n.trashedAt === null).toArray()).map((n) => [n.id, n]))
  return rows
    .map((r) => ({ r, node: nodes.get(r.nodeId), score: cosine(q, r.embedding ?? []) }))
    .filter((x) => x.node && x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r, node, score }) => ({ id: r.nodeId, name: node?.name ?? '', score, snippet: r.summary || (r.keywords.length ? r.keywords.join(', ') : '') }))
}
