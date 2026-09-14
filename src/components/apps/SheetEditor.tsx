import { useEffect, useRef, useState } from 'react'
import { Workbook } from '@fortune-sheet/react'
import type { Cell, CellMatrix, CellWithRowAndCol, Sheet } from '@fortune-sheet/core'
import '@fortune-sheet/react/dist/index.css'
import { read, utils, write, type CellObject, type WorkSheet } from 'xlsx'
import { Loader2, Save } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { useToasts } from '../../kernel/commands'
import { cn } from '../../lib/utils'

/**
 * Excel inside Sky: SheetJS reads the workbook, FortuneSheet turns it into a live grid (tabs, formulas,
 * formats, filters) the person can edit, and "Guardar" writes it back to the same file. Loaded on demand:
 * the grid is a big dependency and most sessions never open a spreadsheet.
 */

const MIN_ROWS = 40
const MIN_COLS = 26
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

export default function SheetEditor({ blob, nodeId, name }: { blob: Blob; nodeId: string; name: string }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const latest = useRef<Sheet[] | null>(null)
  // FortuneSheet reports a change while it lays the workbook out; only edits after that count as the person's.
  const settled = useRef(false)

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
    <div className="flex h-full flex-col">
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
      <div className="sheet-editor min-h-0 flex-1">
        <Workbook
          data={sheets}
          lang="es"
          allowEdit
          showToolbar
          showFormulaBar
          showSheetTabs
          onChange={(data) => {
            latest.current = data
            if (settled.current) setDirty(true)
          }}
        />
      </div>
    </div>
  )
}
