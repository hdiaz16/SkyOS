import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Code2, GitBranch, Pencil, Plus, Sparkles, StickyNote, Trash2, type LucideIcon } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { appendBlocks, BLOCK_LABELS, canvasExtent, parseCanvas, serializeCanvas, type BlockKind, type CanvasBlock, type CanvasDoc } from '../../kernel/canvas'
import type { Win } from '../../state/windows'
import { useUi } from '../../state/ui'
import { useSession } from '../../ai/session'
import { isAiConfigured, useAiSettings } from '../../ai/settings'
import { cn } from '../../lib/utils'
import { Markdown } from '../Markdown'
import { Mermaid } from '../Mermaid'
import { HtmlSandbox } from '../HtmlSandbox'
import { ToolButton } from '../ToolButton'

const SAVE_DELAY_MS = 500
const MIN_W = 200
const MIN_H = 120

const KIND_ICON: Record<BlockKind, LucideIcon> = { markdown: StickyNote, mermaid: GitBranch, html: Code2 }

const TEMPLATES: Record<BlockKind, string> = {
  markdown: '# Nota\n\nEscribe aquí. Markdown con **negritas**, listas y tablas:\n\n| Tema | Estado |\n| --- | --- |\n| Primer punto | En curso |',
  mermaid: 'flowchart LR\n  A[Idea] --> B{¿Viable?}\n  B -- Sí --> C[Plan]\n  B -- No --> D[Descartar]',
  html: '<div style="padding:12px">\n  <strong>Bloque HTML</strong>\n  <p>Cualquier componente que Sky genere vive aquí, aislado.</p>\n</div>',
}

type Geometry = Pick<CanvasBlock, 'x' | 'y' | 'w' | 'h'>

/**
 * A free board: notes, tables, Mermaid diagrams and HTML blocks anywhere on an open surface. The board is a
 * file (.canvas), so Sky can build it from a sentence and the person can move, edit or extend each block.
 */
