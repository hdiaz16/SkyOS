import { execute, listCommands, type CommandDef } from '../kernel/commands'
import { paramsToJsonSchema } from './schema'
import type { ToolSpec } from './types'
import type { ProviderId } from './settings'
import { executeMcpTool, isMcpToolName, mcpToolSpecs, type ToolContext } from '../mcp/tools'

/**
 * How many of Sky's commands travel with a request.
 *
 * Measured on this desk: the whole manual is 58 tools and 22 KB — about 6 100 tokens — before a word of
 * conversation, on every request of every turn. Two very different bills come out of that:
 *
 * - `full` sends it whole, in a fixed order, so the request prefix never changes and the provider's prompt
 *   cache pays for it. Anthropic caches the prefix explicitly and bills the hit at a tenth: 6 100 tokens
 *   cost like 600. Cheaper than any selection, and the model never lacks a tool.
 * - `compact` sends the commands the request is about (routed by what it says), a small core that any turn
 *   may need, and a search tool that can bring in the rest — never more than a cap. Groq's shared key gives
 *   8 000 tokens a minute: the whole manual alone ate three quarters of it, and a turn with two tool calls
 *   could not fit. The OpenAI-compatible providers cache at half price at best and only for long prefixes,
 *   so there a smaller request beats a cached big one too.
 *
 * Both keep their tool lists in name order, because a list that changes between turns changes the prefix.
 */
export type ToolStrategy = 'full' | 'compact'

export const toolStrategyFor = (provider: ProviderId): ToolStrategy => (provider === 'anthropic' ? 'full' : 'compact')

/** Internal tools per request in compact mode: Groq's own recommendation on its metered key, more elsewhere. */
export const TOOL_CAP = { metered: 15, roomy: 24 } as const
export const MAX_INITIAL_TOOLS = TOOL_CAP.metered

export type ToolDomain = 'files' | 'windows' | 'widgets' | 'canvas' | 'projects' | 'flows' | 'apps' | 'storage' | 'jobs' | 'profile'

const DOMAIN_ORDER: ToolDomain[] = ['files', 'windows', 'widgets', 'canvas', 'projects', 'flows', 'apps', 'storage', 'jobs', 'profile']
const DOMAIN_PATTERNS: Record<ToolDomain, RegExp> = {
  files: /\b(archivo|archivos|carpeta|carpetas|documento|documentos|escritorio|renombra|mueve|borra|papelera|lee|leer|busca|buscar|lista|listar|abre|abrir|nota|notas|etiqueta|etiquetas)\b/i,
  windows: /\b(ventana|ventanas|minimiza|cierra|acomoda|ordena|maximiza|pantalla|zen)\b/i,
  widgets: /\b(widget|widgets|reloj|clima|temporizador|divisas?|recientes|tablero)\b/i,
  canvas: /\b(lienzo|canvas|diagrama|bloque)\b/i,
  projects: /\b(proyecto|proyectos|objetivo|hito)\b/i,
  flows: /\b(flujo|flujos|automatiza|automatizacion|automatización|rutina)\b/i,
  apps: /\b(app|aplicacion|aplicación|aplicaciones|navegador|terminal|ajustes|configuracion|configuración|tema|google|busca en internet)\b/i,
  storage: /\b(sincroniza|sincronizacion|sincronización|almacenamiento|nube|espacio)\b/i,
  jobs: /\b(tarea|tareas|trabajo|trabajos|proceso|procesos|sintetiza|sintetizar|pendientes|resume|resumir|resumen)\b/i,
  // No word boundary after «mudé»: without the u flag, \b does not know that é is a letter.
  profile: /\b(ubicacion|ubicación|ciudad|perfil)\b|me mud[eé]|vivo en/i,
}

/**
 * Command ownership is deliberately explicit. UI commands are not a homogeneous "windows" bag: opening a
 * file needs file readers, while opening the browser or the settings is an app action. Keep this map next to
 * the packs below when adding an AI-visible command.
 */
