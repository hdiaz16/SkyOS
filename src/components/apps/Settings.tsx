import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Plug,
  RefreshCw,
  Sun,
  Trash2,
  UserRound,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react'
import { fs } from '../../kernel/fs'
import { flows } from '../../kernel/flows'
import { dispatch, useToasts } from '../../kernel/commands'
import { useSettings, type Theme } from '../../state/settings'
import { AUTO_MODEL, isAiConfigured, presetFor, PROVIDERS, resolveKey, useAiSettings, usesSharedKey, type ProviderId } from '../../ai/settings'
import { getProvider } from '../../ai/providers'
import { listModels } from '../../ai/providers/openaiCompat'
import { TIER_LABELS } from '../../ai/router'
import { AiError, type Effort } from '../../ai/types'
import { useAuth } from '../../system/auth'
import { users } from '../../system/users'
import { useDialog } from '../../state/dialog'
import { cn, formatBytes } from '../../lib/utils'
import { Avatar } from '../system/Login'
import { AppsSummary } from './Apps'

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
]

const EFFORTS: { value: Effort; label: string; hint: string }[] = [
  { value: 'low', label: 'Rápida', hint: 'Responde al instante, ideal para acciones simples' },
  { value: 'medium', label: 'Equilibrada', hint: 'Buen balance entre velocidad y criterio' },
  { value: 'high', label: 'Profunda', hint: 'Piensa más antes de actuar; tarda más' },
]

