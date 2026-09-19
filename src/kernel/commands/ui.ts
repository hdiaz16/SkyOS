import { registerCommand } from '../commands'
import { fs } from '../fs'
import { ROOT_ID, fileKind } from '../types'
import { useWindows } from '../../state/windows'
import { useUi } from '../../state/ui'
import { ACCENTS, BACKDROPS, useSettings, type Accent, type Backdrop, type Theme } from '../../state/settings'
import { GOOGLE_HOME, googleSearchUrl, titleForUrl, toNavigableUrl } from '../../lib/web'

/** Words that make these commands relevant; without one of them in the request, their tools stay home. */
const LOOK_WORDS = ['tema', 'oscuro', 'claro', 'modo noche', 'luz', 'apariencia', 'color', 'colores', 'paleta', 'fondo']

registerCommand<{ id: string }, void>({
  id: 'ui.open',
  title: 'Abrir',
  description: 'Abre un archivo o carpeta en una ventana con la aplicación adecuada.',
  params: { id: { type: 'string', description: 'Id del elemento.', required: true } },
  async run({ id }) {
    const node = await fs.get(id)
    if (!node) throw new Error('El elemento ya no existe')
    const wm = useWindows.getState()
    switch (fileKind(node)) {
      case 'folder':
        wm.open('files', { title: node.name, props: { folderId: id } })
        break
      case 'text':
        wm.open('editor', { title: node.name, props: { nodeId: id } })
        break
      case 'image':
        wm.open('image', { title: node.name, props: { nodeId: id } })
        break
      case 'pdf':
        wm.open('pdf', { title: node.name, props: { nodeId: id } })
        break
      case 'document':
      case 'spreadsheet':
      case 'presentation':
        wm.open('office', { title: node.name, props: { nodeId: id } })
        break
      case 'canvas':
        wm.open('canvas', { title: node.name, props: { nodeId: id } })
        break
      default:
        throw new Error(`Todavía no hay un visor para "${node.name}"`)
    }
    return { result: undefined }
  },
})

registerCommand<{ folderId?: string }, void>({
  id: 'ui.openFiles',
  title: 'Abrir Archivos',
  description: 'Abre el explorador de archivos en una carpeta.',
  params: { folderId: { type: 'string', description: 'Carpeta a mostrar. "root" es el escritorio.' } },
  async run({ folderId = ROOT_ID }) {
    const name = folderId === ROOT_ID ? 'Escritorio' : (await fs.get(folderId))?.name ?? 'Archivos'
    useWindows.getState().open('files', { title: name, props: { folderId } })
    return { result: undefined }
  },
})

registerCommand<{ url?: string; query?: string }, void>({
  id: 'ui.openBrowser',
  // Not a read: when a browser window is already open this replaces the page in it, and that window has no way
  // back. The address it had goes in the journal so there is one.
  risk: 'write',
  title: 'Abrir navegador',
  description: 'Abre el navegador web. Con "query" busca en Google; con "url" abre esa dirección. Sin parámetros abre Google.',
  params: {
    url: { type: 'string', description: 'Dirección a abrir.' },
    query: { type: 'string', description: 'Texto a buscar en Google.' },
  },
  async run({ url, query }) {
    const target = url ? toNavigableUrl(url) : query ? googleSearchUrl(query) : GOOGLE_HOME
    const wm = useWindows.getState()
    const existing = wm.windows.find((w) => w.app === 'browser')
    if (existing) {
      const before = typeof existing.props.url === 'string' ? existing.props.url : GOOGLE_HOME
      wm.setProps(existing.id, { url: target })
      wm.setTitle(existing.id, titleForUrl(target))
      wm.focus(existing.id)
      if (before === target) return { result: undefined }
      return {
        result: undefined,
        label: `Navegador en ${titleForUrl(target)}`,
        undo: { commandId: 'ui.openBrowser', params: { url: before } },
        ephemeral: true,
      }
    }
    wm.open('browser', { title: titleForUrl(target), props: { url: target } })
    return { result: undefined }
  },
})

registerCommand<Record<string, never>, void>({
  id: 'ui.openTrash',
  title: 'Abrir papelera',
  description: 'Muestra la papelera.',
  params: {},
  async run() {
    useWindows.getState().open('trash', { singleton: true })
    return { result: undefined }
  },
})

