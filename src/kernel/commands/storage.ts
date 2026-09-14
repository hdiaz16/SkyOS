import { registerCommand } from '../commands'
import { providerById, summarize, syncNow, useSync } from '../../system/sync'
import { useWindows } from '../../state/windows'

/** Cloud sync from the bar: "sincroniza con Drive", "¿está todo respaldado?". */

const SYNC_WORDS = ['sincroniza', 'sincronizar', 'sincronización', 'sincronizacion', 'nube', 'respaldo', 'respalda', 'respaldar', 'copia de seguridad', 'dispositivos', 'drive', 'dropbox', 'onedrive']

registerCommand<Record<string, never>, string>({
  id: 'storage.sync',
  title: 'Sincronizar con la nube',
  description: 'Sube y baja lo que cambió entre el escritorio y la nube elegida (Google Drive, Dropbox u OneDrive). Corre en segundo plano; devuelve el resumen. Si no hay nube configurada, dilo y abre Ajustes › Almacenamiento con ui.openSettings.',
  params: {},
  keywords: SYNC_WORDS,
  async run() {
    const { settings } = useSync.getState()
    const provider = providerById(settings.providerId)
    if (!provider || !(await provider.ready())) {
      const wm = useWindows.getState()
      const id = wm.open('settings', { singleton: true, props: { section: 'storage' } })
      wm.setProps(id, { section: 'storage' })
      return { result: 'No hay una nube lista. Abrí Ajustes › Almacenamiento para que la persona elija y conecte una.' }
    }
    const report = await syncNow('command')
    return { result: report ? `Sincronizado con ${provider.name}: ${summarize(report)}` : `Ya había una sincronización en curso con ${provider.name}.` }
  },
})

registerCommand<Record<string, never>, { enabled: boolean; provider?: string; scope: string; running: boolean; lastRun?: string }>({
  id: 'storage.syncStatus',
  title: 'Estado de la nube',
  description: 'Dice qué nube está configurada, qué se sincroniza y cómo terminó la última pasada.',
  params: {},
  keywords: SYNC_WORDS,
  async run() {
    const { settings, running, lastRun } = useSync.getState()
    const provider = providerById(settings.providerId)
    return {
      result: {
        enabled: settings.enabled && !!provider,
        provider: provider?.name,
        scope: settings.scope.mode === 'all' ? 'todo el escritorio' : `carpeta «${settings.scope.name}»`,
        running,
        lastRun: lastRun ? `${lastRun.ok ? 'ok' : 'error'} · ${new Date(lastRun.at).toLocaleString('es-MX')} · ${lastRun.summary}` : undefined,
      },
    }
  },
})
