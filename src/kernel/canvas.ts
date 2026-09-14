import { nanoid } from 'nanoid'

/**
 * A canvas is a free board saved as a file (.canvas): blocks of Markdown (notes, tables), Mermaid diagrams
 * and sandboxed HTML placed wherever the person or Sky wants them. Text-to-UI: Sky lays out a plan, a flow
 * or a small dashboard from one sentence; the person moves, edits and extends every block.
 */

export type BlockKind = 'markdown' | 'mermaid' | 'html'

export interface CanvasBlock {
  id: string
  kind: BlockKind
  title?: string
  x: number
  y: number
  w: number
  h: number
  content: string
}

export interface CanvasDoc {
  version: 1
  blocks: CanvasBlock[]
}

export interface NewBlock {
  kind: BlockKind
  content: string
  title?: string
  w?: number
  h?: number
  x?: number
  y?: number
}

export const CANVAS_EXT = 'canvas'
export const CANVAS_MIME = 'application/x-sky-canvas+json'
export const BLOCK_KINDS: BlockKind[] = ['markdown', 'mermaid', 'html']

export const BLOCK_SIZES: Record<BlockKind, { w: number; h: number }> = {
  markdown: { w: 360, h: 240 },
  mermaid: { w: 520, h: 360 },
  html: { w: 420, h: 300 },
}

export const BLOCK_LABELS: Record<BlockKind, string> = { markdown: 'Nota', mermaid: 'Diagrama', html: 'HTML' }

const GAP = 24
const MARGIN = 24
/** Blocks flow in rows up to this width before wrapping. */
const ROW_WIDTH = 1500
const MIN_W = 200
const MIN_H = 120

export const emptyCanvas = (): CanvasDoc => ({ version: 1, blocks: [] })

export const isBlockKind = (k: unknown): k is BlockKind => typeof k === 'string' && (BLOCK_KINDS as string[]).includes(k)

function isBlock(b: unknown): b is CanvasBlock {
  if (!b || typeof b !== 'object') return false
  const o = b as Record<string, unknown>
  return typeof o.id === 'string' && isBlockKind(o.kind) && typeof o.content === 'string' && [o.x, o.y, o.w, o.h].every((n) => typeof n === 'number')
}

/** Reads a canvas file; anything malformed becomes an empty board rather than an error. */
export function parseCanvas(text: string): CanvasDoc {
  try {
    const raw = JSON.parse(text) as Partial<CanvasDoc>
    const blocks = Array.isArray(raw.blocks) ? raw.blocks.filter(isBlock) : []
    return { version: 1, blocks }
  } catch {
    return emptyCanvas()
  }
}

export const serializeCanvas = (doc: CanvasDoc): string => JSON.stringify(doc, null, 2)

/** Where a new block goes: right of the last one while the row has room, else a new row below everything. */
export function nextBlockPosition(blocks: CanvasBlock[], w: number): { x: number; y: number } {
  if (!blocks.length) return { x: MARGIN, y: MARGIN }
  const last = blocks[blocks.length - 1]
  const x = last.x + last.w + GAP
  if (x + w <= ROW_WIDTH) return { x, y: last.y }
  const bottom = blocks.reduce((acc, b) => Math.max(acc, b.y + b.h), 0)
  return { x: MARGIN, y: bottom + GAP }
}

/** Appends blocks with sensible sizes and positions; returns the new document and the ids created. */
export function appendBlocks(doc: CanvasDoc, items: NewBlock[]): { doc: CanvasDoc; ids: string[] } {
  const blocks = [...doc.blocks]
  const ids: string[] = []
  for (const item of items) {
    const size = BLOCK_SIZES[item.kind]
    const w = Math.max(MIN_W, Math.round(item.w ?? size.w))
    const h = Math.max(MIN_H, Math.round(item.h ?? size.h))
    const pos = item.x !== undefined && item.y !== undefined ? { x: Math.max(0, item.x), y: Math.max(0, item.y) } : nextBlockPosition(blocks, w)
    const title = item.title?.trim()
    const block: CanvasBlock = { id: nanoid(6), kind: item.kind, ...(title ? { title } : {}), x: pos.x, y: pos.y, w, h, content: item.content }
    blocks.push(block)
    ids.push(block.id)
  }
  return { doc: { version: 1, blocks }, ids }
}

/** The words in a canvas, for search and for Sky: block titles and contents in order. */
export function canvasText(text: string): string {
  return parseCanvas(text)
    .blocks.map((b) => {
      const head = b.title ? `## ${b.title}\n` : ''
      const body = b.kind === 'mermaid' ? ['```mermaid', b.content, '```'].join('\n') : b.content
      return head + body
    })
    .join('\n\n')
}

/** Size of the board needed to show every block, with room to grow. */
export function canvasExtent(blocks: CanvasBlock[]): { w: number; h: number } {
  const w = blocks.reduce((acc, b) => Math.max(acc, b.x + b.w), 0) + 400
  const h = blocks.reduce((acc, b) => Math.max(acc, b.y + b.h), 0) + 400
  return { w: Math.max(w, 1200), h: Math.max(h, 800) }
}
