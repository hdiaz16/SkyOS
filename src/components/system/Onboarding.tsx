import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, ExternalLink, Loader2, MapPin, Mic, XCircle } from 'lucide-react'
import type { Autonomy, Permission, Purpose, Tone, UserLocation, UserProfile } from '../../system/db'
import { hasSharedGroqKey } from '../../config'
import { users } from '../../system/users'
import { useAuth } from '../../system/auth'
import { startSession } from '../../system/session'
import { applyTheme, persistThemeFor, type Theme } from '../../state/settings'
import { AUTO_MODEL, persistAiSettingsFor, presetFor, type ProviderId } from '../../ai/settings'
import { createOpenAICompatProvider } from '../../ai/providers/openaiCompat'
import { createAnthropicProvider } from '../../ai/providers/anthropic'
import { currentPosition, reverseGeocode } from '../../lib/weather'
import { cn } from '../../lib/utils'
import { BELOW_ORB, useOrbStage } from './orbStore'

type Step = 'hello' | 'name' | 'tone' | 'purpose' | 'autonomy' | 'theme' | 'location' | 'microphone' | 'ai' | 'pin' | 'setup'

const ORDER: Step[] = ['hello', 'name', 'tone', 'purpose', 'autonomy', 'theme', 'location', 'microphone', 'ai', 'pin', 'setup']

interface Choice<T extends string> {
  value: T
  label: string
  hint: string
}

const TONES: Choice<Tone>[] = [
  { value: 'warm', label: 'Cercano y relajado', hint: 'Como hablar con alguien de confianza.' },
  { value: 'direct', label: 'Directo y breve', hint: 'Al punto, sin rodeos.' },
  { value: 'formal', label: 'Formal y detallado', hint: 'Cuidado y completo.' },
]

const PURPOSES: Choice<Purpose>[] = [
  { value: 'work', label: 'Trabajo', hint: 'Documentos, proyectos, reportes.' },
  { value: 'study', label: 'Estudio', hint: 'Apuntes, lecturas, tareas.' },
  { value: 'personal', label: 'Proyectos personales', hint: 'Ideas, planes, lo tuyo.' },
  { value: 'mixed', label: 'Un poco de todo', hint: 'Que se adapte a lo que venga.' },
]

const AUTONOMIES: Choice<Autonomy>[] = [
  { value: 'ask', label: 'Que me pregunte antes de mover cosas', hint: 'Propone, yo confirmo.' },
  { value: 'act', label: 'Que actúe y me avise', hint: 'Hace, y todo se puede deshacer.' },
  { value: 'manual', label: 'Solo lo que yo le pida', hint: 'Sin iniciativa propia.' },
]

const THEMES: Choice<Theme>[] = [
  { value: 'light', label: 'Claro', hint: 'Mañana en el campo.' },
  { value: 'dark', label: 'Oscuro', hint: 'Noche en el bosque.' },
  { value: 'system', label: 'Según el sistema', hint: 'Cambia con tu dispositivo.' },
]

const ONBOARDING_PROVIDERS: ProviderId[] = ['groq', 'anthropic', 'openai', 'openrouter', 'ollama']

