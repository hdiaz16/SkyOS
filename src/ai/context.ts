import { fs } from '../kernel/fs'
import { ROOT_ID, fileKind, type FsNode } from '../kernel/types'
import { widgets } from '../kernel/widgets'
import { useWindows, type Win } from '../state/windows'
import { formatBytes } from '../lib/utils'
import { useUi } from '../state/ui'
import { useSettings } from '../state/settings'
import { useAuth } from '../system/auth'
import type { UserProfile } from '../system/db'
import { connectedAppsSummary } from '../mcp/tools'

/**
 * Stable instructions. Kept free of anything that changes between requests so the provider can cache it;
 * volatile state travels in the user turn (see buildStateSnapshot).
 */
export const SYSTEM_PROMPT = `Eres Sky, un escritorio web donde tú eres el protagonista: la persona te habla y tú actúas sobre sus archivos, carpetas, widgets y ventanas mediante herramientas.

Cómo trabajas:
- Responde siempre en español, de forma breve y natural. Sin listas de pasos salvo que te las pidan.
- Cuando la intención es clara, actúa directamente con las herramientas. Pregunta solo si la ambigüedad cambia el resultado.
- Antes de mover, renombrar o enviar a la papelera más de 10 elementos, o de cerrar todas las ventanas, di el plan en una línea y espera confirmación.
- Nunca inventes archivos ni carpetas: verifica con fs_list, fs_find o fs_overview antes de actuar sobre algo que no aparezca en el estado.
- Para leer un archivo usa fs_read. Para crear contenido usa fs_createFile con el texto completo.
- Los ids son internos: nunca los muestres; refiérete a las cosas por su nombre.
- Todo lo que haces es reversible por la persona. Aun así, no repitas acciones que ya salieron bien.
- Al terminar, resume en una o dos frases lo que hiciste. Si algo falló, dilo con claridad.
- Si la persona menciona un flujo guardado por su nombre, obtén sus instrucciones con flows_run y ejecútalas. Si pide guardar algo "como flujo", usa flows_save con pasos concretos.
- Si adjunta una imagen o captura, descríbela solo si te lo pide; normalmente quiere que hagas algo con ella (analizar, traducir, extraer datos a un archivo).
- Contexto por defecto: la carpeta activa, el archivo activo y la selección que aparecen en el <estado>. "Estos archivos", "esta carpeta", "esto" o "aquí" se refieren a ellos; con una selección, actúa sobre todos sus elementos sin pedir la lista. Para leer varios archivos de una vez usa fs_readMany en lugar de fs_read uno por uno.
- Lienzos (.canvas): tableros libres con bloques de Markdown (notas, tablas), diagramas Mermaid y HTML. Cuando pidan un plan visual, esquema, diagrama, tablero o "lienzo", crea uno con canvas_create entregando los bloques listos, o añade bloques al lienzo activo con canvas_addBlocks. En cualquier respuesta puedes dibujar con un bloque de cÃ³digo de lenguaje mermaid.
- Apps conectadas (Notion, Slack, Google Drive, Gmail, Calendar, GitHub, Todoist, Spotify, Evernote…): sus herramientas empiezan por mcp_ y aparecen cuando la petición habla de esa app (por su nombre o por lo que guarda). Si la persona pide algo de una app que el estado marca como conectada pero no ves sus herramientas, pídele en una frase que nombre la app. Si la app no está conectada, dilo y abre el panel con ui_openApps indicando la app. Nunca inventes datos de esas apps.

El bloque <estado> del mensaje describe el escritorio en este momento: úsalo como fuente de verdad inicial.`

const TONE: Record<UserProfile['tone'], string> = {
  warm: 'Tono cercano y relajado, como alguien de confianza; tutéala.',
  direct: 'Tono directo y breve: frases cortas, sin adornos ni preámbulos.',
  formal: 'Tono formal y cuidado, con respuestas completas y bien estructuradas.',
}

const PURPOSE: Record<UserProfile['purpose'], string> = {
  work: 'Usa Sky sobre todo para trabajo: documentos, proyectos y reportes.',
  study: 'Usa Sky sobre todo para estudiar: apuntes, lecturas y tareas.',
  personal: 'Usa Sky sobre todo para proyectos personales.',
  mixed: 'Usa Sky para un poco de todo.',
}

const AUTONOMY: Record<UserProfile['autonomy'], string> = {
  ask: 'Autonomía: antes de mover, renombrar o borrar cualquier archivo, propone el plan en una línea y espera su confirmación, salvo que la instrucción sea explícita y de un solo paso.',
  act: 'Autonomía: actúa directamente y avisa en una frase qué hiciste; todo se puede deshacer.',
  manual: 'Autonomía: nunca hagas cambios que no se te hayan pedido de forma explícita; cuando veas una mejora, sugiérela en vez de aplicarla.',
}

