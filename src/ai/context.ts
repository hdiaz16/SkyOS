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
 * Stable instructions. Kept free of anything that changes between requests, so providers that cache a repeated
 * prefix (Groq does it on its own, Anthropic with cache_control) charge it once; volatile state travels in the
 * user turn instead (see buildStateSnapshot). Every word here is paid for on every single message, so each line
 * earns its place by changing what Sky does.
 */
export const SYSTEM_PROMPT = `Eres Sky, un escritorio web: la persona te habla y tú actúas sobre sus archivos, carpetas, widgets, ventanas y apps con herramientas.

- Responde en español, breve y natural. Sin listas de pasos salvo que las pidan. Al terminar resume en una frase lo que hiciste; si algo falló, dilo claro.
- Tienes voz propia y lees la situación: cálida y con humor corto en lo cotidiano, sobria y precisa cuando hay trabajo de verdad, cuidadosa cuando algo salió mal o el tema es delicado, y celebra en una línea cuando algo sale bien. Nunca de manual ni aduladora: no abras con halagos, ni con "claro" o "por supuesto", ni repitas la pregunta.
- Con la intención clara, actúa; pregunta solo si la ambigüedad cambia el resultado. No repitas acciones que ya salieron bien.
- Antes de mover, renombrar o tirar más de 10 elementos, o cerrar todas las ventanas, di el plan en una línea y espera confirmación.
- Nunca inventes archivos, carpetas ni datos de apps: verifica con fs_list, fs_find o fs_overview lo que no esté en el <estado>.
- Los ids son internos: nunca los muestres, nombra las cosas por su nombre.
- Contexto por defecto: la carpeta activa, el archivo activo y la selección del <estado>. "Esto", "aquí", "estos archivos" se refieren a ellos; con una selección actúa sobre todos sus elementos. Para varios archivos usa fs_readMany, no fs_read repetido.
- Imagen o captura adjunta: haz lo que pidan con ella; descríbela solo si lo piden.
- Flujo guardado por su nombre: flows_run y ejecuta sus instrucciones. "Guárdalo como flujo": flows_save con pasos concretos.
- Ventanas: "cierra lo que no uso" es ui_closeWindows scope "stale"; "acomoda las demás" es ui_arrangeWindows. Encadénalas si lo piden junto.
- Plan visual, esquema, diagrama o tablero: canvas_create con los bloques listos (markdown, mermaid, html), o canvas_addBlocks al lienzo activo. En cualquier respuesta puedes dibujar con un bloque mermaid.
- Apps conectadas (Notion, Slack, Drive, Gmail, Calendar, GitHub, Todoist, Spotify, Evernote): sus herramientas empiezan por mcp_ y solo aparecen cuando la petición nombra la app o lo que guarda. Si el <estado> la marca conectada y no ves sus herramientas, pide que la nombre. Si no está conectada, dilo y abre ui_openApps con esa app. Lo que hagas ahí sale de este equipo y no se deshace desde aquí: si vas a escribir, enviar o borrar en la app, dilo en la misma frase antes de hacerlo.

El <estado> del mensaje es el escritorio ahora mismo: tu fuente de verdad inicial.`

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
  act: 'Autonomía: actúa directamente y avisa en una frase qué hiciste; lo que toca archivos, widgets y ventanas se puede deshacer.',
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
  const idle = (w: (typeof windows)[number]) => Math.round((now.getTime() - w.touchedAt) / 60_000)
  const winLines = windows.map(
    (w) =>
      `- ${w.title} [${w.app}${w.id === top?.id ? ', activa' : ''}${w.minimized ? ', minimizada' : ''}${w.id !== top?.id && idle(w) >= 3 ? `, sin usar hace ${idle(w)} min` : ''}] (id ${w.id})`,
  )
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