/** One question at a time, a breathing presence, and the sense that this space is being made for you. */
export function Onboarding() {
  const [step, setStep] = useState<Step>('hello')
  const [name, setName] = useState('')
  const [tone, setTone] = useState<Tone>('warm')
  const [purpose, setPurpose] = useState<Purpose>('mixed')
  const [autonomy, setAutonomy] = useState<Autonomy>('act')
  const [theme, setTheme] = useState<Theme>('light')
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [locState, setLocState] = useState<'idle' | 'asking' | 'ok' | 'denied'>('idle')
  const [micState, setMicState] = useState<'idle' | 'asking' | 'granted' | 'denied'>('idle')
  const [ownKey, setOwnKey] = useState(!hasSharedGroqKey)
  const [provider, setProvider] = useState<ProviderId>('groq')
  const [apiKey, setApiKey] = useState('')
  const [keyTest, setKeyTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; message?: string }>({ state: 'idle' })
  const [pin, setPin] = useState('')
  const hasUsers = useAuth((s) => s.users.length > 0)

  const index = ORDER.indexOf(step)
  const next = () => setStep(ORDER[Math.min(index + 1, ORDER.length - 1)])
  const back = () => setStep(ORDER[Math.max(index - 1, 0)])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const askLocation = async () => {
    setLocState('asking')
    try {
      const pos = await currentPosition(12000)
      const place = await reverseGeocode(pos.lat, pos.lon)
      setLocation({ lat: pos.lat, lon: pos.lon, place })
      setLocState('ok')
    } catch {
      setLocState('denied')
    }
  }

  const askMicrophone = async () => {
    setMicState('asking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setMicState('granted')
    } catch {
      setMicState('denied')
    }
  }

  const testKey = async () => {
    const preset = presetFor(provider)
    setKeyTest({ state: 'running' })
    try {
      const p =
        provider === 'anthropic'
          ? createAnthropicProvider(apiKey.trim())
          : createOpenAICompatProvider({ id: provider, name: preset.name, baseUrl: preset.baseUrl ?? '', apiKey: apiKey.trim() || undefined, vision: preset.vision })
      const model = preset.tiers?.fast ?? preset.models[0]?.id ?? ''
      if (!model) throw new Error('Elige el modelo después en Ajustes')
      let out = ''
      for await (const ev of p.chat({
        model,
        system: 'Responde únicamente con la palabra OK.',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Prueba de conexión' }] }],
        maxTokens: 400,
        effort: 'low',
      })) {
        if (ev.type === 'text') out += ev.delta
        if (ev.type === 'error') throw ev.error
      }
      setKeyTest({ state: 'ok', message: out.trim() ? 'Conectado' : 'Conectado, sin respuesta de texto' })
    } catch (err) {
      setKeyTest({ state: 'fail', message: err instanceof Error ? err.message : 'No se pudo conectar' })
    }
  }

  const finish = async () => {
    const microphone: Permission = micState === 'granted' ? 'granted' : micState === 'denied' ? 'denied' : 'skipped'
    const profile: UserProfile = { tone, purpose, autonomy, location: location ?? undefined, microphone, voice: true }
    const user = await users.create({ name, profile, pin: pin.length >= 4 ? pin : undefined })
    persistThemeFor(user.id, theme)
    const chosen = ownKey ? provider : 'groq'
    const preset = presetFor(chosen)
    persistAiSettingsFor(user.id, {
      provider: chosen,
      model: preset.tiers ? AUTO_MODEL : preset.models[0]?.id ?? '',
      keys: ownKey && apiKey.trim() ? { [chosen]: apiKey.trim() } : {},
    })
    return user
  }

  const preset = presetFor(provider)
  const needsKey = preset.needsKey

  // Screens that share the stage with the orb sit under it; the questions take the whole screen.
  const withOrb = step === 'hello' || step === 'setup'

  useEffect(() => {
    useOrbStage.getState().setMode(step === 'hello' ? 'idle' : step === 'setup' ? 'busy' : 'hidden')
  }, [step])

  return (
    <div className="absolute inset-0 select-none">
      <div className="absolute left-6 top-5 flex items-center gap-3">
        {index > 0 && step !== 'setup' && (
          <button type="button" onClick={back} className="text-[13px] text-ink-3 transition hover:text-ink">
            Atrás
          </button>
        )}
        {hasUsers && step === 'hello' && (
          <button type="button" onClick={() => useAuth.getState().showLogin()} className="text-[13px] text-ink-3 transition hover:text-ink">
            Ya tengo un usuario
          </button>
        )}
      </div>
      {step !== 'hello' && step !== 'setup' && (
        <div className="absolute inset-x-0 top-0 flex h-1 justify-center">
          <div className="mt-2 flex gap-1">
            {ORDER.slice(1, -1).map((s, i) => (
              <span key={s} className={cn('h-1 w-6 rounded-full transition-colors', i < index ? 'bg-accent' : 'bg-line-2')} />
            ))}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.18 } }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          className={cn('absolute inset-x-0 flex flex-col items-center px-6', !withOrb && 'inset-y-0 justify-center')}
          style={withOrb ? { top: BELOW_ORB } : undefined}
        >
          {step === 'hello' && (
            <Screen>
              <Sequence
                lines={['Hola.', 'Soy Sky.', 'Voy a preparar un espacio para ti. Toma un minuto y unas cuantas preguntas.']}
                onDone={() => undefined}
              />
              <Primary onClick={next} delay={2.2}>
                Empezar
              </Primary>
            </Screen>
          )}

          {step === 'name' && (
            <Screen question="¿Cómo te llamas?">
              <form
                className="flex w-full flex-col items-center gap-6"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (name.trim()) next()
                }}
              >
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  maxLength={40}
                  className="font-display w-full max-w-[380px] border-b border-line-2 bg-transparent pb-2 text-center text-[32px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-accent"
                />
                <Primary type="submit" disabled={!name.trim()}>
                  Continuar
                </Primary>
              </form>
            </Screen>
          )}

          {step === 'tone' && (
            <Screen question={`${name.trim().split(' ')[0]}, ¿cómo prefieres que te hable?`}>
              <Choices options={TONES} value={tone} onChange={setTone} onPick={next} />
            </Screen>
          )}

          {step === 'purpose' && (
            <Screen question="¿Para qué usarás Sky sobre todo?">
              <Choices options={PURPOSES} value={purpose} onChange={setPurpose} onPick={next} />
            </Screen>
          )}

          {step === 'autonomy' && (
            <Screen question="¿Qué tanto quieres que actúe por su cuenta?" note="Todo lo que Sky haga se puede deshacer, decidas lo que decidas.">
              <Choices options={AUTONOMIES} value={autonomy} onChange={setAutonomy} onPick={next} />
            </Screen>
          )}

          {step === 'theme' && (
            <Screen question="¿Qué luz prefieres?">
              <Choices options={THEMES} value={theme} onChange={setTheme} onPick={next} />
            </Screen>
          )}

          {step === 'location' && (
            <Screen
              question="¿Puedo saber dónde estás?"
              note="Solo para mostrarte el clima y la hora de tu lugar. Se guarda en tu perfil, en este navegador, y en ningún otro sitio."
            >
              <div className="flex flex-col items-center gap-4">
                {locState === 'ok' && location ? (
                  <p className="flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-[14px] text-accent">
                    <MapPin className="h-4 w-4" />
                    {location.place}
                    <Check className="h-4 w-4" />
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={locState === 'asking'}
                    onClick={() => void askLocation()}
                    className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[14px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-60"
                  >
                    {locState === 'asking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                    {locState === 'asking' ? 'Esperando tu permiso…' : 'Permitir ubicación'}
                  </button>
                )}
                {locState === 'denied' && <p className="text-[13px] text-ink-3">Sin problema. Después puedes escribir tu ciudad en el widget del clima.</p>}
                <div className="flex items-center gap-4 pt-2">
                  {locState === 'ok' ? (
                    <Primary onClick={next}>Continuar</Primary>
                  ) : (
                    <button type="button" onClick={next} className="text-[13px] text-ink-3 transition hover:text-ink">
                      Ahora no
                    </button>
                  )}
                </div>
              </div>
            </Screen>
          )}

          {step === 'microphone' && (
            <Screen
              question="¿Puedo usar tu micrófono?"
              note="Para que le dictes a Sky en vez de escribir. Solo escucha cuando tú activas el micrófono en la barra, y se apaga al terminar."
            >
              <div className="flex flex-col items-center gap-4">
                {micState === 'granted' ? (
                  <p className="flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-[14px] text-accent">
                    <Mic className="h-4 w-4" />
                    Micrófono listo
                    <Check className="h-4 w-4" />
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={micState === 'asking'}
                    onClick={() => void askMicrophone()}
                    className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[14px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-60"
                  >
                    {micState === 'asking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                    {micState === 'asking' ? 'Esperando tu permiso…' : 'Permitir micrófono'}
                  </button>
                )}
                {micState === 'denied' && <p className="text-[13px] text-ink-3">Sin problema. Podrás activarlo desde el navegador cuando quieras dictar.</p>}
                <div className="flex items-center gap-4 pt-2">
                  {micState === 'granted' ? (
                    <Primary onClick={next}>Continuar</Primary>
                  ) : (
                    <button type="button" onClick={next} className="text-[13px] text-ink-3 transition hover:text-ink">
                      Ahora no
                    </button>
                  )}
                </div>
              </div>
            </Screen>
          )}

          {step === 'ai' && !ownKey && (
            <Screen
              question="Sky piensa con Groq."
              note="Es rápido y gratuito, y todos empiezan con él. Cuando quieras, podrás cambiar al proveedor de tu preferencia en Ajustes: Claude, OpenAI, OpenRouter o un modelo local."
            >
              <div className="flex flex-col items-center gap-4">
                <p className="glass flex items-center gap-2 rounded-full px-4 py-2 text-[13px] text-ink-2">
                  <Check className="h-4 w-4 text-accent" />
                  GPT-OSS 20B para lo cotidiano · GPT-OSS 120B para lo complejo
                </p>
                <div className="flex items-center gap-5 pt-2">
                  <Primary onClick={next}>Continuar</Primary>
                  <button type="button" onClick={() => setOwnKey(true)} className="text-[13px] text-ink-3 transition hover:text-ink">
                    Prefiero usar mi propia llave
                  </button>
                </div>
              </div>
            </Screen>
          )}

          {step === 'ai' && ownKey && (
            <Screen
              question="Sky piensa con un modelo de lenguaje."
              note="Groq es gratuito para empezar y responde casi al instante. Puedes cambiar de proveedor cuando quieras en Ajustes."
            >
              <div className="flex w-full max-w-[460px] flex-col gap-4">
                <div className="flex flex-wrap justify-center gap-2">
                  {ONBOARDING_PROVIDERS.map((id) => {
                    const p = presetFor(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setProvider(id)
                          setKeyTest({ state: 'idle' })
                        }}
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-[13px] transition',
                          provider === id ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2 hover:border-line-2 hover:text-ink',
                        )}
                      >
                        {p.name}
                      </button>
                    )
                  })}
                </div>
                <p className="text-center text-[13px] text-ink-2">{preset.tagline}</p>
                {needsKey ? (
                  <>
                    <input
                      autoFocus
                      type="password"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value)
                        setKeyTest({ state: 'idle' })
                      }}
                      placeholder={`Pega aquí tu llave de ${preset.name}`}
                      spellCheck={false}
                      autoComplete="off"
                      className="glass h-12 w-full rounded-xl px-4 text-center font-mono text-[14px] text-ink outline-none focus:ring-1 focus:ring-accent/50"
                    />
                    <div className="flex items-center justify-between gap-3 text-[12px]">
                      {preset.keyUrl ? (
                        <a href={preset.keyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                          Crear una llave en {new URL(preset.keyUrl).hostname}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        disabled={!apiKey.trim() || keyTest.state === 'running'}
                        onClick={() => void testKey()}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                      >
                        {keyTest.state === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : keyTest.state === 'ok' ? <Check className="h-3.5 w-3.5 text-accent" /> : keyTest.state === 'fail' ? <XCircle className="h-3.5 w-3.5 text-danger" /> : null}
                        {keyTest.state === 'ok' ? keyTest.message : keyTest.state === 'fail' ? keyTest.message : 'Probar conexión'}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-center text-[13px] text-ink-3">Este proveedor no necesita llave. Elige el modelo después en Ajustes.</p>
                )}
                <div className="flex items-center justify-center gap-5 pt-2">
                  <Primary onClick={next} disabled={needsKey && !apiKey.trim()}>
                    Continuar
                  </Primary>
                  {needsKey && (
                    <button
                      type="button"
                      onClick={() => {
                        setApiKey('')
                        next()
                      }}
                      className="text-[13px] text-ink-3 transition hover:text-ink"
                    >
                      Configurar después
                    </button>
                  )}
                </div>
              </div>
            </Screen>
          )}

          {step === 'pin' && (
            <Screen question="¿Quieres proteger tu sesión con un PIN?" note="Cuatro a seis dígitos. Evita miradas casuales; no cifra tus archivos.">
              <form
                className="flex flex-col items-center gap-5"
                onSubmit={(e) => {
                  e.preventDefault()
                  next()
                }}
              >
                <input
                  autoFocus
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="PIN"
                  className="glass h-12 w-48 rounded-xl text-center text-[20px] tracking-[0.4em] text-ink outline-none focus:ring-1 focus:ring-accent/50"
                />
                <div className="flex items-center gap-5">
                  <Primary type="submit" disabled={pin.length > 0 && pin.length < 4}>
                    {pin.length >= 4 ? 'Usar este PIN' : 'Continuar sin PIN'}
                  </Primary>
                </div>
              </form>
            </Screen>
          )}

          {step === 'setup' && <Setup name={name} providerName={apiKey.trim() ? preset.name : null} finish={finish} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Screen({ question, note, children }: { question?: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex w-full max-w-[560px] flex-col items-center gap-8">
      {question && (
        <div className="text-center">
          <h1 className="font-display text-[36px] font-bold leading-[1.15] tracking-tight text-ink">{question}</h1>
          {note && <p className="mx-auto mt-4 max-w-[460px] text-[14.5px] leading-relaxed text-ink-2">{note}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

function Choices<T extends string>({ options, value, onChange, onPick }: { options: Choice<T>[]; value: T; onChange: (v: T) => void; onPick: () => void }) {
  return (
    <div className="flex w-full max-w-[460px] flex-col gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            onChange(o.value)
            window.setTimeout(onPick, 180)
          }}
          className={cn(
            'glass flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 text-left transition hover:border-line-2',
            value === o.value && 'ring-1 ring-accent/60',
          )}
        >
          <span>
            <span className="block text-[15px] text-ink">{o.label}</span>
            <span className="block text-[12.5px] text-ink-3">{o.hint}</span>
          </span>
          <ArrowRight className={cn('h-4 w-4 shrink-0 text-ink-3 transition', value === o.value && 'text-accent')} />
        </button>
      ))}
    </div>
  )
}

function Primary({ children, onClick, type = 'button', disabled, delay = 0 }: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; delay?: number }) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className="rounded-full bg-accent px-6 py-2.5 text-[14px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40"
    >
      {children}
    </motion.button>
  )
}

