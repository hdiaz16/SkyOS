import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Lock, UserPlus } from 'lucide-react'
import { useAuth } from '../../system/auth'
import { users } from '../../system/users'
import type { UserRow } from '../../system/db'
import { cn } from '../../lib/utils'
import { BELOW_ORB, useOrbStage } from './orbStore'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Who is sitting down? Pick a person, type a PIN if they set one, and Sky boots their space. Or type the
 * email the account was registered with: that is what "iniciar sesión" means to whoever is not in the list
 * they see, and it is the same email the verified accounts will use.
 */
export function Login() {
  const list = useAuth((s) => s.users)
  const unavailable = useAuth((s) => s.accountsUnavailable)
  const [selected, setSelected] = useState<UserRow | null>(list.length === 1 ? list[0] : null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [byEmail, setByEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [notFound, setNotFound] = useState(false)

  const enter = async (user: UserRow, code?: string) => {
    setBusy(true)
    const ok = await useAuth.getState().login(user, code)
    if (!ok) {
      setBusy(false)
      setError(true)
      setPin('')
    }
  }

  const pick = (user: UserRow) => {
    setError(false)
    if (!user.pinHash) void enter(user)
    else setSelected(user)
  }

  const findByEmail = async () => {
    setNotFound(false)
    const user = await users.byEmail(email)
    if (!user) {
      setNotFound(true)
      return
    }
    setByEmail(false)
    pick(user)
  }

  useEffect(() => {
    if (selected?.pinHash && pin.length >= 4 && pin.length <= 6 && !busy) {
      const timer = window.setTimeout(() => void enter(selected, pin), pin.length === 6 ? 0 : 350)
      return () => window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, selected])

  useEffect(() => {
    useOrbStage.getState().setMode(busy ? 'busy' : 'idle')
  }, [busy])

  return (
    <div className="absolute inset-x-0 flex flex-col items-center gap-8 px-6 select-none" style={{ top: BELOW_ORB }}>
      <div className="text-center">
        <p className="text-[15px] text-ink-2">{greeting()}</p>
        <h1 className="font-display mt-1 text-[36px] font-bold tracking-tight text-ink">Inicia sesión</h1>
        {unavailable && (
          <p className="mt-2 max-w-[380px] text-center text-[12.5px] leading-relaxed text-ink-3">Este SkyOS todavía no puede abrir cuentas: por ahora los perfiles viven en este navegador, y los escritorios que ya son de una cuenta esperan a que vuelva.</p>
        )}
      </div>

      <AnimatePresence mode="wait">
        {selected?.pinHash ? (
          <motion.form
            key="pin"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col items-center gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (pin.length >= 4) void enter(selected, pin)
            }}
          >
            <Avatar user={selected} size={64} />
            <p className="text-[15px] text-ink">{selected.name}</p>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="PIN"
                className={cn(
                  'glass h-11 w-48 rounded-xl pl-10 pr-3 text-center text-[18px] tracking-[0.4em] text-ink outline-none transition focus:ring-1 focus:ring-accent/50',
                  error && 'ring-1 ring-danger',
                )}
              />
            </div>
            <p className={cn('h-4 text-[12px]', error ? 'text-danger' : 'text-ink-3')}>{error ? 'PIN incorrecto' : ''}</p>
            <button
              type="button"
              onClick={() => {
                setSelected(null)
                setPin('')
                setError(false)
              }}
              className="flex items-center gap-1.5 text-[13px] text-ink-2 transition hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Otra persona
            </button>
          </motion.form>
        ) : byEmail ? (
          <motion.form
            key="email"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex w-full max-w-[380px] flex-col items-center gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (EMAIL.test(email.trim())) void findByEmail()
            }}
          >
            <input
              autoFocus
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setNotFound(false)
              }}
              placeholder="tu@correo.com"
              className={cn(
                'glass h-11 w-full rounded-xl px-4 text-center text-[16px] text-ink outline-none transition focus:ring-1 focus:ring-accent/50',
                notFound && 'ring-1 ring-danger',
              )}
            />
            {notFound ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-[13px] text-danger">No encuentro una cuenta con ese correo en este navegador.</p>
                <button type="button" onClick={() => useAuth.getState().showOnboarding()} className="text-[13px] text-accent transition hover:underline">
                  Es mi primera vez aquí
                </button>
              </div>
            ) : (
              <p className="h-4 text-[12px] text-ink-3">Tu cuenta vive en este navegador; entra con el correo con el que la creaste.</p>
            )}
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setByEmail(false)} className="flex items-center gap-1.5 text-[13px] text-ink-2 transition hover:text-ink">
                <ArrowLeft className="h-3.5 w-3.5" />
                Elegir de la lista
              </button>
              <button type="submit" disabled={!EMAIL.test(email.trim())} className="rounded-full bg-accent px-5 py-2 text-[13px] font-medium text-white shadow-soft transition hover:brightness-110 disabled:opacity-40">
                Entrar
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.div key="users" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-wrap items-start justify-center gap-4">
            {list.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pick(u)}
                className="group flex w-28 flex-col items-center gap-2 rounded-2xl p-3 transition hover:bg-surface-2"
              >
                <Avatar user={u} size={64} />
                <span className="max-w-full truncate text-[13px] text-ink">{u.name}</span>
                {u.pinHash && <Lock className="h-3 w-3 text-ink-3" />}
              </button>
            ))}
            <button
              type="button"
              onClick={() => useAuth.getState().showOnboarding()}
              className="flex w-28 flex-col items-center gap-2 rounded-2xl p-3 text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-line-2">
                <UserPlus className="h-6 w-6" strokeWidth={1.5} />
              </span>
              <span className="text-[13px]">Alguien más</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {!selected?.pinHash && !byEmail && (
        <button type="button" onClick={() => setByEmail(true)} className="text-[13px] text-ink-2 transition hover:text-ink">
          Entrar con mi correo
        </button>
      )}
    </div>
  )
}

export function Avatar({ user, size = 40 }: { user: UserRow; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-medium text-white shadow-soft"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${user.hue} 45% 55%), hsl(${(user.hue + 40) % 360} 40% 45%))`,
      }}
    >
      {user.initials}
    </span>
  )
}
