import { registerCommand } from '../commands'
import { ROOT_ID } from '../types'
import { readProject, saveProject, startProject, type ProjectMemory, type ProjectPatch } from '../project'
import { useWindows } from '../../state/windows'

/**
 * Project memory: the goal, the decisions, what is still open and what happened last. Sky reads it on its own
 * — the active project travels in the state — so these commands are only for writing it down and for looking
 * up a project that is not the one on screen.
 */

const PROJECT_WORDS = [
  'proyecto', 'proyectos', 'objetivo', 'meta', 'decision', 'decisión', 'decisiones', 'pendiente', 'pendientes', 'avance', 'avances',
  'bitacora', 'bitácora', 'nos quedamos', 'quedamos', 'retomar', 'retomamos', 'seguimos', 'vamos', 'estatus', 'estado del proyecto',
]

const summarize = (m: ProjectMemory) => ({
  folderId: m.folderId,
  name: m.name,
  goal: m.goal,
  decisions: m.decisions,
  pending: m.pending,
  done: m.done.slice(-8),
  log: m.log.slice(-6),
})

/** The folder a project command is about: the one given, or the one on screen. */
function currentFolder(folderId?: string): string {
  if (folderId) return folderId
  const { windows } = useWindows.getState()
  let top: (typeof windows)[number] | undefined
  for (const w of windows) if (!w.minimized && (!top || w.z > top.z)) top = w
  return top?.props.folderId ?? ROOT_ID
}

registerCommand<{ folderId?: string; goal?: string }, ReturnType<typeof summarize>>({
  id: 'project.start',
  keywords: PROJECT_WORDS,
  title: 'Convertir en proyecto',
  description:
    'Convierte una carpeta en proyecto: a partir de ahí recuerda objetivo, decisiones, pendientes y bitácora, y tú los ves cada vez que la abres. Úsalo cuando digan que van a trabajar en algo durante varios días.',
  params: {
    folderId: { type: 'string', description: 'Carpeta del proyecto; por defecto la carpeta activa.' },
    goal: { type: 'string', description: 'Qué se quiere lograr, en una o dos frases.' },
  },
  async run({ folderId, goal }) {
    const id = currentFolder(folderId)
    if (id === ROOT_ID) throw new Error('Un proyecto vive en una carpeta, no en el escritorio')
    const { mem, created } = await startProject(id, goal)
    if (created) {
      return {
        result: summarize(mem),
        label: `«${mem.name}» es ahora un proyecto`,
        undo: { commandId: 'fs.trash', params: { ids: [mem.nodeId] } },
      }
    }
    // It already remembered. If a new goal came with the request, that is the change worth making.
    if (!goal?.trim()) return { result: summarize(mem), label: `«${mem.name}» ya es un proyecto` }
    const { before, after } = await saveProject(mem, { goal })
    return {
      result: summarize(after),
      label: `«${after.name}»: objetivo actualizado`,
      undo: { commandId: 'fs.writeText', params: { id: mem.nodeId, content: before } },
    }
  },
})

registerCommand<{ folderId?: string }, ReturnType<typeof summarize> | null>({
  id: 'project.read',
  keywords: PROJECT_WORDS,
  title: 'Memoria del proyecto',
  description: 'Devuelve el objetivo, las decisiones, los pendientes y la bitácora de un proyecto. El proyecto activo ya viaja en el <estado>: usa esto solo para consultar otro.',
  params: { folderId: { type: 'string', description: 'Carpeta del proyecto; por defecto la carpeta activa.' } },
  async run({ folderId }) {
    const mem = await readProject(currentFolder(folderId))
    return { result: mem ? summarize(mem) : null }
  },
})

registerCommand<ProjectPatch & { folderId?: string }, ReturnType<typeof summarize>>({
  id: 'project.update',
  keywords: PROJECT_WORDS,
  title: 'Anotar en el proyecto',
  description:
    'Escribe en la memoria del proyecto: cambia el objetivo, suma decisiones o pendientes, tacha lo que ya se hizo y deja una línea de bitácora. Anota la bitácora cuando cierres un avance de verdad, para que mañana sepamos dónde nos quedamos.',
  params: {
    folderId: { type: 'string', description: 'Carpeta del proyecto; por defecto la carpeta activa.' },
    goal: { type: 'string', description: 'Nuevo objetivo, si cambió.' },
    decisions: { type: 'array', items: { type: 'string', description: 'Decisión' }, description: 'Decisiones que se tomaron, en una frase cada una.' },
    pending: { type: 'array', items: { type: 'string', description: 'Pendiente' }, description: 'Pendientes nuevos.' },
    done: { type: 'array', items: { type: 'string', description: 'Pendiente resuelto' }, description: 'Pendientes que ya se resolvieron (texto parecido al que tienen).' },
    log: { type: 'array', items: { type: 'string', description: 'Avance' }, description: 'Qué se avanzó, una línea por avance.' },
  },
  async run({ folderId, ...patch }) {
    const id = currentFolder(folderId)
    const mem = await readProject(id)
    if (!mem) throw new Error('Esa carpeta todavía no es un proyecto; usa project_start')
    const { before, after } = await saveProject(mem, patch)
    const what = [patch.goal ? 'objetivo' : '', patch.decisions?.length ? 'decisiones' : '', patch.pending?.length ? 'pendientes' : '', patch.done?.length ? 'avances' : '', patch.log?.length ? 'bitácora' : '']
      .filter(Boolean)
      .join(', ')
    return {
      result: summarize(after),
      label: `«${after.name}»: ${what || 'memoria al día'}`,
      undo: { commandId: 'fs.writeText', params: { id: mem.nodeId, content: before } },
    }
  },
})

registerCommand<{ folderId?: string; text: string; done?: boolean }, void>({
  id: 'project.togglePending',
  title: 'Marcar un pendiente',
  description: 'Tacha o reabre un pendiente del proyecto.',
  // What the checkbox in the folder's project strip calls; the model uses project_update instead.
  ai: false,
  params: {},
  async run({ folderId, text, done = true }) {
    const id = currentFolder(folderId)
    const mem = await readProject(id)
    if (!mem) throw new Error('Esa carpeta no es un proyecto')
    const { before } = done
      ? await saveProject(mem, { done: [text] })
      : await saveProject({ ...mem, done: mem.done.filter((d) => d !== text) }, { pending: [text] })
    return {
      result: undefined,
      label: done ? `Hecho: ${text}` : `Reabierto: ${text}`,
      undo: { commandId: 'fs.writeText', params: { id: mem.nodeId, content: before } },
    }
  },
})
