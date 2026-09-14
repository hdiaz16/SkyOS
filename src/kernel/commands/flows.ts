import { registerCommand } from '../commands'
import { flows } from '../flows'
import type { FlowRow } from '../db'

const summarize = (f: FlowRow) => ({ id: f.id, name: f.name, instructions: f.instructions, uses: f.uses })

/** Words that make these commands relevant; without one of them in the request, their tools stay home. */
const FLOW_WORDS = ['flujo', 'flujos', 'rutina', 'rutinas', 'guarda esto', 'guardar como', 'automatiza', 'atajo']

registerCommand<{ name: string; instructions: string }, ReturnType<typeof summarize>>({
  id: 'flows.save',
  keywords: FLOW_WORDS,
  title: 'Guardar flujo',
  description:
    'Guarda una rutina con nombre para repetirla después escribiendo su nombre en la barra. Las instrucciones son los pasos en lenguaje natural que ejecutarás cuando se invoque (por ejemplo: "abre la carpeta Proyecto X, crea una nota Acta con la fecha de hoy y la plantilla de reunión"). Si ya existe un flujo con ese nombre, se reemplaza.',
  params: {
    name: { type: 'string', description: 'Nombre corto del flujo, como "preparar reunión".', required: true },
    instructions: { type: 'string', description: 'Pasos a ejecutar, en lenguaje natural y concretos.', required: true },
  },
  async run({ name, instructions }) {
    const { flow, replaced } = await flows.save(name, instructions)
    return {
      result: summarize(flow),
      label: replaced ? `Flujo "${flow.name}" actualizado` : `Flujo "${flow.name}" guardado`,
      undo: async () => {
        if (replaced) await flows.restore(replaced)
        else await flows.remove(flow.id)
      },
    }
  },
})

registerCommand<Record<string, never>, ReturnType<typeof summarize>[]>({
  id: 'flows.list',
  keywords: FLOW_WORDS,
  title: 'Flujos guardados',
  description: 'Lista los flujos guardados con sus instrucciones.',
  params: {},
  async run() {
    return { result: (await flows.list()).map(summarize) }
  },
})

registerCommand<{ name: string }, { name: string; instructions: string }>({
  id: 'flows.run',
  title: 'Ejecutar flujo',
  description:
    'Obtiene las instrucciones de un flujo guardado para que las ejecutes paso a paso con las demás herramientas. Llámalo cuando la persona mencione un flujo por su nombre.',
  params: { name: { type: 'string', description: 'Nombre del flujo.', required: true } },
  async run({ name }) {
    const flow = await flows.findByName(name)
    if (!flow) throw new Error(`No hay un flujo llamado "${name}"`)
    await flows.touch(flow.id)
    return { result: { name: flow.name, instructions: flow.instructions } }
  },
})

registerCommand<{ name: string }, void>({
  id: 'flows.delete',
  keywords: FLOW_WORDS,
  title: 'Eliminar flujo',
  description: 'Elimina un flujo guardado por nombre.',
  params: { name: { type: 'string', description: 'Nombre del flujo.', required: true } },
  async run({ name }) {
    const flow = await flows.findByName(name)
    if (!flow) throw new Error(`No hay un flujo llamado "${name}"`)
    await flows.remove(flow.id)
    return {
      result: undefined,
      label: `Flujo "${flow.name}" eliminado`,
      undo: async () => {
        await flows.restore(flow)
      },
    }
  },
})
