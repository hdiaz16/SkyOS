import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { runAgent } from './agent'
import { getProvider } from './providers'
import type { Attachment, ServerTool } from './types'
import { fs } from '../kernel/fs'
import { ROOT_ID, fileKind, type FsNode } from '../kernel/types'
import { useWindows } from '../state/windows'
import { formatBytes } from '../lib/utils'

/**
 * Focused, single-shot AI jobs that produce a document rather than a conversation:
 * folder summaries, file transformations, page key points. Each one streams into a Result window.
 */

export type TaskKind = 'summary' | 'transform' | 'keypoints' | 'generic'

export interface TaskContext {
  /** Folder the result may be saved into. */
  folderId?: string
  /** File a transformation applies to. */
  nodeId?: string
  /** Suggested file name when saving. */
  saveAs?: string
  url?: string
}

export interface Task {
  id: string
  kind: TaskKind
  title: string
  status: 'running' | 'done' | 'error' | 'stopped'
  text: string
  statusMessage?: string
  error?: string
  runId?: string
  context: TaskContext
  controller: AbortController | null
}

interface TasksState {
  tasks: Record<string, Task>
  upsert: (task: Task) => void
  patch: (id: string, patch: Partial<Task> | ((t: Task) => Partial<Task>)) => void
  stop: (id: string) => void
  remove: (id: string) => void
}

export const useTasks = create<TasksState>((set, get) => ({
  tasks: {},
  upsert: (task) => set((s) => ({ tasks: { ...s.tasks, [task.id]: task } })),
  patch: (id, patch) =>
    set((s) => {
      const t = s.tasks[id]
      if (!t) return s
      return { tasks: { ...s.tasks, [id]: { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } } }
    }),
  stop: (id) => get().tasks[id]?.controller?.abort(),
  remove: (id) => {
    get().tasks[id]?.controller?.abort()
    set((s) => {
      const next = { ...s.tasks }
      delete next[id]
      return { tasks: next }
    })
  },
}))

interface StartTaskOptions {
  kind: TaskKind
  title: string
  prompt: string
  extraSystem: string
  attachments?: Attachment[]
  serverTools?: ServerTool[]
  context?: TaskContext
  /** Open a Result window for this task (default true). */
  openWindow?: boolean
}

/** Starts a task, opens its window and streams the model's answer into it. Returns the task id. */
export function startTask(opts: StartTaskOptions): string {
  const id = nanoid(6)
  const controller = new AbortController()
  useTasks.getState().upsert({
    id,
    kind: opts.kind,
    title: opts.title,
    status: 'running',
    text: '',
    context: opts.context ?? {},
    controller,
  })
  if (opts.openWindow !== false) {
    useWindows.getState().open('result', { title: opts.title, props: { taskId: id } })
  }

  let pending = ''
  let frame: number | null = null
  const flush = () => {
    frame = null
    if (!pending) return
    const chunk = pending
    pending = ''
    useTasks.getState().patch(id, (t) => ({ text: t.text + chunk, statusMessage: undefined }))
  }

  void runAgent({
    prompt: opts.prompt,
    extraSystem: opts.extraSystem,
    attachments: opts.attachments,
    serverTools: opts.serverTools,
    tools: [],
    withoutState: true,
    signal: controller.signal,
    onEvent: (e) => {
      if (e.type === 'text') {
        pending += e.delta
        if (frame === null) frame = requestAnimationFrame(flush)
      } else if (e.type === 'status') {
        useTasks.getState().patch(id, { statusMessage: e.message })
      }
    },
  })
    .then((result) => {
      if (frame !== null) cancelAnimationFrame(frame)
      flush()
      useTasks.getState().patch(id, {
        text: result.text,
        status: result.stopReason === 'aborted' ? 'stopped' : 'done',
        runId: result.runId,
        controller: null,
        statusMessage: undefined,
      })
    })
    .catch((err: unknown) => {
      if (frame !== null) cancelAnimationFrame(frame)
      flush()
      useTasks.getState().patch(id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Algo salió mal',
        controller: null,
        statusMessage: undefined,
      })
    })

  return id
}

const MAX_FILES = 25
const MAX_CHARS_PER_FILE = 12000
const MAX_TOTAL_CHARS = 120000
const MAX_PDFS = 3
const MAX_PDF_BYTES = 4 * 1024 * 1024