const COMMAND_DOMAINS: Record<string, ToolDomain> = {
  'fs.createFolder': 'files', 'fs.createFile': 'files', 'fs.rename': 'files', 'fs.move': 'files', 'fs.trash': 'files', 'fs.restore': 'files', 'fs.emptyTrash': 'files', 'fs.setTags': 'files', 'fs.writeText': 'files',
  'fs.list': 'files', 'fs.overview': 'files', 'fs.read': 'files', 'fs.find': 'files', 'fs.readMany': 'files', 'fs.info': 'files', 'ui.open': 'files', 'ui.openFiles': 'files', 'ui.openTrash': 'files',
  'ui.windows': 'windows', 'ui.closeWindows': 'windows', 'ui.minimizeWindows': 'windows', 'ui.arrangeWindows': 'windows', 'ui.cleanDesktop': 'windows', 'ui.zen': 'windows', 'ui.snapWindow': 'windows', 'ui.stackWindows': 'windows', 'system.info': 'windows',
  'widgets.create': 'widgets', 'widgets.update': 'widgets', 'widgets.remove': 'widgets', 'widgets.list': 'widgets',
  'canvas.create': 'canvas', 'canvas.read': 'canvas', 'canvas.addBlocks': 'canvas', 'canvas.updateBlock': 'canvas', 'canvas.removeBlock': 'canvas', 'canvas.save': 'canvas',
  'project.start': 'projects', 'project.read': 'projects', 'project.update': 'projects', 'project.togglePending': 'projects',
  'flows.save': 'flows', 'flows.run': 'flows', 'flows.list': 'flows', 'flows.delete': 'flows',
  'apps.status': 'apps', 'ui.openApp': 'apps', 'ui.openApps': 'apps', 'ui.openBrowser': 'apps', 'ui.openTerminal': 'apps', 'ui.openSettings': 'apps', 'ui.theme': 'apps',
  'storage.sync': 'storage', 'storage.syncStatus': 'storage',
  'tasks.synthesize': 'jobs', 'tasks.pending': 'jobs', 'tasks.summarizeFolder': 'jobs', 'system.jobs': 'jobs',
  'user.setLocation': 'profile',
}

const PACKS: Record<ToolDomain, string[]> = {
  files: ['fs.list', 'fs.find', 'fs.read', 'fs.readMany', 'fs.info', 'ui.open', 'ui.openFiles', 'fs.createFile', 'fs.createFolder', 'fs.rename', 'fs.move', 'fs.trash', 'fs.writeText', 'fs.setTags'],
  windows: ['ui.windows', 'ui.closeWindows', 'ui.minimizeWindows', 'ui.arrangeWindows', 'ui.cleanDesktop', 'ui.zen', 'ui.snapWindow', 'ui.stackWindows', 'system.info'],
  widgets: ['widgets.list', 'widgets.create', 'widgets.update', 'widgets.remove'],
  canvas: ['canvas.read', 'canvas.create', 'canvas.addBlocks', 'canvas.updateBlock', 'canvas.removeBlock', 'canvas.save'],
  projects: ['project.read', 'project.start', 'project.update', 'project.togglePending'],
  flows: ['flows.list', 'flows.run', 'flows.save', 'flows.delete'],
  apps: ['ui.openBrowser', 'ui.openTerminal', 'ui.openSettings', 'ui.openApp', 'ui.openApps', 'apps.status', 'ui.theme'],
  storage: ['storage.syncStatus', 'storage.sync'],
  jobs: ['system.jobs', 'tasks.synthesize', 'tasks.pending', 'tasks.summarizeFolder'],
  profile: ['user.setLocation'],
}

/** Within files, the verb narrows the pack: "renombra" does not need the whole file manual. */
const FILE_INTENT_PACKS: Array<{ pattern: RegExp; ids: string[] }> = [
  { pattern: /\b(crea|crear|nueva?|nuevo|escribe|guarda)\b/i, ids: ['fs.createFile', 'fs.createFolder', 'fs.writeText', 'fs.list', 'ui.openFiles'] },
  { pattern: /\b(renombra|renombrar|cambia el nombre)\b/i, ids: ['fs.rename', 'fs.find', 'fs.info', 'fs.list'] },
  { pattern: /\b(lista|listar|contenido|contenidos|que hay|qué hay|cuantos|cuántos)\b/i, ids: ['fs.list', 'fs.overview', 'fs.find', 'ui.openFiles'] },
  { pattern: /\b(lee|leer|abre|abrir|muestra|muéstrame)\b/i, ids: ['fs.read', 'fs.readMany', 'fs.info', 'fs.find', 'ui.open', 'ui.openFiles'] },
  { pattern: /\b(busca|buscar|encuentra|donde|dónde)\b/i, ids: ['fs.find', 'fs.list', 'fs.info', 'ui.open'] },
  { pattern: /\b(sintetiza|sintetizar|resume|resumir|pendientes)\b/i, ids: ['fs.list', 'fs.read', 'fs.readMany', 'fs.find'] },
  { pattern: /\b(mueve|mover|organiza|ordena|agrupa|junta)\b/i, ids: ['fs.move', 'fs.createFolder', 'fs.list', 'fs.find', 'fs.info'] },
  { pattern: /\b(borra|elimina|papelera|tira|quita)\b/i, ids: ['fs.trash', 'fs.restore', 'fs.list', 'fs.find', 'fs.info', 'ui.openTrash'] },
  { pattern: /\b(etiqueta|etiquetas|tag)\b/i, ids: ['fs.setTags', 'fs.find', 'fs.list', 'fs.info'] },
]

