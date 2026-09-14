import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LogOut, Plug, Settings2 } from 'lucide-react'
import { useClock } from '../lib/hooks'
import { cn } from '../lib/utils'
import { dispatch } from '../kernel/commands'
import { useAuth } from '../system/auth'
import { Avatar } from './system/Login'
import { Calendar } from './Calendar'
import { StatusPill } from './StatusPill'

function greetingFor(hour: number): string {
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function TopBar() {
  const now = useClock()
  const user = useAuth((s) => s.current)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const time = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const rawDate = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/\./g, '')
  const date = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)
  const firstName = user?.name.trim().split(' ')[0]

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-usermenu]')) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[100000] flex h-11 items-center justify-between px-5">
      <div className="pointer-events-auto relative" data-usermenu>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className={cn('flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] text-ink-2 transition hover:bg-surface-2', menuOpen && 'bg-surface-2')}
        >
          {user && <Avatar user={user} size={20} />}
          <span className="font-medium text-ink">
            {greetingFor(now.getHours())}
            {firstName ? `, ${firstName}` : ''}
          </span>
          <span className="hidden md:inline"> · {date}</span>
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              style={{ transformOrigin: 'top left' }}
              className="glass absolute left-0 top-full mt-2 w-56 rounded-xl p-1 shadow-win"
            >
              {user && (
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <Avatar user={user} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
                    <p className="text-[11px] text-ink-3">Tu espacio en este navegador</p>
                  </div>
                </div>
              )}
              <div className="my-1 h-px bg-line" />
              <MenuButton
                icon={<Plug className="h-3.5 w-3.5" />}
                onClick={() => {
                  setMenuOpen(false)
                  void dispatch('ui.openApps')
                }}
              >
                Apps conectadas
              </MenuButton>
              <MenuButton
                icon={<Settings2 className="h-3.5 w-3.5" />}
                onClick={() => {
                  setMenuOpen(false)
                  void dispatch('ui.openSettings')
                }}
              >
                Ajustes
              </MenuButton>
              <MenuButton icon={<LogOut className="h-3.5 w-3.5" />} onClick={() => useAuth.getState().logout()}>
                Cerrar sesión
              </MenuButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <StatusPill />
        <div className="relative">
        <button
          type="button"
          data-clock
          onClick={() => setCalendarOpen((o) => !o)}
          title="Calendario"
          className={cn(
            'rounded-lg px-2 py-1 text-[13px] font-medium tabular-nums text-ink transition hover:bg-surface-2',
            calendarOpen && 'bg-surface-2',
          )}
        >
          {time}
        </button>
        <AnimatePresence>{calendarOpen && <Calendar onClose={() => setCalendarOpen(false)} />}</AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function MenuButton({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink transition hover:bg-accent hover:text-white"
    >
      {icon}
      {children}
    </button>
  )
}
