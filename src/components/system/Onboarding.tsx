import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ExternalLink, Loader2, XCircle } from 'lucide-react'
import type { UserLocation, UserProfile, UserRow } from '../../system/db'
import { hasSharedGroqKey } from '../../config'
import { users } from '../../system/users'
import { useAuth } from '../../system/auth'
import { startSession } from '../../system/session'
import { persistThemeFor } from '../../state/settings'
import { AUTO_MODEL, baseUrlFor, inferTiers, persistAiSettingsFor, presetFor, useAiSettings, type ProviderId } from '../../ai/settings'
import { createOpenAICompatProvider } from '../../ai/providers/openaiCompat'
import { listModels } from '../../ai/providers/openaiCompat'
import { createAnthropicProvider } from '../../ai/providers/anthropic'
import { approximateLocation } from '../../lib/weather'
import { cn } from '../../lib/utils'
import { BELOW_ORB, useOrbStage } from './orbStore'

type Step = 'hello' | 'name' | 'access' | 'ai' | 'setup'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * A name, and you are in. Sky is worth more shown than explained, so nothing else is asked before the desktop
 * exists: the place is worked out from the network while you type, the light starts at night, the microphone
 * waits until you press dictate, and how Sky treats you lives in Ajustes › Cuenta, changeable any day. The
 * provider screen only appears where the deployment ships no model of its own.
 */
/**
 * The email is the registration: it is how the person gets back in from the login screen without doing this
 * again, and the identity the account will hang from once verified accounts are switched on. With a verified
 * account already in hand there is nothing to ask.
 */
const ORDER: Step[] = hasSharedGroqKey ? ['hello', 'name', 'access', 'setup'] : ['hello', 'name', 'access', 'ai', 'setup']

const ONBOARDING_PROVIDERS: ProviderId[] = ['groq', 'anthropic', 'openai', 'glm', 'openrouter', 'ollama']

