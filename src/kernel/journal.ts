import { db } from './db'
import { useJournal, type Inverse, type JournalEntry } from './commands'

/**
 * The journal on disk. Undo is only a promise if it outlives the tab: an inverse written down as a command and
 * its parameters can be saved, so what happened yesterday can still be taken back today. Two things are left
 * behind on purpose — inverses that only mean something while this desktop is open (window geometry, which the
 * reload already re-fitted) and inverses too heavy to carry (a whole document's previous text). Those entries
 * still come back, as history: the interface says so instead of offering a button that would do nothing.
 */

/** How many entries survive a reload. Enough to cover a day of work, small enough to load in one go. */
const KEEP = 80
/** Older than this and an undo is usually meaningless: the world moved on. */
const MAX_AGE_MS = 7 * 24 * 3_600_000
/** An inverse fatter than this is not worth carrying between sessions. */
const MAX_INVERSE_BYTES = 256 * 1024
const SAVE_DELAY_MS = 500

const weight = (inv: Inverse): number => {
  try {
    return JSON.stringify(inv).length
  } catch {
    return Infinity
  }
}

/**
 * The entry as it will come back tomorrow: same words, and the inverse only when it will still work. Built
 * field by field on purpose — whatever goes into the database has to survive being cloned.
 */
function storable(entry: JournalEntry): JournalEntry {
  const row: JournalEntry = {
    id: entry.id,
    commandId: entry.commandId,
    label: entry.label,
    at: entry.at,
    source: entry.source,
    undone: entry.undone,
  }
  if (entry.runId) row.runId = entry.runId
  if (entry.external) row.external = true
  if (entry.undo && !entry.ephemeral && weight(entry.undo) <= MAX_INVERSE_BYTES) row.undo = entry.undo
  return row
}

let written = new Map<string, string>()
let timer: number | undefined
let loaded = false

/** Writes what changed and nothing else: the journal grows all day and most of it is already on disk. */
async function flush(): Promise<void> {
  const entries = useJournal.getState().entries
  const rows: JournalEntry[] = []
  const next = new Map<string, string>()
  for (const entry of entries.slice(-KEEP)) {
    const row = storable(entry)
    const print = `${row.undone}·${row.undo ? weight(row.undo) : 0}`
    next.set(row.id, print)
    if (written.get(row.id) !== print) rows.push(row)
  }
  written = next
  try {
    if (rows.length) await db.journal.bulkPut(rows)
    const cutoff = Date.now() - MAX_AGE_MS
    const stale = await db.journal.where('at').below(cutoff).primaryKeys()
    const extra = await db.journal.orderBy('at').reverse().offset(KEEP).primaryKeys()
    if (stale.length || extra.length) await db.journal.bulkDelete([...stale, ...extra])
  } catch {
    // A row that cannot be cloned (rare, and never from our own commands) must not take the journal down.
  }
}

function save(): void {
  if (!loaded) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
}

/** Brings back what was done before this reload and then keeps the journal in step. Returns the cleanup. */
export async function startJournal(): Promise<() => void> {
  try {
    const rows = await db.journal.orderBy('at').reverse().limit(KEEP).toArray()
    if (rows.length) {
      useJournal.getState().adopt(rows.reverse().map((r) => ({ ...r, restored: true })))
      for (const r of rows) written.set(r.id, `${r.undone}·${r.undo ? weight(r.undo) : 0}`)
    }
  } catch {
    // An unreadable journal is history lost, not a broken desktop.
  }
  loaded = true
  return useJournal.subscribe(save)
}

/** Forgets everything that was done. Each account keeps its own journal, in its own database. */
export async function clearJournal(): Promise<void> {
  useJournal.getState().clear()
  written = new Map()
  await db.journal.clear()
}
