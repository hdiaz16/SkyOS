import { fs } from './fs'
import type { FsNode } from './types'

/**
 * A folder is a place; a project is a place that remembers. What it remembers — what we are building, what was
 * decided, what is still open, what happened last — lives in the folder itself, in a Markdown file anyone can
 * read and edit by hand. That way the memory travels with the folder to the cloud and back, survives an export
 * and never depends on this browser being the same browser tomorrow.
 */

export const PROJECT_FILE = 'Proyecto.md'

export interface ProjectMemory {
  folderId: string
  /** The folder's name, which is the project's name. */
  name: string
  /** The file the memory lives in. */
  nodeId: string
  goal: string
  decisions: string[]
  pending: string[]
  done: string[]
  /** Newest last: what happened, one line per session of work. */
  log: string[]
}

export interface ProjectPatch {
  goal?: string
  decisions?: string[]
  pending?: string[]
  /** Items to tick off; matched against what is still open, by text. */
  done?: string[]
  log?: string[]
}

const today = (): string => new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

const HEADINGS: Record<string, keyof Pick<ProjectMemory, 'goal' | 'decisions' | 'pending' | 'log'>> = {
  objetivo: 'goal',
  decisiones: 'decisions',
  pendientes: 'pending',
  bitácora: 'log',
  bitacora: 'log',
}

/**
 * The italics an empty section is filled with, so the file reads well before there is anything to read. They
 * are decoration: whatever is written like this comes back as nothing.
 */
const isPlaceholder = (s: string): boolean => /^_[^_]*_$/.test(s)

/** Forgiving on purpose: this file is meant to be edited by hand, and a stray blank line must not lose a decision. */
export function parseProject(text: string, folder: FsNode, nodeId: string): ProjectMemory {
  const mem: ProjectMemory = { folderId: folder.id, name: folder.name, nodeId, goal: '', decisions: [], pending: [], done: [], log: [] }
  let section: 'goal' | 'decisions' | 'pending' | 'log' | null = null
  const goal: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      section = HEADINGS[heading[1].trim().toLowerCase()] ?? null
      continue
    }
    if (!section || !line || isPlaceholder(line)) continue
    if (section === 'goal') {
      goal.push(line)
      continue
    }
    const item = /^[-*]\s+(.*)$/.exec(line)
    if (!item) continue
    const body = item[1].trim()
    if (isPlaceholder(body)) continue
    if (section === 'pending') {
      const box = /^\[([ xX])\]\s*(.*)$/.exec(body)
      const text = box ? box[2].trim() : body
      if (isPlaceholder(text)) continue
      if (!box || box[1] === ' ') mem.pending.push(text)
      else mem.done.push(text)
    } else {
      mem[section].push(body)
    }
  }
  mem.goal = goal.join(' ')
  return mem
}

export function serializeProject(mem: ProjectMemory): string {
  return [
    `# ${mem.name}`,
    '',
    '## Objetivo',
    mem.goal || '_Por definir._',
    '',
    '## Decisiones',
    ...(mem.decisions.length ? mem.decisions.map((d) => `- ${d}`) : ['- _Ninguna todavía._']),
    '',
    '## Pendientes',
    ...(mem.pending.length || mem.done.length
      ? [...mem.pending.map((p) => `- [ ] ${p}`), ...mem.done.map((d) => `- [x] ${d}`)]
      : ['- [ ] _Por definir._']),
    '',
    '## Bitácora',
    ...(mem.log.length ? mem.log.map((l) => `- ${l}`) : ['- _Sin movimientos._']),
    '',
  ].join('\n')
}

/** The memory file of a folder, if that folder is a project. */
export async function projectFile(folderId: string): Promise<FsNode | undefined> {
  const items = await fs.list(folderId)
  return items.find((n) => n.kind === 'file' && n.name.toLowerCase() === PROJECT_FILE.toLowerCase())
}

/** What this project remembers, or null when the folder is just a folder. */
export async function readProject(folderId: string): Promise<ProjectMemory | null> {
  const folder = await fs.get(folderId)
  if (!folder || folder.kind !== 'folder') return null
  const file = await projectFile(folderId)
  if (!file) return null
  return parseProject(await fs.readText(file.id), folder, file.id)
}

/** Turns a folder into a project: one file, and from then on Sky knows what is being built here. */
export async function startProject(folderId: string, goal = ''): Promise<{ mem: ProjectMemory; created: boolean }> {
  const folder = await fs.get(folderId)
  if (!folder || folder.kind !== 'folder') throw new Error('Un proyecto vive en una carpeta')
  const existing = await projectFile(folderId)
  if (existing) return { mem: parseProject(await fs.readText(existing.id), folder, existing.id), created: false }
  const mem: ProjectMemory = {
    folderId,
    name: folder.name,
    nodeId: '',
    goal: goal.trim(),
    decisions: [],
    pending: [],
    done: [],
    log: [`${today()} · Proyecto iniciado.`],
  }
  const node = await fs.createFile(folderId, PROJECT_FILE, new Blob([serializeProject(mem)], { type: 'text/markdown' }), 'text/markdown')
  return { mem: { ...mem, nodeId: node.id }, created: true }
}

const norm = (s: string): string => s.trim().toLowerCase()

/** Applies a change and returns the file's previous text, which is what an undo needs. */
export async function saveProject(mem: ProjectMemory, patch: ProjectPatch): Promise<{ before: string; after: ProjectMemory }> {
  const before = await fs.readText(mem.nodeId)
  const ticked = (patch.done ?? []).map(norm)
  const stays = mem.pending.filter((p) => !ticked.some((t) => norm(p) === t || norm(p).startsWith(t) || t.startsWith(norm(p))))
  const closed = mem.pending.filter((p) => !stays.includes(p))
  // What was ticked off but never written down as pending still counts as done: the work happened.
  const extra = (patch.done ?? []).filter((d) => !closed.some((c) => norm(c) === norm(d)))
  const after: ProjectMemory = {
    ...mem,
    goal: patch.goal?.trim() || mem.goal,
    decisions: [...mem.decisions, ...(patch.decisions ?? []).map((d) => `${today()} · ${d.trim()}`)],
    pending: [...stays, ...(patch.pending ?? []).map((p) => p.trim()).filter((p) => p && !stays.some((s) => norm(s) === norm(p)))],
    done: [...mem.done, ...closed, ...extra],
    log: [...mem.log, ...(patch.log ?? []).map((l) => `${today()} · ${l.trim()}`)],
  }
  await fs.writeText(mem.nodeId, serializeProject(after))
  return { before, after }
}

/** How many log lines are worth carrying into a request: the last ones are the ones that say where we left off. */
const LOG_TAIL = 3

/** The project in a handful of lines, for the model's picture of the desktop. */
export function summarizeProject(mem: ProjectMemory): string[] {
  const lines = [`Proyecto activo «${mem.name}» (carpeta id ${mem.folderId}).`]
  if (mem.goal) lines.push(`- Objetivo: ${mem.goal}`)
  if (mem.decisions.length) lines.push(`- Decisiones: ${mem.decisions.slice(-4).join(' | ')}`)
  if (mem.pending.length) lines.push(`- Pendientes: ${mem.pending.join(' | ')}`)
  if (mem.log.length) lines.push(`- Últimos avances: ${mem.log.slice(-LOG_TAIL).join(' | ')}`)
  return lines
}