export function SettingsApp() {
  const theme = useSettings((s) => s.theme)
  const setTheme = useSettings((s) => s.setTheme)
  const stats = useLiveQuery(() => fs.stats(), [])
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => undefined)
  }, [stats])

  const pct = estimate && estimate.quota ? Math.min(100, (estimate.usage / estimate.quota) * 100) : 0

  return (
    <div className="scrollbar-thin h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-[460px] flex-col gap-7">
        <Section icon={<UserRound className="h-4 w-4" />} title="Tu cuenta">
          <AccountSection />
        </Section>

        <Section icon={<Bot className="h-4 w-4" />} title="Inteligencia">
          <AiSection />
        </Section>

        <Section icon={<Plug className="h-4 w-4" />} title="Apps conectadas">
          <AppsSummary onOpen={() => void dispatch('ui.openApps')} />
        </Section>

        <Section icon={<Zap className="h-4 w-4" />} title="Flujos guardados">
          <FlowsSection />
        </Section>

        <Section icon={<Palette className="h-4 w-4" />} title="Apariencia">
          <Segmented
            value={theme}
            onChange={setTheme}
            options={THEMES.map((t) => ({ value: t.value, label: t.label, icon: <t.icon className="h-4 w-4" strokeWidth={1.75} /> }))}
          />
        </Section>

        <Section icon={<HardDrive className="h-4 w-4" />} title="Almacenamiento">
          <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <Row label="Dónde viven tus archivos">{fs.engine === 'opfs' ? 'Sistema de archivos del navegador' : 'IndexedDB'}</Row>
            <Row label="Contenido">
              {stats ? `${stats.files} archivos · ${stats.folders} carpetas · ${formatBytes(stats.bytes)}` : '…'}
            </Row>
            <div>
              <Row label="Espacio del navegador">
                {estimate ? `${formatBytes(estimate.usage)} de ${formatBytes(estimate.quota)}` : '…'}
              </Row>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(pct, 0.5)}%` }} />
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-3">
              Cada cuenta tiene su propio espacio en este navegador. Tus archivos solo viajan al proveedor de IA cuando le pides algo que los necesita.
            </p>
          </div>
        </Section>

        <p className="text-center text-[11px] text-ink-3">Sky 0.3</p>
      </div>
    </div>
  )
}

function AccountSection() {
  const user = useAuth((s) => s.current)
  if (!user) return null

  const changePin = async () => {
    const pin = await useDialog.getState().ask({
      title: user.pinHash ? 'Nuevo PIN' : 'Crear un PIN',
      description: 'Cuatro a seis dígitos. Deja el campo vacío y confirma para quitar el PIN.',
      placeholder: '••••',
      confirmLabel: 'Guardar',
    })
    if (pin === null) return
    const digits = pin.replace(/\D/g, '')
    if (digits && (digits.length < 4 || digits.length > 6)) {
      useToasts.getState().push({ message: 'El PIN debe tener entre 4 y 6 dígitos.', kind: 'error' })
      return
    }
    await users.setPin(user.id, digits || null)
    await useAuth.getState().refreshCurrent()
    useToasts.getState().push({ message: digits ? 'PIN actualizado' : 'PIN eliminado', kind: 'info' })
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-4">
      <Avatar user={user} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{user.name}</p>
        <p className="text-[12px] text-ink-3">
          {user.profile.location?.place ?? 'Sin ubicación'} · {user.pinHash ? 'Con PIN' : 'Sin PIN'}
        </p>
      </div>
      <button
        type="button"
        title={user.profile.voice === false ? 'Activar la voz de Sky' : 'Silenciar la voz de Sky'}
        onClick={async () => {
          await users.updateProfile(user.id, { voice: user.profile.voice === false }, user.profile)
          await useAuth.getState().refreshCurrent()
        }}
        className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition hover:bg-surface-2', user.profile.voice === false ? 'text-ink-3' : 'text-ink-2 hover:text-ink')}
      >
        {user.profile.voice === false ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        Voz
      </button>
      <button type="button" onClick={() => void changePin()} className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink">
        {user.pinHash ? 'Cambiar PIN' : 'Poner PIN'}
      </button>
      <button
        type="button"
        onClick={() => useAuth.getState().logout()}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink"
      >
        <LogOut className="h-3.5 w-3.5" />
        Salir
      </button>
    </div>
  )
}

function AiSection() {
  const ai = useAiSettings()
  const preset = presetFor(ai.provider)
  const configured = isAiConfigured(ai)
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; message?: string }>({ state: 'idle' })
  const [loadingModels, setLoadingModels] = useState(false)

  const providers = PROVIDERS.filter((p) => !p.devOnly || import.meta.env.DEV)
  const baseUrl = ai.baseUrls[ai.provider] ?? ''
  const isCompat = ai.provider !== 'anthropic' && ai.provider !== 'mock'
  const discovered = ai.discovered[ai.provider] ?? []
  const knownIds = new Set(preset.models.map((m) => m.id))
  const extraModels = discovered.filter((id) => !knownIds.has(id))
  // Sky's included key is resolved at request time and never shown; the field only ever holds the person's own.
  const shared = usesSharedKey(ai)

  const runTest = async () => {
    setTest({ state: 'running' })
    try {
      const provider = getProvider(ai)
      if (!provider) throw new AiError('Falta completar la configuración.')
      const model = ai.model === AUTO_MODEL ? preset.tiers?.fast ?? '' : ai.model
      let out = ''
      for await (const ev of provider.chat({
        model,
        system: 'Responde únicamente con la palabra OK.',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Prueba de conexión' }] }],
        maxTokens: 2000,
        effort: 'low',
      })) {
        if (ev.type === 'text') out += ev.delta
        if (ev.type === 'error') throw ev.error
      }
      setTest({ state: 'ok', message: `Conectado · respondió "${out.trim().slice(0, 30) || '…'}"` })
    } catch (err) {
      setTest({ state: 'fail', message: err instanceof Error ? err.message : 'No se pudo conectar' })
    }
  }

  const refreshModels = async () => {
    setLoadingModels(true)
    try {
      const ids = await listModels(baseUrl || preset.baseUrl || '', resolveKey(ai), shared)
      ai.setDiscovered(ai.provider, ids)
      useToasts.getState().push({ message: `${ids.length} modelos disponibles en ${preset.name}`, kind: 'info' })
    } catch (err) {
      useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo consultar la lista', kind: 'error' })
    } finally {
      setLoadingModels(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-2">Estado</span>
        <span className={cn('flex items-center gap-1.5 text-[12px] font-medium', configured ? 'text-accent' : 'text-ink-3')}>
          <span className={cn('h-1.5 w-1.5 rounded-full', configured ? 'bg-accent' : 'bg-ink-3')} />
          {configured ? 'Lista para trabajar' : 'Falta configurar'}
        </span>
      </div>

      <Field label="Proveedor" hint={preset.tagline}>
        <select
          value={ai.provider}
          onChange={(e) => {
            ai.setProvider(e.target.value as ProviderId)
            setTest({ state: 'idle' })
          }}
          className="h-9 w-full rounded-lg border border-line bg-surface-solid px-2.5 text-[13px] text-ink outline-none focus:border-accent"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      {preset.needsKey && (
        <Field
          label="Llave de API"
          hint={
            <>
              {shared && 'Sky ya trae una llave para que funcione desde el primer día; si pegas la tuya, usará tu cuenta. '}
              Se guarda solo en este navegador, dentro de tu cuenta, y viaja únicamente al proveedor.
              {preset.keyUrl && (
                <>
                  {' '}
                  <a href={preset.keyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
                    Crear llave
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </>
          }
        >
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={ai.keys[ai.provider] ?? ''}
              onChange={(e) => {
                ai.setKey(ai.provider, e.target.value)
                setTest({ state: 'idle' })
              }}
              placeholder={shared ? 'Incluida con Sky · pega la tuya si prefieres usar tu cuenta' : ai.provider === 'anthropic' ? 'sk-ant-…' : ai.provider === 'groq' ? 'gsk_…' : 'sk-…'}
              spellCheck={false}
              autoComplete="off"
              className="h-9 w-full rounded-lg border border-line bg-surface-solid px-2.5 pr-9 font-mono text-[13px] text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? 'Ocultar llave' : 'Mostrar llave'}
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:text-ink"
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </Field>
      )}

      {isCompat && (
        <Field label="URL base" hint={preset.baseUrl ? `Por defecto ${preset.baseUrl}` : 'Endpoint compatible con OpenAI, sin /chat/completions'}>
          <input
            value={baseUrl}
            onChange={(e) => ai.setBaseUrl(ai.provider, e.target.value)}
            placeholder={preset.baseUrl || 'https://mi-servidor/v1'}
            spellCheck={false}
            className="h-9 w-full rounded-lg border border-line bg-surface-solid px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent"
          />
        </Field>
      )}

      <Field
        label="Modelo"
        hint={
          ai.model === AUTO_MODEL && preset.tiers
            ? `Automático: ${TIER_LABELS.fast} → ${labelOf(preset, preset.tiers.fast)}; ${TIER_LABELS.deep} → ${labelOf(preset, preset.tiers.deep)}. Sky elige según la dificultad de cada petición.`
            : undefined
        }
      >
        <div className="flex flex-col gap-1.5">
          {preset.tiers && (
            <ModelOption selected={ai.model === AUTO_MODEL} onClick={() => ai.setModel(AUTO_MODEL)} label="Automático" hint="según la tarea" recommended />
          )}
          {preset.models.map((m) => (
            <ModelOption
              key={m.id}
              selected={ai.model === m.id}
              onClick={() => ai.setModel(m.id)}
              label={m.label}
              hint={m.tier === 'deep' ? 'más criterio' : m.tier === 'fast' ? 'más rápido' : 'equilibrado'}
            />
          ))}
          {extraModels.length > 0 && (
            <select
              value={extraModels.includes(ai.model) ? ai.model : ''}
              onChange={(e) => e.target.value && ai.setModel(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-surface-solid px-2.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
            >
              <option value="">Otros modelos del proveedor…</option>
              {extraModels.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          )}
          {isCompat && (
            <div className="flex items-center gap-2">
              {preset.models.length === 0 && (
                <input
                  value={ai.model === AUTO_MODEL ? '' : ai.model}
                  onChange={(e) => ai.setModel(e.target.value)}
                  placeholder={preset.modelHint}
                  spellCheck={false}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-solid px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent"
                />
              )}
              <button
                type="button"
                disabled={loadingModels || (preset.needsKey && !resolveKey(ai))}
                onClick={() => void refreshModels()}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] text-ink-2 transition hover:border-line-2 hover:text-ink disabled:opacity-40"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loadingModels && 'animate-spin')} />
                Consultar modelos disponibles
              </button>
            </div>
          )}
        </div>
      </Field>

      {ai.provider === 'anthropic' && (
        <Field label="Profundidad" hint={EFFORTS.find((e) => e.value === ai.effort)?.hint}>
          <Segmented value={ai.effort} onChange={ai.setEffort} options={EFFORTS.map((e) => ({ value: e.value, label: e.label }))} />
        </Field>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
          {test.state === 'running' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
          {test.state === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />}
          {test.state === 'fail' && <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />}
          <span className={cn('truncate', test.state === 'fail' && 'text-danger', test.state === 'ok' && 'text-ink-2')}>{test.message}</span>
        </span>
        <button
          type="button"
          disabled={!configured || test.state === 'running'}
          onClick={() => void runTest()}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40"
        >
          Probar conexión
        </button>
      </div>
    </div>
  )
}

function labelOf(preset: ReturnType<typeof presetFor>, id: string): string {
  return preset.models.find((m) => m.id === id)?.label ?? id
}

function ModelOption({ selected, onClick, label, hint, recommended }: { selected: boolean; onClick: () => void; label: string; hint: string; recommended?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px] transition',
        selected ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2 hover:border-line-2 hover:text-ink',
      )}
    >
      <span className="flex items-center gap-2">
        {label}
        {recommended && <span className="rounded-md bg-accent px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-white">recomendado</span>}
      </span>
      <span className="text-[11px] uppercase tracking-wide text-ink-3">{hint}</span>
    </button>
  )
}

function FlowsSection() {
  const list = useLiveQuery(() => flows.list(), []) ?? []
  if (list.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-2 p-4 text-[12px] leading-relaxed text-ink-3">
        Aún no hay flujos. Pídele a Sky algo como «guarda esto como flujo llamado preparar reunión» y aparecerá aquí; después bastará
        escribir su nombre en la barra.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {list.map((f) => (
        <li key={f.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink">{f.name}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">{f.instructions}</p>
            <p className="mt-1 text-[11px] text-ink-3">{f.uses === 0 ? 'Sin usar todavía' : `Usado ${f.uses} ${f.uses === 1 ? 'vez' : 'veces'}`}</p>
          </div>
          <button
            type="button"
            aria-label={`Eliminar flujo ${f.name}`}
            onClick={() => void dispatch('flows.delete', { name: f.name })}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: ReactNode }[]
}) {
  return (
    <div className="flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[13px] transition',
            value === o.value ? 'bg-surface-solid text-ink shadow-soft' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-ink-3">{hint}</span>}
    </label>
  )
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-ink-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-[13px]">
      <span className="text-ink-2">{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  )
}
