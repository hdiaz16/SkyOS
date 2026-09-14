import { db, type ExtractRow } from '../../kernel/db'
import { fs } from '../../kernel/fs'
import { fileKind, type FileKind, type FsNode } from '../../kernel/types'
import { useJobs } from '../jobs'
import { canvasText } from '../../kernel/canvas'
import type { ExtractKind } from './worker'

/**
 * Documents become text in the background. A worker reads PDFs and Office files as they arrive or change; the
 * text is kept next to the file so search, summaries and Sky's reading never touch the binary again. Reading a
 * document Sky was just asked about happens on demand, same worker.
 */

export const EXTRACTABLE = new Set<FileKind>(['pdf', 'document', 'spreadsheet', 'presentation'])
const MAX_BYTES = 40 * 1024 * 1024

export const isExtractable = (node: FsNode): boolean => node.kind === 'file' && EXTRACTABLE.has(fileKind(node)) && node.size <= MAX_BYTES

/** Whether Sky can read this file's words, now or after extracting them. */
export const isReadable = (node: FsNode): boolean => node.kind === 'file' && (fileKind(node) === 'text' || fileKind(node) === 'canvas' || isExtractable(node))

/** Identifies the content an extract was made from without hashing the binary. */
const stamp = (node: FsNode) => `${node.size}:${node.updatedAt}`

/* ---------- worker ---------- */

interface Pending {
  resolve: (r: { text: string; pages?: number }) => void
  reject: (e: Error) => void
  onProgress?: (done: number, total: number) => void
}

interface WorkerMessage {
  id: number
  type: 'result' | 'error' | 'progress'
  text?: string
  pages?: number
  message?: string
  done?: number
  total?: number
}

let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, Pending>()

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const m = e.data
    const p = waiting.get(m.id)
    if (!p) return
    if (m.type === 'progress') {
      p.onProgress?.(m.done ?? 0, m.total ?? 1)
      return
    }
    waiting.delete(m.id)
    if (m.type === 'error') p.reject(new Error(m.message ?? 'No se pudo leer el documento'))
    else p.resolve({ text: m.text ?? '', pages: m.pages })
  }
  w.onerror = (e) => {
    for (const p of waiting.values()) p.reject(new Error(e.message || 'El lector de documentos falló'))
    waiting.clear()
    worker = null
  }
  worker = w
  return w
}

function extractInWorker(node: FsNode, buffer: ArrayBuffer, onProgress?: Pending['onProgress']): Promise<{ text: string; pages?: number }> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, onProgress })
    getWorker().postMessage({ id, kind: fileKind(node) as ExtractKind, name: node.name, buffer }, [buffer])
  })
}

/* ---------- extracting ---------- */

const inflight = new Map<string, Promise<string | null>>()

const formatCount = (n: number) => n.toLocaleString('es-MX')

/** Reads one document now, as a tracked job. Failures are remembered so the file is not retried on every pass. */
function extractNow(node: FsNode, quiet: boolean): Promise<string | null> {
  const running = inflight.get(node.id)
  if (running) return running
  const job = (async () => {
    const blob = await fs.readBlob(node.id)
    if (!blob) return null
    const jobs = useJobs.getState()
    const jobId = jobs.start({ kind: 'read', title: `Leyendo «${node.name}»`, quiet })
    try {
      const buffer = await blob.arrayBuffer()
      const { text, pages } = await extractInWorker(node, buffer, (done, total) =>
        useJobs.getState().update(jobId, { progress: done / total, detail: `Página ${done} de ${total}` }),
      )
      const row: ExtractRow = { nodeId: node.id, hash: stamp(node), text, chars: text.length, pages, updatedAt: Date.now() }
      await db.extracts.put(row)
      const detail = text.length ? `${pages ? `${pages} páginas · ` : ''}${formatCount(text.length)} caracteres listos para buscar y resumir` : 'Sin texto legible (puede ser un escaneo)'
      useJobs.getState().finish(jobId, { detail, quiet })
      return text
    } catch (err) {
      await db.extracts.put({ nodeId: node.id, hash: stamp(node), text: '', chars: 0, updatedAt: Date.now(), failed: true })
      useJobs.getState().finish(jobId, { error: err instanceof Error ? err.message : 'No se pudo leer el documento', quiet })
      return null
    } finally {
      inflight.delete(node.id)
    }
  })()
  inflight.set(node.id, job)
  return job
}

interface TextOptions {
  /** Read the document now when no fresh extract exists (default true). */
  extract?: boolean
  /** Announce the reading with a card when it happens now (default false). */
  announce?: boolean
}

/** Text of a PDF or Office file. Null when the file cannot be read (or is not extracted yet and extraction was declined). */
export async function extractedText(node: FsNode, opts: TextOptions = {}): Promise<string | null> {
  if (!isExtractable(node)) return null
  const row = await db.extracts.get(node.id)
  if (row && row.hash === stamp(node)) return row.failed ? null : row.text
  if (opts.extract === false) return null
  return extractNow(node, !opts.announce)
}

/** Words Sky can read from any file: text files as they are, documents through their extract. Null for images and unknown binaries. */
export async function textOf(node: FsNode, opts: TextOptions = {}): Promise<string | null> {
  if (node.kind !== 'file') return null
  const kind = fileKind(node)
  if (kind === 'text') return fs.readText(node.id)
  if (kind === 'canvas') return canvasText(await fs.readText(node.id))
  return extractedText(node, opts)
}

let sweeping: Promise<number> | null = null

/** Reads every new or changed document in the background; a batch announces itself once. Single-flight. */
export function extractPending(signal?: AbortSignal): Promise<number> {
  if (sweeping) return sweeping
  sweeping = (async () => {
    const files = (await db.nodes.filter((n) => n.kind === 'file' && n.trashedAt === null).toArray()).filter(isExtractable)
    const pending: FsNode[] = []
    for (const node of files) {
      const row = await db.extracts.get(node.id)
      if (row?.hash !== stamp(node)) pending.push(node)
    }
    if (!pending.length) return 0
    const batch = pending.length > 1 ? useJobs.getState().start({ kind: 'read', title: `Leyendo ${pending.length} documentos`, progress: 0 }) : null
    let done = 0
    for (const node of pending) {
      if (signal?.aborted) break
      const text = await extractNow(node, !!batch)
      if (text !== null) done++
      if (batch) useJobs.getState().update(batch, { progress: done / pending.length, detail: node.name })
    }
    if (batch) useJobs.getState().finish(batch, { detail: `${done} de ${pending.length} listos para buscar y resumir` })
    if (done) {
      const { embedPending, useEmbeddings } = await import('../../ai/embeddings')
      if (useEmbeddings.getState().enabled) void embedPending()
    }
    return done
  })().finally(() => {
    sweeping = null
  })
  return sweeping
}
