import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../../system/auth'
import { readSession } from '../../system/session'
import { applyTheme, useSettings } from '../../state/settings'
import App from '../../App'
import { Backdrop } from '../Backdrop'
import { Login } from './Login'
import { Onboarding } from './Onboarding'
import { Orb } from './Orb'

/** Cold start shows the mark for a moment; a signed-in reload gets a shorter one. */
const SPLASH_MS = readSession() ? 1400 : 2200

/** Decides what is on screen: the splash, the login, the onboarding, or someone's desktop. */
export function Shell() {
  const status = useAuth((s) => s.status)
  const theme = useSettings((s) => s.theme)
  const [splashDone, setSplashDone] = useState(false)

  // Before anyone is signed in there are no preferences yet, so the shell always greets in daylight.
  useEffect(() => {
    applyTheme(status === 'ready' ? theme : 'light')
  }, [status, theme])

  useEffect(() => {
    void useAuth.getState().load()
    const t = window.setTimeout(() => setSplashDone(true), SPLASH_MS)
    return () => window.clearTimeout(t)
  }, [])

  const showSplash = !splashDone || status === 'loading'
  if (!showSplash && status === 'ready') return <App />

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Backdrop />
      <AnimatePresence mode="wait">
        <motion.div
          key={showSplash ? 'splash' : status}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          {showSplash ? <Splash /> : status === 'login' ? <Login /> : <Onboarding />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Splash() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 select-none">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }}>
        <Orb size={128} />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.7 }}
        className="text-[22px] font-medium tracking-[0.18em] text-ink"
      >
        SKY
      </motion.p>
    </div>
  )
}