/** The stable prompt for the signed-in person: base rules plus how they asked to be treated. */
export async function buildSystemPrompt(): Promise<string> {
  const user = useAuth.getState().current
  if (!user) return SYSTEM_PROMPT
  const p = user.profile
  const persona = [
    `Sobre la persona: se llama ${user.name}.`,
    TONE[p.tone],
    PURPOSE[p.purpose],
    AUTONOMY[p.autonomy],
    p.location ? `Vive o trabaja en ${p.location.place}; úsalo como referencia para clima, hora y lugares.` : '',
  ]
    .filter(Boolean)
    .join('\n')
  return `${SYSTEM_PROMPT}\n\n${persona}`
}

async function describeFolder(id: string, indent: string, depth: number): Promise<string[]> {
  const items = await fs.list(id)
  const lines: string[] = []
  for (const n of items) {
    if (n.kind === 'folder') {
      const count = (await fs.list(n.id)).length
      lines.push(`${indent}- [carpeta] ${n.name} (id ${n.id}, ${count} elementos)`)
      if (depth > 0 && count > 0 && count <= 12) lines.push(...(await describeFolder(n.id, `${indent}  `, depth - 1)))
    } else {
      lines.push(`${indent}- ${n.name} (id ${n.id})${n.tags?.length ? ` #${n.tags.join(' #')}` : ''}`)
    }
  }
  return lines
}

const CONTEXT_ITEMS = 40

const describeNode = (n: FsNode) =>
  n.kind === 'folder' ? `- [carpeta] ${n.name} (id ${n.id})` : `- ${n.name} (id ${n.id}, ${fileKind(n)}, ${formatBytes(n.size)})${n.tags?.length ? ` #${n.tags.join(' #')}` : ''}`

/**
 * The dynamic context window: whatever the person is looking at. A Files window makes its folder the context
 * (contents listed, bounded); an editor or viewer makes its file the context. Sky reads "esto" as this.
 */
async function describeActive(top: Win | undefined): Promise<string[]> {
  if (!top) return []
  if (top.app === 'files') {
    const folderId = top.props.folderId ?? ROOT_ID
    if (folderId === ROOT_ID) return ['Carpeta activa (contexto por defecto): Escritorio, listado arriba.']
    const folder = await fs.get(folderId)
    if (!folder) return []
    const items = await fs.list(folderId)
    const lines = items.slice(0, CONTEXT_ITEMS).map(describeNode)
    if (items.length > CONTEXT_ITEMS) lines.push(`- …y ${items.length - CONTEXT_ITEMS} más (fs_list para verlos)`)
    return [`Carpeta activa (contexto por defecto): «${folder.name}» (id ${folder.id}), ${items.length} elementos:`, ...(lines.length ? lines : ['- (vacía)'])]
  }
  if (top.props.nodeId) {
    const node = await fs.get(top.props.nodeId)
    if (!node) return []
    const parent = node.parentId === ROOT_ID ? 'Escritorio' : ((await fs.get(node.parentId))?.name ?? '?')
    const where = node.parentId === ROOT_ID ? parent : `«${parent}» (id ${node.parentId})`
    return [`Archivo activo (contexto por defecto): «${node.name}» (id ${node.id}, ${fileKind(node)}, ${formatBytes(node.size)}) en ${where}.`]
  }
  if (top.app === 'app' && top.props.app) return [`App activa: ${top.props.app}.`]
  return []
}

/** A compact, human-readable picture of the desktop for the model. */
export async function buildStateSnapshot(): Promise<string> {
  const now = new Date()
  const desktop = await describeFolder(ROOT_ID, '', 1)
  const { windows } = useWindows.getState()
  let top: (typeof windows)[number] | undefined
  for (const w of windows) if (!w.minimized && (!top || w.z > top.z)) top = w
  const winLines = windows.map((w) => `- ${w.title} [${w.app}${w.id === top?.id ? ', activa' : ''}${w.minimized ? ', minimizada' : ''}] (id ${w.id})`)
  const active = await describeActive(top)
  const selection = useUi.getState().selection
  const selected = (await Promise.all(selection.map((id) => fs.get(id)))).filter((n): n is NonNullable<typeof n> => !!n)
  const widgetLines = (await widgets.list()).map((w) => `- ${w.title} [${w.type}] (id ${w.id})`)
  const appLines = connectedAppsSummary()

  return [
    '<estado>',
    `Fecha y hora: ${now.toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}`,
    `Tema: ${useSettings.getState().theme}`,
    'Escritorio (id root):',
    ...(desktop.length ? desktop : ['- (vacío)']),
    'Widgets en el escritorio:',
    ...(widgetLines.length ? widgetLines : ['- (ninguno)']),
    'Ventanas abiertas:',
    ...(winLines.length ? winLines : ['- (ninguna)']),
    ...active,
    selected.length ? `Selección actual (${selected.length}): ${selected.map((n) => `${n.name} (id ${n.id}${n.kind === 'folder' ? ', carpeta' : ''})`).join(', ')}` : 'Selección actual: ninguna',
    'Apps conectadas:',
    ...(appLines.length ? appLines : ['- (ninguna; se conectan en Apps conectadas)']),
    '</estado>',
  ].join('\n')
}
