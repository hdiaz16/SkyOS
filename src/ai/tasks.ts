import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { runAgent } from './agent'
import { getProvider } from './providers'
import { useAiSettings } from './settings'
import type { Attachment, ServerTool } from './types'
import { fs } from '../kernel/fs'
import { ROOT_ID, fileKind, type FsNode } from '../kernel/types'
import { useWindows } from '../state/windows'
import { formatBytes } from '../lib/utils'
import { useJobs } from '../system/jobs'
import { textOf } from '../system/extract'

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

export interface TaskRunOptions {
  /** No window now: the task runs on its own and a card offers the result when it is ready. */
  background?: boolean
}

/** Whether the task's Result window is the one on top; if not, finishing deserves a card. */
function resultVisible(taskId: string): boolean {
  const { windows } = useWindows.getState()
  const win = windows.find((w) => w.props.taskId === taskId)
  if (!win || win.minimized) return false
  let top: (typeof windows)[number] | undefined
  for (const w of windows) if (!w.minimized && (!top || w.z > top.z)) top = w
  return top?.id === win.id
}

/** Brings the task's Result window to the front, opening one if it was never shown. */
function showResult(taskId: string, title: string): void {
  const wm = useWindows.getState()
  const win = wm.windows.find((w) => w.props.taskId === taskId)
  if (win) wm.focus(win.id)
  else wm.open('result', { title, props: { taskId } })
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
  useJobs.getState().start({ id, kind: 'ai', title: opts.title, detail: 'Sky está trabajando…' })
  const open = () => showResult(id, opts.title)

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
      const aborted = result.stopReason === 'aborted'
      useTasks.getState().patch(id, {
        text: result.text,
        status: aborted ? 'stopped' : 'done',
        runId: result.runId,
        controller: null,
        statusMessage: undefined,
      })
      useJobs.getState().finish(id, { detail: aborted ? 'Detenida' : 'Resultado listo', open, quiet: aborted || resultVisible(id) })
    })
    .catch((err: unknown) => {
      if (frame !== null) cancelAnimationFrame(frame)
      flush()
      const message = err instanceof Error ? err.message : 'Algo salió mal'
      useTasks.getState().patch(id, {
        status: 'error',
        error: message,
        controller: null,
        statusMessage: undefined,
      })
      useJobs.getState().finish(id, { error: message, open, quiet: resultVisible(id) })
    })

  return id
}

const MAX_FILES = 25
const MAX_CHARS_PER_FILE = 12000
const MAX_TOTAL_CHARS = 120000
/** Metered free tiers (Groq: 8k tokens per minute) get a budget that leaves room for the answer. */
const METERED_CHARS_PER_FILE = 3000
const METERED_TOTAL_CHARS = 10000
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

interface Gathered {
  sections: string[]
  attachments: Attachment[]
  skipped: string[]
}

/** What the model can use from a set of files: text inline within budget (documents through their extracted text), PDFs attached when the provider reads them natively, the rest by name. */
async function gather(files: FsNode[]): Promise<Gathered> {
  const sections: string[] = []
  const attachments: Attachment[] = []
  const skipped: string[] = []
  const metered = useAiSettings.getState().provider === 'groq'
  const perFile = metered ? METERED_CHARS_PER_FILE : MAX_CHARS_PER_FILE
  let budget = metered ? METERED_TOTAL_CHARS : MAX_TOTAL_CHARS
  const provider = getProvider()
  let pdfs = 0

  for (const f of files) {
    const kind = fileKind(f)
    if (kind === 'text' && budget > 0) {
      const whole = await fs.readText(f.id).catch(() => '')
      const text = whole.slice(0, Math.min(perFile, budget))
      budget -= text.length
      // A summary that only saw the first three thousand characters must not read as if it had seen the
      // whole file: the cut is written down where the model, and later the person, can see it.
      const cut = text.length < whole.length ? `\n…[recortado: se leyeron ${text.length} de ${whole.length} caracteres]` : ''
      sections.push(`### ${f.name}\n${text}${cut}`)
    } else if (kind === 'pdf' && provider?.capabilities.documents && pdfs < MAX_PDFS && f.size <= MAX_PDF_BYTES) {
      const blob = await fs.readBlob(f.id)
      if (blob) {
        attachments.push({ type: 'document', mediaType: 'application/pdf', data: await blobToBase64(blob), title: f.name })
        pdfs++
      }
    } else if (kind !== 'text' && budget > 0 && (await textOf(f))?.trim()) {
      const text = ((await textOf(f)) ?? '').slice(0, Math.min(perFile, budget))
      budget -= text.length
      sections.push(`### ${f.name}\n${text}`)
    } else {
      skipped.push(`${f.name} (${kind}, ${formatBytes(f.size)})`)
    }
  }
  return { sections, attachments, skipped }
}