registerCommand<Record<string, never>, void>({
  id: 'ui.openTerminal',
  title: 'Abrir terminal',
  description: 'Abre la terminal en lenguaje natural de Sky.',
  params: {},
  async run() {
    useWindows.getState().open('terminal', { singleton: true })
    return { result: undefined }
  },
})

registerCommand<Record<string, never>, void>({
  id: 'ui.openSettings',
  title: 'Abrir ajustes',
  description: 'Muestra los ajustes de Sky.',
  params: {},
  async run() {
    useWindows.getState().open('settings', { singleton: true })
    return { result: undefined }
  },
})

const THEME_NAMES: Record<Theme, string> = { system: 'del sistema', light: 'claro', dark: 'oscuro' }

registerCommand<{ theme?: Theme }, Theme>({
  id: 'ui.theme',
  risk: 'write',
  keywords: LOOK_WORDS,
  title: 'Cambiar tema',
  description: 'Cambia entre tema claro, oscuro o el del sistema. Sin parámetro alterna al siguiente.',
  params: { theme: { type: 'string', description: 'system, light o dark', enum: ['system', 'light', 'dark'] } },
  async run({ theme }) {
    const s = useSettings.getState()
    const before = s.theme
    if (theme) s.setTheme(theme)
    else s.cycleTheme()
    const next = useSettings.getState().theme
    // The only write in this group that had no inverse: the dialog promised «se puede deshacer después» and
    // then the entry showed up with nothing to press.
    return { result: next, label: `Tema ${THEME_NAMES[next]}`, undo: next === before ? undefined : { commandId: 'ui.theme', params: { theme: before } } }
  },
})

registerCommand<{ theme?: Theme; accent?: Accent; backdrop?: Backdrop }, { theme: Theme; accent: Accent; backdrop: Backdrop }>({
  id: 'ui.appearance',
  risk: 'write',
  keywords: LOOK_WORDS,
  title: 'Cambiar la apariencia',
  description: `Personaliza el escritorio: tema (system, light, dark), color de acento (${ACCENTS.map((a) => a.value).join(', ')}) y fondo (${BACKDROPS.map((b) => b.value).join(', ')}). Manda solo lo que cambia. Para "ponlo azul" usa accent cielo; "más cálido" es accent arena o backdrop atardecer; "modo noche" es theme dark.`,
  params: {
    theme: { type: 'string', description: 'system, light o dark', enum: ['system', 'light', 'dark'] },
    accent: { type: 'string', description: 'Color de acento.', enum: ACCENTS.map((a) => a.value) },
    backdrop: { type: 'string', description: 'Fondo del escritorio.', enum: BACKDROPS.map((b) => b.value) },
  },
  async run({ theme, accent, backdrop }) {
    const s = useSettings.getState()
    const before = { theme: s.theme, accent: s.accent, backdrop: s.backdrop }
    if (theme && theme !== s.theme) s.setTheme(theme)
    if (accent && accent !== s.accent) s.setAccent(accent)
    if (backdrop && backdrop !== s.backdrop) s.setBackdrop(backdrop)
    const after = useSettings.getState()
    const changes = [
      theme && theme !== before.theme ? `tema ${THEME_NAMES[theme]}` : '',
      accent && accent !== before.accent ? `acento ${ACCENTS.find((a) => a.value === accent)?.label.toLowerCase() ?? accent}` : '',
      backdrop && backdrop !== before.backdrop ? `fondo ${BACKDROPS.find((b) => b.value === backdrop)?.label.toLowerCase() ?? backdrop}` : '',
    ].filter(Boolean)
    const result = { theme: after.theme, accent: after.accent, backdrop: after.backdrop }
    if (!changes.length) return { result }
    // Not a toggle: the inverse carries the exact values that were there, so undoing puts back what was.
    return { result, label: `Apariencia: ${changes.join(', ')}`, undo: { commandId: 'ui.appearance', params: before } }
  },
})

registerCommand<Record<string, never>, void>({
  id: 'ui.palette',
  risk: 'write',
  keywords: LOOK_WORDS,
  title: 'Barra de Sky',
  description: 'Lleva el foco a la barra principal.',
  ai: false,
  params: {},
  async run() {
    useUi.getState().focusComposer()
    return { result: undefined }
  },
})