/**
 * What any turn may need regardless of what it seems to be about: reading the desk and opening things. It
 * is what keeps a routed request from ever leaving the model with no way to look around — «muéstrame lo de
 * ayer» matches no domain, and without this it used to travel with zero tools.
 */
const CORE: string[] = ['fs.list', 'fs.find', 'fs.read', 'fs.info', 'ui.open', 'ui.windows', 'system.info']

/** Tool names may only contain letters, digits, underscores and dashes, so "fs.move" becomes "fs_move". */
export const toolNameFor = (commandId: string) => commandId.replace(/\./g, '_')

function aiCommands(): CommandDef<unknown, unknown>[] {
  return listCommands().filter((c) => c.ai !== false)
}

export function domainForCommand(id: string): ToolDomain {
  return COMMAND_DOMAINS[id] ?? 'profile'
}

/** Deterministic domain router. Recent text is used only for a short follow-up, never desktop state. */
export function routeToolDomains(prompt: string, recent = ''): ToolDomain[] {
  let direct = DOMAIN_ORDER.filter((domain) => DOMAIN_PATTERNS[domain].test(prompt))
  // "abre navegador/terminal/ajustes" is not a file request merely because it uses the verb abrir.
  if (/\b(navegador|terminal|ajustes|configuracion|configuración)\b/i.test(prompt) && !/\b(archivo|carpeta|documento|nota)\b/i.test(prompt)) {
    direct = direct.filter((domain) => domain !== 'files')
  }
  if (direct.length) return direct
  if (/^(y |tambien |también |ahora |hazlo|abrelo|ábrelo|cierrala|ciérrala|otra vez|de nuevo)/i.test(prompt.trim())) {
    return DOMAIN_ORDER.filter((domain) => DOMAIN_PATTERNS[domain].test(recent))
  }
  return []
}

/**
 * The commands a compact request carries, in the order they matter: what the request is about first, then
 * the core, then anything the model asked for by name through the search tool. Capped, and never empty.
 */
export function routeInternalToolIds(prompt: string, recent = '', cap: number = MAX_INITIAL_TOOLS, extra: string[] = []): string[] {
  const domains = routeToolDomains(prompt, recent)
  const files = domains.includes('files') ? (FILE_INTENT_PACKS.find((pack) => pack.pattern.test(prompt))?.ids ?? PACKS.files) : []
  const other = domains.filter((domain) => domain !== 'files').flatMap((domain) => PACKS[domain])
  return [...new Set([...extra, ...files, ...other, ...CORE])].slice(0, cap)
}

export function commandIdForTool(name: string): string | undefined {
  return aiCommands().find((c) => toolNameFor(c.id) === name)?.id
}

/**
 * Every AI-visible command, exposed as a tool, in name order. The order is part of the design: it is what
 * makes two turns produce the same prefix, and the same prefix is what a prompt cache can hit.
 */