function describeInput(lead: string, files: FsNode[], g: Gathered): string {
  return [
    `${lead} con ${files.length} archivo${files.length === 1 ? '' : 's'}.`,
    g.sections.length ? `Contenido de los archivos de texto:\n\n${g.sections.join('\n\n')}` : 'No hay archivos de texto legibles.',
    g.attachments.length ? `Además se adjuntan ${g.attachments.length} PDF.` : '',
    g.skipped.length ? `Archivos no leídos (solo nombre): ${g.skipped.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Reads a folder's documents and asks for a report, without opening any of them. */
export async function summarizeFolder(folderId: string, opts: TaskRunOptions = {}): Promise<string> {
  const folder = folderId === ROOT_ID ? null : await fs.get(folderId)
  const folderName = folder?.name ?? 'Escritorio'
  const files: FsNode[] = []
  await collectFiles(folderId, 2, files)
  const g = await gather(files)

  return startTask({
    kind: 'summary',
    title: `Resumen · ${folderName}`,
    prompt: describeInput(`Carpeta: "${folderName}"`, files, g),
    attachments: g.attachments,
    openWindow: !opts.background,
    extraSystem:
      'Tarea: resumir el contexto de una carpeta para alguien que no quiere abrir los archivos. Responde en Markdown breve con estas secciones: "Qué hay aquí" (2-3 frases), "Temas" (viñetas), "Fechas, pendientes y cifras" (viñetas, solo si aparecen) y "Sugerencias" (máximo 3, concretas). No inventes nada que no esté en los archivos; si algo no se pudo leer, dilo en una línea.',
    context: { folderId, saveAs: `Resumen de ${folderName}.md` },
  })
}

/** The files behind a selection: files as they are, folders through their direct files. */
async function selectedFiles(ids: string[]): Promise<FsNode[]> {
  const out: FsNode[] = []
  for (const id of ids) {
    const node = await fs.get(id)
    if (!node || node.trashedAt !== null) continue
    if (node.kind === 'folder') await collectFiles(node.id, 1, out)
    else if (out.length < MAX_FILES) out.push(node)
  }
  return out
}

/** The folder every file shares, when there is one, so the result can be saved next to them. */
function commonFolder(files: FsNode[]): string | undefined {
  const first = files[0]?.parentId
  return first !== undefined && files.every((f) => f.parentId === first) ? first : undefined
}

const plural = (n: number) => `${n} archivo${n === 1 ? '' : 's'}`

/** One document out of several: what they say together, where they agree or clash, what matters now. */
export async function synthesizeFiles(ids: string[], opts: TaskRunOptions = {}): Promise<string> {
  const files = await selectedFiles(ids)
  if (!files.length) throw new Error('No hay archivos que leer en la selección')
  const g = await gather(files)
  return startTask({
    kind: 'summary',
    title: `Síntesis · ${plural(files.length)}`,
    prompt: describeInput('Selección de archivos', files, g),
    attachments: g.attachments,
    openWindow: !opts.background,
    extraSystem:
      'Tarea: sintetizar varios archivos en un solo documento para alguien que no quiere abrirlos uno por uno. Responde en Markdown con: "En conjunto" (2-4 frases que unan las piezas), "Por archivo" (una viñeta por archivo con lo esencial), "Coincidencias y contradicciones" (solo si las hay) y "Lo que importa ahora" (máximo 3 viñetas). No inventes nada que no esté en los archivos; si algo no se pudo leer, dilo en una línea.',
    context: { folderId: commonFolder(files), saveAs: 'Síntesis.md' },
  })
}

/** A checklist of the commitments, pending items and dates scattered across the files. */
export async function tasksFromFiles(ids: string[], opts: TaskRunOptions = {}): Promise<string> {
  const files = await selectedFiles(ids)
  if (!files.length) throw new Error('No hay archivos que leer en la selección')
  const g = await gather(files)
  return startTask({
    kind: 'summary',
    title: `Pendientes · ${plural(files.length)}`,
    prompt: describeInput('Selección de archivos', files, g),
    attachments: g.attachments,
    openWindow: !opts.background,
    extraSystem:
      'Tarea: extraer los pendientes, compromisos y fechas que aparecen en los archivos. Responde en Markdown con una lista de tareas ("- [ ] …"), agrupada por archivo cuando ayude; cada tarea con su fecha o responsable si aparece. Cierra con "Sin fecha" para lo que no la tiene. Nada que no esté en los archivos; si algo no se pudo leer, dilo en una línea.',
    context: { folderId: commonFolder(files), saveAs: 'Pendientes.md' },
  })
}

/** Asks Claude to read a page on the server side (web_fetch) and return its key points. */
export function keyPointsForUrl(url: string): string {
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    /* keep raw */
  }
  return startTask({
    kind: 'keypoints',
    title: `Puntos clave · ${host}`,
    prompt: `Lee esta página con la herramienta web_fetch y extrae lo importante: ${url}`,
    serverTools: ['web_fetch'],
    extraSystem:
      'Tarea: resumir una página web para alguien con prisa. Usa web_fetch para leer la URL. Responde en Markdown: una línea con de qué trata, luego "Puntos clave" con 4 a 7 viñetas concretas (cifras, nombres, fechas si aparecen) y, si aplica, "Para tener en cuenta" con máximo 2 viñetas. Si la página no se pudo leer, dilo en una línea y no inventes.',
    context: { url, saveAs: `Puntos clave - ${host}.md` },
    openWindow: false,
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
