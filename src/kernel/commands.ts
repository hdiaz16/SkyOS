import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { play } from '../system/sound'

/** Who asked for the command. The AI and the user share the same command surface. */
export type Source = 'user' | 'ai' | 'system'

export interface CommandContext {
  source: Source
  /** Groups every entry produced by one AI run so the whole run can be undone at once. */
  runId?: string
}

/**
 * How to revert a command: the name of another command and its parameters. Saying the inverse instead of
 * closing over it is what lets the journal be written to disk and still work tomorrow — a function cannot be
 * saved, a sentence can.
 */
export interface Inverse {
  commandId: string
  params: Record<string, unknown>
}

export interface CommandOutcome<R = unknown> {
  result: R
  /** Human-readable summary. When present the command is journaled and shown as a toast. */
  label?: string
  /** How to revert this command. When present the journal entry becomes undoable. */
  undo?: Inverse
  /** The inverse only means something while this desktop stays open: window layout, not files. */
  ephemeral?: boolean
  /** The action reached a service outside this device; here it is history, not something to take back. */
  external?: boolean
}

export interface ParamSpec {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required?: boolean
  items?: ParamSpec
  enum?: string[]
}

export interface CommandDef<P = unknown, R = unknown> {
  id: string
  title: string
  description: string
  params: Record<string, ParamSpec>
  /** Whether the AI may call this command as a tool. Defaults to true. */
  ai?: boolean
  /**
   * Words (lowercase, accents optional) that make this command relevant to a request. When set, the tool is
   * sent to the model only if the request or the recent conversation mentions one of them; commands without
   * keywords always travel. Keeps requests small for providers that meter tokens per minute.
   */
  keywords?: string[]
  run: (params: P, ctx: CommandContext) => Promise<CommandOutcome<R>>
}

export interface JournalEntry {
  id: string
  commandId: string
  label: string
  at: number
  source: Source
  runId?: string
  undo?: Inverse
  /** Undoable only while this desktop stays open; the saved copy keeps the label, not the inverse. */
  ephemeral?: boolean
  /** The action left this device: nothing here can take it back. */
  external?: boolean
  /** Came back from an earlier session. Still undoable, but on purpose from the log, never by a reflex Ctrl+Z. */
  restored?: boolean
  undone: boolean
}

/** What can still be done about an entry, which is what the interface has to show honestly. */
export type Standing = 'undoable' | 'external' | 'history'

export function standingOf(entry: JournalEntry): Standing {
  if (entry.external) return 'external'
  return !entry.undone && entry.undo ? 'undoable' : 'history'
}

export interface Toast {
  id: string
  message: string
  kind: 'info' | 'error'
  entryId?: string
  /** Optional call to action shown as a button (e.g. accept an AI suggestion). */
  action?: { label: string; run: () => void }
  /** Milliseconds before auto-dismiss. Defaults to 5200. */
  duration?: number
}

type AnyCommand = CommandDef<unknown, unknown>

const registry = new Map<string, AnyCommand>()

export function registerCommand<P, R>(def: CommandDef<P, R>): void {
  registry.set(def.id, def as unknown as AnyCommand)
}

export function getCommand(id: string): AnyCommand | undefined {
  return registry.get(id)
}

export function listCommands(): AnyCommand[] {
  return [...registry.values()]
}

interface JournalState {
  entries: JournalEntry[]
  push: (entry: JournalEntry) => void
  markUndone: (id: string) => void
  /** Puts back what was saved from earlier sessions, underneath whatever already happened in this one. */
  adopt: (entries: JournalEntry[]) => void
  clear: () => void
}

export const useJournal = create<JournalState>((set) => ({
  entries: [],
  push: (entry) => set((s) => ({ entries: [...s.entries.slice(-199), entry] })),
  markUndone: (id) =>
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, undone: true } : e)) })),
  adopt: (entries) =>
    set((s) => {
      const known = new Set(s.entries.map((e) => e.id))
      return { entries: [...entries.filter((e) => !known.has(e.id)), ...s.entries].slice(-199) }
    }),
  clear: () => set({ entries: [] }),
}))

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nanoid(6)
    if (toast.kind === 'error') play('error')
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), toast.duration ?? 5200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export interface Execution<R> {
  result: R
  /** Present only when the command produced a journaled (labelled) outcome. */
  entry?: JournalEntry
}

