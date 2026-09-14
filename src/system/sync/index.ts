import { create } from 'zustand'
import { useToasts } from '../../kernel/commands'
import { useWindows } from '../../state/windows'
import { useJobs } from '../jobs'
import { sessionSuffix } from '../session'
import { runSync, type SyncReport, type SyncScope } from './engine'
import { dropbox } from './providers/dropbox'
import { googleDrive } from './providers/googleDrive'
import { oneDrive, resumeOneDrive } from './providers/onedrive'
import type { SyncProvider, SyncProviderId } from './types'

/**
 * Hybrid storage: everything lives in this browser and, when the person wants, a copy lives in their own
 * cloud (Google Drive, Dropbox or OneDrive). Another device signed into the same cloud account pulls what it
 * lacks. Runs as a tracked background job; a card says what moved.
 */

export const SYNC_PROVIDERS: SyncProvider[] = [googleDrive, dropbox, oneDrive]

export const providerById = (id: SyncProviderId | null | undefined): SyncProvider | undefined => SYNC_PROVIDERS.find((p) => p.id === id)

export interface SyncSettings {
  enabled: boolean
  providerId: SyncProviderId | null
  scope: SyncScope
}

export interface LastRun {
  at: number
  ok: boolean
  summary: string
}

interface SyncStore {
  settings: SyncSettings
  running: boolean
  lastRun: LastRun | null
  update: (patch: Partial<SyncSettings>) => void
}

export const DEFAULT_SYNC_FOLDER = 'Nube'
const DEFAULTS: SyncSettings = { enabled: false, providerId: null, scope: { mode: 'folder', name: DEFAULT_SYNC_FOLDER } }

const key = () => `mesa:sync${sessionSuffix()}`

function readSettings(): SyncSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(key()) ?? '{}') as Partial<SyncSettings>) }
  } catch {
    return DEFAULTS
  }
}

function readLastRun(): LastRun | null {
  try {
    const raw = localStorage.getItem(`${key()}:last`)
    return raw ? (JSON.parse(raw) as LastRun) : null
  } catch {
    return null
  }
}

function saveLastRun(run: LastRun): void {
  useSync.setState({ lastRun: run })
  try {
    localStorage.setItem(`${key()}:last`, JSON.stringify(run))
  } catch {
    // the status simply does not survive a reload
  }
}

export const useSync = create<SyncStore>((set, get) => ({
  settings: readSettings(),
  running: false,
  lastRun: readLastRun(),
  update: (patch) => {
    const settings = { ...get().settings, ...patch }
    try {
      localStorage.setItem(key(), JSON.stringify(settings))
    } catch {
      // storage unavailable: the choice lasts the session
    }
    set({ settings })
  },
}))

export const INTERVAL_MS = 5 * 60_000
/** Automatic passes never run closer than this; a download changes files, which would otherwise schedule another pass. */
const MIN_GAP_MS = 45_000
let lastStartedAt = 0

export function summarize(r: SyncReport): string {
  const parts: string[] = []
  if (r.uploaded) parts.push(`${r.uploaded} ${r.uploaded === 1 ? 'subido' : 'subidos'}`)
  if (r.downloaded) parts.push(`${r.downloaded} ${r.downloaded === 1 ? 'descargado' : 'descargados'}`)
  if (r.conflicts) parts.push(`${r.conflicts} ${r.conflicts === 1 ? 'conflicto' : 'conflictos'}`)
  if (r.deletedLocal + r.deletedRemote) parts.push(`${r.deletedLocal + r.deletedRemote} ${r.deletedLocal + r.deletedRemote === 1 ? 'borrado' : 'borrados'}`)
  if (r.skipped) parts.push(`${r.skipped} omitidos por tamaño`)
  const base = parts.length ? parts.join(' · ') : 'Todo al día'
  return r.errors.length ? `${base} · ${r.errors.length} con error` : base
}

export type SyncReason = 'manual' | 'auto' | 'command'

/** One pass as a tracked job. Automatic passes stay quiet unless something moved or failed. */
export async function syncNow(reason: SyncReason = 'manual'): Promise<SyncReport | null> {
  const { settings, running } = useSync.getState()
  const provider = providerById(settings.providerId)
  if (!provider || running) return null
  if (reason === 'auto' && (Date.now() - lastStartedAt < MIN_GAP_MS || !navigator.onLine)) return null
  if (!(await provider.ready())) {
    if (reason !== 'auto') useToasts.getState().push({ message: `${provider.name} no está conectado.`, kind: 'error' })
    return null
  }
  useSync.setState({ running: true })
  lastStartedAt = Date.now()
  const jobId = useJobs.getState().start({ kind: 'sync', title: `Sincronizando con ${provider.name}`, detail: 'Comparando archivos…', quiet: reason === 'auto' })
  try {
    const report = await runSync(provider, settings.scope, (done, total, detail) => useJobs.getState().update(jobId, { progress: total ? done / total : 1, detail }))
    const summary = summarize(report)
    const moved = report.uploaded + report.downloaded + report.conflicts + report.deletedLocal + report.deletedRemote > 0
    saveLastRun({ at: Date.now(), ok: report.errors.length === 0, summary })
    useJobs.getState().finish(jobId, {
      detail: summary,
      quiet: reason === 'auto' && !moved && !report.errors.length,
      ...(report.errors.length ? { error: `${summary}. ${report.errors[0]}` } : {}),
    })
    return report
  } catch (err) {
    const text = err instanceof Error ? err.message : 'La sincronización falló'
    saveLastRun({ at: Date.now(), ok: false, summary: text })
    useJobs.getState().finish(jobId, { error: text, quiet: false })
    return null
  } finally {
    useSync.setState({ running: false })
  }
}

function openStorageSettings(): void {
  const wm = useWindows.getState()
  const id = wm.open('settings', { singleton: true, props: { section: 'storage' } })
  wm.setProps(id, { section: 'storage' })
}

/** Finishes a OneDrive sign-in if the person just came back, then keeps the cloud in step while the desktop is open. */
export function startSync(): () => void {
  void resumeOneDrive()
    .then((connected) => {
      if (!connected) return
      useSync.getState().update({ providerId: 'onedrive', enabled: true })
      useToasts.getState().push({ message: 'OneDrive conectado', kind: 'info' })
      openStorageSettings()
      void syncNow('manual')
    })
    .catch((err: unknown) => useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo conectar OneDrive', kind: 'error' }))

  const tick = () => {
    if (useSync.getState().settings.enabled) void syncNow('auto')
  }
  const timer = window.setInterval(tick, INTERVAL_MS)
  const first = window.setTimeout(tick, 8000)
  window.addEventListener('online', tick)
  return () => {
    window.clearInterval(timer)
    window.clearTimeout(first)
    window.removeEventListener('online', tick)
  }
}
