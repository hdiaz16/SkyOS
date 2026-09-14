import { registerCommand } from '../commands'
import { summarizeFolder, synthesizeFiles, tasksFromFiles } from '../../ai/tasks'
import { finishedJobs, runningJobs, useJobs, type Job } from '../../system/jobs'

/**
 * Work Sky can hand to the background: it answers right away, the job runs on its own and a card announces
 * the result. The person keeps working in the meantime.
 */

const TASK_WORDS = [
  'segundo plano', 'de fondo', 'en el fondo', 'sintetiza', 'sintetizar', 'síntesis', 'sintesis', 'pendientes', 'compromisos',
  'resume la carpeta', 'resumen de la carpeta', 'resume estos', 'resume los', 'resume todos', 'mientras', 'avísame', 'avisame',
  'cuando termines', 'cuando acabes', 'tarea', 'tareas', 'trabajando', 'progreso', 'qué haces', 'que haces', 'leyendo',
]

const BACKGROUND_REPLY = 'En marcha en segundo plano; una tarjeta avisará cuando el resultado esté listo.'

registerCommand<{ ids: string[] }, string>({
  id: 'tasks.synthesize',
  title: 'Sintetizar archivos en segundo plano',
  description:
    'Lee varios archivos (o carpetas) y produce un documento que los une: qué dicen en conjunto, lo esencial de cada uno, coincidencias y lo que importa ahora. Corre en segundo plano: responde de inmediato y la persona recibe una tarjeta con el resultado al terminar. Úsalo cuando pidan sintetizar, unir o comparar varios archivos.',
  params: {
    ids: { type: 'array', items: { type: 'string', description: 'Id' }, description: 'Ids de archivos o carpetas (la selección o la carpeta activa, normalmente).', required: true },
  },
  keywords: TASK_WORDS,
  async run({ ids }) {
    await synthesizeFiles(ids, { background: true })
    return { result: BACKGROUND_REPLY }
  },
})

registerCommand<{ ids: string[] }, string>({
  id: 'tasks.pending',
  title: 'Extraer pendientes en segundo plano',
  description:
    'Lee varios archivos (o carpetas) y produce una lista de tareas con los pendientes, compromisos y fechas que aparecen en ellos. Corre en segundo plano y avisa al terminar.',
  params: {
    ids: { type: 'array', items: { type: 'string', description: 'Id' }, description: 'Ids de archivos o carpetas.', required: true },
  },
  keywords: TASK_WORDS,
  async run({ ids }) {
    await tasksFromFiles(ids, { background: true })
    return { result: BACKGROUND_REPLY }
  },
})

registerCommand<{ folderId: string }, string>({
  id: 'tasks.summarizeFolder',
  title: 'Resumir carpeta en segundo plano',
  description:
    'Lee los documentos de una carpeta (dos niveles) y redacta un resumen: qué hay, temas, fechas y cifras, sugerencias. Corre en segundo plano y avisa al terminar. Para el escritorio usa el id root.',
  params: { folderId: { type: 'string', description: 'Id de la carpeta.', required: true } },
  keywords: TASK_WORDS,
  async run({ folderId }) {
    await summarizeFolder(folderId, { background: true })
    return { result: BACKGROUND_REPLY }
  },
})

const describe = (j: Job) => ({
  title: j.title,
  status: j.status === 'running' ? 'en curso' : j.status === 'done' ? 'terminado' : 'con error',
  progress: j.progress !== undefined && j.status === 'running' ? `${Math.round(j.progress * 100)}%` : undefined,
  detail: j.detail,
  ago: `${Math.max(1, Math.round((Date.now() - (j.finishedAt ?? j.startedAt)) / 60_000))} min`,
})

registerCommand<Record<string, never>, { running: ReturnType<typeof describe>[]; recent: ReturnType<typeof describe>[] }>({
  id: 'system.jobs',
  title: 'Qué hace Sky en segundo plano',
  description: 'Lista los trabajos en curso (lectura de documentos, índices, tareas de IA) con su progreso, y los terminados recientemente.',
  params: {},
  keywords: TASK_WORDS,
  async run() {
    const jobs = useJobs.getState().jobs
    return { result: { running: runningJobs(jobs).map(describe), recent: finishedJobs(jobs).slice(0, 6).map(describe) } }
  },
})
