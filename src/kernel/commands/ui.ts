import { registerCommand } from '../commands'
import { fs } from '../fs'
import { ROOT_ID, fileKind } from '../types'
import { useWindows } from '../../state/windows'
import { useUi } from '../../state/ui'
import { useSettings, type Theme } from '../../state/settings'

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
  id: 'ui.openSettings',
  title: 'Abrir ajustes',
  description: 'Muestra los ajustes de Mesa.',
  params: {},
  async run() {
    useWindows.getState().open('settings', { singleton: true })
    return { result: undefined }
  },
})

registerCommand<{ theme?: Theme }, Theme>({
  id: 'ui.theme',
  title: 'Cambiar tema',
  description: 'Cambia entre tema claro, oscuro o el del sistema. Sin parámetro alterna al siguiente.',
  params: { theme: { type: 'string', description: 'system, light o dark', enum: ['system', 'light', 'dark'] } },
  async run({ theme }) {
    const s = useSettings.getState()
    if (theme) s.setTheme(theme)
    else s.cycleTheme()
    return { result: useSettings.getState().theme }
  },
})

registerCommand<Record<string, never>, void>({
  id: 'ui.palette',
  title: 'Barra universal',
  description: 'Abre la barra de búsqueda y acciones.',
  ai: false,
  params: {},
  async run() {
    useUi.getState().setPalette(true)
    return { result: undefined }
  },
})
