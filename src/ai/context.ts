import { fs } from '../kernel/fs'
import { ROOT_ID } from '../kernel/types'
import { useWindows } from '../state/windows'
import { useUi } from '../state/ui'
import { useSettings } from '../state/settings'

/**
 * Stable instructions. Kept free of anything that changes between requests so the provider can cache it;
 * volatile state travels in the user turn (see buildStateSnapshot).
 */
export const SYSTEM_PROMPT = `Eres Mesa, un escritorio web donde tú eres el protagonista: la persona te habla y tú actúas sobre sus archivos, carpetas y ventanas mediante herramientas.

Cómo trabajas:
- Responde siempre en español, de forma breve y natural. Sin listas de pasos salvo que te las pidan.
- Cuando la intención es clara, actúa directamente con las herramientas. Pregunta solo si la ambigüedad cambia el resultado.
- Antes de mover, renombrar o enviar a la papelera más de 10 elementos, o de cerrar todas las ventanas, di el plan en una línea y espera confirmación.
- Nunca inventes archivos ni carpetas: verifica con fs_list, fs_find o fs_overview antes de actuar sobre algo que no aparezca en el estado.
- Para leer un archivo usa fs_read. Para crear contenido usa fs_createFile con el texto completo.
- Los ids son internos: nunca los muestres; refiérete a las cosas por su nombre.
- Todo lo que haces es reversible por la persona. Aun así, no repitas acciones que ya salieron bien.
- Al terminar, resume en una o dos frases lo que hiciste. Si algo falló, dilo con claridad.

El bloque <estado> del mensaje describe el escritorio en este momento: úsalo como fuente de verdad inicial.`

async function describeFolder(id: string, indent: string, depth: number): Promise<string[]> {
  const items = await fs.list(id)
  const lines: string[] = []
  for (const n of items) {
    if (n.kind === 'folder') {
      const count = (await fs.list(n.id)).length
      lines.push(`${indent}- [carpeta] ${n.name} (id ${n.id}, ${count} elementos)`)
      if (depth > 0 && count > 0 && count <= 12) lines.push(...(await describeFolder(n.id, `${indent}  `, depth - 1)))
    } else {
      lines.push(`${indent}- ${n.name} (id ${n.id})`)
    }
  }
  return lines
}

/** A compact, human-readable picture of the desktop for the model. */
export async function buildStateSnapshot(): Promise<string> {
  const now = new Date()
  const desktop = await describeFolder(ROOT_ID, '', 1)
  const { windows } = useWindows.getState()
  let top: (typeof windows)[number] | undefined
  for (const w of windows) if (!w.minimized && (!top || w.z > top.z)) top = w
  const winLines = windows.map((w) => `- ${w.title} [${w.app}${w.id === top?.id ? ', activa' : ''}${w.minimized ? ', minimizada' : ''}] (id ${w.id})`)
  const selection = useUi.getState().selection
  const selected = (await Promise.all(selection.map((id) => fs.get(id)))).filter((n): n is NonNullable<typeof n> => !!n)

  return [
    '<estado>',
    `Fecha y hora: ${now.toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}`,
    `Tema: ${useSettings.getState().theme}`,
    'Escritorio (id root):',
    ...(desktop.length ? desktop : ['- (vacío)']),
    'Ventanas abiertas:',
    ...(winLines.length ? winLines : ['- (ninguna)']),
    selected.length ? `Selección actual: ${selected.map((n) => `${n.name} (id ${n.id})`).join(', ')}` : 'Selección actual: ninguna',
    '</estado>',
  ].join('\n')
}
