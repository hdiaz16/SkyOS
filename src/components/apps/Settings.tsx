import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  Info,
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
import { db } from '../../kernel/db'
import { flows } from '../../kernel/flows'
import { speak, listElevenVoices, listElevenModels, type ElevenVoice, type ElevenModel } from '../../ai/speech'
import { useVoiceSettings } from '../../ai/voiceSettings'
import { dispatch, useToasts } from '../../kernel/commands'
import { ACCENTS, BACKDROPS, useSettings, type Theme } from '../../state/settings'
import { PHASE_LABEL, minuteOf, phaseAt, readSun } from '../../lib/daylight'
import {
  AUTO_MODEL,
  baseUrlFor,
  effectiveTiers,
  isAiConfigured,
  presetFor,
  PROVIDERS,
  resolveKey,
  useAiSettings,
  usesEffort,
  usesRelay,
  usesSharedKey,
  type ProviderId,
} from '../../ai/settings'
import { ensureDiscovered, getProvider } from '../../ai/providers'
import { listModels } from '../../ai/providers/openaiCompat'
import { TIER_LABELS } from '../../ai/router'
import { AiError, type Effort } from '../../ai/types'
import { useAuth } from '../../system/auth'
import { users } from '../../system/users'
import type { Autonomy, Purpose, Tone, UserProfile } from '../../system/db'
import { useDialog } from '../../state/dialog'
import { changePassword } from '../../system/account'
import { MIN_PASSWORD, passwordProblem } from '../../lib/password'
import { cn, formatBytes } from '../../lib/utils'
import { Avatar } from '../system/Login'
import { AppsPanel } from './Apps'
import { CloudSyncPanel } from './CloudSync'
import { useEmbeddings } from '../../ai/embeddings'
import type { Win } from '../../state/windows'

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

type SectionId = 'account' | 'ai' | 'apps' | 'flows' | 'appearance' | 'storage' | 'about'

interface SectionMeta {
  id: SectionId
  label: string
  title: string
  description: string
  icon: typeof UserRound
}

/** The map of Ajustes: every area with a name, what it is for and an icon, in the order they appear. */
const SECTIONS: SectionMeta[] = [
  {
    id: 'account',
    label: 'Cuenta',
    title: 'Tu cuenta',
    // The name and the place are shown here, not edited here: the name comes from the first conversation and
    // the place from the weather widget or from telling Sky. Promising them was sending people to look for a
    // field that does not exist.
    description: 'Quién eres en este navegador: tu PIN, la voz de Sky, cómo te trata y por dónde salir.',
    icon: UserRound,
  },
  { id: 'ai', label: 'Inteligencia', title: 'Inteligencia', description: 'Con qué modelo piensa Sky, cómo elige entre rápido y profundo, y con qué llave se conecta.', icon: Bot },
  {
    id: 'apps',
    label: 'Apps conectadas',
    title: 'Apps conectadas',
    description: 'Las apps a las que Sky puede llegar en tu nombre: correo, notas, archivos, agenda, código y música. Concedes el permiso una vez y Sky mantiene la sesión viva.',
    icon: Plug,
  },
  { id: 'flows', label: 'Flujos', title: 'Flujos guardados', description: 'Rutinas que guardaste con Sky para pedirlas por su nombre desde la barra.', icon: Zap },
  { id: 'appearance', label: 'Apariencia', title: 'Apariencia', description: 'La luz del escritorio (clara, oscura o la de tu sistema) y los sonidos discretos del sistema.', icon: Palette },
  { id: 'storage', label: 'Almacenamiento', title: 'Almacenamiento', description: 'Dónde viven tus archivos, cuánto ocupan y qué sale de este navegador.', icon: HardDrive },
  { id: 'about', label: 'Acerca de', title: 'Acerca de SkyOS', description: 'Versión, estándares que usa y dónde está el código.', icon: Info },
]

const isSectionId = (v: unknown): v is SectionId => SECTIONS.some((s) => s.id === v)