/** Runs a command and returns both its result and the journal entry it produced, if any. */
export async function execute<R = unknown>(
  id: string,
  params: unknown = {},
  ctx: CommandContext = { source: 'user' },
): Promise<Execution<R>> {
  const def = registry.get(id)
  if (!def) throw new Error(`Comando desconocido: ${id}`)
  try {
    const out = await def.run(params, ctx)
    let entry: JournalEntry | undefined
    if (out.label) {
      entry = {
        id: nanoid(8),
        commandId: id,
        label: out.label,
        at: Date.now(),
        source: ctx.source,
        runId: ctx.runId,
        undo: out.undo,
        ...(out.ephemeral ? { ephemeral: true } : {}),
        ...(out.external ? { external: true } : {}),
        undone: false,
      }
      useJournal.getState().push(entry)
      // AI actions are already listed, with their own undo, inside the conversation panel.
      if (ctx.source !== 'ai') {
        useToasts.getState().push({ message: out.label, kind: 'info', entryId: out.undo ? entry.id : undefined })
      }
    }
    return { result: out.result as R, entry }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Algo salió mal'
    if (ctx.source !== 'ai') useToasts.getState().push({ message, kind: 'error' })
    throw err
  }
}

/** Runs a command and returns only its result. */
export async function dispatch<R = unknown>(
  id: string,
  params: unknown = {},
  ctx: CommandContext = { source: 'user' },
): Promise<R> {
  return (await execute<R>(id, params, ctx)).result
}

/** Runs an inverse without journaling it: undoing is not itself an action to undo. */
export async function runInverse(inv: Inverse): Promise<void> {
  const def = registry.get(inv.commandId)
  if (!def) throw new Error(`falta el comando ${inv.commandId}`)
  await def.run(inv.params, { source: 'system' })
}

export async function undoEntry(entryId: string, quiet = false): Promise<boolean> {
  const entry = useJournal.getState().entries.find((e) => e.id === entryId)
  if (!entry || entry.undone || !entry.undo) return false
  try {
    await runInverse(entry.undo)
  } catch (err) {
    // An undo can arrive too late: the file was emptied from the trash, the widget is gone, the window closed.
    // Saying so is better than a button that quietly does nothing.
    const why = err instanceof Error ? err.message : 'ya no es posible'
    useToasts.getState().push({ message: `No pude deshacer ${entry.label}: ${why}`, kind: 'error' })
    return false
  }
  useJournal.getState().markUndone(entryId)
  if (!quiet) useToasts.getState().push({ message: `Deshecho: ${entry.label}`, kind: 'info' })
  return true
}

/**
 * Ctrl+Z walks back through this session only. What was done before the last reload is still undoable, but
 * from the log and by name: a reflex should never reach into yesterday.
 */
export async function undoLast(): Promise<boolean> {
  const entry = [...useJournal.getState().entries].reverse().find((e) => !e.undone && e.undo && !e.restored)
  return entry ? undoEntry(entry.id) : false
}

/** Undoes every reversible entry of an AI run, newest first. Returns how many were undone. */
export async function undoRun(runId: string): Promise<number> {
  const entries = [...useJournal.getState().entries].reverse().filter((e) => e.runId === runId && !e.undone && e.undo)
  let count = 0
  for (const e of entries) {
    if (await undoEntry(e.id, true)) count++
  }
  if (count) useToasts.getState().push({ message: `${count} ${count === 1 ? 'acción deshecha' : 'acciones deshechas'}`, kind: 'info' })
  return count
}

export function runEntries(runId: string): JournalEntry[] {
  return useJournal.getState().entries.filter((e) => e.runId === runId)
}
