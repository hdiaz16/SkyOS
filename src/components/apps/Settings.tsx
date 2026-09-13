import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bot, HardDrive, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { fs } from '../../kernel/fs'
import { useSettings, type Theme } from '../../state/settings'
import { cn, formatBytes } from '../../lib/utils'

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
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
      <div className="mx-auto flex max-w-[440px] flex-col gap-7">
        <Section icon={<Palette className="h-4 w-4" />} title="Apariencia">
          <div className="flex rounded-xl bg-surface-2 p-1">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTheme(t.value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[13px] transition',
                  theme === t.value ? 'bg-surface-solid text-ink shadow-soft' : 'text-ink-2 hover:text-ink',
                )}
              >
                <t.icon className="h-4 w-4" strokeWidth={1.75} />
                {t.label}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={<HardDrive className="h-4 w-4" />} title="Almacenamiento">
          <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <Row label="Dónde viven tus archivos">
              {fs.engine === 'opfs' ? 'Sistema de archivos del navegador' : 'IndexedDB'}
            </Row>
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
              Todo se guarda en este navegador. Nada se envía a ningún servidor.
            </p>
          </div>
        </Section>

        <Section icon={<Bot className="h-4 w-4" />} title="Inteligencia">
          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line-2 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink">Motor principal</span>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[12px] text-ink-2">Claude Opus 5</span>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-3">
              Se conecta en la siguiente fase. Podrás pegar tu llave de API y elegir otros modelos, incluidos
              locales con Ollama. La llave se queda en tu navegador.
            </p>
          </div>
        </Section>

        <p className="text-center text-[11px] text-ink-3">Mesa 0.1 · fase 0</p>
      </div>
    </div>
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