async function collectFiles(folderId: string, depth: number, out: FsNode[]): Promise<void> {
  const items = await fs.list(folderId)
  for (const n of items) {
    if (out.length >= MAX_FILES) return
    if (n.kind === 'folder') {
      if (depth > 0) await collectFiles(n.id, depth - 1, out)
    } else out.push(n)
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Reads a folder's documents and asks for a report, without opening any of them. */
export async function summarizeFolder(folderId: string): Promise<string> {
  const folder = folderId === ROOT_ID ? null : await fs.get(folderId)
  const folderName = folder?.name ?? 'Escritorio'
  const files: FsNode[] = []
  await collectFiles(folderId, 2, files)

  const sections: string[] = []
  const attachments: Attachment[] = []
  const skipped: string[] = []
  let budget = MAX_TOTAL_CHARS
  const provider = getProvider()
  let pdfs = 0

  for (const f of files) {
    const kind = fileKind(f)
    if (kind === 'text' && budget > 0) {
      const text = (await fs.readText(f.id)).slice(0, Math.min(MAX_CHARS_PER_FILE, budget))
      budget -= text.length
      sections.push(`### ${f.name}\n${text}`)
    } else if (kind === 'pdf' && provider?.capabilities.documents && pdfs < MAX_PDFS && f.size <= MAX_PDF_BYTES) {
      const blob = await fs.readBlob(f.id)
      if (blob) {
        attachments.push({ type: 'document', mediaType: 'application/pdf', data: await blobToBase64(blob), title: f.name })
        pdfs++
      }
    } else {
      skipped.push(`${f.name} (${kind}, ${formatBytes(f.size)})`)
    }
  }

  const prompt = [
    `Carpeta: "${folderName}" con ${files.length} archivo${files.length === 1 ? '' : 's'}.`,
    sections.length ? `Contenido de los archivos de texto:\n\n${sections.join('\n\n')}` : 'No hay archivos de texto legibles.',
    attachments.length ? `Además se adjuntan ${attachments.length} PDF.` : '',
    skipped.length ? `Archivos no leídos (solo nombre): ${skipped.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  return startTask({
    kind: 'summary',
    title: `Resumen · ${folderName}`,
    prompt,
    attachments,
    extraSystem:
      'Tarea: resumir el contexto de una carpeta para alguien que no quiere abrir los archivos. Responde en Markdown breve con estas secciones: "Qué hay aquí" (2-3 frases), "Temas" (viñetas), "Fechas, pendientes y cifras" (viñetas, solo si aparecen) y "Sugerencias" (máximo 3, concretas). No inventes nada que no esté en los archivos; si algo no se pudo leer, dilo en una línea.',
    context: { folderId, saveAs: `Resumen de ${folderName}.md` },
  })
}

export interface TransformPreset {
  id: string
  label: string
  instruction: string
}

export const TRANSFORM_PRESETS: TransformPreset[] = [
  { id: 'en', label: 'Traducir al inglés', instruction: 'Traduce el texto al inglés conservando formato y tono.' },
  { id: 'es', label: 'Traducir al español', instruction: 'Traduce el texto al español natural de México conservando formato y tono.' },
  { id: 'pro', label: 'Tono profesional', instruction: 'Reescribe el texto con un tono profesional y claro, sin cambiar el significado ni omitir información.' },
  { id: 'short', label: 'Resumir', instruction: 'Resume el texto a lo esencial, en Markdown, con la mitad de extensión o menos.' },
  { id: 'fix', label: 'Corregir ortografía y gramática', instruction: 'Corrige ortografía, gramática y puntuación sin cambiar el estilo ni el contenido.' },
  { id: 'json', label: 'Convertir a JSON', instruction: 'Convierte la información del texto en un JSON bien estructurado y válido. Devuelve solo el JSON.' },
]

/** Runs an instruction over a text file and shows the result as a preview the user can apply. */
export async function transformFile(nodeId: string, instruction: string, label?: string): Promise<string> {
  const node = await fs.get(nodeId)
  if (!node) throw new Error('El archivo ya no existe')
  const text = await fs.readText(nodeId)
  if (!text.trim()) throw new Error('El archivo está vacío')

  return startTask({
    kind: 'transform',
    title: `${label ?? 'Transformar'} · ${node.name}`,
    prompt: `Instrucción: ${instruction}\n\nArchivo "${node.name}":\n\n${text.slice(0, 60000)}`,
    extraSystem:
      'Tarea: transformar el contenido de un archivo según la instrucción. Devuelve únicamente el texto resultante, listo para guardarse en el archivo: sin explicaciones, sin comillas envolventes ni bloques de código, salvo que el resultado sea código o JSON.',
    context: { nodeId, folderId: node.parentId, saveAs: node.name },
  })
}
