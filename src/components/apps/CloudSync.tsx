import { useState, type ReactNode } from 'react'
import { Check, Cloud, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { dispatch, useToasts } from '../../kernel/commands'
import { useMcp } from '../../mcp/manager'
import { DEFAULT_SYNC_FOLDER, syncNow, useSync } from '../../system/sync'
import { connectOneDrive, disconnectOneDrive, oneDriveClientId, oneDriveConnected, setOneDriveClientId } from '../../system/sync/providers/onedrive'
import type { SyncProviderId } from '../../system/sync/types'
import { cn } from '../../lib/utils'

interface ProviderRow {
  id: SyncProviderId
  name: string
  note: string
}

const ROWS: ProviderRow[] = [
  { id: 'google-drive', name: 'Google Drive', note: 'Usa la conexión de Apps conectadas; guarda en una carpeta SkyOS de tu Drive.' },
  { id: 'dropbox', name: 'Dropbox', note: 'Usa la conexión de Apps conectadas; guarda en /SkyOS.' },
  { id: 'onedrive', name: 'OneDrive', note: 'Microsoft no ofrece MCP para cuentas personales: inicia sesión aquí con tu propia app de Microsoft Entra.' },
]

const ago = (at: number) => {
  const min = Math.round((Date.now() - at) / 60_000)
  return min < 1 ? 'hace un momento' : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`
}

/** Settings › Almacenamiento: pick your cloud, what to sync, and watch it happen. */
export function CloudSyncPanel() {
  const { settings, running, lastRun, update } = useSync()
  const servers = useMcp((s) => s.servers)
  const [, bump] = useState(0)
  const [clientDraft, setClientDraft] = useState(oneDriveClientId())
  const [leaving, setLeaving] = useState(false)
  /** The Entra block only appears to whoever is actually setting OneDrive up. */
  const [settingUp, setSettingUp] = useState(false)

  const ready = (id: SyncProviderId) => (id === 'onedrive' ? oneDriveConnected() : servers.find((s) => s.id === id)?.status === 'connected')
  const active = settings.providerId && ready(settings.providerId) ? settings.providerId : null

  const choose = (id: SyncProviderId) => update({ providerId: id, enabled: true })

  const connect = async (id: SyncProviderId) => {
    if (id !== 'onedrive') {
      await dispatch('ui.openApps', { app: id })
      return
    }
    // The hardest jargon in all of Ajustes — a GUID, a redirect URI, Files.ReadWrite.AppFolder — used to sit in
    // Almacenamiento for everyone, including people who only use Google Drive and never asked about OneDrive.
    if (!oneDriveClientId()) {
      setSettingUp(true)
      useToasts.getState().push({ message: 'OneDrive necesita el id de aplicación de Microsoft Entra. Te lo pido abajo.', kind: 'info' })
      return
    }
    setLeaving(true)
    try {
      await connectOneDrive()
    } catch (err) {
      setLeaving(false)
      useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo iniciar la conexión', kind: 'error' })
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Cloud className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">Nube: tus archivos en tu propio almacenamiento</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
            Todo vive en este navegador. Si quieres, SkyOS mantiene una copia en tu Google Drive, Dropbox o OneDrive y otro dispositivo con la misma cuenta baja lo
            que le falte. Son tus cuentas y tu espacio; nada pasa por servidores de SkyOS.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {ROWS.map((row) => {
          const on = ready(row.id)
          const selected = active === row.id
          return (
            <div key={row.id} className={cn('flex items-center gap-3 rounded-xl border p-3 transition', selected ? 'border-accent/60 bg-accent-soft/40' : 'border-line')}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white p-1.5 shadow-soft">
                <img src={`/brands/${row.id}.svg`} alt="" className="h-full w-full object-contain" draggable={false} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  {row.name}
                  <span className={cn('rounded-full px-1.5 py-px text-[10px] font-medium', on ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-3')}>{on ? 'Conectado' : 'Sin conectar'}</span>
                </p>
                <p className="text-[11.5px] leading-snug text-ink-3">{row.note}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {on ? (
                  <button
                    type="button"
                    onClick={() => choose(row.id)}
                    disabled={selected}
                    className={cn('flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium transition', selected ? 'text-accent' : 'bg-accent text-white hover:brightness-110')}
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                    {selected ? 'En uso' : 'Usar'}
                  </button>
                ) : (
                  <button type="button" onClick={() => void connect(row.id)} disabled={leaving} className="rounded-full border border-line px-3 py-1 text-[12px] font-medium text-ink transition hover:bg-surface-2">
                    {row.id === 'onedrive' && leaving ? 'Te llevo a Microsoft…' : 'Conectar'}
                  </button>
                )}
                {row.id === 'onedrive' && on && (
                  <button
                    type="button"
                    onClick={() => {
                      disconnectOneDrive()
                      if (settings.providerId === 'onedrive') update({ providerId: null, enabled: false })
                      bump((n) => n + 1)
                    }}
                    className="rounded-full px-2 py-1 text-[12px] text-ink-3 transition hover:text-danger"
                  >
                    Desconectar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {settingUp && !oneDriveConnected() && (
        <form
          className="flex flex-col gap-1.5 rounded-xl bg-surface-2/60 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            const clean = clientDraft.trim()
            setOneDriveClientId(clean)
            // Pasting it and pressing Enter used to do nothing at all: it was only kept on blur, with no sign
            // that anything had been kept.
            useToasts.getState().push({ message: clean ? 'Id guardado. Ya puedes darle a Conectar.' : 'Id borrado.', kind: 'info' })
          }}
        >
          <label className="text-[12px] font-medium text-ink-2" htmlFor="onedrive-client">
            Id de aplicación de Microsoft Entra (para OneDrive)
          </label>
          <div className="flex gap-2">
            <input
              id="onedrive-client"
              value={clientDraft}
              onChange={(e) => setClientDraft(e.target.value)}
              onBlur={() => setOneDriveClientId(clientDraft.trim())}
              placeholder="00000000-0000-0000-0000-000000000000"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-soft transition hover:brightness-110">
              Guardar
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-3">
            Registra una aplicación de tipo «Aplicación de página única» con la URI de redirección{' '}
            <code className="rounded bg-surface px-1">{`${window.location.origin}/oauth/callback`}</code> y el permiso Files.ReadWrite.AppFolder.{' '}
            <a href="https://learn.microsoft.com/entra/identity-platform/quickstart-register-app" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
              Cómo registrarla
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </form>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-medium text-ink-2">Qué se sincroniza</p>
        <div className="flex flex-wrap gap-1.5">
          <ScopeChip selected={settings.scope.mode === 'folder'} onClick={() => update({ scope: { mode: 'folder', name: DEFAULT_SYNC_FOLDER } })}>
            Carpeta «{DEFAULT_SYNC_FOLDER}» del escritorio
          </ScopeChip>
          <ScopeChip selected={settings.scope.mode === 'all'} onClick={() => update({ scope: { mode: 'all' } })}>
            Todo el escritorio
          </ScopeChip>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">Sincronización automática</p>
          <p className="truncate text-[12px] text-ink-3">
            {running ? 'Sincronizando…' : lastRun ? `${lastRun.ok ? 'Última vez' : 'Falló'} ${ago(lastRun.at)} · ${lastRun.summary}` : active ? 'Cada 5 minutos y al cambiar archivos' : 'Elige una nube conectada'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void syncNow('manual')}
            disabled={!active || running}
            className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-ink transition hover:bg-surface-2 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizar ahora
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled && !!active}
            aria-label="Sincronización automática"
            disabled={!active}
            onClick={() => update({ enabled: !settings.enabled })}
            className={cn('relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', settings.enabled && active ? 'bg-accent' : 'bg-line-2')}
          >
            <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition', settings.enabled && active ? 'left-[22px]' : 'left-0.5')} />
          </button>
        </div>
      </div>
    </div>
  )
}

function ScopeChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('rounded-full border px-3 py-1 text-[12px] font-medium transition', selected ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2')}
    >
      {children}
    </button>
  )
}
