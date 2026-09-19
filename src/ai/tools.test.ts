import { describe, expect, it } from 'vitest'
import '../kernel/commands/index'
import {
  allTools,
  commandTools,
  domainForCommand,
  enforceToolBudget,
  MAX_INITIAL_TOOLS,
  measureToolBudget,
  routeInternalToolIds,
  routeToolDomains,
  SEARCH_TOOL_NAME,
  searchToolIds,
  TOOL_CAP,
  toolStrategyFor,
} from './tools'
import type { ToolSpec } from './types'

const names = (specs: ToolSpec[]) => specs.map((t) => t.name)
const internal = (specs: ToolSpec[]) => specs.filter((t) => !t.name.startsWith('mcp_'))

describe('la estrategia por proveedor', () => {
  it('Anthropic lleva el manual entero, que su caché cobra a una décima; los demás, lo que la petición pide', () => {
    expect(toolStrategyFor('anthropic')).toBe('full')
    expect(toolStrategyFor('groq')).toBe('compact')
    expect(toolStrategyFor('openai')).toBe('compact')
  })

  it('el manual entero es el mismo en dos turnos distintos: el prefijo no cambia, la caché puede pegar', () => {
    const a = names(internal(allTools(undefined, { prompt: 'renombra este archivo', strategy: 'full' })))
    const b = names(internal(allTools(undefined, { prompt: 'hola, ¿cómo estás?', strategy: 'full' })))
    expect(a).toEqual(b)
    expect(a.length).toBe(commandTools().length)
    expect(a).toEqual([...a].sort((x, y) => x.localeCompare(y)))
    expect(a).not.toContain(SEARCH_TOOL_NAME)
  })

  it('en compacto nunca viajan más internas que el tope, y la búsqueda siempre va', () => {
    for (const prompt of ['renombra este archivo', 'hola', 'muéstrame lo de ayer', 'pon un reloj y ordena las ventanas y sintetiza la carpeta']) {
      const specs = internal(allTools(undefined, { prompt, strategy: 'compact' }))
      expect(specs.length, prompt).toBeLessThanOrEqual(MAX_INITIAL_TOOLS)
      expect(names(specs), prompt).toContain(SEARCH_TOOL_NAME)
    }
  })

  it('una petición sin dominio no deja al modelo sin manos: el núcleo va siempre', () => {
    const specs = names(allTools(undefined, { prompt: 'muéstrame lo de ayer', strategy: 'compact' }))
    expect(specs).toContain('fs_list')
    expect(specs).toContain('fs_find')
    expect(specs).toContain('fs_read')
    expect(specs).toContain('ui_open')
  })

  it('lo que la búsqueda encontró se suma a lo que ya iba, sin tirar el núcleo', () => {
    const before = names(allTools(undefined, { prompt: 'necesito algo', strategy: 'compact' }))
    const after = names(allTools(undefined, { prompt: 'necesito algo', strategy: 'compact', extraIds: ['widgets.create', 'canvas.create'] }))
    expect(after).toContain('widgets_create')
    expect(after).toContain('canvas_create')
    expect(after).toContain('fs_list')
    expect(after.length).toBeGreaterThanOrEqual(before.length)
  })

  it('un proveedor con holgura admite más herramientas que la llave medida', () => {
    const roomy = internal(allTools(undefined, { prompt: 'pon un reloj y ordena las ventanas y crea un lienzo y busca archivos', strategy: 'compact', maxTools: TOOL_CAP.roomy }))
    expect(roomy.length).toBeLessThanOrEqual(TOOL_CAP.roomy)
    expect(roomy.length).toBeGreaterThan(TOOL_CAP.metered)
  })

  it('`only` entrega exactamente lo pedido, sin recorte: un trabajo de un solo tiro sabe qué necesita', () => {
    const ids = ['fs.list', 'fs.read', 'fs.find']
    expect(names(allTools(ids))).toEqual(['fs_find', 'fs_list', 'fs_read'])
  })
})

describe('el router de herramientas internas', () => {
  it('no asigna herramientas a conversación y mantiene los dominios estables', () => {
    expect(routeToolDomains('hola, ¿cómo estás?')).toEqual([])
    expect(routeToolDomains('renombra este archivo')).toEqual(['files'])
    expect(routeToolDomains('ahora hazlo', 'renombra este archivo')).toEqual(['files'])
  })

  it('el presupuesto recorta a la cantidad pedida', () => {
    const specs: ToolSpec[] = Array.from({ length: MAX_INITIAL_TOOLS + 1 }, (_, i) => ({ name: `fs_${i}`, description: 'x', inputSchema: { type: 'object', properties: {} } }))
    expect(measureToolBudget(enforceToolBudget(specs)).total).toBe(MAX_INITIAL_TOOLS)
  })

  it('asigna los comandos UI a sus paquetes reales, no por prefijo', () => {
    expect(domainForCommand('ui.open')).toBe('files')
    expect(domainForCommand('ui.openFiles')).toBe('files')
    expect(domainForCommand('ui.openTrash')).toBe('files')
    expect(domainForCommand('ui.openBrowser')).toBe('apps')
    expect(domainForCommand('ui.openSettings')).toBe('apps')
    expect(domainForCommand('ui.openTerminal')).toBe('apps')
  })

  it.each([
    ['abre este archivo', 'ui.open'],
    ['crea un archivo', 'fs.createFile'],
    ['renombra este archivo', 'fs.rename'],
    ['lista mis archivos', 'fs.list'],
    ['lee este archivo', 'fs.read'],
    ['busca el archivo presupuesto', 'fs.find'],
    ['agrupa estos documentos en una carpeta', 'fs.move'],
    ['etiqueta estos archivos', 'fs.setTags'],
    ['cierra la ventana activa', 'ui.closeWindows'],
    ['añade un widget de reloj', 'widgets.create'],
    ['crea un lienzo', 'canvas.create'],
    ['actualiza el proyecto', 'project.update'],
    ['ejecuta el flujo diario', 'flows.run'],
    ['abre el navegador', 'ui.openBrowser'],
    ['cambia el tema a oscuro', 'ui.theme'],
    ['sincroniza con la nube', 'storage.syncStatus'],
    ['sintetiza estos archivos', 'tasks.synthesize'],
    ['me mudé a Monterrey', 'user.setLocation'],
  ])('incluye %s en un paquete acotado', (prompt, expectedId) => {
    const ids = routeInternalToolIds(prompt)
    expect(ids).toContain(expectedId)
    expect(ids.length).toBeLessThanOrEqual(MAX_INITIAL_TOOLS)
    expect(names(allTools(undefined, { prompt, strategy: 'compact' }))).toContain(expectedId.replace(/\./g, '_'))
  })
})

describe('la búsqueda de herramientas', () => {
  it('encuentra por palabra, sin acentos, y ordena por cuántas pegan', () => {
    expect(searchToolIds('widget reloj')).toContain('widgets.create')
    expect(searchToolIds('lienzo diagrama')[0]).toMatch(/^canvas\./)
    expect(searchToolIds('')).toEqual([])
  })
})