export function SettingsApp({ win }: { win: Win }) {
  const [section, setSection] = useState<SectionId>(() => (isSectionId(win.props.section) ? win.props.section : 'account'))
  // Commands can point an already open window at a section (ui.openApps does): adopt the request during render.
  const requested = `${win.props.section ?? ''}|${win.props.app ?? ''}`
  const [seen, setSeen] = useState(requested)
  if (requested !== seen) {
    setSeen(requested)
    if (isSectionId(win.props.section)) setSection(win.props.section)
  }

  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]

  return (
    <div className="flex h-full">
      <nav className="scrollbar-thin flex w-[196px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line p-3">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition',
              s.id === section ? 'bg-surface-solid text-ink shadow-soft' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            <s.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {s.label}
          </button>
        ))}
      </nav>
      <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[560px] flex-col gap-5 p-6">
          <header>
            <h1 className="font-display text-[22px] font-bold tracking-tight text-ink">{meta.title}</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{meta.description}</p>
          </header>
          {section === 'account' && <AccountSection />}
          {section === 'ai' && <AiSection />}
          {section === 'apps' && <AppsPanel highlight={win.props.app} />}
          {section === 'flows' && <FlowsSection />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'storage' && <StorageSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

function AppearanceSection() {
  const theme = useSettings((s) => s.theme)
  const setTheme = useSettings((s) => s.setTheme)
  const sounds = useSettings((s) => s.sounds)
  const setSounds = useSettings((s) => s.setSounds)
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={theme}
        onChange={setTheme}
        options={THEMES.map((t) => ({ value: t.value, label: t.label, icon: <t.icon className="h-4 w-4" strokeWidth={1.75} /> }))}
      />
      <LookRow />
      <VoiceRow />
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">Sonidos del sistema</p>
          <p className="text-[12px] leading-relaxed text-ink-3">
            Un clic suave al abrir una ventana, un tono amortiguado cuando una tarea termina en segundo plano, un chasquido al llamar a la barra. Sintetizados al
            momento, sin archivos.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={sounds}
          aria-label="Sonidos del sistema"
          onClick={() => setSounds(!sounds)}
          className={cn('relative h-6 w-11 shrink-0 rounded-full transition', sounds ? 'bg-accent' : 'bg-line-2')}
        >
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition', sounds ? 'left-[22px]' : 'left-0.5')} />
        </button>
      </div>
    </div>
  )
}

