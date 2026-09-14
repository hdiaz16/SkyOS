import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Lock, UserPlus } from 'lucide-react'
import { useAuth } from '../../system/auth'
import type { UserRow } from '../../system/db'
import { cn } from '../../lib/utils'
import { Orb } from './Orb'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/** Who is sitting down? Pick a person, type a PIN if they set one, and Sky boots their space. */
export function Login() {
  const list = useAuth((s) => s.users)
  const [selected, setSelected] = useState<UserRow | null>(list.length === 1 ? list[0] : null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

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

  useEffect(() => {
    if (selected?.pinHash && pin.length >= 4 && pin.length <= 6 && !busy) {
      const timer = window.setTimeout(() => void enter(selected, pin), pin.length === 6 ? 0 : 350)
      return () => window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, selected])

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 px-6 select-none">
      <Orb size={120} active={busy} />
      <div className="text-center">
        <p className="text-[15px] text-ink-2">{greeting()}</p>
        <h1 className="font-display mt-1 text-[36px] font-bold tracking-tight text-ink">¿Quién eres?</h1>
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