export function commandTools(only?: string[]): ToolSpec[] {
  return aiCommands()
    .filter((c) => !only || only.includes(c.id))
    .map((c) => ({
      name: toolNameFor(c.id),
      description: c.description,
      inputSchema: paramsToJsonSchema(c.params),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function commandToolsForIds(ids: string[]): ToolSpec[] {
  if (!ids.length) return []
  const byId = new Map(commandTools().map((spec) => [commandIdForTool(spec.name), spec]))
  return ids.flatMap((id) => {
    const spec = byId.get(id)
    return spec ? [spec] : []
  })
}

/**
 * The way back to the whole manual from a compact request. It travels with every compact request, so a
 * routing miss costs one extra round trip instead of an answer that says «no puedo».
 */
export const SEARCH_TOOL_NAME = 'system_searchTools'

const SEARCH_TOOLS_SPEC: ToolSpec = {
  name: SEARCH_TOOL_NAME,
  description:
    'Busca más capacidades de SkyOS cuando ninguna herramienta disponible sirve para lo que se pide (widgets, lienzos, proyectos, flujos, ventanas, apps conectadas, nube…). Úsala una vez, con dos o tres palabras.',
  inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Qué necesitas hacer, en pocas palabras.' } }, required: ['query'] },
}

export interface ToolBudget {
  total: number
  internal: number
  mcp: number
  bytes: number
  domains: ToolDomain[]
  strategy: ToolStrategy
}

export function measureToolBudget(specs: ToolSpec[], domains: ToolDomain[] = [], strategy: ToolStrategy = 'compact'): ToolBudget {
  return {
    total: specs.length,
    internal: specs.filter((s) => !isMcpToolName(s.name)).length,
    mcp: specs.filter((s) => isMcpToolName(s.name)).length,
    bytes: JSON.stringify(specs).length,
    domains,
    strategy,
  }
}

/** The compact cap for internal tools, search included. */
export function enforceToolBudget(specs: ToolSpec[], cap: number = MAX_INITIAL_TOOLS): ToolSpec[] {
  return specs.slice(0, cap)
}

/**
 * Every tool the model may use for this request: Sky's commands, chosen by the strategy, plus the tools of
 * the connected app the request names. `only` restricts to those commands and leaves the apps out (one-shot
 * jobs, and the expansion after a search).
 */
export function allTools(only?: string[], context?: ToolContext): ToolSpec[] {
  if (only) return commandTools(only)
  const strategy = context?.strategy ?? 'full'
  if (strategy === 'full') return [...commandTools(), ...mcpToolSpecs(context)]
  const cap = context?.maxTools ?? MAX_INITIAL_TOOLS
  const ids = routeInternalToolIds(context?.prompt ?? '', context?.recent, cap - 1, context?.extraIds)
  const internal = commandToolsForIds(ids).sort((a, b) => a.name.localeCompare(b.name))
  return [...enforceToolBudget(internal, cap - 1), SEARCH_TOOLS_SPEC, ...mcpToolSpecs(context)]
}

export interface ToolExecution {
  content: string
  isError: boolean
  label?: string
  entryId?: string
  undoable: boolean
  /** The search tool found these commands; the next request carries them on top of what it already had. */
  discoveredToolIds?: string[]
}

export function searchToolIds(query: string, cap: number = MAX_INITIAL_TOOLS): string[] {
  const words = query
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2)
  if (!words.length) return []
  const haystack = (c: CommandDef<unknown, unknown>) =>
    `${c.id} ${c.title} ${c.description} ${(c.keywords ?? []).join(' ')}`
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
  return aiCommands()
    .map((c) => ({ id: c.id, hits: words.filter((w) => haystack(c).includes(w)).length }))
    .filter((c) => c.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.id.localeCompare(b.id))
    .slice(0, cap)
    .map((c) => c.id)
}

const MAX_RESULT_CHARS = 60000

function serialize(value: unknown): string {
  if (value === undefined || value === null) return JSON.stringify({ ok: true })
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n…[recortado]` : text
}

/** Runs a tool call through the command bus under the AI source, so it is journaled and undoable like any user action. */
export async function executeTool(name: string, input: Record<string, unknown>, runId: string): Promise<ToolExecution> {
  if (name === SEARCH_TOOL_NAME) {
    const ids = searchToolIds(typeof input.query === 'string' ? input.query : '')
    return {
      content: ids.length
        ? `Herramientas encontradas: ${ids.map(toolNameFor).join(', ')}. Ya están disponibles: llámalas directamente.`
        : 'No hay una herramienta de SkyOS para eso. Dilo así, sin inventar una.',
      isError: !ids.length,
      undoable: false,
      discoveredToolIds: ids,
    }
  }
  if (isMcpToolName(name)) return executeMcpTool(name, input, runId)
  const id = commandIdForTool(name)
  if (!id) return { content: `Herramienta desconocida: ${name}`, isError: true, undoable: false }
  try {
    const { result, entry } = await execute(id, input, { source: 'ai', runId })
    return {
      content: serialize(result),
      isError: false,
      label: entry?.label,
      entryId: entry?.id,
      undoable: !!entry?.undo,
    }
  } catch (err) {
    return { content: err instanceof Error ? err.message : 'Error desconocido', isError: true, undoable: false }
  }
}
