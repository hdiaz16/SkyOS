import { registerCommand } from '../commands'
import { providerById, summarize, syncNow, useSync } from '../../system/sync'
import { useWindows } from '../../state/windows'

/** Cloud sync from the bar: "sincroniza con Drive", "¿está todo respaldado?". */

const SYNC_WORDS = ['sincroniza', 'sincronizar', 'sincronización', 'sincronizacion', 'nube', 'respaldo', 'respalda', 'respaldar', 'copia de seguridad', 'dispositivos', 'drive', 'dropbox', 'onedrive']

registerCommand<Record<string, never>, string>({
  id: 'storage.sync',
  risk: 'external',
  title: 'Sincronizar con la nube',
  // Consult storage.syncStatus first: this one is 'external', so the gate asks with the language of what
  // cannot be undone, and it used to ask that before discovering there was no cloud to sync with at all.
  description:
    'Sube y baja lo que cambió entre el escritorio y la nube elegida (Google Drive, Dropbox u OneDrive). Corre en segundo plano; devuelve el resumen. Consulta storage.syncStatus antes y llámalo solo si enabled es true.',
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
    return report
      ? {
          result: `Sincronizado con ${provider.name}: ${summarize(report)}`,
          // A pass that uploaded 12 files and deleted 3 in the cloud left no trace in «Lo que hice», while
          // minimising a window did: this was the only 'external' command the journal never heard of. It does
          // now, marked «En la app» like the MCP calls.
          label: `Sincronizado con ${provider.name} · ${summarize(report)}`,
          external: true,
        }
      : { result: `Ya había una sincronización en curso con ${provider.name}.` }
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