/** The accent and the backdrop: the same things Sky changes when asked «ponlo azul» or «más cálido». */
function LookRow() {
  const accent = useSettings((s) => s.accent)
  const backdrop = useSettings((s) => s.backdrop)
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-[116px] shrink-0 text-[12.5px] text-ink-3">Acento</span>
        <div className="flex items-center gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              type="button"
              aria-label={a.label}
              aria-pressed={accent === a.value}
              title={a.label}
              onClick={() => void dispatch('ui.appearance', { accent: a.value })}
              className={cn('h-6 w-6 rounded-full border-2 transition hover:scale-110', accent === a.value ? 'border-ink' : 'border-transparent')}
              style={{ background: a.swatch }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-[116px] shrink-0 text-[12.5px] text-ink-3">Fondo</span>
        <div className="flex flex-wrap gap-1.5">
          {BACKDROPS.map((b) => (
            <button
              key={b.value}
              type="button"
              aria-pressed={backdrop === b.value}
              onClick={() => void dispatch('ui.appearance', { backdrop: b.value })}
              className={cn(
                'rounded-full border px-3 py-1 text-[12.5px] transition',
                backdrop === b.value ? 'border-accent bg-accent-soft text-accent' : 'border-line-2 text-ink-2 hover:border-line hover:text-ink',
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      {backdrop === 'hora' && (
        <p className="text-[12px] leading-relaxed text-ink-3">
          Ahora {PHASE_LABEL[phaseAt(minuteOf(new Date()), readSun())]} en el escritorio: el fondo va con la hora real, de una mañana en el campo a la luz de luna, sin saltos.
        </p>
      )}
      <p className="text-[12px] leading-relaxed text-ink-3">También se lo puedes pedir a Sky: «ponlo azul», «un fondo más cálido», «que siga la hora del día», «modo noche».</p>
    </div>
  )
}

/**
 * Con qué voz habla Sky. La del navegador viene de fábrica y se nota; la de Gemini está hecha para hablar y
 * acepta que le digan cómo decirlo. La llave se pega aquí porque es aquí donde a alguien se le ocurre que la
 * voz podría sonar mejor, no en la sección de proveedores.
 */
function VoiceRow() {
  const keys = useAiSettings((s) => s.keys)
  const setKey = useAiSettings((s) => s.setKey)
  const voice = useVoiceSettings()
  const [probando, setProbando] = useState(false)
  const [voices, setVoices] = useState<ElevenVoice[] | null>(null)
  const [models, setModels] = useState<ElevenModel[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const natural = !!(voice.elevenKey || keys.gemini || keys.openai)

  // The voices and models belong to the key's account: they arrive when the key does, and the first voice
  // becomes the chosen one so there is always something selected to hear.
  useEffect(() => {
    setVoices(null)
    setModels(null)
    setError(null)
    if (!voice.elevenKey) return
    let alive = true
    void (async () => {
      try {
        const [vs, ms] = await Promise.all([listElevenVoices(voice.elevenKey), listElevenModels(voice.elevenKey)])
        if (!alive) return
        setVoices(vs)
        setModels(ms)
        if (vs.length && !voice.elevenVoiceId) voice.setElevenVoice(vs[0].voice_id)
        if (ms.length && !voice.elevenModel) voice.setElevenModel(ms[0].model_id)
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'No pude leer tus voces de ElevenLabs.')
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.elevenKey])

  const probar = async () => {
    setProbando(true)
    await speak('Hola. Soy Sky. Así es como sueno cuando me dejas hablar con calma.')
    setProbando(false)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">La voz de Sky</p>
          <p className="text-[12px] leading-relaxed text-ink-3">
            {voice.elevenKey
              ? 'Habla con la voz que elegiste de ElevenLabs: neuronal, hecha para sonar a persona.'
              : natural
                ? 'Ahora mismo habla con una voz hecha para hablar: respira entre frases y se le puede pedir el tono.'
                : 'Ahora mismo usa la voz del navegador. Cumple, pero se le oye la máquina. Con una llave de ElevenLabs o de Gemini habla de verdad.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void probar()}
          disabled={probando}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:border-line-2 hover:text-ink disabled:opacity-50"
        >
          <Volume2 className="h-3.5 w-3.5" />
          {probando ? 'Hablando…' : 'Escúchala'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="password"
          value={voice.elevenKey}
          onChange={(e) => voice.setElevenKey(e.target.value)}
          placeholder="Llave de ElevenLabs (la voz más natural)"
          aria-label="Llave de ElevenLabs"
          spellCheck={false}
          autoComplete="off"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-solid px-3 text-[13px] text-ink outline-none transition focus:border-accent"
        />
        <a
          href="https://elevenlabs.io/app/settings/api-keys"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-[12px] font-medium text-accent transition hover:underline"
        >
          Conseguir una
        </a>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {voice.elevenKey && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11.5px] text-ink-3">Voz</span>
            <select
              aria-label="Voz de ElevenLabs"
              value={voice.elevenVoiceId}
              onChange={(e) => voice.setElevenVoice(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-surface-solid px-2.5 text-[13px] text-ink outline-none focus:border-accent"
            >
              {voices === null ? (
                <option value="">{error ? 'Sin voces' : 'Leyendo tus voces…'}</option>
              ) : voices.length === 0 ? (
                <option value="">Esta cuenta no tiene voces</option>
              ) : (
                voices.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11.5px] text-ink-3">Modelo</span>
            <select
              aria-label="Modelo de ElevenLabs"
              value={voice.elevenModel}
              onChange={(e) => voice.setElevenModel(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-surface-solid px-2.5 text-[13px] text-ink outline-none focus:border-accent"
            >
              {models === null ? (
                <option value="">{error ? 'Sin modelos' : 'Leyendo los modelos…'}</option>
              ) : models.length === 0 ? (
                <option value="">El de la cuenta</option>
              ) : (
                models.map((m) => (
                  <option key={m.model_id} value={m.model_id}>
                    {m.name}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
      )}
      <p className="text-[11.5px] leading-relaxed text-ink-3">Las llaves viven solo en tu cuenta, en este navegador; nadie más las ve ni las oye.</p>

      {!natural && (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={keys.gemini ?? ''}
            onChange={(e) => setKey('gemini', e.target.value)}
            placeholder="Llave de Gemini para la voz"
            aria-label="Llave de Gemini para la voz"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-solid px-3 text-[13px] text-ink outline-none transition focus:border-accent"
          />
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-[12px] font-medium text-accent transition hover:underline"
          >
            Conseguir una
          </a>
        </div>
      )}
    </div>
  )
}

function StorageSection() {
  const stats = useLiveQuery(() => fs.stats(), [])
  /** null while asking, false when the browser will not say. Swallowing the failure left the row on «…» for
   *  good, with a sliver of accent colour under it that looked like a real measurement. */
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null | false>(() => (typeof navigator.storage?.estimate === 'function' ? null : false))

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setEstimate(e.quota ? { usage: e.usage ?? 0, quota: e.quota } : false))
      .catch(() => setEstimate(false))
  }, [stats])

  const pct = estimate ? Math.min(100, (estimate.usage / estimate.quota) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <CloudSyncPanel />
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <Row label="Dónde viven tus archivos">{fs.engine === 'opfs' ? 'Sistema de archivos del navegador' : 'IndexedDB'}</Row>
      <Row label="Contenido">
        {stats ? `${stats.files} archivos · ${stats.folders} carpetas · ${formatBytes(stats.bytes)}${stats.trashed ? ` · ${stats.trashed} en la papelera` : ''}` : '…'}
      </Row>
      <div>
        <Row label="Espacio del navegador">
          {estimate ? `${formatBytes(estimate.usage)} de ${formatBytes(estimate.quota)}` : estimate === false ? 'Tu navegador no lo dice' : '…'}
        </Row>
        {estimate !== false && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${estimate ? Math.max(pct, 0.5) : 0}%` }} />
          </div>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-3">
        Cada cuenta tiene su propio espacio en este navegador. Tus archivos solo viajan al proveedor de IA cuando le pides algo que los necesita, a una app
        conectada solo cuando se lo pides a Sky, y a tu nube solo si activas la sincronización.
      </p>
    </div>
    </div>
  )
}

function AboutSection() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <Row label="Versión">SkyOS 0.4</Row>
      <Row label="Apps conectadas">Model Context Protocol 2026-07-28, con retroceso a 2025</Row>
      <Row label="Código">
        <a href="https://github.com/hdiaz16/SkyOS" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
          github.com/hdiaz16/SkyOS
          <ExternalLink className="h-3 w-3" />
        </a>
      </Row>
      <p className="text-[12px] leading-relaxed text-ink-3">
        Un escritorio web tranquilo donde la inteligencia es la protagonista. Código abierto bajo licencia MIT.
      </p>
    </div>
  )
}

/** How Sky treats this person: the same three answers the onboarding asks for, changeable any day. */
const TONE_OPTIONS: Array<{ value: Tone; label: string }> = [
  { value: 'warm', label: 'Cercano' },
  { value: 'direct', label: 'Directo' },
  { value: 'formal', label: 'Formal' },
]

const PURPOSE_OPTIONS: Array<{ value: Purpose; label: string }> = [
  { value: 'work', label: 'Trabajo' },
  { value: 'study', label: 'Estudio' },
  { value: 'personal', label: 'Personal' },
  { value: 'mixed', label: 'De todo' },
]

const AUTONOMY_OPTIONS: Array<{ value: Autonomy; label: string }> = [
  { value: 'act', label: 'Que actúe' },
  { value: 'ask', label: 'Que pregunte' },
  { value: 'manual', label: 'Solo si lo pido' },
]

function AccountSection() {
  const user = useAuth((s) => s.current)
  const account = useAuth((s) => s.account)
  if (!user) return null

  const setProfile = async (patch: Partial<UserProfile>) => {
    await users.updateProfile(user.id, patch, user.profile)
    await useAuth.getState().refreshCurrent()
  }

  /**
   * The dialog used to say "leave it empty and confirm to remove the PIN", and that path did not exist: an
   * empty field keeps the confirm button disabled. What did happen is worse — typing anything without digits,
   * or pasting text by mistake, was read as "remove it" and the PIN disappeared without a word.
   */
  const changePin = async () => {
    const pin = await useDialog.getState().ask({
      title: user.pinHash ? 'Nuevo PIN' : 'Crear un PIN',
      description: 'Cuatro a seis dígitos.',
      placeholder: '••••',
      confirmLabel: 'Guardar',
    })
    if (pin === null) return
    const digits = pin.replace(/\D/g, '')
    if (digits.length < 4 || digits.length > 6) {
      useToasts.getState().push({ message: 'El PIN debe tener entre 4 y 6 dígitos.', kind: 'error' })
      return
    }
    await users.setPin(user.id, digits)
    await useAuth.getState().refreshCurrent()
    useToasts.getState().push({ message: 'PIN actualizado', kind: 'info' })
  }

  const removePin = async () => {
    const ok = await useDialog.getState().confirm({
      title: '¿Quitar el PIN?',
      description: 'Cualquiera que abra este navegador podrá entrar a tu escritorio sin que se le pregunte nada.',
      confirmLabel: 'Quitarlo',
      danger: true,
    })
    if (!ok) return
    await users.setPin(user.id, null)
    await useAuth.getState().refreshCurrent()
    useToasts.getState().push({ message: 'PIN eliminado', kind: 'info' })
  }

  /** The account's password: for whoever entered with one, or wants one ready for another computer. */
  const changeAccountPassword = async () => {
    const password = await useDialog.getState().ask({
      title: 'Nueva contraseña de tu cuenta',
      description: `Al menos ${MIN_PASSWORD} caracteres; que no sea tu correo ni de las que cualquiera probaría. Con ella entras desde cualquier computadora.`,
      placeholder: '••••••••',
      confirmLabel: 'Guardar',
      secret: true,
    })
    if (password === null) return
    const problem = passwordProblem(password, account?.email)
    if (problem) {
      useToasts.getState().push({ message: problem, kind: 'error' })
      return
    }
    try {
      await changePassword(password)
      useToasts.getState().push({ message: 'Contraseña actualizada', kind: 'info' })
    } catch (err) {
      useToasts.getState().push({ message: err instanceof Error ? err.message : 'No se pudo cambiar la contraseña', kind: 'error' })
    }
  }

  return (
    <div className="flex flex-col gap-4">
    <div className="flex items-center gap-3 rounded-xl border border-line p-4">
      <Avatar user={user} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{user.name}</p>
        <p className="text-[12px] text-ink-3">
          {account ? `${account.email} · ` : ''}
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
      {user.pinHash && (
        <button type="button" onClick={() => void removePin()} className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink">
          Quitar PIN
        </button>
      )}
      {account && (
        <button type="button" onClick={() => void changeAccountPassword()} className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink">
          Contraseña
        </button>
      )}
      <button
        type="button"
        onClick={() => useAuth.getState().logout()}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-2 transition hover:bg-surface-2 hover:text-ink"
      >
        <LogOut className="h-3.5 w-3.5" />
        Salir
      </button>
    </div>

    <div className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <p className="text-[13px] font-medium text-ink">Cómo te trata Sky</p>
      <PreferenceRow label="Te habla" options={TONE_OPTIONS} value={user.profile.tone} onChange={(tone) => void setProfile({ tone })} />
      <PreferenceRow label="Sobre todo para" options={PURPOSE_OPTIONS} value={user.profile.purpose} onChange={(purpose) => void setProfile({ purpose })} />
      <PreferenceRow label="Con tus archivos" options={AUTONOMY_OPTIONS} value={user.profile.autonomy} onChange={(autonomy) => void setProfile({ autonomy })} />
    </div>
    </div>
  )
}

/** A line of chips: what Sky is like with this person, one tap to change. */
function PreferenceRow<T extends string>({ label, options, value, onChange }: { label: string; options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-[116px] shrink-0 text-[12.5px] text-ink-3">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-[12.5px] transition',
              value === o.value ? 'border-accent bg-accent-soft text-accent' : 'border-line-2 text-ink-2 hover:border-line hover:text-ink',
            )}
          >
            {o.label}
          </button>
        ))}
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
  const [loadingModels, setLoadingModels] = useState(false)

  const providers = PROVIDERS.filter((p) => !p.devOnly || import.meta.env.DEV)
  const baseUrl = ai.baseUrls[ai.provider] ?? ''
  const isCompat = ai.provider !== 'anthropic' && ai.provider !== 'mock'
  const discovered = ai.discovered[ai.provider] ?? []
  const knownIds = new Set(preset.models.map((m) => m.id))
  const extraModels = discovered.filter((id) => !knownIds.has(id))
  // Sky's included key is resolved at request time and never shown; the field only ever holds the person's own.
  const shared = usesSharedKey(ai)
  const tiers = effectiveTiers(ai, preset)

  // Live-tier providers (GLM) get their model list the moment there is a key to ask with, so «Automático»
  // has something real to route with instead of waiting for the person to find the button.
  useEffect(() => {
    if (!preset.autoTiers || discovered.length) return
    if (preset.needsKey && !resolveKey(ai) && !usesRelay(ai)) return
    void ensureDiscovered(ai)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.provider, ai.keys[ai.provider], discovered.length])

  const runTest = async () => {
    setTest({ state: 'running' })
    try {
      const provider = getProvider(ai)
      if (!provider) throw new AiError('Falta completar la configuración.')
      // «Automático» no fija un modelo: escala del barato al completo cuando el proveedor limita. La prueba
      // sube la misma escalera y dice cuál respondió — probar solo el barato de un minuto limitado siempre
      // falla, y suena a que todo está roto cuando solo ese escalón está ocupado.
      const ladder = [...new Set([tiers?.fast, tiers?.balanced, tiers?.deep].filter((m): m is string => !!m))]
      if (!ladder.length) throw new AiError('No hay ningún modelo todavía: consulta los disponibles o escribe uno.')
      let lastErr: unknown
      for (const model of ladder) {
        try {
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
          setTest({ state: 'ok', message: `Conectado · respondió "${out.trim().slice(0, 30) || '…'}" con ${model}` })
          return
        } catch (err) {
          lastErr = err
          // Solo se escala lo que puede mejorar esperando o subiendo: un llave inválida no se arregla arriba.
          if (!(err instanceof AiError) || !err.retryable) throw err
        }
      }
      throw lastErr
    } catch (err) {
      setTest({ state: 'fail', message: err instanceof Error ? err.message : 'No se pudo conectar' })
    }
  }

  const refreshModels = async () => {
    setLoadingModels(true)
    try {
      const ids = await listModels(baseUrlFor(ai), resolveKey(ai), shared)
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
          aria-label="Proveedor"
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
              aria-label="Llave de API"
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
            aria-label="URL base"
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
          ai.model === AUTO_MODEL && tiers
            ? `Automático: ${TIER_LABELS.fast} → ${labelOf(preset, tiers.fast)}; ${TIER_LABELS.deep} → ${labelOf(preset, tiers.deep)}. Sky empieza con lo más económico y sube según la dificultad de cada petición.`
            : preset.autoTiers && !discovered.length
              ? 'Los modelos de este proveedor se leen directo de su API: pega la llave y la lista llega sola.'
              : undefined
        }
      >
        <div className="flex flex-col gap-1.5">
          {tiers && (
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
              aria-label="Otros modelos del proveedor"
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
                  aria-label="Modelo"
                  value={ai.model === AUTO_MODEL ? '' : ai.model}
                  onChange={(e) => ai.setModel(e.target.value)}
                  placeholder={preset.modelHint}
                  spellCheck={false}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-solid px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent"
                />
              )}
              <button
                type="button"
                disabled={loadingModels || (preset.needsKey && !resolveKey(ai) && !usesRelay(ai))}
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

      {usesEffort(ai) && (
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

      <EmbeddingsRow />
    </div>
  )
}

/** The on-device meaning model: one switch, one line of status. */
function EmbeddingsRow() {
  const state = useEmbeddings()
  // The real count, not the session's accumulator: `state.indexed` starts at zero on every load and only adds
  // during indexing passes, so opening Ajustes over 200 fingerprinted files used to say «0 archivos con
  // huella». This counts the rows that actually carry a vector, and moves while new ones arrive.
  const indexed = useLiveQuery(async () => (await db.fileIndex.toArray()).filter((r) => r.embedding?.length).length, [])
  const status = !state.enabled
    ? 'Desactivada'
    : state.status === 'ready'
      ? `Modelo listo · ${indexed ?? '…'} archivos con huella`
      : state.status === 'loading'
        ? `Descargando el modelo… ${Math.round(state.progress * 100)}%`
        : state.status === 'error'
          ? `No se pudo cargar el modelo${state.error ? `: ${state.error}` : ''}`
          : 'Se prepara al abrir el escritorio'
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">Búsqueda por significado en tu dispositivo</p>
          <p className="text-[12px] text-ink-3">{status}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.enabled}
          onClick={() => state.setEnabled(!state.enabled)}
          className={cn('relative h-6 w-11 shrink-0 rounded-full transition', state.enabled ? 'bg-accent' : 'bg-line-2')}
        >
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition', state.enabled ? 'left-[22px]' : 'left-0.5')} />
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-ink-3">
        Un modelo multilingüe pequeño (una sola descarga de unos 120 MB) convierte el contenido de tus archivos de texto en huellas de significado, aquí mismo. La barra encuentra "el reporte de los costos del servidor" sin recordar el nombre, sin tokens y sin que nada salga de tu equipo.
      </p>
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
  const list = useLiveQuery(() => flows.list(), [])
  // Before the query comes back there is nothing to say: `?? []` turned that instant into «aún no hay flujos»,
  // which flashed as a lie over a list that was about to appear.
  if (!list) return null
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

/**
 * A titled block. It used to be a <label>, and a <button> is a labelable element: clicking the word «Modelo»,
 * or dragging to select the long hint under it, went to the first button inside and switched the model to
 * «Automático» without a word. The controls carry their own aria-label instead.
 */
function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-ink-3">{hint}</span>}
    </div>
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