/** Lines that appear one after another, like someone speaking calmly. */
function Sequence({ lines, onDone, interval = 900 }: { lines: string[]; onDone: () => void; interval?: number }) {
  const [shown, setShown] = useState(1)
  useEffect(() => {
    if (shown >= lines.length) {
      onDone()
      return
    }
    const t = window.setTimeout(() => setShown((n) => n + 1), interval)
    return () => window.clearTimeout(t)
  }, [shown, lines.length, interval, onDone])
  return (
    <div className="flex min-h-[120px] flex-col items-center gap-2 text-center">
      {lines.slice(0, shown).map((l, i) => (
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className={cn(
            i === 0 ? 'font-display text-[54px] font-bold leading-none tracking-tight text-ink' : i === 1 ? 'font-display text-[28px] font-medium text-ink-2' : 'mt-2 max-w-[420px] text-[15px] leading-relaxed text-ink-2',
          )}
        >
          {l}
        </motion.p>
      ))}
    </div>
  )
}

/** Creates the account while the orb quickens, then hands over to the session. */
function Setup({ name, providerName, finish }: { name: string; providerName: string | null; finish: () => Promise<{ id: string; dbName: string; storageDir: string }> }) {
  const lines = ['Creando tu espacio…', 'Guardando tus preferencias…', ...(providerName ? [`Conectando con ${providerName}…`] : []), 'Preparando tu escritorio…']
  const [shown, setShown] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [rushing, setRushing] = useState(false)
  const [expanding, setExpanding] = useState(false)
  // The account must be created exactly once, even though React runs effects twice in development.
  const started = useRef(false)

  // This screen ends in a full reload, so nothing here needs tearing down.
  useEffect(() => {
    if (started.current) return
    started.current = true
    lines.forEach((_, i) => {
      if (i > 0) window.setTimeout(() => setShown(i + 1), i * 800)
    })
    const total = lines.length * 800 + 400
    void finish()
      .then((user) => {
        window.setTimeout(() => {
          setDone(true)
          // A beat to read "Listo", then the line races, the disc opens and the desktop takes over.
          window.setTimeout(() => setRushing(true), 1200)
          window.setTimeout(() => setExpanding(true), 1200 + 1300)
          window.setTimeout(() => startSession({ userId: user.id, dbName: user.dbName, storageDir: user.storageDir }, 'flood'), 1200 + 1300 + 1000)
        }, total)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Algo salió mal'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The shared orb tells the story: busy while creating, calm on "Listo", then racing, then flooding.
  useEffect(() => {
    useOrbStage.getState().setMode(expanding ? 'flood' : rushing ? 'rush' : done ? 'idle' : 'busy')
  }, [done, rushing, expanding])

  return (
    <div className="flex flex-col items-center">
      <motion.div animate={{ opacity: rushing || expanding ? 0 : 1 }} transition={{ duration: 0.5 }} className="flex min-h-[96px] flex-col items-center gap-1.5 text-center">
        {done ? (
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-display text-[40px] font-bold tracking-tight text-ink">
            Listo, {name.trim().split(' ')[0]}.
          </motion.p>
        ) : (
          lines.slice(0, shown).map((l, i) => (
            <motion.p
              key={l}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: i === shown - 1 ? 1 : 0.35, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-[15px] text-ink-2"
            >
              {l}
            </motion.p>
          ))
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </motion.div>
    </div>
  )
}
