import { create } from 'zustand'
import { runAgent } from './agent'
import { extractJson, hashText } from './json'
import { fastModelFor, isAiConfigured } from './settings'
import { db } from '../kernel/db'
import { fs } from '../kernel/fs'
import { fileKind, type FsNode } from '../kernel/types'

/**
 * Search by meaning without an embeddings service: a fast model writes a short summary and keywords
 * for every text file (once per content version), and a query is answered by ranking that compact index.
 */

const MAX_INDEX_BYTES = 200 * 1024
const BATCH = 6
const EXCERPT = 6000

interface IndexedReply {
  id: string
  summary?: string
  keywords?: string[]
}

let indexing: Promise<number> | null = null

/** Summarizes every text file whose content changed since it was last indexed. Safe to call often. */
export function indexPending(signal?: AbortSignal): Promise<number> {
  if (indexing) return indexing
  indexing = (async () => {
    if (!isAiConfigured()) return 0
    const files = (await db.nodes.filter((n) => n.kind === 'file' && n.trashedAt === null && n.size <= MAX_INDEX_BYTES).toArray()).filter(
      (n) => fileKind(n) === 'text',
    )
    const alive = new Set(files.map((f) => f.id))
    for (const row of await db.fileIndex.toArray()) if (!alive.has(row.nodeId)) await db.fileIndex.delete(row.nodeId)

    const pending: Array<{ node: FsNode; text: string; hash: string }> = []
    for (const node of files) {
      // One unreadable file must not stop the sweep for all the others.
      const text = await fs.readText(node.id).catch(() => '')
      if (!text.trim()) continue
      const hash = hashText(text)
      const row = await db.fileIndex.get(node.id)
      if (row?.hash !== hash) pending.push({ node, text, hash })
    }

    let done = 0
    for (let i = 0; i < pending.length && !signal?.aborted; i += BATCH) {
      const batch = pending.slice(i, i + BATCH)
      const prompt = [
        ...batch.map((b) => `<archivo id="${b.node.id}" nombre="${b.node.name}">\n${b.text.slice(0, EXCERPT)}\n</archivo>`),
        '',
        'Para cada archivo escribe un resumen de máximo 40 palabras en español y de 3 a 8 palabras clave en minúsculas.',
        'Responde únicamente con JSON: [{"id":"...","summary":"...","keywords":["..."]}]',
      ].join('\n')
      let text: string
      try {
        text = (
          await runAgent({
            prompt,
            systemOverride: 'Indexas documentos para poder buscarlos después. Responde únicamente con JSON válido, sin texto alrededor.',
            tools: [],
            withoutState: true,
            model: fastModelFor(),
            maxTokens: 3000,
            signal,
          })
        ).text
      } catch {
        break
      }
      const replies = extractJson<IndexedReply[]>(text)
      if (!Array.isArray(replies)) continue
      for (const r of replies) {
        const item = batch.find((b) => b.node.id === r.id)
        if (!item) continue
        const previous = await db.fileIndex.get(item.node.id)
        await db.fileIndex.put({
          ...previous,
          nodeId: item.node.id,
          hash: item.hash,
          summary: String(r.summary ?? '').slice(0, 400),
          keywords: Array.isArray(r.keywords) ? r.keywords.map(String).slice(0, 10) : [],
          updatedAt: Date.now(),
        })
        done++
      }
    }
    return done
  })().finally(() => {
    indexing = null
  })
  return indexing
}

export interface SemanticHit {
  id: string
  name: string
  reason: string
}

export interface SemanticResult {
  hits: SemanticHit[]
  indexed: number
  total: number
}

const MAX_ENTRIES = 300

/** Ranks files against a natural-language description using the index (and names for unindexed files). */
export async function semanticSearch(query: string, limit = 8): Promise<SemanticResult> {
  const rows = await db.fileIndex.toArray()
  const nodes = new Map((await db.nodes.filter((n) => n.trashedAt === null).toArray()).map((n) => [n.id, n]))
  const indexedIds = new Set(rows.map((r) => r.nodeId))

  const entries = rows
    .filter((r) => nodes.has(r.nodeId))
    .map((r) => {
      const n = nodes.get(r.nodeId)!
      return `${r.nodeId} | ${n.name} | ${(n.tags ?? []).join(', ')} | ${r.summary} | ${r.keywords.join(', ')}`
    })
  const unindexed = [...nodes.values()]
    .filter((n) => n.kind === 'file' && !indexedIds.has(n.id))
    .map((n) => `${n.id} | ${n.name} | ${(n.tags ?? []).join(', ')} | (sin resumen) |`)
  const all = [...entries, ...unindexed].slice(0, MAX_ENTRIES)
  const total = [...nodes.values()].filter((n) => n.kind === 'file').length
  if (!all.length) return { hits: [], indexed: 0, total }

  const prompt = [
    `Consulta: "${query}"`,
    '',
    'Archivos (id | nombre | etiquetas | resumen | palabras clave):',
    ...all,
    '',
    `Devuelve hasta ${limit} archivos que mejor correspondan a la consulta, ordenados por relevancia, cada uno con una razón de máximo 12 palabras. Si ninguno aplica devuelve [].`,
    'Responde únicamente con JSON: [{"id":"...","reason":"..."}]',
  ].join('\n')

  const text = (
    await runAgent({
      prompt,
      systemOverride: 'Buscas por significado sobre un índice de archivos. Responde únicamente con JSON válido, sin texto alrededor.',
      tools: [],
      withoutState: true,
      model: fastModelFor(),
      maxTokens: 1500,
    })
  ).text
  const parsed = extractJson<Array<{ id: string; reason?: string }>>(text) ?? []
  const hits = parsed
    .filter((p) => nodes.has(p.id))
    .slice(0, limit)
    .map((p) => ({ id: p.id, name: nodes.get(p.id)!.name, reason: String(p.reason ?? '') }))
  return { hits, indexed: entries.length, total }
}

interface SemanticState {
  query: string
  status: 'idle' | 'running' | 'done' | 'error'
  result: SemanticResult | null
  error?: string
  run: (query: string) => Promise<void>
  reset: () => void
}

/** UI state for the search-by-meaning results shown in the command bar. */
export const useSemantic = create<SemanticState>((set) => ({
  query: '',
  status: 'idle',
  result: null,
  run: async (query) => {
    set({ query, status: 'running', result: null, error: undefined })
    try {
      const result = await semanticSearch(query)
      set((s) => (s.query === query ? { status: 'done', result } : s))
    } catch (err) {
      set((s) => (s.query === query ? { status: 'error', error: err instanceof Error ? err.message : 'Error' } : s))
    }
  },
  reset: () => set({ query: '', status: 'idle', result: null, error: undefined }),
}))
