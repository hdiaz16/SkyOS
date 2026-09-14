import { create } from 'zustand'
import { nanoid } from 'nanoid'

/** Who asked for the command. The AI and the user share the same command surface. */
export type Source = 'user' | 'ai' | 'system'

export interface CommandContext {
  source: Source
  /** Groups every entry produced by one AI run so the whole run can be undone at once. */
  runId?: string
}

export interface CommandOutcome<R = unknown> {
  result: R
  /** Human-readable summary. When present the command is journaled and shown as a toast. */
  label?: string
  /** Reverts the command. When present the journal entry becomes undoable. */
  undo?: () => Promise<void>
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
  undo?: () => Promise<void>
  undone: boolean
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
}

export const useJournal = create<JournalState>((set) => ({
  entries: [],
  push: (entry) => set((s) => ({ entries: [...s.entries.slice(-199), entry] })),
  markUndone: (id) =>
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, undone: true } : e)) })),
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

export async function undoEntry(entryId: string, quiet = false): Promise<boolean> {
  const entry = useJournal.getState().entries.find((e) => e.id === entryId)
  if (!entry || entry.undone || !entry.undo) return false
  await entry.undo()
  useJournal.getState().markUndone(entryId)
  if (!quiet) useToasts.getState().push({ message: `Deshecho: ${entry.label}`, kind: 'info' })
  return true
}

export async function undoLast(): Promise<boolean> {
  const entry = [...useJournal.getState().entries].reverse().find((e) => !e.undone && e.undo)
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
