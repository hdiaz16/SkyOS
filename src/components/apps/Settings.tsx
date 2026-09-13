import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bot, CheckCircle2, Eye, EyeOff, HardDrive, Loader2, Monitor, Moon, Palette, Sun, Trash2, XCircle, Zap } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { flows } from '../../kernel/flows'
import { dispatch } from '../../kernel/commands'
import { useSettings, type Theme } from '../../state/settings'
import { isAiConfigured, presetFor, PROVIDERS, useAiSettings, type ProviderId } from '../../ai/settings'
import { getProvider } from '../../ai/providers'
import { AiError, type Effort } from '../../ai/types'
import { cn, formatBytes } from '../../lib/utils'

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
        <Section icon={<Bot className="h-4 w-4" />} title="Inteligencia">
          <AiSection />
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
              Todo se guarda en este navegador. Tus archivos solo viajan al proveedor de IA cuando le pides algo que los necesita.
            </p>
          </div>
        </Section>

        <p className="text-center text-[11px] text-ink-3">Mesa 0.2 · fase 1</p>
      </div>
    </div>
  )
}

function AiSection() {
  const ai = useAiSettings()
  const preset = presetFor(ai.provider)
  const configured = isAiConfigured(ai)
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; message?: string }>({ state: 'idle' })

  const providers = PROVIDERS.filter((p) => !p.devOnly || import.meta.env.DEV)
  const baseUrl = ai.baseUrls[ai.provider] ?? ''
  const showBaseUrl = ai.provider !== 'anthropic' && ai.provider !== 'mock'

  const runTest = async () => {
    setTest({ state: 'running' })
    try {
      const provider = getProvider(ai)
      if (!provider) throw new AiError('Falta completar la configuración.')
      let out = ''
      for await (const ev of provider.chat({
        model: ai.model,
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

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-2">Estado</span>
        <span className={cn('flex items-center gap-1.5 text-[12px] font-medium', configured ? 'text-accent' : 'text-ink-3')}>
          <span className={cn('h-1.5 w-1.5 rounded-full', configured ? 'bg-accent' : 'bg-ink-3')} />
          {configured ? 'Lista para trabajar' : 'Falta configurar'}
        </span>
      </div>

      <Field label="Proveedor">
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

      <Field label="Modelo">
        {preset.models.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {preset.models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => ai.setModel(m.id)}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px] transition',
                  ai.model === m.id ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2 hover:border-line-2 hover:text-ink',
                )}
              >
                <span>{m.label}</span>
                <span className="text-[11px] uppercase tracking-wide text-ink-3">
                  {m.tier === 'deep' ? 'más criterio' : m.tier === 'fast' ? 'más rápido' : 'equilibrado'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <input
            value={ai.model}
            onChange={(e) => ai.setModel(e.target.value)}
            placeholder={preset.modelHint}
            spellCheck={false}
            className="h-9 w-full rounded-lg border border-line bg-surface-solid px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent"
          />
        )}
      </Field>

      {preset.needsKey && (
        <Field label="Llave de API" hint="Se guarda solo en este navegador y viaja únicamente al proveedor.">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={ai.keys[ai.provider] ?? ''}
              onChange={(e) => ai.setKey(ai.provider, e.target.value)}
              placeholder={ai.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
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

      {showBaseUrl && (
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

function FlowsSection() {
  const list = useLiveQuery(() => flows.list(), []) ?? []
  if (list.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-2 p-4 text-[12px] leading-relaxed text-ink-3">
        Aún no hay flujos. Pídele a Mesa algo como «guarda esto como flujo llamado preparar reunión» y aparecerá aquí; después bastará
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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
