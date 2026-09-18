import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { Check, Code2, GitBranch, Pencil, Plus, Sparkles, StickyNote, Trash2, type LucideIcon } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { dispatch, useToasts } from '../../kernel/commands'
import { FileMissing, Opening } from './FileState'
import { useFileNode } from '../../lib/hooks'
import { appendBlocks, BLOCK_LABELS, canvasExtent, parseCanvas, type BlockKind, type CanvasBlock, type CanvasDoc } from '../../kernel/canvas'
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
  const { status, node } = useFileNode(nodeId)
  const [doc, setDoc] = useState<CanvasDoc | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const loadedVersion = useRef(0)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  /** Blocks removed here, so a merge with what arrived from outside does not bring them back to life. */
  const removed = useRef(new Set<string>())
  /** The first block of a batch that arrived from outside, to be brought into view once it is painted. */
  const arrived = useRef<string | null>(null)
  const aiReady = isAiConfigured(useAiSettings())

  // Load once, then follow external changes (Sky adding blocks, undo) while not mid-edit.
  useEffect(() => {
    if (!node || node.updatedAt === loadedVersion.current || dirty.current) return
    let alive = true
    void fs.readText(nodeId).then(
      (t) => {
        if (!alive) return
        // Reading a file that is not a board as an empty one is how its content got saved over with nothing.
        const next = parseCanvas(t)
        if (!next) {
          setUnreadable(true)
          return
        }
        loadedVersion.current = node.updatedAt
        // A board is wider than its window: Sky said «1 bloque añadido» and the visible part did not change,
        // because the new block had landed at x=952 or on a second row. The first one gets scrolled to.
        setDoc((before) => {
          if (before) {
            const had = new Set(before.blocks.map((b) => b.id))
            arrived.current = next.blocks.find((b) => !had.has(b.id))?.id ?? null
          }
          return next
        })
      },
      () => alive && setUnreadable(true),
    )
    return () => {
      alive = false
    }
  }, [node, nodeId])

  useLayoutEffect(() => {
    const id = arrived.current
    if (!id) return
    arrived.current = null
    document.querySelector(`[data-block="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [doc])

  // Moving a block and closing the window within the same half second used to lose the move: the timer was
  // cleared and nobody wrote. Whatever is pending goes to disk on the way out.
  const pending = useRef<CanvasDoc | null>(null)
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (dirty.current && pending.current) {
        // Through the bus like every other save, so the last edits are in the journal and undoable too.
        void dispatch('canvas.save', { id: nodeId, blocks: pending.current.blocks }, { source: 'system' }).catch(() => undefined)
      }
    },
    [nodeId],
  )

  const commit = (next: CanvasDoc) => {
    setDoc(next)
    dirty.current = true
    pending.current = next
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        // Saving replaces the whole document, and someone else may have written during the half second this was
        // dirty — Sky adding a block to the board you are moving things on. That block used to disappear while
        // the assistant announced it. What arrived is merged back in by id; what was removed here stays removed.
        let blocks = next.blocks.filter((b) => !removed.current.has(b.id))
        const current = await fs.get(nodeId)
        if (current && current.updatedAt !== loadedVersion.current) {
          const text = await fs.readText(nodeId).catch(() => null)
          // Unreadable on disk means there is nothing sound to merge; the save below will hit the same wall
          // and say so, rather than write a fresh board over what could not be read.
          const onDisk = text !== null ? parseCanvas(text) : null
          if (onDisk) {
            const mine = new Set(blocks.map((b) => b.id))
            const extra = onDisk.blocks.filter((b) => !mine.has(b.id) && !removed.current.has(b.id))
            if (extra.length) {
              blocks = [...blocks, ...extra]
              arrived.current = extra[0].id
              pending.current = { version: 1, blocks }
              setDoc({ version: 1, blocks })
            }
          }
        }
        // Not fs.writeText: the save goes through the bus, which leaves a journal entry with the inverse of
        // exactly what differed. Writing behind the bus's back is how Ctrl+Z ended up trashing a canvas the
        // person was only tidying.
        await dispatch('canvas.save', { id: nodeId, blocks }, { source: 'system' })
      } catch {
        // Saying nothing here is how a canvas quietly stops saving; the person has to know to copy it out.
        useToasts.getState().push({ message: 'No pude guardar el lienzo. Copia lo que necesites antes de cerrarlo.', kind: 'error' })
        return
      }
      const fresh = await fs.get(nodeId)
      if (fresh) loadedVersion.current = fresh.updatedAt
      dirty.current = false
      pending.current = null
      // The removals this save carried are on disk now; keeping them in the set is how a block brought back by
      // an undo in between got dropped again by the next save, without anyone touching it.
      removed.current.clear()
    }, SAVE_DELAY_MS)
  }

  const patchBlock = (id: string, patch: Partial<CanvasBlock>) => {
    if (doc) commit({ ...doc, blocks: doc.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) })
  }
  const removeBlock = (id: string) => {
    // Removed here and now for the eye; the write itself goes through the command, which journals it with its
    // inverse. Removing by hand used to be the one canvas edit with no undo, so Ctrl+Z afterwards reached for
    // the last entry that did have one — Sky's creation — and threw the whole canvas in the trash.
    setDoc((d) => (d ? { ...d, blocks: d.blocks.filter((b) => b.id !== id) } : d))
    removed.current.add(id)
    if (editing === id) setEditing(null)
    void dispatch('canvas.removeBlock', { id: nodeId, blockId: id })
      .then(() => {
        // No dirty window open means nothing else will carry this removal: the set is only a guard for the
        // merge inside a pending save, and a stale guard would drop the block again on the next one — including
        // one put back by an undo.
        if (!dirty.current) removed.current.delete(id)
      })
      .catch(() => {
        // The block was already gone from the file, or the file would not open: back to what is on disk.
        void fs
          .readText(nodeId)
          .then((t) => {
            const back = parseCanvas(t)
            if (back) setDoc(back)
            else setUnreadable(true)
          })
          .catch(() => undefined)
      })
  }
  const addBlock = (kind: BlockKind) => {
    if (!doc) return
    const next = appendBlocks(doc, [{ kind, content: TEMPLATES[kind] }])
    commit(next.doc)
    setEditing(next.ids[0])
  }
  const askSky = (block?: CanvasBlock) => {
    if (block) {
      const label = block.title?.trim() || BLOCK_LABELS[block.kind]
      useSession.getState().attach({ type: 'file', name: `${node?.name ?? 'Lienzo'} · ${label}`, text: block.content, nodeId }, label)
    }
    useUi.getState().focusComposer()
  }
  const onBoardMouseDown = (e: MouseEvent) => {
    // The scroller counts as board too: past the board's edge, a click still means "put this away".
    const el = e.target as HTMLElement
    if (el.hasAttribute('data-board') || el.hasAttribute('data-scroller')) setEditing(null)
  }

  if (status === 'trashed' || status === 'gone') return <FileMissing winId={win.id} nodeId={nodeId} status={status} name={win.title} />
  if (unreadable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-[14px] text-ink-2">No pude leer este lienzo</p>
        <p className="text-[12px] leading-relaxed text-ink-3">Su contenido no está donde debería, así que no lo abro en blanco para no perderlo.</p>
      </div>
    )
  }
  if (!doc) return <Opening what="Abriendo el lienzo…" />
  const count = doc.blocks.length
  // An empty board has no extent: the 1200 px minimum canvasExtent is room for blocks that do not exist, and
  // it gave an empty canvas a sideways scrollbar with nothing to reach.
  const extent = count ? canvasExtent(doc.blocks) : { w: 0, h: 0 }

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

      {/* The scroll goes in an inner layer so the empty state can sit over what is visible: it used to live
          inside the board, whose minimum width is 1200 px, and on a narrower window it came up off-centre
          with a sideways scrollbar for a board that has nothing on it. */}
      <div className="relative min-h-0 flex-1">
        <div data-scroller className="scrollbar-thin canvas-grid absolute inset-0 overflow-auto" onMouseDown={onBoardMouseDown}>
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
          </div>
        </div>
        {!count && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center px-6 pt-24 text-center text-[13px] leading-relaxed text-ink-3">
            <div className="max-w-[440px]">
              <p className="font-medium text-ink-2">Un lienzo en blanco</p>
              <p className="mt-1">
                Añade una nota, un diagrama o un bloque HTML desde arriba, o pídeselo a Sky: «arma el plan del proyecto con un diagrama de fases y una tabla de
                costos».
              </p>
            </div>
          </div>
        )}
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
  // Not `??`: typing a title and then erasing it leaves '', and an empty header said nothing at all — that
  // same '' travelled as the name of the attachment and as the title of the HTML block's frame.
  const label = block.title?.trim() || BLOCK_LABELS[block.kind]

  useEffect(() => {
    if (editing) areaRef.current?.focus()
  }, [editing])

  const track = (apply: (dx: number, dy: number, start: Geometry) => Geometry) => (e: PointerEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return
    e.preventDefault()
    // An HTML block is a separate document: letting go over one used to swallow the pointerup and leave the
    // block glued to the hand. Capturing keeps every event coming back here.
    const handle = e.currentTarget as HTMLElement
    try {
      handle.setPointerCapture(e.pointerId)
    } catch {
      // Not every pointer can be captured; the window listeners below still finish the gesture.
    }
    const sx = e.clientX
    const sy = e.clientY
    const start: Geometry = { x: block.x, y: block.y, w: block.w, h: block.h }
    const move = (ev: Event) => {
      const p = ev as globalThis.PointerEvent
      live.current = apply(p.clientX - sx, p.clientY - sy, start)
      setGeo(live.current)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
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
      data-block={block.id}
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
            onChange={(e) => onChange({ title: e.target.value.trim() ? e.target.value : undefined })}
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