export function CanvasApp({ win }: { win: Win }) {
  const nodeId = win.props.nodeId ?? ''
  const node = useLiveQuery(() => fs.get(nodeId), [nodeId])
  const [doc, setDoc] = useState<CanvasDoc | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const loadedVersion = useRef(0)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const aiReady = isAiConfigured(useAiSettings())

  // Load once, then follow external changes (Sky adding blocks, undo) while not mid-edit.
  useEffect(() => {
    if (!node || node.updatedAt === loadedVersion.current || dirty.current) return
    let alive = true
    void fs.readText(nodeId).then((t) => {
      if (!alive) return
      loadedVersion.current = node.updatedAt
      setDoc(parseCanvas(t))
    })
    return () => {
      alive = false
    }
  }, [node, nodeId])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const commit = (next: CanvasDoc) => {
    setDoc(next)
    dirty.current = true
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      await fs.writeText(nodeId, serializeCanvas(next))
      const fresh = await fs.get(nodeId)
      if (fresh) loadedVersion.current = fresh.updatedAt
      dirty.current = false
    }, SAVE_DELAY_MS)
  }

  const patchBlock = (id: string, patch: Partial<CanvasBlock>) => {
    if (doc) commit({ ...doc, blocks: doc.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) })
  }
  const removeBlock = (id: string) => {
    if (doc) commit({ ...doc, blocks: doc.blocks.filter((b) => b.id !== id) })
    if (editing === id) setEditing(null)
  }
  const addBlock = (kind: BlockKind) => {
    if (!doc) return
    const next = appendBlocks(doc, [{ kind, content: TEMPLATES[kind] }])
    commit(next.doc)
    setEditing(next.ids[0])
  }
  const askSky = (block?: CanvasBlock) => {
    if (block) {
      const label = block.title ?? BLOCK_LABELS[block.kind]
      useSession.getState().attach({ type: 'file', name: `${node?.name ?? 'Lienzo'} · ${label}`, text: block.content, nodeId }, label)
    }
    useUi.getState().focusComposer()
  }
  const onBoardMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).hasAttribute('data-board')) setEditing(null)
  }

  if (!doc) return <div className="flex h-full items-center justify-center text-[13px] text-ink-3">Abriendo el lienzo…</div>
  const extent = canvasExtent(doc.blocks)
  const count = doc.blocks.length

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
        <span className="px-2 text-[12px] text-ink-3">{count ? `${count} bloque${count === 1 ? '' : 's'}` : 'Lienzo vacío'}</span>
        <span className="flex-1" />
        <AddButton icon={StickyNote} label="Nota" onClick={() => addBlock('markdown')} />
        <AddButton icon={GitBranch} label="Diagrama" onClick={() => addBlock('mermaid')} />
        <AddButton icon={Code2} label="HTML" onClick={() => addBlock('html')} />
        {aiReady && (
          <ToolButton label="Pedir a Sky sobre este lienzo" onClick={() => askSky()}>
            <Sparkles className="h-4 w-4 text-accent" />
          </ToolButton>
        )}
      </div>

      <div className="scrollbar-thin canvas-grid relative min-h-0 flex-1 overflow-auto" onMouseDown={onBoardMouseDown}>
        <div data-board className="relative" style={{ width: extent.w, height: extent.h }}>
          {doc.blocks.map((b) => (
            <Block
              key={b.id}
              block={b}
              editing={editing === b.id}
              onEdit={() => setEditing(b.id)}
              onDone={() => setEditing(null)}
              onChange={(patch) => patchBlock(b.id, patch)}
              onRemove={() => removeBlock(b.id)}
              onAsk={aiReady ? () => askSky(b) : undefined}
            />
          ))}
          {!count && (
            <div data-board className="absolute left-1/2 top-40 w-[440px] -translate-x-1/2 text-center text-[13px] leading-relaxed text-ink-3">
              <p className="font-medium text-ink-2">Un lienzo en blanco</p>
              <p className="mt-1">
                Añade una nota, un diagrama o un bloque HTML desde arriba, o pídeselo a Sky: «arma el plan del proyecto con un diagrama de fases y una tabla de
                costos».
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface BlockProps {
  block: CanvasBlock
  editing: boolean
  onEdit: () => void
  onDone: () => void
  onChange: (patch: Partial<CanvasBlock>) => void
  onRemove: () => void
  onAsk?: () => void
}

function Block({ block, editing, onEdit, onDone, onChange, onRemove, onAsk }: BlockProps) {
  // Live geometry while dragging or resizing; the stored one takes over on release.
  const [geo, setGeo] = useState<Geometry | null>(null)
  const live = useRef<Geometry>({ x: block.x, y: block.y, w: block.w, h: block.h })
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const shown = geo ?? block
  const Icon = KIND_ICON[block.kind]
  const label = block.title ?? BLOCK_LABELS[block.kind]

  useEffect(() => {
    if (editing) areaRef.current?.focus()
  }, [editing])

  const track = (apply: (dx: number, dy: number, start: Geometry) => Geometry) => (e: PointerEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return
    e.preventDefault()
    const sx = e.clientX
    const sy = e.clientY
    const start: Geometry = { x: block.x, y: block.y, w: block.w, h: block.h }
    const move = (ev: globalThis.PointerEvent) => {
      live.current = apply(ev.clientX - sx, ev.clientY - sy, start)
      setGeo(live.current)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const g = live.current
      if (g.x !== block.x || g.y !== block.y || g.w !== block.w || g.h !== block.h) onChange(g)
      setGeo(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const startDrag = track((dx, dy, s) => ({ ...s, x: Math.max(0, Math.round(s.x + dx)), y: Math.max(0, Math.round(s.y + dy)) }))
  const startResize = track((dx, dy, s) => ({ ...s, w: Math.max(MIN_W, Math.round(s.w + dx)), h: Math.max(MIN_H, Math.round(s.h + dy)) }))

  return (
    <div
      style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h }}
      className={cn(
        'group absolute flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-soft transition-shadow hover:shadow-win',
        geo && 'select-none shadow-win',
        editing && 'ring-2 ring-accent/40',
      )}
    >
      <div className="flex h-8 shrink-0 cursor-grab items-center gap-1.5 border-b border-line/70 px-2.5 active:cursor-grabbing" onPointerDown={startDrag} onDoubleClick={onEdit}>
        <Icon className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
        {editing ? (
          <input
            value={block.title ?? ''}
            placeholder={BLOCK_LABELS[block.kind]}
            onChange={(e) => onChange({ title: e.target.value })}
            aria-label="Título del bloque"
            className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-ink outline-none placeholder:text-ink-3"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">{label}</span>
        )}
        <div className={cn('flex items-center gap-0.5 transition-opacity', editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
          {onAsk && !editing && (
            <IconButton label="Pedir a Sky sobre este bloque" onClick={onAsk}>
              <Sparkles className="h-3.5 w-3.5" />
            </IconButton>
          )}
          {editing ? (
            <IconButton label="Listo" onClick={onDone}>
              <Check className="h-3.5 w-3.5" />
            </IconButton>
          ) : (
            <IconButton label="Editar" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton label="Quitar bloque" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div className={cn('min-h-0 flex-1', geo && 'pointer-events-none')}>
        {editing ? (
          <textarea
            ref={areaRef}
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
            spellCheck={block.kind === 'markdown'}
            aria-label="Contenido del bloque"
            className={cn('h-full w-full resize-none bg-transparent p-3 text-[13px] leading-relaxed text-ink outline-none', block.kind !== 'markdown' && 'font-mono text-[12px]')}
          />
        ) : block.kind === 'markdown' ? (
          <div className="scrollbar-thin h-full overflow-auto px-4 py-2 text-[13px] text-ink-2">
            <Markdown text={block.content} />
          </div>
        ) : block.kind === 'mermaid' ? (
          <div className="scrollbar-thin h-full overflow-auto p-3">
            <Mermaid code={block.content} />
          </div>
        ) : (
          <HtmlSandbox html={block.content} title={label} />
        )}
      </div>
      <div className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize" onPointerDown={startResize} aria-hidden />
    </div>
  )
}

function AddButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink">
      <Plus className="h-3 w-3" />
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-6 w-6 items-center justify-center rounded-md text-ink-3 transition hover:bg-surface-2 hover:text-ink">
      {children}
    </button>
  )
}
