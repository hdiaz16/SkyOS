import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Workbook } from '@fortune-sheet/react'
import type { Cell, CellMatrix, CellWithRowAndCol, Selection, Sheet } from '@fortune-sheet/core'
import '@fortune-sheet/react/dist/index.css'
import { read, utils, write, type BookType, type CellObject, type WorkBook, type WorkSheet } from 'xlsx'
import { Languages, Lightbulb, Loader2, Save, Sparkles, Table2 } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { extOf } from '../../kernel/types'
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
/** And no more text than one turn of a shared key can chew: 400 rows of thirty columns never made it through. */
const MAX_RANGE_CHARS = 6000

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

/**
 * The selected cells as tab-separated text, display strings first, values as fallback. It also says how much
 * of the selection actually fits: five thousand rows used to leave with the first four hundred and come back
 * summarised as if they were all of them — convincing, and wrong.
 */
function rangeText(sheet: Sheet, r: CellRange): { text: string; rows: number; whole: boolean } {
  const matrix = matrixOf(sheet)
  const lines: string[] = []
  const lastRow = Math.min(r.rows[1], r.rows[0] + MAX_SELECTED_ROWS - 1)
  let whole = lastRow === r.rows[1]
  let chars = 0
  for (let row = r.rows[0]; row <= lastRow; row++) {
    const cells: string[] = []
    for (let col = r.cols[0]; col <= r.cols[1]; col++) {
      const cell = matrix[row]?.[col]
      cells.push(cell?.m !== undefined ? String(cell.m) : cell?.v === undefined || cell?.v === null ? '' : String(cell.v))
    }
    if (!cells.some((c) => c !== '')) continue
    const line = cells.join('\t')
    if (chars + line.length > MAX_RANGE_CHARS) {
      whole = false
      break
    }
    chars += line.length + 1
    lines.push(line)
  }
  return { text: lines.join('\n'), rows: lines.length, whole }
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

/**
 * The grid is sized by the cells that exist, never by the `!ref` the file declares: FortuneSheet materialises
 * a dense matrix of row × column, nulls included, so one stray cell at row 200000 —or a generator writing
 * A1:XFD1048576 into the dimension— froze the desk for seconds or killed the tab with no message at all. Past
 * these caps the sheet loads cut, says so in the bar, and whatever fell outside is preserved when saving.
 */
const MAX_ROWS = 50_000
const MAX_COLS = 1_024
/** Ceiling on row × column as a whole, for files that are huge in both directions at once. */
const DENSE_BUDGET = 2_000_000

function fromSheetJs(ws: WorkSheet, name: string, order: number): { sheet: Sheet; trimmed: boolean } {
  const cells: CellWithRowAndCol[] = []
  let maxR = 0
  let maxC = 0
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue
    const cell = ws[addr] as CellObject
    if (cell.v === undefined && !cell.f) continue
    const { r, c } = utils.decode_cell(addr)
    // Dates keep their serial number and their mask, which is how the file stores them. Reading them as text
    // is what made a save leave them as text: aligned left, useless for sorting or subtracting.
    const v: Cell = {
      v: cell.v as string | number | boolean | undefined,
      m: cell.w ?? (cell.v === undefined ? '' : String(cell.v)),
      ct: { fa: typeof cell.z === 'string' ? cell.z : 'General', t: typeof cell.v === 'number' ? 'n' : typeof cell.v === 'boolean' ? 'b' : 'g' },
    }
    if (cell.f) v.f = `=${cell.f}`
    cells.push({ r, c, v })
    maxR = Math.max(maxR, r)
    maxC = Math.max(maxC, c)
  }
  let row = Math.min(Math.max(maxR + 1 + 10, MIN_ROWS), MAX_ROWS)
  let column = Math.min(Math.max(maxC + 1 + 4, MIN_COLS), MAX_COLS)
  if (row * column > DENSE_BUDGET) {
    if (row >= column) row = Math.floor(DENSE_BUDGET / column)
    else column = Math.floor(DENSE_BUDGET / row)
  }
  const trimmed = maxR + 1 > row || maxC + 1 > column
  const celldata = trimmed ? cells.filter((d) => d.r < row && d.c < column) : cells
  const columnlen: Record<string, number> = {}
  ws['!cols']?.forEach((col, i) => {
    if (col?.wch) columnlen[String(i)] = Math.round(col.wch * CHAR_PX)
  })
  // A merge the file already has was made on purpose: without it, merged headers came up split from the start.
  const merge: Record<string, { r: number; c: number; rs: number; cs: number }> = {}
  for (const range of ws['!merges'] ?? []) {
    if (range.e.r >= row || range.e.c >= column) continue
    merge[`${range.s.r}_${range.s.c}`] = { r: range.s.r, c: range.s.c, rs: range.e.r - range.s.r + 1, cs: range.e.c - range.s.c + 1 }
  }
  const config: Sheet['config'] = {}
  if (Object.keys(columnlen).length) config.columnlen = columnlen
  if (Object.keys(merge).length) config.merge = merge
  return {
    sheet: {
      id: `sheet-${order}`,
      name,
      order,
      status: order === 0 ? 1 : 0,
      celldata,
      row,
      column,
      config,
      // Without a starting selection the grid shows "A1:NaN" in its name box until the first click.
      luckysheet_select_save: [{ row: [0, 0], column: [0, 0], row_focus: 0, column_focus: 0 }],
    },
    trimmed,
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

/**
 * What the file already is, written back as itself. Everything used to be saved as xlsx under its old name, so
 * «presupuesto.ods» became a workbook that Excel opened complaining that the format and the extension did not
 * match. Macros are a separate matter: they are never read, so a .xlsm comes back without them and says so.
 */
const FORMATS: Record<string, { bookType: BookType; mime: string }> = {
  xlsx: { bookType: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xlsm: { bookType: 'xlsm', mime: 'application/vnd.ms-excel.sheet.macroEnabled.12' },
  xlsb: { bookType: 'xlsb', mime: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12' },
  ods: { bookType: 'ods', mime: 'application/vnd.oasis.opendocument.spreadsheet' },
  xls: { bookType: 'xls', mime: 'application/vnd.ms-excel' },
}

const formatFor = (name: string) => FORMATS[extOf(name)] ?? FORMATS.xlsx

/** A grid cell back into a SheetJS cell: its value, its formula, and the mask it was shown with. */
function cellObjectOf(cell: Cell): CellObject {
  const raw = cell.v
  const out: CellObject = typeof raw === 'number' ? { t: 'n', v: raw } : typeof raw === 'boolean' ? { t: 'b', v: raw } : { t: 's', v: raw === undefined || raw === null ? '' : String(raw) }
  if (cell.f) out.f = cell.f.replace(/^=/, '')
  // The mask is the difference between 0.15 and 15 %, and between a date and the bare number underneath it.
  if (out.t === 'n' && typeof cell.ct?.fa === 'string' && cell.ct.fa !== 'General') out.z = cell.ct.fa
  return out
}

/** Column widths and merges of the grid onto a worksheet. `keepRows`/`keepCols` carry file merges that start
 *  outside the loaded window across a save: the grid never saw them, so it has no opinion about them. */
function applyLayout(ws: WorkSheet, sheet: Sheet, keepRows: number, keepCols: number) {
  const widths = sheet.config?.columnlen
  if (widths) {
    const cols = Array.isArray(ws['!cols']) ? [...ws['!cols']] : []
    for (const [key, px] of Object.entries(widths)) cols[Number(key)] = { ...(cols[Number(key)] ?? {}), wch: Math.round(px / CHAR_PX) }
    for (let i = 0; i < cols.length; i++) cols[i] ??= {}
    ws['!cols'] = cols
  }
  const fromGrid = Object.values(sheet.config?.merge ?? {}).map((m) => ({ s: { r: m.r, c: m.c }, e: { r: m.r + m.rs - 1, c: m.c + m.cs - 1 } }))
  const fromFile = keepRows ? (ws['!merges'] ?? []).filter((m) => m.s.r >= keepRows || m.s.c >= keepCols) : []
  const merges = [...fromFile, ...fromGrid]
  if (merges.length) ws['!merges'] = merges
  else delete ws['!merges']
}

/** A sheet with no original to lean on: one born in the grid, or whose file was never kept. */
function freshSheet(sheet: Sheet): WorkSheet {
  const matrix = matrixOf(sheet)
  const ws: WorkSheet = {}
  let maxR = 0
  let maxC = 0
  matrix.forEach((row, r) => {
    row?.forEach((cell, c) => {
      if (!cell || ((cell.v === undefined || cell.v === null) && !cell.f)) return
      maxR = Math.max(maxR, r)
      maxC = Math.max(maxC, c)
      ws[utils.encode_cell({ r, c })] = cellObjectOf(cell)
    })
  })
  ws['!ref'] = utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
  applyLayout(ws, sheet, 0, 0)
  return ws
}

/**
 * The grid written on top of the sheet it came from. Rebuilding the workbook from zero is what stripped every
 * date into text, every percentage into 0.15 and the merged headers apart; here the original sheet is kept and
 * only its cells are rewritten — and only within the window it was loaded into, because past it the grid would
 * be deleting cells it never showed.
 */
function overlaySheet(base: WorkSheet, sheet: Sheet, win: { rows: number; cols: number } | undefined): WorkSheet {
  const matrix = matrixOf(sheet)
  const ws: WorkSheet = { ...base }
  const rows = win?.rows ?? Number.POSITIVE_INFINITY
  const cols = win?.cols ?? Number.POSITIVE_INFINITY
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue
    const { r, c } = utils.decode_cell(addr)
    if (r < rows && c < cols) delete ws[addr]
  }
  matrix.forEach((row, r) => {
    row?.forEach((cell, c) => {
      if (!cell || ((cell.v === undefined || cell.v === null) && !cell.f)) return
      ws[utils.encode_cell({ r, c })] = cellObjectOf(cell)
    })
  })
  let maxR = 0
  let maxC = 0
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue
    const { r, c } = utils.decode_cell(addr)
    maxR = Math.max(maxR, r)
    maxC = Math.max(maxC, c)
  }
  ws['!ref'] = utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
  applyLayout(ws, sheet, win?.rows ?? 0, win?.cols ?? 0)
  return ws
}

/**
 * The grid back into its workbook, each sheet onto the one it came from: the `sheet-N` ids are the order the
 * sheets were read in. Sheets renamed, reordered, added or deleted in the grid come out with their new place
 * and name; everything the editor never touches —styles, margins, filters— rides along in the original.
 */
function toSheetJs(source: { wb: WorkBook; windows: Record<string, { rows: number; cols: number }> } | null, sheets: Sheet[], bookType: BookType): ArrayBuffer {
  const wb = utils.book_new()
  if (source?.wb.Props) wb.Props = source.wb.Props
  for (const sheet of [...sheets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const idx = /^sheet-(\d+)$/.exec(sheet.id ?? '')?.[1]
    const base = idx !== undefined ? source?.wb.Sheets[source.wb.SheetNames[Number(idx)]] : undefined
    utils.book_append_sheet(wb, base ? overlaySheet(base, sheet, source?.windows[sheet.id ?? '']) : freshSheet(sheet), sheet.name.slice(0, 31))
  }
  return write(wb, { type: 'array', bookType }) as ArrayBuffer
}

function RangeAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink transition hover:bg-surface-2">
      {icon}
      {label}
    </button>
  )
}

export default function SheetEditor({
  blob,
  nodeId,
  name,
  onSaved,
}: {
  blob: Blob
  nodeId: string
  name: string
  /** The version this editor just wrote, so whoever opened it can tell its own save from someone else's. */
  onSaved?: (stamp: number) => void
}) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  /** Read from the unmount cleanup, which would otherwise only ever see the first render's value. */
  const dirtyRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const latest = useRef<Sheet[] | null>(null)
  /** The workbook as it was read, with the window each sheet was loaded into: saving writes the grid on top of it. */
  const source = useRef<{ wb: WorkBook; windows: Record<string, { rows: number; cols: number }> } | null>(null)
  const [trimNote, setTrimNote] = useState<string | null>(null)
  // FortuneSheet reports a change while it lays the workbook out; only edits after that count as the person's.
  const settled = useRef(false)
  const [range, setRange] = useState<CellRange | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const aiReady = isAiConfigured(useAiSettings())

  /**
   * FortuneSheet rebuilds its internal settings whenever one of these props changes identity, and both were
   * handed to it brand new on every render. A fresh `hooks` object meant selecting a range put the grid in a
   * loop that never settled; a fresh `onChange` fired on its own and lit "cambios sin guardar" with nobody
   * having typed anything. Both are frozen here, and what they need to see lives in refs.
   */
  const onSelectionRef = useRef<(sheetId: string, s: Selection) => void>(() => undefined)
  const hooks = useMemo(() => ({ afterSelectionChange: (sheetId: string, s: Selection) => onSelectionRef.current(sheetId, s) }), [])
  const onGridChange = useCallback((data: Sheet[]) => {
    latest.current = data
    if (settled.current) {
      dirtyRef.current = true
      setDirty(true)
    }
  }, [])

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
    // The grid paints the selection right after this hook; measure it a frame later. The same range as the
    // one already on screen is nothing to update: re-setting it feeds the render loop it came from.
    requestAnimationFrame(() =>
      setRange((prev) =>
        prev && prev.sheetId === sheetId && prev.rows[0] === rows[0] && prev.rows[1] === rows[1] && prev.cols[0] === cols[0] && prev.cols[1] === cols[1]
          ? prev
          : { sheetId, rows, cols, anchor: anchorFor(gridRef.current) },
      ),
    )
  }
  // The frozen hook above reads this; keeping it fresh belongs after the render, not during it.
  useEffect(() => {
    onSelectionRef.current = onSelection
  })

  const askAboutRange = (intent: RangeIntent) => {
    if (!range) return
    const sheet = latest.current?.find((s) => s.id === range.sheetId) ?? latest.current?.[0]
    if (!sheet) return
    // send() turns around without a word when a turn is already in flight: the panel opened, nothing appeared
    // in it, and the button looked broken.
    if (useSession.getState().running) {
      useToasts.getState().push({ message: 'Sky está respondiendo algo; en cuanto termine, vuelve a pedírselo.', kind: 'info' })
      return
    }
    const { text, rows, whole } = rangeText(sheet, range)
    if (!text.trim()) {
      useToasts.getState().push({ message: 'Las celdas seleccionadas están vacías.', kind: 'error' })
      return
    }
    // What did not fit is said twice: to the person, and inside the prompt, so the answer cannot be written as
    // if it had seen the whole selection.
    const note = whole ? '' : `\n\n(De la selección solo caben aquí las primeras ${rows} filas con contenido; no las viste todas.)`
    if (!whole) {
      useToasts.getState().push({ message: `La selección no cabe entera: le mando las primeras ${rows} filas.`, kind: 'info' })
    }
    useSession.getState().setOpen(true)
    void useSession.getState().send(`${rangeLead(intent, name, sheet.name, rangeLabel(range))}\n\n"""\n${text}\n"""${note}`)
  }

  /**
   * The menu floats centered on the selection and then gets pushed back inside the grid. Its width was assumed
   * to be about 480 px, so in a window at the minimum 360 the last two actions fell outside the frame and could
   * not be clicked. Measured before the browser paints, and allowed to wrap when even that is not enough.
   */
  useLayoutEffect(() => {
    const el = menuRef.current
    const anchor = range?.anchor
    if (!el || !anchor) return
    const half = el.offsetWidth / 2 + 6
    el.style.left = `${Math.min(Math.max(anchor.x, half), Math.max(anchor.width - half, half))}px`
  }, [range])

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
        // Dates as serial numbers with their mask (no cellDates): a date read as text could not survive a save.
        const wb = read(buffer, { type: 'array', cellNF: true })
        const parsed = wb.SheetNames.map((n, i) => fromSheetJs(wb.Sheets[n], n, i))
        if (alive) {
          const loaded = parsed.map((p) => p.sheet)
          latest.current = loaded
          source.current = { wb, windows: Object.fromEntries(parsed.map((p) => [p.sheet.id ?? '', { rows: p.sheet.row ?? 0, cols: p.sheet.column ?? 0 }])) }
          const cut = parsed.filter((p) => p.trimmed)
          // Being shown cut is a lasting condition of this sheet, not an event that passes: it stays in the bar.
          const many = cut.length > 1
          setTrimNote(cut.length ? `${cut.map((p) => `«${p.sheet.name}»`).join(', ')} se carga${many ? 'n' : ''} recortada${many ? 's' : ''}: lo que quedó fuera del editor se conserva al guardar.` : null)
          settled.current = false
          setSheets(loaded)
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

  // Closing a window is not a decision to throw away what was typed, and nothing here asks. So it saves.
  useEffect(
    () => () => {
      if (!dirtyRef.current || !latest.current) return
      const format = formatFor(name)
      const buffer = toSheetJs(source.current, latest.current, format.bookType)
      void fs.writeBlob(nodeId, new Blob([buffer], { type: format.mime })).catch(() => undefined)
    },
    [nodeId, name],
  )

  const save = async () => {
    if (!latest.current) return
    setSaving(true)
    // Flattening the workbook blocks this thread for seconds on a large file. Two frames to the browser first,
    // so the spinner is actually on screen: without them the button looked like it had done nothing at all.
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
    try {
      const format = formatFor(name)
      const buffer = toSheetJs(source.current, latest.current, format.bookType)
      const stamp = await fs.writeBlob(nodeId, new Blob([buffer], { type: format.mime }))
      onSaved?.(stamp)
      dirtyRef.current = false
      setDirty(false)
      // Macros are never read, so they cannot be written back. Silence there would be a lie by omission.
      const macros = extOf(name) === 'xlsm' ? ' Las macros no se guardan: quedan los datos y las fórmulas.' : ''
      useToasts.getState().push({ message: `${name} guardado.${macros}`, kind: 'info' })
    } catch (err) {
      // These failures come out of libraries, in English, and the toast repeated them word for word.
      const detail = err instanceof Error ? err.message : ''
      const why = /already exists/i.test(detail)
        ? ' Hay dos hojas cuyo nombre queda igual al recortarlo a 31 caracteres.'
        : /cannot contain|invalid/i.test(detail)
          ? ' El nombre de alguna hoja lleva caracteres que Excel no acepta.'
          : /quota/i.test(detail)
            ? ' Ya no queda espacio en este navegador.'
            : ''
      if (detail) console.warn('[hoja] no se pudo guardar:', detail)
      useToasts.getState().push({ message: `No pude guardar ${name}.${why}`, kind: 'error' })
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
        {trimNote && (
          <span className="max-w-[55%] truncate text-[11.5px] text-ink-3" title={trimNote}>
            {trimNote}
          </span>
        )}
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
          hooks={hooks}
          onChange={onGridChange}
        />
        {range && aiReady && (
          <div
            ref={menuRef}
            data-selection-menu
            style={range.anchor ? { left: range.anchor.x, top: range.anchor.y } : { left: '50%', top: 8 }}
            className={cn(
              'glass absolute z-20 flex max-w-[calc(100%-16px)] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 rounded-xl p-1 shadow-win',
              range.anchor && !range.anchor.below && '-translate-y-full',
            )}
          >
            <span className="px-2 text-[11.5px] tabular-nums text-ink-3">
              {rangeLabel(range)} · {(range.rows[1] - range.rows[0] + 1) * (range.cols[1] - range.cols[0] + 1)} celdas
              {range.rows[1] - range.rows[0] + 1 > MAX_SELECTED_ROWS && ` · le mando las primeras ${MAX_SELECTED_ROWS}`}
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
