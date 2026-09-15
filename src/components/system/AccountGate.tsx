import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Loader2, LogIn, Mail, UserPlus } from 'lucide-react'
import { NoSuchAccount, sendCode, verifyCode } from '../../system/account'
import { useAuth } from '../../system/auth'
import { useOrbStage, BELOW_ORB } from './orbStore'

/**
 * Entering SkyOS. Your email, a six-digit code, and you are in — on this computer or on any other, because
 * what is checked happens on a server and not in this browser's memory. No password to invent and nothing to
 * click in another tab: the code is typed where you already are.
 *
 * Coming back and starting out ask for the same two things, but they are not the same intention and the screen
 * says which one you are doing. Somebody who mistypes their address on the way back should hear "no existe",
 * not land inside a brand-new empty desktop wondering where their files went.
 *
 * Those files never travel with the account. They stay on the device that made them, which is the whole point
 * of a desktop that works without asking anyone's permission.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Step = 'choose' | 'email' | 'code'

export function AccountGate() {
  const [step, setStep] = useState<Step>('choose')
  const [creating, setCreating] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  /** The provider throttles codes anyway; the button says so instead of letting someone hammer it. */
  const [canResend, setCanResend] = useState(true)
  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    useOrbStage.getState().setMode(busy ? 'busy' : 'idle')
  }, [busy])

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
    if (step === 'email') emailRef.current?.focus()
  }, [step])

  const ask = async (create = creating, again = false) => {
    if (!EMAIL.test(email.trim())) return setError('A ese correo le falta algo: revisa la arroba y el punto.')
    setBusy(true)
    setError(null)
    setMissing(false)
    try {
      await sendCode(email, create)
      setCreating(create)
      setStep('code')
      if (again) {
        setCanResend(false)
        window.setTimeout(() => setCanResend(true), 30_000)
      }
    } catch (err) {
      if (err instanceof NoSuchAccount) setMissing(true)
      else setError(err instanceof Error ? err.message : 'No se pudo enviar el código.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * The six digits are passed in, not read from state: the last keystroke submits on its own, and at that
   * moment this closure still holds the five digits from the render before it.
   */
  const enter = async (value = code) => {
    const token = value.replace(/\D/g, '')
    if (token.length < 6) return
    setBusy(true)
    setError(null)
    try {
      const account = await verifyCode(email, token)
      await useAuth.getState().enter(account)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar.')
      setCode('')
      setBusy(false)
    }
  }

  const start = (create: boolean) => {
    setCreating(create)
    setMissing(false)
    setError(null)
    setStep('email')
  }

  return (
    <div className="absolute inset-x-0 flex flex-col items-center gap-7 px-6" style={{ top: BELOW_ORB }}>
      <AnimatePresence mode="wait">
        {step === 'choose' && (
          <Panel key="choose">
            <div className="text-center">
              <h1 className="font-display text-[30px] font-bold tracking-tight text-ink">Hola. Soy Sky.</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">Entras con tu correo: sin contraseñas que recordar. Lo que hagas aquí se queda en esta computadora.</p>
            </div>
            <div className="flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={() => start(false)}
                className="flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13.5px] font-medium text-white shadow-soft transition hover:brightness-110"
              >
                <LogIn className="h-4 w-4" />
                Ya nos conocemos
              </button>
              <button
                type="button"
                onClick={() => start(true)}
                className="flex items-center justify-center gap-2 rounded-full border border-line px-5 py-2.5 text-[13.5px] text-ink-2 transition hover:border-accent/60 hover:text-ink"
              >
                <UserPlus className="h-4 w-4" />
                Es mi primera vez
              </button>
            </div>
          </Panel>
        )}

        {step === 'email' && (
          <Panel key="email" onSubmit={() => void ask()}>
            <div className="text-center">
              <h1 className="font-display text-[30px] font-bold tracking-tight text-ink">{creating ? '¿A qué correo te escribo?' : '¿Cuál es tu correo?'}</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                {creating ? 'Te mando un código para saber que eres tú, y ya. Nada de contraseñas.' : 'Te mando un código y entras. Funciona igual aquí que en cualquier otra computadora.'}
              </p>
            </div>
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
                setMissing(false)
              }}
              placeholder="tu@correo.com"
              aria-label="Tu correo"
              className="w-full border-0 border-b border-line bg-transparent pb-2 text-center text-[19px] text-ink outline-none transition placeholder:text-ink-3 focus:border-accent"
            />
            {missing ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-[12.5px] leading-relaxed text-ink-2">
                  No encuentro ninguna cuenta con <span className="text-ink">{email.trim()}</span>. ¿Lo escribiste bien? Si es tu primera vez, la creo ahora mismo.
                </p>
                <button
                  type="button"
                  onClick={() => void ask(true)}
                  className="flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-[12.5px] font-medium text-white transition hover:brightness-110"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Créala con ese correo
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-[13px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {busy ? 'Enviando…' : 'Enviar código'}
              </button>
            )}
            <Back onClick={() => setStep('choose')}>Atrás</Back>
          </Panel>
        )}

        {step === 'code' && (
          <Panel key="code" onSubmit={() => void enter()}>
            <div className="text-center">
              <h1 className="font-display text-[30px] font-bold tracking-tight text-ink">Te acabo de escribir</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                Busca los seis dígitos en <span className="text-ink">{email.trim()}</span>. Si en vez del código te llegó un enlace, ábrelo y entras igual.
              </p>
            </div>
            <input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(digits)
                setError(null)
                if (digits.length === 6) void enter(digits)
              }}
              placeholder="000000"
              aria-label="Código de seis dígitos"
              className="w-[190px] border-0 border-b border-line bg-transparent pb-2 text-center font-display text-[30px] tracking-[0.35em] text-ink outline-none transition placeholder:text-ink-3 focus:border-accent"
            />
            {busy && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
            <div className="flex items-center gap-4 text-[12.5px]">
              <Back onClick={() => setStep('email')}>Otro correo</Back>
              <button type="button" disabled={busy || !canResend} onClick={() => void ask(creating, true)} className="text-accent transition hover:underline disabled:opacity-40">
                {canResend ? 'Mándalo otra vez' : 'Va en camino'}
              </button>
            </div>
          </Panel>
        )}
      </AnimatePresence>

      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="alert" className="max-w-[360px] text-center text-[12.5px] leading-relaxed text-danger">
          {error}
        </motion.p>
      )}
    </div>
  )
}

function Panel({ children, onSubmit }: { children: React.ReactNode; onSubmit?: () => void }) {
  const props = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6, transition: { duration: 0.12 } },
    className: 'flex w-full max-w-[380px] flex-col items-center gap-5',
  }
  if (!onSubmit) return <motion.div {...props}>{children}</motion.div>
  return (
    <motion.form
      {...props}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {children}
    </motion.form>
  )
}

function Back({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 text-[12.5px] text-ink-3 transition hover:text-ink">
      <ArrowLeft className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}