/** One question at a time, a breathing presence, and the sense that this space is being made for you. */
export function Onboarding() {
  const [step, setStep] = useState<Step>('hello')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  /** Optional: four to six digits so nobody else walks in from this same browser. */
  const [pin, setPin] = useState('')
  /** Found from the network address while the person types their name; never asked for here. */
  const [location, setLocation] = useState<UserLocation | null>(null)
  const detected = useRef(false)
  const [ownKey, setOwnKey] = useState(!hasSharedGroqKey)
  const [provider, setProvider] = useState<ProviderId>('groq')
  const [apiKey, setApiKey] = useState('')
  const [keyTest, setKeyTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; message?: string }>({ state: 'idle' })

  const hasUsers = useAuth((s) => s.users.length > 0)
  const account = useAuth((s) => s.account)
  const adoptable = useAuth((s) => s.adoptable)
  const [skipAdopt, setSkipAdopt] = useState(false)
  /** A PIN-protected desktop offered to an account whose email nobody has verified: its PIN opens the adoption. */
  const [pinFor, setPinFor] = useState<UserRow | null>(null)
  const [adoptPin, setAdoptPin] = useState('')
  const [adoptError, setAdoptError] = useState(false)

  const steps = account ? ORDER.filter((s) => s !== 'access') : ORDER
  const index = steps.indexOf(step)
  const next = () => setStep(steps[Math.min(index + 1, steps.length - 1)])
  const back = () => setStep(steps[Math.max(index - 1, 0)])

  // Nobody should have to type where they are: as soon as the name is in, Sky works the place out from the
  // network address, so the screen that follows already has an answer. The city box is the last resort.
  useEffect(() => {
    if (step === 'hello' || detected.current) return
    detected.current = true
    let alive = true
    void approximateLocation().then((near) => {
      if (!alive) return
      if (near) setLocation({ lat: near.lat, lon: near.lon, place: near.name })
    })
    return () => {
      alive = false
    }
  }, [step])

  const testKey = async () => {
    const preset = presetFor(provider)
    setKeyTest({ state: 'running' })
    try {
      const p =
        provider === 'anthropic'
          ? createAnthropicProvider(apiKey.trim())
          : createOpenAICompatProvider({ id: provider, name: preset.name, baseUrl: preset.baseUrl ?? '', apiKey: apiKey.trim() || undefined, vision: preset.vision })
      const model = preset.tiers?.fast ?? preset.models[0]?.id ?? ''
      // Live-tier providers (GLM) publish their models at their API: ask for the list and take the cheap end
      // of what comes back, which is where everyday requests start anyway.
      const chosen =
        model ||
        (preset.autoTiers
          ? await listModels(baseUrlFor(useAiSettings.getState(), provider), apiKey.trim() || undefined).then((ids) => inferTiers(ids)?.fast ?? ids[0] ?? '')
          : '')
      if (!chosen) throw new Error('No pude leer los modelos de este proveedor; revisa la llave')
      let out = ''
      for await (const ev of p.chat({
        model: chosen,
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
    // Sensible from the first second and changeable any day in Ajustes: close and warm, ready to act, and the
    // microphone asked for the first time you press dictate.
    const profile: UserProfile = { tone: 'warm', purpose: 'mixed', autonomy: 'act', location: location ?? undefined, microphone: 'skipped', voice: true }
    // A PIN is set later, in Ajustes › Cuenta: asking for one before the desktop even exists slows everybody down.
    // With accounts on, the desktop is stamped with the one that just signed in: that is what makes it yours.
    const account = useAuth.getState().account
    const user = await users.create({
      name,
      profile,
      email: account?.email ?? email.trim().toLowerCase(),
      pin: pin || undefined,
      ...(account ? { authId: account.id } : {}),
    })
    // Entering SkyOS is daylight: the arrival is light and the desktop that follows starts light too. Night is
    // a choice the person makes in Ajustes › Apariencia, not the state they are handed.
    persistThemeFor(user.id, 'light')
    const chosen = ownKey ? provider : 'groq'
    const preset = presetFor(chosen)
    persistAiSettingsFor(user.id, {
      provider: chosen,
      model: preset.tiers || preset.autoTiers ? AUTO_MODEL : preset.models[0]?.id ?? '',
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

  // Signing in for the first time on a machine that already had a desktop: that work is somebody's, and it
  // is almost certainly this person's. Asking is one screen; losing it behind a login is forever.
  if (account && adoptable.length > 0 && !skipAdopt) {
    return (
      <div className="absolute inset-x-0 flex flex-col items-center px-6 select-none" style={{ top: BELOW_ORB }}>
        <Screen question="Aquí ya había un escritorio">
          <p className="max-w-[420px] text-center text-[13.5px] leading-relaxed text-ink-2">
            Alguien lo armó en esta computadora antes de que existieran las cuentas. Si era tuyo, sigue siendo tuyo: sus archivos, sus proyectos y lo que hablamos.
          </p>
          <div className="mt-6 flex w-full max-w-[380px] flex-col gap-2">
            {adoptable.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  if (u.pinHash && !account.emailVerified) {
                    setPinFor(u)
                    setAdoptPin('')
                    setAdoptError(false)
                    return
                  }
                  void useAuth.getState().adopt(u)
                }}
                className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left transition hover:border-accent/60 hover:bg-accent-soft/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-medium text-accent">{u.initials}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-ink">{u.name}</span>
                  <span className="block text-[12px] text-ink-3">La última vez fue el {new Date(u.lastLoginAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}</span>
                </span>
              </button>
            ))}
          </div>
          {pinFor && (
            <form
              className="mt-4 flex flex-col items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void useAuth
                  .getState()
                  .adopt(pinFor, adoptPin)
                  .then((ok) => {
                    if (!ok) {
                      setAdoptError(true)
                      setAdoptPin('')
                    }
                  })
              }}
            >
              <p className="text-[12.5px] text-ink-2">El escritorio de {pinFor.name} tiene PIN. Escríbelo para que sea tuyo.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={adoptPin}
                onChange={(e) => {
                  setAdoptPin(e.target.value.replace(/\D/g, ''))
                  setAdoptError(false)
                }}
                placeholder="••••"
                aria-label="PIN del escritorio"
                className={cn('glass h-10 w-40 rounded-xl px-3 text-center text-[18px] tracking-[0.4em] text-ink outline-none transition focus:ring-1 focus:ring-accent/50', adoptError && 'ring-1 ring-danger')}
              />
              {adoptError && <p className="text-[12px] text-danger">Ese PIN no es.</p>}
              <button type="submit" disabled={adoptPin.length < 4} className="rounded-full bg-accent px-4 py-1.5 text-[12.5px] font-medium text-white transition hover:brightness-110 disabled:opacity-40">
                Abrirlo
              </button>
            </form>
          )}
          <button type="button" onClick={() => setSkipAdopt(true)} className="mt-5 text-[12.5px] text-ink-3 transition hover:text-ink">
            No es mío, quiero uno nuevo
          </button>
        </Screen>
      </div>
    )
  }

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
                lines={['Hola.', 'Soy Sky.', 'Solo necesito tu nombre.']}
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

          {step === 'access' && (
            <Screen
              question="¿Con qué correo te reconozco?"
              note="Con él vuelves a entrar aquí sin repetir esto. Por ahora tu cuenta vive en este navegador; cuando el correo esté conectado, entrarás con él desde cualquier computadora."
            >
              <form
                className="flex w-full flex-col items-center gap-6"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (EMAIL.test(email.trim()) && (!pin || pin.length >= 4)) next()
                }}
              >
                <input
                  autoFocus
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  maxLength={120}
                  className="font-display w-full max-w-[380px] border-b border-line-2 bg-transparent pb-2 text-center text-[26px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-accent"
                />
                <label className="flex flex-col items-center gap-2 text-[13px] text-ink-2">
                  <span>Un PIN, si quieres que nadie más entre desde esta computadora (opcional)</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="glass h-10 w-40 rounded-xl px-3 text-center text-[18px] tracking-[0.4em] text-ink outline-none transition focus:ring-1 focus:ring-accent/50"
                  />
                </label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={back} className="text-[13px] text-ink-2 transition hover:text-ink">
                    Atrás
                  </button>
                  <Primary type="submit" disabled={!EMAIL.test(email.trim()) || (!!pin && pin.length < 4)}>
                    Continuar
                  </Primary>
                </div>
              </form>
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
