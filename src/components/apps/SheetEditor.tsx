import { useEffect, useRef, useState } from 'react'
import { Workbook } from '@fortune-sheet/react'
import type { Cell, CellMatrix, CellWithRowAndCol, Selection, Sheet } from '@fortune-sheet/core'
import '@fortune-sheet/react/dist/index.css'
import { read, utils, write, type CellObject, type WorkSheet } from 'xlsx'
import { Languages, Lightbulb, Loader2, Save, Sparkles, Table2 } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { useToasts } from '../../kernel/commands'
import { useSession } from '../../ai/session'
import { isAiConfigured, useAiSettings } from '../../ai/settings'
import { cn } from '../../lib/utils'

/**
 * Excel inside Sky: SheetJS reads the workbook, FortuneSheet turns it into a live grid (tabs, formulas,
 * formats, filters) the person can edit, and "Guardar" writes it back to the same file. Loaded on demand:
 * the grid is a big dependency and most sessions never open a spreadsheet.
 */

const MIN_ROWS = 40
const MIN_COLS = 26
/** Rows of a selection that travel to Sky at most. */
const MAX_SELECTED_ROWS = 400

interface CellRange {
  sheetId: string
  rows: [number, number]
  cols: [number, number]
  /** Where the menu floats, relative to the grid: centered on the selection, above it unless there is no room. */
  anchor?: { x: number; y: number; below: boolean; width: number }
}

/** The grid draws the selection as an element; its box tells us where to float the menu. */
function anchorFor(grid: HTMLElement | null): CellRange['anchor'] | undefined {
  const el = grid?.querySelector('.luckysheet-cell-selected')
  if (!grid || !el) return undefined
  const box = grid.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const below = r.top - box.top < 110
  return { x: r.left - box.left + r.width / 2, y: below ? r.bottom - box.top + 8 : r.top - box.top - 8, below, width: box.width }
}

type RangeIntent = 'summary' | 'table' | 'translate' | 'explain'

const rangeLabel = (r: CellRange) => `${utils.encode_cell({ r: r.rows[0], c: r.cols[0] })}:${utils.encode_cell({ r: r.rows[1], c: r.cols[1] })}`

