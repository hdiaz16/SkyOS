import { create } from 'zustand'
import { nanoid } from 'nanoid'

/** Who asked for the command. The AI and the user share the same command surface. */
export type Source = 'user' | 'ai' | 'system'

export interface CommandContext {
  source: Source
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
  run: (params: P, ctx: CommandContext) => Promise<CommandOutcome<R>>
}

export interface JournalEntry {
  id: string
  commandId: string
  label: string
  at: number
  source: Source
  undo?: () => Promise<void>
  undone: boolean
}

export interface Toast {
  id: string
  message: string
  kind: 'info' | 'error'
  entryId?: string
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
  push: (entry) => set((s) => ({ entries: [...s.entries.slice(-99), entry] })),
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
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export async function dispatch<R = unknown>(
  id: string,
  params: unknown = {},
  ctx: CommandContext = { source: 'user' },
): Promise<R> {
  const def = registry.get(id)
  if (!def) throw new Error(`Comando desconocido: ${id}`)
  try {
    const out = await def.run(params, ctx)
    if (out.label) {
      const entry: JournalEntry = {
        id: nanoid(8),
        commandId: id,
        label: out.label,
        at: Date.now(),
        source: ctx.source,
        undo: out.undo,
        undone: false,
      }
      useJournal.getState().push(entry)
      useToasts.getState().push({ message: out.label, kind: 'info', entryId: out.undo ? entry.id : undefined })
    }
    return out.result as R
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Algo salió mal'
    useToasts.getState().push({ message, kind: 'error' })
    throw err
  }
}

export async function undoEntry(entryId: string): Promise<boolean> {
  const entry = useJournal.getState().entries.find((e) => e.id === entryId)
  if (!entry || entry.undone || !entry.undo) return false
  await entry.undo()
  useJournal.getState().markUndone(entryId)
  useToasts.getState().push({ message: `Deshecho: ${entry.label}`, kind: 'info' })
  return true
}

export async function undoLast(): Promise<boolean> {
  const entry = [...useJournal.getState().entries].reverse().find((e) => !e.undone && e.undo)
  return entry ? undoEntry(entry.id) : false
}