/** The selected cells as tab-separated text, display strings first, values as fallback. */
function rangeText(sheet: Sheet, r: CellRange): string {
  const matrix = matrixOf(sheet)
  const lines: string[] = []
  for (let row = r.rows[0]; row <= Math.min(r.rows[1], r.rows[0] + MAX_SELECTED_ROWS - 1); row++) {
    const cells: string[] = []
    for (let col = r.cols[0]; col <= r.cols[1]; col++) {
      const cell = matrix[row]?.[col]
      cells.push(cell?.m !== undefined ? String(cell.m) : cell?.v === undefined || cell?.v === null ? '' : String(cell.v))
    }
    if (cells.some((c) => c !== '')) lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

function rangeLead(intent: RangeIntent, name: string, sheet: string, label: string): string {
  const where = `del rango ${label} de la hoja «${sheet}» en «${name}» (columnas separadas por tabulador)`
  switch (intent) {
    case 'summary':
      return `Resume estos datos ${where}: qué contienen, totales o tendencias si aplican, y lo que destaca.`
    case 'table':
      return `Convierte estos datos ${where} en una tabla Markdown limpia con encabezados claros; conserva los números tal cual.`
    case 'translate':
      return `Traduce al español los textos de estos datos ${where} (si ya están en español, al inglés), conservando la estructura por filas.`
    case 'explain':
      return `Explícame con claridad qué muestran estos datos ${where}.`
  }
}
/** Excel column widths come in characters; FortuneSheet wants pixels. */
const CHAR_PX = 7.5

function fromSheetJs(ws: WorkSheet, name: string, order: number): Sheet {
  const ref = ws['!ref'] ?? 'A1:A1'
  const range = utils.decode_range(ref)
  const celldata: CellWithRowAndCol[] = []
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue
    const cell = ws[addr] as CellObject
    if (cell.v === undefined && !cell.f) continue
    const { r, c } = utils.decode_cell(addr)
    const value = cell.v instanceof Date ? cell.w ?? cell.v.toISOString() : cell.v
    const v: Cell = {
      v: value as string | number | boolean | undefined,
      m: cell.w ?? (value === undefined ? '' : String(value)),
      ct: { fa: typeof cell.z === 'string' ? cell.z : 'General', t: typeof value === 'number' ? 'n' : typeof value === 'boolean' ? 'b' : 'g' },
    }
    if (cell.f) v.f = `=${cell.f}`
    celldata.push({ r, c, v })
  }
  const columnlen: Record<string, number> = {}
  ws['!cols']?.forEach((col, i) => {
    if (col?.wch) columnlen[String(i)] = Math.round(col.wch * CHAR_PX)
  })
  return {
    id: `sheet-${order}`,
    name,
    order,
    status: order === 0 ? 1 : 0,
    celldata,
    row: Math.max(range.e.r + 1 + 10, MIN_ROWS),
    column: Math.max(range.e.c + 1 + 4, MIN_COLS),
    config: Object.keys(columnlen).length ? { columnlen } : {},
    // Without a starting selection the grid shows "A1:NaN" in its name box until the first click.
    luckysheet_select_save: [{ row: [0, 0], column: [0, 0], row_focus: 0, column_focus: 0 }],
  }
}

function matrixOf(sheet: Sheet): CellMatrix {
  if (sheet.data) return sheet.data
  const rows: CellMatrix = []
  for (const { r, c, v } of sheet.celldata ?? []) {
    rows[r] ??= []
    rows[r][c] = v
  }
  return rows
}

/** The live grid back into a workbook: values, formulas and the display strings SheetJS needs. */
function toSheetJs(sheets: Sheet[]): ArrayBuffer {
  const wb = utils.book_new()
  for (const sheet of [...sheets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const matrix = matrixOf(sheet)
    const ws: WorkSheet = {}
    let maxR = 0
    let maxC = 0
    matrix.forEach((row, r) => {
      row?.forEach((cell, c) => {
        if (!cell || (cell.v === undefined && !cell.f)) return
        maxR = Math.max(maxR, r)
        maxC = Math.max(maxC, c)
        const raw = cell.v
        const out: CellObject = typeof raw === 'number' ? { t: 'n', v: raw } : typeof raw === 'boolean' ? { t: 'b', v: raw } : { t: 's', v: raw === undefined ? '' : String(raw) }
        if (cell.f) out.f = cell.f.replace(/^=/, '')
        ws[utils.encode_cell({ r, c })] = out
      })
    })
    ws['!ref'] = utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
    const widths = sheet.config?.columnlen
    if (widths) ws['!cols'] = Array.from({ length: maxC + 1 }, (_, i) => (widths[String(i)] ? { wch: Math.round(widths[String(i)] / CHAR_PX) } : {}))
    utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }
  return write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

function RangeAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink transition hover:bg-surface-2">
      {icon}
      {label}
    </button>
  )
}

export default function SheetEditor({ blob, nodeId, name }: { blob: Blob; nodeId: string; name: string }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const latest = useRef<Sheet[] | null>(null)
  // FortuneSheet reports a change while it lays the workbook out; only edits after that count as the person's.
  const settled = useRef(false)
  const [range, setRange] = useState<CellRange | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const aiReady = isAiConfigured(useAiSettings())

  const onSelection = (sheetId: string, s: Selection) => {
    const edges = [s.row?.[0], s.row?.[1], s.column?.[0], s.column?.[1]]
    if (edges.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
      setRange(null)
      return
    }
    const rows: [number, number] = [Math.min(s.row[0], s.row[1]), Math.max(s.row[0], s.row[1])]
    const cols: [number, number] = [Math.min(s.column[0], s.column[1]), Math.max(s.column[0], s.column[1])]
    // One cell is just the cursor; a range is something to talk about.
    if (rows[0] === rows[1] && cols[0] === cols[1]) {
      setRange(null)
      return
    }
    // The grid paints the selection right after this hook; measure it a frame later.
    requestAnimationFrame(() => setRange({ sheetId, rows, cols, anchor: anchorFor(gridRef.current) }))
  }

  const askAboutRange = (intent: RangeIntent) => {
    if (!range) return
    const sheet = latest.current?.find((s) => s.id === range.sheetId) ?? latest.current?.[0]
    if (!sheet) return
    const text = rangeText(sheet, range)
    if (!text.trim()) {
      useToasts.getState().push({ message: 'Las celdas seleccionadas están vacías.', kind: 'error' })
      return
    }
    useSession.getState().setOpen(true)
    void useSession.getState().send(`${rangeLead(intent, name, sheet.name, rangeLabel(range))}\n\n"""\n${text}\n"""`)
  }

  /**
   * FortuneSheet lays its canvas out once and only listens to the browser's own resize, so a window that
   * changes size (a drag on the corner, a snap to an edge, the deck) would leave the grid at its old size and
   * paint it past the frame. Watching the container and replaying a resize keeps the grid inside the window.
   */
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    let frame = 0
    let first = true
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false
        return
      }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    })
    observer.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
    // The grid only exists once the workbook is parsed; watch it from then on.
  }, [sheets])

  useEffect(() => {
    let alive = true
    blob
      .arrayBuffer()
      .then((buffer) => {
        const wb = read(buffer, { type: 'array', cellDates: true, cellNF: true })
        const parsed = wb.SheetNames.map((n, i) => fromSheetJs(wb.Sheets[n], n, i))
        if (alive) {
          latest.current = parsed
          settled.current = false
          setSheets(parsed)
          window.setTimeout(() => {
            settled.current = true
          }, 800)
        }
      })
      .catch(() => alive && setError('No pude leer esta hoja de cálculo.'))
    return () => {
      alive = false
    }
  }, [blob])

  const save = async () => {
    if (!latest.current) return
    setSaving(true)
    try {
      const buffer = toSheetJs(latest.current)
      await fs.writeBlob(nodeId, new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      setDirty(false)
      useToasts.getState().push({ message: `${name} guardado`, kind: 'info' })
    } catch (err) {
      useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo guardar', kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (error) return <div className="flex h-full items-center justify-center text-[13px] text-ink-3">{error}</div>
  if (!sheets) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-ink-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo las hojas…
      </div>
    )
  }

  return (
    // The grid has its own undo stack; Ctrl+Z here must not reach back into the file system.
    <div data-own-undo className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-1.5 text-[12px]">
        <span className={cn('text-ink-3', dirty && 'text-ink-2')}>{dirty ? 'Cambios sin guardar' : 'Todo guardado'}</span>
        <span className="flex-1" />
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar
        </button>
      </div>
      <div ref={gridRef} className="sheet-editor relative min-h-0 flex-1">
        <Workbook
          data={sheets}
          lang="es"
          allowEdit
          showToolbar
          showFormulaBar
          showSheetTabs
          hooks={{ afterSelectionChange: onSelection }}
          onChange={(data) => {
            latest.current = data
            if (settled.current) setDirty(true)
          }}
        />
        {range && aiReady && (
          <div
            data-selection-menu
            style={range.anchor ? { left: Math.max(240, Math.min(range.anchor.width - 240, range.anchor.x)), top: range.anchor.y } : { left: '50%', top: 8 }}
            className={cn('glass absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl p-1 shadow-win', range.anchor && !range.anchor.below && '-translate-y-full')}
          >
            <span className="px-2 text-[11.5px] tabular-nums text-ink-3">
              {rangeLabel(range)} · {(range.rows[1] - range.rows[0] + 1) * (range.cols[1] - range.cols[0] + 1)} celdas
            </span>
            <RangeAction icon={<Sparkles className="h-3.5 w-3.5" />} label="Resumir" onClick={() => askAboutRange('summary')} />
            <RangeAction icon={<Table2 className="h-3.5 w-3.5" />} label="A tabla" onClick={() => askAboutRange('table')} />
            <RangeAction icon={<Languages className="h-3.5 w-3.5" />} label="Traducir" onClick={() => askAboutRange('translate')} />
            <RangeAction icon={<Lightbulb className="h-3.5 w-3.5" />} label="Explicar" onClick={() => askAboutRange('explain')} />
          </div>
        )}
      </div>
    </div>
  )
}
